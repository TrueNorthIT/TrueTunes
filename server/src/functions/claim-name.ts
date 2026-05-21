import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { CosmosClient } from '@azure/cosmos';

// POST /api/profile/claim
// Body: { oid: string, displayName: string }
//
// Adds entraOid to the profiles document for displayName, enforcing 1:1 ownership.
// Also releases any previous claim this OID held on a different display name.
//
// Returns:
//   200 { ok: true }             — claimed or already owned by this OID
//   409 { error: 'taken' }       — another OID already owns this display name
//   400                          — missing fields
//   500                          — Cosmos error

export async function claimNameHandler(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  const corsHeaders = { 'Access-Control-Allow-Origin': '*' };

  let body: { oid?: string; displayName?: string };
  try {
    body = (await request.json()) as { oid?: string; displayName?: string };
  } catch {
    return { status: 400, jsonBody: { error: 'Invalid JSON' }, headers: corsHeaders };
  }

  const { oid, displayName } = body;
  if (!oid || !displayName) {
    return { status: 400, jsonBody: { error: 'oid and displayName required' }, headers: corsHeaders };
  }

  const connStr = process.env['COSMOS_CONNECTION_STRING'];
  const dbName  = process.env['COSMOS_DATABASE'] ?? 'truetunes';
  if (!connStr) return { status: 500, jsonBody: { error: 'Cosmos not configured' }, headers: corsHeaders };

  const container = new CosmosClient(connStr).database(dbName).container('profiles');

  try {
    // 1. Check if the requested display name is already claimed by someone else.
    let existing: Record<string, unknown> | undefined;
    try {
      const { resource } = await container.item(displayName, displayName).read<Record<string, unknown>>();
      existing = resource;
    } catch (err: unknown) {
      if ((err as { code?: number }).code !== 404) throw err;
    }

    if (existing?.entraOid && existing.entraOid !== oid) {
      // Owned by a different Entra user — reject.
      return { status: 409, jsonBody: { error: 'taken' }, headers: corsHeaders };
    }

    // 2. Release any previous claim this OID held on a different display name.
    //    Cross-partition query is fine for a small user base.
    const { resources: prevClaims } = await container.items
      .query<Record<string, unknown>>({
        query: 'SELECT * FROM c WHERE c.entraOid = @oid AND c.id != @displayName',
        parameters: [
          { name: '@oid', value: oid },
          { name: '@displayName', value: displayName },
        ],
      })
      .fetchAll();

    for (const prev of prevClaims) {
      const { entraOid: _removed, ...rest } = prev as Record<string, unknown> & { entraOid?: unknown };
      await container.items.upsert(rest);
    }

    // 3. Upsert the profile with this OID as owner.
    const upserted = { ...(existing ?? {}), id: displayName, entraOid: oid };
    await container.items.upsert(upserted);

    context.log(`[claim-name] ${displayName} claimed by oid=${oid}`);
    return { status: 200, jsonBody: { ok: true }, headers: corsHeaders };
  } catch (err) {
    context.error('[claim-name] failed:', err);
    return { status: 500, jsonBody: { error: String(err) }, headers: corsHeaders };
  }
}

app.http('claim-name', {
  methods: ['POST'],
  route: 'profile/claim',
  authLevel: 'anonymous',
  handler: claimNameHandler,
});
