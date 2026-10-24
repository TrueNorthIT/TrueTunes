import type { HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { CosmosClient, type Container } from '@azure/cosmos';
import { authenticate, entraCheckFromEnv, type EntraTokenCheck } from '../shared/auth';

let profiles: Container | undefined;

/** The display name whose profile this Entra oid has claimed, or null. */
export async function displayNameForOid(oid: string): Promise<string | null> {
  if (!profiles) {
    const connStr = process.env['COSMOS_CONNECTION_STRING'];
    if (!connStr) throw new Error('Cosmos not configured');
    profiles = new CosmosClient(connStr).database(process.env['COSMOS_DATABASE'] ?? 'truetunes').container('profiles');
  }
  const { resources } = await profiles.items
    .query<{ id: string }>({
      query: 'SELECT c.id FROM c WHERE c.entraOid = @oid OFFSET 0 LIMIT 1',
      parameters: [{ name: '@oid', value: oid }],
    })
    .fetchAll();
  return resources[0]?.id ?? null;
}

/**
 * The display name a request acts as. With a token it is the name the token's oid has
 * claimed, whatever the body says. Without a token, or with one whose oid has claimed no
 * profile, it is the name the body claims, which is allowed only while AUTH_ENFORCE is off.
 * The options exist for tests.
 */
export async function callerName(
  request: HttpRequest,
  context: InvocationContext,
  claimed: string | null | undefined,
  {
    lookup = displayNameForOid,
    check = entraCheckFromEnv(),
    enforce = process.env['AUTH_ENFORCE'] === 'true',
  }: { lookup?: (oid: string) => Promise<string | null>; check?: EntraTokenCheck; enforce?: boolean } = {}
): Promise<{ name: string } | { response: HttpResponseInit }> {
  const auth = await authenticate(request, context, check, enforce);
  if ('response' in auth) return auth;
  if (!auth.oid) {
    return claimed ? { name: claimed } : { response: { status: 400, jsonBody: { error: 'userName required' } } };
  }
  let name: string | null;
  try {
    name = await lookup(auth.oid);
  } catch (err) {
    context.error('[auth] profile lookup failed:', err);
    return { response: { status: 500, jsonBody: { error: 'profile lookup failed' } } };
  }
  if (!name) {
    if (enforce) return { response: { status: 403, jsonBody: { error: 'no profile for this account' } } };
    // The claim at sign-in failed or the name belongs to someone else: act as the claimed name,
    // exactly what an old client gets, so a new client loses nothing while enforcement is off.
    if (!claimed) return { response: { status: 400, jsonBody: { error: 'userName required' } } };
    context.warn(
      `[auth] no profile for oid ${auth.oid}: using the claimed name "${claimed}" while AUTH_ENFORCE is off`
    );
    return { name: claimed };
  }
  if (claimed && claimed !== name)
    context.warn(`[auth] body claimed "${claimed}", token says "${name}": using the token`);
  return { name };
}
