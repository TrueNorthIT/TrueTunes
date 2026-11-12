# Secrets live in Key Vault, not in .env or in Terraform. Terraform creates the vault and the access to
# it but never holds a secret value: infra/scripts/load-secrets.mjs puts the values in by hand, once.

data "azurerm_client_config" "current" {}

locals {
  # App setting name => Key Vault secret name (vault secret names cannot contain underscores).
  key_vault_secrets = {
    VESTABOARD_API_KEY  = "vestaboard-api-key"
    GITHUB_ISSUES_TOKEN = "github-issues-token"
    SONOS_USERNAME      = "sonos-username"
    SONOS_PASSWORD      = "sonos-password"
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

# The Function App reads its secrets through its own system-assigned identity.
#
# When the identity is added to an existing app, the provider does not mark its principal id as "known
# after apply", so a plan made in the same run cannot use it. The assignment is therefore created once
# the id is in state: the first apply adds the identity (and the vault), the second adds this. Later
# plans see the id and this resource is stable.
resource "azurerm_role_assignment" "function_app_secrets_user" {
  count = azurerm_windows_function_app.main.identity[0].principal_id == null ? 0 : 1

  scope                = azurerm_key_vault.main.id
  role_definition_name = "Key Vault Secrets User"
  principal_id         = azurerm_windows_function_app.main.identity[0].principal_id
  principal_type       = "ServicePrincipal"
}

# Whoever runs infra/scripts/load-secrets.mjs needs to be able to write secrets.
resource "azurerm_role_assignment" "secrets_officer" {
  for_each = var.key_vault_secrets_officers

  scope                = azurerm_key_vault.main.id
  role_definition_name = "Key Vault Secrets Officer"
  principal_id         = each.value
}
