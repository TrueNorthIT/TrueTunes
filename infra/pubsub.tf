resource "azurerm_web_pubsub" "main" {
  name                = "truetunes-wps"
  resource_group_name = local.rg
  location            = local.location

  sku      = "Free_F1"
  capacity = 1

  public_network_access_enabled = true
}

resource "azurerm_web_pubsub_hub" "office" {
  name                          = "office"
  web_pubsub_id                 = azurerm_web_pubsub.main.id
  anonymous_connections_enabled = false
}
