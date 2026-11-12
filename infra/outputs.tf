output "function_app_name" {
  value = azurerm_windows_function_app.main.name
}

output "function_app_url" {
  description = "PUBSUB_FUNCTION_URL for the desktop app."
  value       = "https://${azurerm_windows_function_app.main.default_hostname}"
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
