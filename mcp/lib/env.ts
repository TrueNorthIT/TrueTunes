// Configuration, read lazily so a missing value fails the request that needs it, not the build.

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

export const env = {
  sonosUsername: () => required('SONOS_USERNAME'),
  sonosPassword: () => required('SONOS_PASSWORD'),
  entraTenantId: () => required('ENTRA_TENANT_ID'),
  /** The TrueTunes app registration, so the ID tokens it issues are the ones the Azure Functions accept. */
  entraClientId: () => required('ENTRA_CLIENT_ID'),
  entraClientSecret: () => required('ENTRA_CLIENT_SECRET'),
  /** Signs our access tokens and encrypts what we keep in Redis. 32+ random bytes. */
  tokenSecret: () => required('TOKEN_SECRET'),
  functionsUrl: () => (process.env['TRUETUNES_FN_URL'] ?? 'https://truetunes-fn.azurewebsites.net').replace(/\/$/, ''),
  /** Room (group or speaker name) to use when a request doesn't name one. */
  defaultRoom: () => process.env['DEFAULT_ROOM'] || undefined,
  /** Volume ceiling for chat requests, 0-100. */
  maxVolume: () => {
    const n = Number(process.env['MAX_VOLUME']);
    return Number.isFinite(n) && n > 0 && n <= 100 ? n : 100;
  },
  /** Fixed public origin, if the deployment is reached through more than one host. */
  publicUrl: () => process.env['PUBLIC_URL']?.replace(/\/$/, '') || undefined,
};

/** The origin clients see: PUBLIC_URL if set, else the request's own. */
export function publicOrigin(req: Request): string {
  return env.publicUrl() ?? new URL(req.url).origin;
}
