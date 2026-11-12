# Identities for GitHub Actions (.github/workflows/deploy.yml and infra-plan.yml). They sign in with
# workload identity federation: GitHub presents a short-lived OIDC token, Entra swaps it for an Azure
# token, and no client secret exists anywhere. A federated credential accepts only the exact `sub`
# claim written below, so a token minted for any other workflow, branch or repository is refused.
#
# These resources cannot be created by the pipeline that uses them. The first apply is by a person
# (infra/README.md, "CI bootstrap"); after that the deploy identity may change everything in this
# directory except the role assignments below (see the condition on its RBAC Administrator role).

locals {
  github_repo = "TrueNorthIT/TrueTunes"

  # The state storage account is not managed here (README.md records how it was made); its container
  # is the narrowest scope that gives these identities access to the state blob.
  state_container_id = "${local.rg_id}/providers/Microsoft.Storage/storageAccounts/truetunestfstate/blobServices/default/containers/tfstate"

  # Built-in role definition ids that the deploy identity may assign: Key Vault Secrets User and
  # Key Vault Secrets Officer, the two roles keyvault.tf hands out.
  deployer_assignable_roles = join(", ", [
    "4633458b-17de-408a-b874-0445c86b69e6", # Key Vault Secrets User
    "b86a8fe4-44ce-4948-aee5-eccb2c155cd7", # Key Vault Secrets Officer
  ])
}

# ---------------------------------------------------------------------------------------------------
# truetunes-ci-deploy: runs on main, in the GitHub environment "production". Applies Terraform and
# publishes the functions.
# ---------------------------------------------------------------------------------------------------

resource "azurerm_user_assigned_identity" "ci_deploy" {
  name                = "truetunes-ci-deploy"
  resource_group_name = local.rg
  location            = local.location
}

resource "azurerm_federated_identity_credential" "ci_deploy" {
  name                      = "github-environment-production"
  user_assigned_identity_id = azurerm_user_assigned_identity.ci_deploy.id
  issuer                    = "https://token.actions.githubusercontent.com"
  audience                  = ["api://AzureADTokenExchange"]
  subject                   = "repo:${local.github_repo}:environment:production"
}

# Create, change and delete every resource in the group, and publish function code.
resource "azurerm_role_assignment" "ci_deploy_contributor" {
  scope                = data.azurerm_resource_group.main.id
  role_definition_name = "Contributor"
  principal_id         = azurerm_user_assigned_identity.ci_deploy.principal_id
  principal_type       = "ServicePrincipal"
}

# Contributor cannot write role assignments, and keyvault.tf assigns "Key Vault Secrets User" to the
# Function App. This role is broad (it can grant access), so it carries a condition: the identity may
# only add or remove assignments of the two Key Vault secret roles. It therefore cannot make itself
# Owner, and it cannot change the assignments in this file; a change to ci.tf's role assignments is
# applied by a person.
resource "azurerm_role_assignment" "ci_deploy_rbac_admin" {
  scope                = data.azurerm_resource_group.main.id
  role_definition_name = "Role Based Access Control Administrator"
  principal_id         = azurerm_user_assigned_identity.ci_deploy.principal_id
  principal_type       = "ServicePrincipal"

  condition_version = "2.0"
  condition         = <<-EOT
    (
     (!(ActionMatches{'Microsoft.Authorization/roleAssignments/write'}))
     OR
     (@Request[Microsoft.Authorization/roleAssignments:RoleDefinitionId] ForAnyOfAnyValues:GuidEquals {${local.deployer_assignable_roles}})
    )
    AND
    (
     (!(ActionMatches{'Microsoft.Authorization/roleAssignments/delete'}))
     OR
     (@Resource[Microsoft.Authorization/roleAssignments:RoleDefinitionId] ForAnyOfAnyValues:GuidEquals {${local.deployer_assignable_roles}})
    )
  EOT
}

