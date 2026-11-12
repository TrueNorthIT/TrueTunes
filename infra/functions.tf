resource "azurerm_service_plan" "main" {
  name                = "truetunes-plan"
  resource_group_name = local.rg
  location            = local.location
  os_type             = "Windows"
  sku_name            = "Y1"
}

locals {
  storage_connection_string = "DefaultEndpointsProtocol=https;AccountName=${azurerm_storage_account.app.name};EndpointSuffix=core.windows.net;AccountKey=${azurerm_storage_account.app.primary_access_key}"

  # The secret settings are Key Vault references: Terraform never holds a value. The Function App resolves
  # them with its own identity (keyvault.tf). Load the values with infra/scripts/load-secrets.mjs.
  secret_settings_as_references = {
    for name, secret in local.key_vault_secrets :
    name => "@Microsoft.KeyVault(SecretUri=${azurerm_key_vault.main.vault_uri}secrets/${secret})"
  }

  app_settings = merge(
    {
      WEBSITE_RUN_FROM_PACKAGE    = "1"
      WEBPUBSUB_CONNECTION_STRING = azurerm_web_pubsub.main.primary_connection_string
      STORAGE_CONNECTION_STRING   = local.storage_connection_string
      COSMOS_CONNECTION_STRING    = azurerm_cosmosdb_account.main.primary_sql_connection_string
      COSMOS_DATABASE             = azurerm_cosmosdb_sql_database.main.name
      COSMOS_CONTAINER            = azurerm_cosmosdb_sql_container.main["events"].name
      COSMOS_GAMES_CONTAINER      = azurerm_cosmosdb_sql_container.main["games"].name
      COSMOS_SCORES_CONTAINER     = azurerm_cosmosdb_sql_container.main["scores"].name
      COSMOS_POLLS_CONTAINER      = azurerm_cosmosdb_sql_container.main["polls"].name
      COSMOS_TRACKS_CONTAINER     = azurerm_cosmosdb_sql_container.main["tracks"].name
      ENTRA_TENANT_ID             = var.entra_tenant_id
      ENTRA_CLIENT_ID             = var.entra_client_id
      AUTH_ENFORCE                = var.auth_enforce
      # The "True Tunes Feedback" GitHub App that opens feedback issues. Ids, not secrets.
      GITHUB_APP_ID              = "5728231"
      GITHUB_APP_INSTALLATION_ID = "181238578"
    },
    local.secret_settings_as_references,
  )
}

resource "azurerm_windows_function_app" "main" {
  name                = "truetunes-fn"
  resource_group_name = local.rg
  location            = local.location
  service_plan_id     = azurerm_service_plan.main.id

  https_only                  = true
  functions_extension_version = "~4"
  builtin_logging_enabled     = false

  client_certificate_enabled = false
  client_certificate_mode    = "Required"

  # The provider writes AzureWebJobsStorage and WEBSITE_CONTENTAZUREFILECONNECTIONSTRING from these.
  storage_account_name       = azurerm_storage_account.app.name
  storage_account_access_key = azurerm_storage_account.app.primary_access_key

  app_settings = local.app_settings

  identity {
    type = "SystemAssigned"
  }

  site_config {
    ftps_state          = "Disabled"
    minimum_tls_version = "1.2"

    application_insights_connection_string = azurerm_application_insights.main.connection_string

    # Must name a version the Windows worker has installed. ~24 took production down on 2026-11-06
    # (see CLAUDE.md). Check the worker's installed versions before changing it.
    application_stack {
      node_version = "~22"
    }
  }

  # The provider fills these in from defaults the live app does not store, and the node stack cannot
  # be set together with dotnet_version, so the config cannot describe the live values:
  #  - application_stack.dotnet_version: live is v8.0 (the platform default); the provider wants v4.0.
  #  - ip_restriction_default_action, scm_ip_restriction_default_action: live is unset, which behaves
  #    as Allow (there is a single "Allow all" rule); the provider wants to write "Allow".
  # None of them changes behaviour. app_settings and every other site_config value stay managed.
  lifecycle {
    ignore_changes = [
      site_config[0].application_stack[0].dotnet_version,
      site_config[0].ip_restriction_default_action,
      site_config[0].scm_ip_restriction_default_action,
    ]
  }
}
