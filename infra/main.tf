# The resource group already exists and is shared with the Terraform state storage account, so it is
# read, not managed: Terraform can never delete it.
data "azurerm_resource_group" "main" {
  name = var.resource_group_name
}

locals {
  rg       = data.azurerm_resource_group.main.name
  location = data.azurerm_resource_group.main.location

  # Prefix of the resource ids used by the import blocks in imports.tf.
  rg_id = "/subscriptions/${var.subscription_id}/resourceGroups/${var.resource_group_name}"
}