# Reads and writes the state blob using Entra auth (the backend's use_azuread_auth).
resource "azurerm_role_assignment" "ci_deploy_state" {
  scope                = local.state_container_id
  role_definition_name = "Storage Blob Data Contributor"
  principal_id         = azurerm_user_assigned_identity.ci_deploy.principal_id
  principal_type       = "ServicePrincipal"
}

# ---------------------------------------------------------------------------------------------------
# truetunes-ci-plan: runs on pull requests. Can read, cannot change. "Cannot change" means no Azure
# resource can be created, modified or deleted and the state blob cannot be written; it CAN read the
# keys and app settings that `terraform plan` needs to refresh, and the state blob, which holds the
# same values.
# ---------------------------------------------------------------------------------------------------

resource "azurerm_user_assigned_identity" "ci_plan" {
  name                = "truetunes-ci-plan"
  resource_group_name = local.rg
  location            = local.location
}

resource "azurerm_federated_identity_credential" "ci_plan" {
  name                      = "github-pull-request"
  user_assigned_identity_id = azurerm_user_assigned_identity.ci_plan.id
  issuer                    = "https://token.actions.githubusercontent.com"
  audience                  = ["api://AzureADTokenExchange"]
  subject                   = "repo:${local.github_repo}:pull_request"
}

resource "azurerm_role_assignment" "ci_plan_reader" {
  scope                = data.azurerm_resource_group.main.id
  role_definition_name = "Reader"
  principal_id         = azurerm_user_assigned_identity.ci_plan.principal_id
  principal_type       = "ServicePrincipal"
}

# Reader cannot call the POST "list" actions, and the azurerm provider calls each of these while it
# refreshes a resource that is already in state. Every action reads a secret or a setting; none can
# write. The role is assigned per resource below, not on the resource group, so the identity cannot
# list the keys of the state storage account (those would let it write state).
resource "azurerm_role_definition" "ci_plan_refresh" {
  name        = "truetunes-ci-plan-refresh"
  scope       = data.azurerm_resource_group.main.id
  description = "Read the keys and settings that terraform plan reads while refreshing. No write actions."

  permissions {
    actions = [
      "Microsoft.Web/sites/config/list/action",                             # Function App settings, connection strings, auth settings
      "Microsoft.Storage/storageAccounts/listKeys/action",                  # primary_access_key
      "Microsoft.DocumentDB/databaseAccounts/listKeys/action",              # Cosmos keys
      "Microsoft.DocumentDB/databaseAccounts/readonlykeys/action",          # Cosmos read-only keys
      "Microsoft.DocumentDB/databaseAccounts/listConnectionStrings/action", # primary_sql_connection_string
      "Microsoft.SignalRService/webPubSub/listKeys/action",                 # primary_connection_string
      "Microsoft.OperationalInsights/workspaces/sharedKeys/action",         # primary_shared_key
    ]
    not_actions = []
  }

  assignable_scopes = [data.azurerm_resource_group.main.id]
}

resource "azurerm_role_assignment" "ci_plan_refresh" {
  for_each = {
    function_app  = azurerm_windows_function_app.main.id
    storage       = azurerm_storage_account.app.id
    cosmos        = azurerm_cosmosdb_account.main.id
    web_pubsub    = azurerm_web_pubsub.main.id
    log_analytics = azurerm_log_analytics_workspace.main.id
  }

  scope              = each.value
  role_definition_id = azurerm_role_definition.ci_plan_refresh.role_definition_resource_id
  principal_id       = azurerm_user_assigned_identity.ci_plan.principal_id
  principal_type     = "ServicePrincipal"
}

# Reads the state blob. Plans run with -lock=false, because taking the lock writes a lease on the blob.
resource "azurerm_role_assignment" "ci_plan_state" {
  scope                = local.state_container_id
  role_definition_name = "Storage Blob Data Reader"
  principal_id         = azurerm_user_assigned_identity.ci_plan.principal_id
  principal_type       = "ServicePrincipal"
}
