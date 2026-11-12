resource "azurerm_log_analytics_workspace" "main" {
  name                = "truetunes-law"
  resource_group_name = local.rg
  location            = local.location
  sku                 = "PerGB2018"
  retention_in_days   = 30

  # The live workspace stores no value for this (the ARM template never set it), so the provider
  # reads null where its default is true. The effective behaviour is identical; adopting the workspace
  # should not issue a write to it.
  lifecycle {
    ignore_changes = [local_authentication_enabled]
  }
}

resource "azurerm_application_insights" "main" {
  name                = "truetunes-ai"
  resource_group_name = local.rg
  location            = local.location
  application_type    = "other"
  workspace_id        = azurerm_log_analytics_workspace.main.id
  retention_in_days   = 90

  # The live component stores no sampling percentage (the ARM template never set one); the provider
  # reads that as 0 and would write 100. Leave it as it is.
  lifecycle {
    ignore_changes = [sampling_percentage]
  }
}
