# The Function App's own storage (host state, content share) and the app's blobs.
resource "azurerm_storage_account" "app" {
  name                = "truetunesfoywo62izs34i"
  resource_group_name = local.rg
  location            = local.location

  account_kind             = "StorageV2"
  account_tier             = "Standard"
  account_replication_type = "LRS"

  https_traffic_only_enabled      = true
  min_tls_version                 = "TLS1_2"
  allow_nested_items_to_be_public = false

  blob_properties {
    cors_rule {
      allowed_origins    = ["*"]
      allowed_methods    = ["GET", "HEAD"]
      allowed_headers    = ["*"]
      exposed_headers    = ["*"]
      max_age_in_seconds = 86400
    }
  }

  # The live account stores no value (the ARM template never set one), so the provider reads "" where
  # its default is "Enabled", which is what the account effectively has. Do not write to it for that.
  lifecycle {
    ignore_changes = [public_network_access]
  }
}

# Only the containers the ARM template declared. azure-webjobs-hosts and azure-webjobs-secrets are
# created by the Functions host, and profile-images by the app, so none of those are managed here.
resource "azurerm_storage_container" "attribution" {
  name                  = "attribution"
  storage_account_id    = azurerm_storage_account.app.id
  container_access_type = "private"
}

resource "azurerm_storage_container" "playlist_images" {
  name                  = "playlist-images"
  storage_account_id    = azurerm_storage_account.app.id
  container_access_type = "private"
}
