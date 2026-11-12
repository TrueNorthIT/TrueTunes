terraform {
  required_version = ">= 1.12"

  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 5.13"
    }
  }

  # State lives in a storage account that Terraform does not manage (README.md records how it was
  # created). Auth is whatever the Azure CLI or the CI federated identity provides: the backend looks
  # the access key up through ARM, so no key is stored here.
  backend "azurerm" {
    resource_group_name  = "truetunes-rg"
    storage_account_name = "truetunestfstate"
    container_name       = "tfstate"
    key                  = "truetunes.tfstate"
    subscription_id      = "919f287f-2e74-4eb4-a2d4-64506ddade51"
  }
}

provider "azurerm" {
  subscription_id = var.subscription_id

  # Terraform registers nothing on its own; every resource provider this config needs is already
  # registered on the subscription.
  resource_provider_registrations = "none"

  features {}
}
