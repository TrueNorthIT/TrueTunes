variable "subscription_id" {
  type        = string
  description = "Subscription holding truetunes-rg (\"Business\")."
  default     = "919f287f-2e74-4eb4-a2d4-64506ddade51"
}

variable "resource_group_name" {
  type    = string
  default = "truetunes-rg"
}

variable "entra_tenant_id" {
  type        = string
  description = "Entra tenant the desktop app signs in to (ENTRA_TENANT_ID). The functions verify the caller's token against it."
}

variable "entra_client_id" {
  type        = string
  description = "The desktop app's Entra app registration (ENTRA_CLIENT_ID): the audience of the tokens the functions accept."
}

variable "auth_enforce" {
  type        = string
  description = "Transitional. \"false\" still lets requests without a token through (logged), for clients released before tokens. Set \"true\" once every client sends one."
  default     = "false"

  validation {
    condition     = contains(["true", "false"], var.auth_enforce)
    error_message = "auth_enforce must be \"true\" or \"false\"."
  }
}

# Secret app settings. Null (not set) leaves the setting out of the Function App altogether; an empty
# string writes an empty setting, which is what the live GITHUB_ISSUES_TOKEN is today.
variable "vestaboard_api_key" {
  type        = string
  description = "Vestaboard Read/Write API key. Unset disables Vestaboard messages."
  default     = null
  sensitive   = true
}

variable "github_issues_token" {
  type        = string
  description = "Fine-grained GitHub token, Issues read/write on TrueNorthIT/TrueTunes only, for the feedback function. Unset or empty disables feedback."
  default     = null
  sensitive   = true
}

variable "sonos_username" {
  type        = string
  description = "Sonos service account username, for the sonos-session function. Unset disables the shared Sonos session."
  default     = null
  sensitive   = true
}

variable "sonos_password" {
  type        = string
  description = "Sonos service account password, for the sonos-session function. Unset disables the shared Sonos session."
  default     = null
  sensitive   = true
}

variable "use_key_vault_references" {
  type        = bool
  description = "false: the secret app settings carry their literal values (from the variables above). true: they become Key Vault references. Turn on only after infra/scripts/load-secrets.mjs has loaded every secret, or the app will read the unresolved reference text."
  default     = false
}

variable "key_vault_secrets_officers" {
  type        = set(string)
  description = "Object ids of the people (or pipeline identity) allowed to write secrets to the vault, for load-secrets.mjs."
  default     = []
}
