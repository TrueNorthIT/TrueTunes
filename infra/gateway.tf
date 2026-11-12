# The Sonos gateway: a small always-on Node HTTP + WebSocket service that fronts all Sonos traffic. Azure
# Functions cannot hold a WebSocket open, so it runs on App Service (Linux). The code is server/src/gateway/;
# publish.yml's `deploy` job zip-deploys the built server/ to this app after the functions are published.

locals {
  gateway_custom_domain = "truetunes.tnapps.co.uk"

  # Only the Sonos credentials: the gateway does not need the Vestaboard key or the GitHub App key.
  gateway_secret_settings = {
    for name in ["SONOS_USERNAME", "SONOS_PASSWORD"] :
    name => local.secret_settings_as_references[name]
  }
}

# B1 is billed monthly whether or not it is busy (README.md, "Sonos gateway").
resource "azurerm_service_plan" "gateway" {
  name                = "truetunes-gw-plan"
  resource_group_name = local.rg
  location            = local.location
  os_type             = "Linux"
  sku_name            = "B1"
}

resource "azurerm_linux_web_app" "gateway" {
  name                = "truetunes-gw"
  resource_group_name = local.rg
  location            = local.location
  service_plan_id     = azurerm_service_plan.gateway.id

  https_only = true

  # FTP is off (ftps_state below); basic-auth FTP publishing is switched off as well. Zip deploy by the
  # CI identity uses its Entra token against the SCM site.
  ftp_publish_basic_authentication_enabled = false

  app_settings = merge(
    {
      # The zip holds the built output and production node_modules (publish.yml); do not run Oryx on it.
      SCM_DO_BUILD_DURING_DEPLOYMENT = "false"
      ENTRA_TENANT_ID                = var.entra_tenant_id
      ENTRA_CLIENT_ID                = var.entra_client_id
      # azurerm_linux_web_app has no typed argument for this (the Function App has); this is the setting it writes.
      APPLICATIONINSIGHTS_CONNECTION_STRING = azurerm_application_insights.main.connection_string
    },
    local.gateway_secret_settings,
  )

  identity {
    type = "SystemAssigned"
  }

  site_config {
    always_on          = true
    websockets_enabled = true
    health_check_path  = "/healthz"
    # The provider insists on this next to the path; it only matters once the plan has more than one instance.
    health_check_eviction_time_in_min = 10
    app_command_line                  = "node dist/gateway/main.js"
    ftps_state                        = "Disabled"
    minimum_tls_version               = "1.2"

    # http2_enabled is left at its default (off): the WebSocket upgrade is an HTTP/1.1 mechanism and the
    # gateway gains nothing from HTTP/2, so there is no reason to risk it.

    application_stack {
      node_version = "22-lts"
    }
  }
}

# A new resource's principal id is known once the app is created, so this plain reference resolves inside the
# same apply (the Function App's assignment, keyvault.tf, needed a `moved` block only because it once had a
# count, which must be known at plan time). The vault role can take a few minutes to take effect: a Key Vault
# reference that fails before then is resolved again when the app restarts, which the deploy does.
resource "azurerm_role_assignment" "gateway_secrets_user" {
  scope                = azurerm_key_vault.main.id
  role_definition_name = "Key Vault Secrets User"
  principal_id         = azurerm_linux_web_app.gateway.identity[0].principal_id
  principal_type       = "ServicePrincipal"
}

# ---------------------------------------------------------------------------------------------------
# Custom domain. The DNS zone (tnapps.co.uk, resource group truenorth-general) is outside this pipeline, so
# the CNAME and the asuid TXT record are created by hand first (README.md, "Sonos gateway"); only then is
# gateway_custom_domain_enabled set. Without the records the hostname binding is refused.
# ---------------------------------------------------------------------------------------------------

resource "azurerm_app_service_custom_hostname_binding" "gateway" {
  count = var.gateway_custom_domain_enabled ? 1 : 0

  hostname            = local.gateway_custom_domain
  app_service_name    = azurerm_linux_web_app.gateway.name
  resource_group_name = local.rg

  # The certificate binding below owns these.
  lifecycle {
    ignore_changes = [ssl_state, thumbprint]
  }
}

resource "azurerm_app_service_managed_certificate" "gateway" {
  count = var.gateway_custom_domain_enabled ? 1 : 0

  custom_hostname_binding_id = azurerm_app_service_custom_hostname_binding.gateway[0].id
}

resource "azurerm_app_service_certificate_binding" "gateway" {
  count = var.gateway_custom_domain_enabled ? 1 : 0

  hostname_binding_id = azurerm_app_service_custom_hostname_binding.gateway[0].id
  certificate_id      = azurerm_app_service_managed_certificate.gateway[0].id
  ssl_state           = "SniEnabled"
}
