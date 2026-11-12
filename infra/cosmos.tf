resource "azurerm_cosmosdb_account" "main" {
  name                = "truetunes-cosmos"
  resource_group_name = local.rg
  location            = local.location

  kind       = "GlobalDocumentDB"
  offer_type = "Standard"

  automatic_failover_enabled = true

  capabilities {
    name = "EnableServerless"
  }

  consistency_policy {
    consistency_level       = "Session"
    max_interval_in_seconds = 5
    max_staleness_prefix    = 100
  }

  geo_location {
    location          = local.location
    failover_priority = 0
  }

  backup {
    type                = "Periodic"
    interval_in_minutes = 240
    retention_in_hours  = 8
    storage_redundancy  = "Geo"
  }
}

resource "azurerm_cosmosdb_sql_database" "main" {
  name                = "truetunes"
  resource_group_name = local.rg
  account_name        = azurerm_cosmosdb_account.main.name
}

# Container name => partition key path and default TTL. -1 means items live until they set their own
# TTL; null means no TTL at all. Both mean "does not expire" by default, but they are different
# container settings, so do not tidy one into the other.
locals {
  cosmos_containers = {
    events    = { partition_key = "/userId", default_ttl = -1 }
    games     = { partition_key = "/id", default_ttl = null }
    scores    = { partition_key = "/gameId", default_ttl = null }
    playlists = { partition_key = "/id", default_ttl = null }
    profiles  = { partition_key = "/id", default_ttl = null }
    sessions  = { partition_key = "/id", default_ttl = -1 }
    polls     = { partition_key = "/id", default_ttl = null }
    tracks    = { partition_key = "/id", default_ttl = -1 }
  }
}

resource "azurerm_cosmosdb_sql_container" "main" {
  for_each = local.cosmos_containers

  name                = each.key
  resource_group_name = local.rg
  account_name        = azurerm_cosmosdb_account.main.name
  database_name       = azurerm_cosmosdb_sql_database.main.name

  partition_key_paths = [each.value.partition_key]
  partition_key_kind  = "Hash"
  default_ttl         = each.value.default_ttl
}
