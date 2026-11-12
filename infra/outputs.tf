output "function_app_name" {
  value = azurerm_windows_function_app.main.name
}

output "function_app_url" {
  description = "PUBSUB_FUNCTION_URL for the desktop app."
  value       = "https://${azurerm_windows_function_app.main.default_hostname}"
}

output "gateway_app_name" {
  value = azurerm_linux_web_app.gateway.name
}

output "gateway_default_hostname" {
  description = "Target of the CNAME for the custom domain, and the host the deploy smoke check calls."
  value       = azurerm_linux_web_app.gateway.default_hostname
}

output "gateway_custom_domain" {
  description = "Name of the CNAME record, and the host the app serves once gateway_custom_domain_enabled is true."
  value       = local.gateway_custom_domain
}

output "gateway_domain_verification_id" {
  description = "Value of the TXT record asuid.truetunes at the gateway's custom domain."
  value       = azurerm_linux_web_app.gateway.custom_domain_verification_id
  # The provider marks it sensitive; `terraform output -raw` still prints it.
  sensitive = true
}

output "storage_account_name" {
  value = azurerm_storage_account.app.name
}

output "web_pubsub_name" {
  value = azurerm_web_pubsub.main.name
}

output "appinsights_connection_string" {
  description = "APPINSIGHTS_CONNECTION_STRING for the desktop app and the GitHub Actions secret."
  value       = azurerm_application_insights.main.connection_string
  sensitive   = true
}

output "key_vault_name" {
  description = "Vault for load-secrets.mjs."
  value       = azurerm_key_vault.main.name
}

# The values for the GitHub repository variables (README.md, "CI bootstrap"). None is a secret.
output "ci_tenant_id" {
  description = "AZURE_TENANT_ID"
  value       = data.azurerm_client_config.current.tenant_id
}

output "ci_subscription_id" {
  description = "AZURE_SUBSCRIPTION_ID"
  value       = data.azurerm_client_config.current.subscription_id
}

output "ci_deploy_client_id" {
  description = "AZURE_DEPLOY_CLIENT_ID"
  value       = azurerm_user_assigned_identity.ci_deploy.client_id
}

output "ci_plan_client_id" {
  description = "AZURE_PLAN_CLIENT_ID"
  value       = azurerm_user_assigned_identity.ci_plan.client_id
}
