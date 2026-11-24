# Azure Speech (text to speech): the Sonos gateway turns announcement text into MP3 with it. The gateway
# signs in with its own managed identity; no key is stored, read or output anywhere.

locals {
  # The text to speech REST endpoint on the account's own host: the regional path (/cognitiveservices/v1 on
  # uksouth.tts.speech.microsoft.com) with a /tts prefix. Proved with a real call on 2026-11-24: with Entra
  # sign-in this path answers 200 and the same path without /tts answers 404. Change it here, and nowhere else.
  speech_tts_url = "https://${azurerm_cognitive_account.speech.custom_subdomain_name}.cognitiveservices.azure.com/tts/cognitiveservices/v1"
}

# F0 is the free tier: 0.5 million characters of neural voices a month, then requests are throttled, not
# billed (README.md, "Azure Speech").
resource "azurerm_cognitive_account" "speech" {
  name                = "truetunes-speech"
  resource_group_name = local.rg
  location            = local.location
  kind                = "SpeechServices"
  sku_name            = "F0"

  # Entra sign-in needs a custom subdomain (the regional endpoint does not take Entra tokens). Once set it
  # cannot be changed or removed: a different name means a new account.
  custom_subdomain_name = "truetunes-speech"

  # Key sign-in is off, so there is no key to leak and the provider never lists keys while refreshing: it
  # calls listKeys only when this is true. Turning it on would also need
  # Microsoft.CognitiveServices/accounts/listKeys/action in the plan identity's refresh role (ci.tf).
  local_auth_enabled = false
}

# The gateway's own identity calls the synthesis API. "Speech User" can synthesise and cannot list keys or
# change the account. Like the vault role (gateway.tf), it can take a few minutes to take effect.
resource "azurerm_role_assignment" "gateway_speech_user" {
  scope                = azurerm_cognitive_account.speech.id
  role_definition_name = "Cognitive Services Speech User"
  principal_id         = azurerm_linux_web_app.gateway.identity[0].principal_id
  principal_type       = "ServicePrincipal"
}

# With key sign-in off, this role is the only way a person can make a test call from a laptop to prove the
# endpoint. It goes to the administrators already listed for the vault rather than adding a variable.
resource "azurerm_role_assignment" "speech_user" {
  for_each = var.key_vault_secrets_officers

  scope                = azurerm_cognitive_account.speech.id
  role_definition_name = "Cognitive Services Speech User"
  principal_id         = each.value
}
