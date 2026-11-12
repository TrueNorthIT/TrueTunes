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

variable "key_vault_secrets_officers" {
  type        = set(string)
  description = "Object ids of the people allowed to write secrets to the vault, for load-secrets.mjs. The secret values themselves are never Terraform inputs: the Function App reads them from Key Vault."
  default     = []
}
