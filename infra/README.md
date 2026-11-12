# True Tunes infrastructure (Terraform)

Describes the production Azure resources in `truetunes-rg` (uksouth, subscription `919f287f-2e74-4eb4-a2d4-64506ddade51`).
There is one environment, so there are no modules, workspaces or per-environment files.

Merging to `main` applies this directory and publishes the functions (`.github/workflows/publish.yml`, job `deploy`).
Pull requests that touch it get the plan as a comment (`.github/workflows/infra-plan.yml`). Both sign in to Azure
with OIDC workload identity federation, so GitHub holds no Azure secret. A person runs Terraform only to bootstrap
(below) or to change the CI identities' own role assignments.

| File | What it holds |
| --- | --- |
| `versions.tf` | Terraform and provider versions, the remote state backend, the provider block |
| `main.tf` | The resource group (read only) and shared locals |
| `monitoring.tf` | Log Analytics workspace, Application Insights |
| `storage.tf` | The app storage account and its containers |
| `pubsub.tf` | Web PubSub and the `office` hub |
| `cosmos.tf` | Cosmos DB account, database and containers |
| `functions.tf` | Consumption plan, Function App and its app settings |
| `keyvault.tf` | Key Vault, the Function App's access to it |
| `gateway.tf` | The Sonos gateway: Linux plan, web app, its Key Vault access, optional custom domain and certificate |
| `ci.tf` | The two GitHub Actions identities, their federated credentials and roles |
| `scripts/load-secrets.mjs` | Copies the secrets from `.env` into the vault, by hand |
| `imports.tf` | `import` blocks that adopted the live resources into state |
| `outputs.tf` | Function URL, App Insights connection string, the ids for the GitHub variables |

## How a merge reaches production

`publish.yml` on a push to `main`:

```
validate ──► deploy ──► version ──► publish
             (infra apply,        (desktop app release)
              function publish,
              gateway deploy,
              smoke checks)
```

`version` needs `deploy`, so the desktop app is released only if the Terraform apply and the function publish for the
same commit both succeeded, because a new app may call a new function or rely on a new setting. If `deploy` fails or
is cancelled, `version` and `publish` are skipped; fix and merge again (the next release carries the missed commits).

The `deploy` job runs in the GitHub environment `production`, one at a time (`concurrency: deploy-production`):

1. `terraform init`, `fmt -check`, `validate`.
2. `terraform plan -out=tfplan`, then `terraform apply tfplan`: what runs is what was planned. The log shows resource
   addresses and actions only, never a raw plan.
