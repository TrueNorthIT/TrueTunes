/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** The web app's sign-in: the Entra app registration and tenant (public identifiers, set at build time). */
  readonly VITE_ENTRA_CLIENT_ID?: string;
  readonly VITE_ENTRA_TENANT_ID?: string;
}
