# True Tunes infrastructure (Terraform)

Describes the production Azure resources in `truetunes-rg` (uksouth, subscription `919f287f-2e74-4eb4-a2d4-64506ddade51`).
There is one environment, so there are no modules, workspaces or per-environment files.

| File | What it holds |
| --- | --- |
| `versions.tf` | Terraform and provider versions, the remote state backend, the provider block |
| `main.tf` | The resource group (read only) and shared locals |
| `monitoring.tf` | Log Analytics workspace, Application Insights |
| `storage.tf` | The app storage account and its containers |
| `pubsub.tf` | Web PubSub and the `office` hub |
| `cosmos.tf` | Cosmos DB account, database and containers |
| `functions.tf` | Consumption plan, Function App and its app settings |
| `imports.tf` | `import` blocks that adopted the live resources into state |
| `outputs.tf` | Function URL, App Insights connection string and so on |

## Running it

Pick the TrueNorth admin Azure CLI identity first (the `azswap` `tnit-admin` profile), then:

```bash
cd infra
terraform init
terraform plan
```

The Function App's settings include `ENTRA_TENANT_ID`, `ENTRA_CLIENT_ID` and the secret settings. Supply
them as `TF_VAR_*` environment variables or an untracked `terraform.tfvars` (see
`terraform.tfvars.example`). `*.tfvars` and `*.tfstate*` are git-ignored. Never paste an unredacted
plan or `terraform show` output: the Function App's `app_settings` hold live secrets.

## Remote state

State is in the storage account `truetunestfstate` (container `tfstate`, blob `truetunes.tfstate`), in
the same resource group. It is not managed by Terraform (it would have to exist before Terraform could
store its own state), and it is separate from the app's storage account. It was created once with:

```bash
az storage account create --subscription 919f287f-2e74-4eb4-a2d4-64506ddade51 \
  -g truetunes-rg -n truetunestfstate -l uksouth --sku Standard_LRS --kind StorageV2 \
  --min-tls-version TLS1_2 --allow-blob-public-access false --https-only true
az storage account blob-service-properties update --subscription 919f287f-2e74-4eb4-a2d4-64506ddade51 \
  -g truetunes-rg --account-name truetunestfstate --enable-versioning true
az storage container create --subscription 919f287f-2e74-4eb4-a2d4-64506ddade51 \
  --account-name truetunestfstate -n tfstate --auth-mode key --public-access off
```

The backend finds the account key through Azure Resource Manager using whichever identity is signed
in, so no key or SAS token is stored anywhere. Blob versioning keeps the previous state files.

## What was adopted, and what was not

The `import` blocks in `imports.tf` adopted everything the old ARM template (`server/azuredeploy.json`)
described. Left out on purpose:

- `azure-webjobs-hosts`, `azure-webjobs-secrets` (created by the Functions host) and `profile-images`
  (created by the app) blobs containers. They are not in the template.
- The `Failure Anomalies - truetunes-ai` smart detector alert rule, which Application Insights created
  itself.
- The resource group, which is read with a data source.

### `ignore_changes`

Each one is there because the live resource stores no value for the attribute (the ARM template never
set it) while the provider fills in a default, so the plan would otherwise write a value that changes
nothing:

| Resource | Attribute | Live | Provider wants |
| --- | --- | --- | --- |
| Log Analytics workspace | `local_authentication_enabled` | unset | `true` |
| Application Insights | `sampling_percentage` | unset | `100` |
| Storage account | `public_network_access` | unset | `Enabled` |
| Function App | `site_config[0].application_stack[0].dotnet_version` | `v8.0` | `v4.0` (cannot be set alongside `node_version`) |
| Function App | `site_config[0].ip_restriction_default_action` and `scm_ip_restriction_default_action` | unset | `Allow` |

`app_settings` is fully managed: no key is ignored.

### The first apply

The first plan after the import reports `19 to import, 0 to add, 1 to change, 0 to destroy`. The one
change is the Function App's `app_settings`: the provider marks it sensitive and the import did not,
so Terraform shows an in-place update with the note "The value is unchanged". No individual setting
differs. A second plan after that apply reports no changes.

## Things to know

- `WEBSITE_NODE_DEFAULT_VERSION` is `~22` (`application_stack.node_version`) and must name a version the
  Windows worker has installed. `~24` took production down on 2026-11-06; see the root `CLAUDE.md`.
- The Function App's `AzureWebJobsStorage`, `WEBSITE_CONTENTAZUREFILECONNECTIONSTRING`,
  `WEBSITE_CONTENTSHARE`, `FUNCTIONS_WORKER_RUNTIME`, `FUNCTIONS_EXTENSION_VERSION`,
  `WEBSITE_NODE_DEFAULT_VERSION` and `APPLICATIONINSIGHTS_CONNECTION_STRING` are written by the provider
  from the typed arguments, not from `app_settings`.
- The live `GITHUB_ISSUES_TOKEN` is an empty string (feedback is switched off), and the live app has no
  `SONOS_USERNAME` or `SONOS_PASSWORD` yet. A secret variable left unset (`null`) leaves its setting out;
  one set to `""` writes an empty setting.