3. Sign in with `azure/login`, then in `server/`: `npm ci`, `npm test`, `npm run build`, `npm prune --omit=dev`,
   `func azure functionapp publish` (replaces every function with this commit's).
4. Smoke check: `GET /api/attribution` must answer 2xx (retries for a cold start).
5. Deploy the gateway (below), then smoke check `GET https://<gateway default host>/healthz`.

The workflow publishes `github.sha` of the push to `main` and nothing else, which is how the "deploy from a tree
that contains `origin/main`" rule is kept. The Function App's Node version (`~22`) is Terraform's, in `functions.tf`;
the workflow never sets it. The runner's own Node (`.nvmrc`) only builds.

## Sonos gateway

`gateway.tf` describes `truetunes-gw`, a small always-on Node HTTP + WebSocket service (`server/src/gateway/`, entry
`dist/gateway/main.js`) that fronts all Sonos traffic. Azure Functions cannot hold a WebSocket open, so it runs on App
Service (Linux, Node 22 LTS) in its own plan, `truetunes-gw-plan`, SKU **B1**. **B1 is always on and billed monthly
whether or not anything calls it**; the Function App's consumption plan is not. The app has `always_on`, WebSockets
and a health check on `/healthz`; HTTP/2 is left at the default (off). It reads `SONOS_USERNAME` and `SONOS_PASSWORD`
through Key Vault references (its own system-assigned identity holds "Key Vault Secrets User"), plus `ENTRA_TENANT_ID`,
`ENTRA_CLIENT_ID` and the Application Insights connection string. It is reachable at `https://truetunes-gw.azurewebsites.net`
(see `terraform output gateway_default_hostname`) and, once DNS exists, at `https://truetunes.tnapps.co.uk`.

**Deploy.** In the `deploy` job, after the functions are published and in the same `azure/login` session, the job zips
`server/dist`, the production `node_modules` that `npm prune --omit=dev` left, and `package.json`, and runs
`az webapp deploy --type zip --clean true --restart true` against `truetunes-gw`. Nothing is built on the server
(`SCM_DO_BUILD_DURING_DEPLOYMENT=false`); the start command is `node dist/gateway/main.js`. The restart also makes
the app resolve its Key Vault references again. The smoke check then calls `/healthz` on the `azurewebsites.net`
host (it exists before DNS does) with retries and fails the job on a non-2xx.

**Custom domain.** The `tnapps.co.uk` zone (resource group `truenorth-general`) is outside this pipeline, so a person
creates two records first, then turns the binding on. In this order:

1. Apply this directory **by hand, once, by a person** ("Running it locally"). The gateway adds an entry to the
   `ci_plan_refresh` assignments in `ci.tf`, a role assignment of a custom role, which the deploy identity's condition
   does not allow, so a CI apply of this change fails with an authorisation error. After that apply the app exists and
   CI applies everything else.
2. In the `tnapps.co.uk` zone create:

   | Record | Name | Value |
   | --- | --- | --- |
   | CNAME | `truetunes` | `terraform output -raw gateway_default_hostname` (`truetunes-gw.azurewebsites.net`) |
   | TXT | `asuid.truetunes` | `terraform output -raw gateway_domain_verification_id` |

3. Set the repository variable (default `false` when unset), then merge anything or re-run `deploy`:

   ```bash
   gh variable set GATEWAY_CUSTOM_DOMAIN_ENABLED --repo TrueNorthIT/TrueTunes --body true
   ```

   For a local apply use `TF_VAR_gateway_custom_domain_enabled=true` or `gateway_custom_domain_enabled = true` in
   `terraform.tfvars`.
4. That apply adds the hostname binding, a free App Service managed certificate and the SNI binding. Azure checks the
   two records when it creates the binding, and the managed certificate needs the CNAME to resolve; if the apply fails
   on either, fix the record and apply again.

Setting the variable before the records exist makes every `deploy` fail at the binding, which blocks the desktop
release. The deploy smoke check uses the default host, so it does not prove the custom domain.

## CI identities

Both are user-assigned managed identities in `ci.tf`, each with one federated credential for
`TrueNorthIT/TrueTunes`. A credential matches the token's `sub` claim exactly; no branch or workflow other than
the one named can use the identity.

| Identity | `sub` it accepts | Used by |
| --- | --- | --- |
| `truetunes-ci-deploy` | `repo:TrueNorthIT/TrueTunes:environment:production` | `deploy` job (only reachable from `main`, see the environment's branch policy below) |
| `truetunes-ci-plan` | `repo:TrueNorthIT/TrueTunes:pull_request` | `plan` job on pull requests |

### `truetunes-ci-deploy`

| Role | Scope | Why |
| --- | --- | --- |
| Contributor | resource group | create, change and delete the resources in this directory; publish function code |
| Role Based Access Control Administrator | resource group | `keyvault.tf` assigns Key Vault roles, which Contributor cannot do |
| Storage Blob Data Contributor | `tfstate` container | read and write state and take its lock (Entra auth) |

The Key Vault assignment for the gateway (`gateway_secrets_user`) is within that condition, so CI can create it. The RBAC Administrator role is broad (it can grant access), so its assignment has a condition: it may only add or
remove assignments of "Key Vault Secrets User" and "Key Vault Secrets Officer". It cannot make itself Owner, and it
cannot change the role assignments in `ci.tf`: a change to those is applied by a person, and a CI apply that includes
one fails with an authorisation error. Contributor also lets it change the state storage account's settings (not its
blobs).

### `truetunes-ci-plan`

| Role | Scope | Why |
| --- | --- | --- |
| Reader | resource group | refresh every resource |
| `truetunes-ci-plan-refresh` (custom) | Function App, gateway web app, app storage account, Cosmos account, Web PubSub, Log Analytics workspace | the `list*` actions the azurerm provider calls while refreshing, below |
| Storage Blob Data Reader | `tfstate` container | read state; plans run with `-lock=false` because the lock is a write |

The custom role has these actions and nothing else (no write, no delete): `Microsoft.Web/sites/config/list/action`,
`Microsoft.Storage/storageAccounts/listKeys/action`, `Microsoft.DocumentDB/databaseAccounts/listKeys/action`,
`.../readonlykeys/action`, `.../listConnectionStrings/action`, `Microsoft.SignalRService/webPubSub/listKeys/action`
and `Microsoft.OperationalInsights/workspaces/sharedKeys/action`. It is assigned per resource, not on the group, so
the identity cannot list the state account's keys (which would let it write state).

**This identity cannot create, modify or delete any Azure resource and cannot write state. It can read the Function
App's app settings, the storage, Cosmos, Web PubSub and Log Analytics keys, and the state blob, which holds the same
values. That is what `terraform plan` needs; it is read access to secrets, not an absence of it.** Key Vault secrets
themselves are not readable by it (no data-plane role on the vault). Whoever can open a pull request in this
repository can run Terraform code as this identity (a `pull_request` token does not say which branch it came from),
so write access to the repository is the trust boundary. Fork and Dependabot pull requests get no plan.

The state backend uses Entra auth (`use_azuread_auth` in `versions.tf`), not the account key, so neither identity
needs `listKeys` on the state account.

## CI bootstrap

The identities cannot create themselves, so one apply is by a person, **before** the first merge to `main` (a merge
without these steps fails `deploy` and so blocks the desktop release). With the TrueNorth admin Azure CLI identity
(`tnit-admin` azswap profile) signed in, and the GitHub CLI signed in as a repository admin:

1. Production must already be on Key Vault references: the four secrets are in `truetunes-kv` (see
   [Key Vault and secrets](#key-vault-and-secrets)) and the Function App's settings show them as references. This
   configuration has no secret variables, so a plan against a not-yet-migrated app would try to replace the literals.

2. Give yourself data access to the state container (the backend now uses Entra auth, and Owner does not include
   blob data actions):

   ```bash
   az role assignment create --assignee-object-id "$(az ad signed-in-user show --query id -o tsv)" \
     --assignee-principal-type User --role "Storage Blob Data Contributor" \
     --scope /subscriptions/919f287f-2e74-4eb4-a2d4-64506ddade51/resourceGroups/truetunes-rg/providers/Microsoft.Storage/storageAccounts/truetunestfstate/blobServices/default/containers/tfstate
   ```

3. Plan and apply this directory once by hand. Read the plan: expect the new identities, credentials, role
   definition and assignments, and the `moved` of `function_app_secrets_user[0]`; expect no change to the Function App.
   Never paste an unredacted plan.

   ```bash
   cd infra
   export TF_VAR_entra_tenant_id=<ENTRA_TENANT_ID> TF_VAR_entra_client_id=<ENTRA_CLIENT_ID> TF_VAR_auth_enforce=false
   export TF_VAR_key_vault_secrets_officers='["<your Entra object id>"]'   # or '[]'
   terraform init -reconfigure     # the backend changed from key lookup to Entra auth
   terraform plan -out=tfplan
   terraform apply tfplan
   ```

4. Set the repository variables (none is a secret; the client ids are public identifiers). `AUTH_ENFORCE` must be the
   value production has now. The Entra values are the same ones the `publish` job already has as secrets
   `ENTRA_TENANT_ID` and `ENTRA_CLIENT_ID`:

   ```bash
   gh variable set AZURE_TENANT_ID       --repo TrueNorthIT/TrueTunes --body "$(terraform output -raw ci_tenant_id)"
   gh variable set AZURE_SUBSCRIPTION_ID --repo TrueNorthIT/TrueTunes --body "$(terraform output -raw ci_subscription_id)"
   gh variable set AZURE_DEPLOY_CLIENT_ID --repo TrueNorthIT/TrueTunes --body "$(terraform output -raw ci_deploy_client_id)"
   gh variable set AZURE_PLAN_CLIENT_ID  --repo TrueNorthIT/TrueTunes --body "$(terraform output -raw ci_plan_client_id)"
   gh variable set ENTRA_TENANT_ID       --repo TrueNorthIT/TrueTunes --body "<ENTRA_TENANT_ID>"
   gh variable set ENTRA_CLIENT_ID       --repo TrueNorthIT/TrueTunes --body "<ENTRA_CLIENT_ID>"
   gh variable set AUTH_ENFORCE          --repo TrueNorthIT/TrueTunes --body "false"
   # Whoever may run load-secrets.mjs; CI would otherwise remove their assignment. Use "[]" for nobody.
   gh variable set KEY_VAULT_SECRETS_OFFICERS --repo TrueNorthIT/TrueTunes --body '["<your Entra object id>"]'
   ```

5. Create the `production` environment and let only `main` deploy to it. The federated credential trusts the
   environment name, so this branch policy is what keeps other branches out:

   ```bash
   gh api --method PUT repos/TrueNorthIT/TrueTunes/environments/production \
     --input - <<< '{"deployment_branch_policy":{"protected_branches":false,"custom_branch_policies":true}}'
   gh api --method POST repos/TrueNorthIT/TrueTunes/environments/production/deployment-branch-policies \
     -f name=main -f type=branch
   ```

6. Role assignments can take a few minutes to take effect. Then open a pull request that touches `infra/`: the plan
   comment appears. If a run's sign-in fails with `AADSTS70021` ("no matching federated identity record"), the log
   shows the `sub` the token carried; compare it with the credential in `ci.tf`.

To change `AUTH_ENFORCE` (or the Entra ids), change the repository variable and re-run the `deploy` job or merge
anything: they are Terraform inputs, so the next apply writes them to the Function App.

## Running it locally

Only for the bootstrap above or an emergency; CI applies everything else. Pick the TrueNorth admin Azure CLI identity
first (the `azswap` `tnit-admin` profile), with "Storage Blob Data Contributor" on the state container (step 2), then:

```bash
cd infra
terraform init
terraform plan
```

Supply `ENTRA_TENANT_ID`, `ENTRA_CLIENT_ID`, `AUTH_ENFORCE`, `GATEWAY_CUSTOM_DOMAIN_ENABLED` (as `gateway_custom_domain_enabled`) and `KEY_VAULT_SECRETS_OFFICERS` (matching the repository variables, or the apply will change them) as `TF_VAR_*` environment variables or an untracked
`terraform.tfvars` (see `terraform.tfvars.example`). There are no secret inputs. `*.tfvars` and `*.tfstate*` are
git-ignored. Never paste an unredacted plan or `terraform show` output: the Function App's resolved settings and the
provider's keys are in them.

## Remote state

State is in the storage account `truetunestfstate` (container `tfstate`, blob `truetunes.tfstate`), in the same
resource group. It is not managed by Terraform (it would have to exist before Terraform could store its own state),
and it is separate from the app's storage account. It was created once with:

```bash
az storage account create --subscription 919f287f-2e74-4eb4-a2d4-64506ddade51 \
  -g truetunes-rg -n truetunestfstate -l uksouth --sku Standard_LRS --kind StorageV2 \
  --min-tls-version TLS1_2 --allow-blob-public-access false --https-only true
az storage account blob-service-properties update --subscription 919f287f-2e74-4eb4-a2d4-64506ddade51 \
  -g truetunes-rg --account-name truetunestfstate --enable-versioning true
az storage container create --subscription 919f287f-2e74-4eb4-a2d4-64506ddade51 \
  --account-name truetunestfstate -n tfstate --auth-mode key --public-access off
```

The backend authenticates to the blob with Entra ID (`use_azuread_auth`): the Azure CLI's account locally, the
federated identity in CI (`ARM_USE_OIDC`, `ARM_CLIENT_ID`, `ARM_TENANT_ID`). No key or SAS token is stored or looked
up. Blob versioning keeps the previous state files.

## What was adopted, and what was not

The `import` blocks in `imports.tf` adopted everything the old ARM template described. Left out on purpose:

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

## Key Vault and secrets

`keyvault.tf` creates `truetunes-kv` (RBAC authorisation, soft delete 90 days), gives the Function App a
system-assigned identity and grants it "Key Vault Secrets User". Terraform never holds a secret value: the four
secret settings (`VESTABOARD_API_KEY`, `GITHUB_APP_PRIVATE_KEY`, `SONOS_USERNAME`, `SONOS_PASSWORD`) are always
`@Microsoft.KeyVault(SecretUri=...)` references. A reference to a secret that does not exist hands the app the
reference text, so the vault must hold all four before an apply that first introduces the references.

To load or rotate a secret, by a person with "Key Vault Secrets Officer" on the vault (add your Entra object id to the
`KEY_VAULT_SECRETS_OFFICERS` repository variable, a JSON list; the next deploy applies it): fill `VESTABOARD_API_KEY`,
`SONOS_USERNAME` and `SONOS_PASSWORD` in the root `.env` (all non-empty), then run `node infra/scripts/load-secrets.mjs`
from the repo root with the admin identity signed in (from a worktree, pass the main checkout's `.env` path as the
first argument). The fourth, the feedback GitHub App's private key, comes from the `.pem` GitHub gave you, not `.env`:

```bash
az keyvault secret set --vault-name truetunes-kv --name github-app-private-key --file <path-to.pem> --encoding utf-8 --query name
```

The App's id and installation id are not secret and sit in `functions.tf`. Role assignments can take a few minutes. Check the Function App's Configuration page shows each setting with a green "Key Vault Reference"
tick, and that `/api/attribution` still answers. The vault name and secret names are mirrored in
`scripts/load-secrets.mjs`; change both together.

## Things to know

- `WEBSITE_NODE_DEFAULT_VERSION` is `~22` (`application_stack.node_version`) and must name a version the
  Windows worker has installed. `~24` took production down on 2026-11-06; see the root `CLAUDE.md`. CI never sets it.
- The Function App's `AzureWebJobsStorage`, `WEBSITE_CONTENTAZUREFILECONNECTIONSTRING`,
  `WEBSITE_CONTENTSHARE`, `FUNCTIONS_WORKER_RUNTIME`, `FUNCTIONS_EXTENSION_VERSION`,
  `WEBSITE_NODE_DEFAULT_VERSION` and `APPLICATIONINSIGHTS_CONNECTION_STRING` are written by the provider
  from the typed arguments, not from `app_settings`.
- `function_app_secrets_user` used to have a `count` (the provider hides a new identity's principal id until after
  apply). The identity has long been in state, so it is a plain resource now, with a `moved` block from index 0.
