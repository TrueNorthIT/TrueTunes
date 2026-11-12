terraform {
  required_version = ">= 1.12"

  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 5.13"
    }
  }

  # State lives in a storage account that Terraform does not manage (README.md records how it was
  # created). The backend signs in to the blob with Entra ID (use_azuread_auth), so it never looks up an
  # account key: locally it uses the Azure CLI's account, in GitHub Actions the ARM_USE_OIDC,
  # ARM_CLIENT_ID and ARM_TENANT_ID environment variables select the federated identity. Either needs
  # "Storage Blob Data Contributor" (or Reader, for plan) on the tfstate container.
  backend "azurerm" {
    resource_group_name  = "truetunes-rg"
    storage_account_name = "truetunestfstate"
    container_name       = "tfstate"
    key                  = "truetunes.tfstate"
    use_azuread_auth     = true
  }
}

provider "azurerm" {
  subscription_id = var.subscription_id

  # Terraform registers nothing on its own; every resource provider this config needs is already
  # registered on the subscription.
  resource_provider_registrations = "none"

  features {}
}
