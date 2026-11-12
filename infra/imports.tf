# Brings the live resources into state. Once applied these blocks are inert; they stay as the record
# of what was adopted, and can be deleted at any time.

import {
  to = azurerm_log_analytics_workspace.main
  id = "${local.rg_id}/providers/Microsoft.OperationalInsights/workspaces/truetunes-law"
}

import {
  to = azurerm_application_insights.main
  id = "${local.rg_id}/providers/Microsoft.Insights/components/truetunes-ai"
}

import {
  to = azurerm_storage_account.app
  id = "${local.rg_id}/providers/Microsoft.Storage/storageAccounts/truetunesfoywo62izs34i"
}

import {
  to = azurerm_storage_container.attribution
  id = "${local.rg_id}/providers/Microsoft.Storage/storageAccounts/truetunesfoywo62izs34i/blobServices/default/containers/attribution"
}

import {
  to = azurerm_storage_container.playlist_images
  id = "${local.rg_id}/providers/Microsoft.Storage/storageAccounts/truetunesfoywo62izs34i/blobServices/default/containers/playlist-images"
}

import {
  to = azurerm_web_pubsub.main
  id = "${local.rg_id}/providers/Microsoft.SignalRService/webPubSub/truetunes-wps"
}

import {
  to = azurerm_web_pubsub_hub.office
  id = "${local.rg_id}/providers/Microsoft.SignalRService/webPubSub/truetunes-wps/hubs/office"
}

import {
  to = azurerm_cosmosdb_account.main
  id = "${local.rg_id}/providers/Microsoft.DocumentDB/databaseAccounts/truetunes-cosmos"
}

import {
  to = azurerm_cosmosdb_sql_database.main
  id = "${local.rg_id}/providers/Microsoft.DocumentDB/databaseAccounts/truetunes-cosmos/sqlDatabases/truetunes"
}

import {
  for_each = local.cosmos_containers
  to       = azurerm_cosmosdb_sql_container.main[each.key]
  id       = "${local.rg_id}/providers/Microsoft.DocumentDB/databaseAccounts/truetunes-cosmos/sqlDatabases/truetunes/containers/${each.key}"
}

import {
  to = azurerm_service_plan.main
  id = "${local.rg_id}/providers/Microsoft.Web/serverFarms/truetunes-plan"
}

import {
  to = azurerm_windows_function_app.main
  id = "${local.rg_id}/providers/Microsoft.Web/sites/truetunes-fn"
}
