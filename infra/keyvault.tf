# Secrets live in Key Vault, not in .env or in Terraform. Terraform creates the vault and the access to
# it but never holds a secret value: infra/scripts/load-secrets.mjs puts the values in by hand, once.

data "azurerm_client_config" "current" {}

locals {
  # App setting name => Key Vault secret name (vault secret names cannot contain underscores).
  key_vault_secrets = {
    VESTABOARD_API_KEY = "vestaboard-api-key"
    # The feedback GitHub App's private key. Loaded from its .pem with az, not from .env (see README).
    GITHUB_APP_PRIVATE_KEY = "github-app-private-key"
    SONOS_USERNAME         = "sonos-username"
    SONOS_PASSWORD         = "sonos-password"
  }
}

resource "azurerm_key_vault" "main" {
  name                = "truetunes-kv"
  resource_group_name = local.rg
  location            = local.location
  tenant_id           = data.azurerm_client_config.current.tenant_id
  sku_name            = "standard"

  rbac_authorization_enabled = true
  soft_delete_retention_days = 90
}

# The Function App reads its secrets through its own system-assigned identity, which has been in state
# since the vault was first applied. (Adding an identity to an app that has none makes the provider
# hide its principal id until after apply, so a rebuilt environment would need two applies, the second
# for this assignment.)
resource "azurerm_role_assignment" "function_app_secrets_user" {
  scope                = azurerm_key_vault.main.id
  role_definition_name = "Key Vault Secrets User"
  principal_id         = azurerm_windows_function_app.main.identity[0].principal_id
  principal_type       = "ServicePrincipal"
}

# The assignment used to carry a count of 0 or 1; production holds it at index 0.
moved {
  from = azurerm_role_assignment.function_app_secrets_user[0]
  to   = azurerm_role_assignment.function_app_secrets_user
}

# Whoever runs infra/scripts/load-secrets.mjs needs to be able to write secrets.
resource "azurerm_role_assignment" "secrets_officer" {
  for_each = var.key_vault_secrets_officers

  scope                = azurerm_key_vault.main.id
  role_definition_name = "Key Vault Secrets Officer"
  principal_id         = each.value
}
