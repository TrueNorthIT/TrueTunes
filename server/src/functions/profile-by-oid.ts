import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { CosmosClient } from '@azure/cosmos';

// GET /api/profile/lookup?oid=<entraOid>
//
// Returns the display name (profile id) associated with this Entra OID, if any.
//
// Returns:
//   200 { displayName: string }   — profile found
//   404 {}                        — no profile for this OID
//   400                           — missing oid
//   500                           — Cosmos error

export async function profileByOidHandler(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const oid = request.query.get('oid');
  if (!oid) return { status: 400, jsonBody: { error: 'oid required' } };

  const connStr = process.env['COSMOS_CONNECTION_STRING'];
  const dbName = process.env['COSMOS_DATABASE'] ?? 'truetunes';
  if (!connStr) return { status: 500, jsonBody: { error: 'Cosmos not configured' } };

  const container = new CosmosClient(connStr).database(dbName).container('profiles');

  try {
    const { resources } = await container.items
      .query<{ id: string }>({
        query: 'SELECT c.id FROM c WHERE c.entraOid = @oid OFFSET 0 LIMIT 1',
        parameters: [{ name: '@oid', value: oid }],
      })
      .fetchAll();

    if (resources.length === 0) {
      return { status: 404, jsonBody: {} };
    }

    context.log(`[profile-by-oid] oid=${oid} → ${resources[0].id}`);
    return { status: 200, jsonBody: { displayName: resources[0].id } };
  } catch (err) {
    context.error('[profile-by-oid] failed:', err);
    return { status: 500, jsonBody: { error: String(err) } };
  }
}

app.http('profile-by-oid', {
  methods: ['GET'],
  route: 'profile/lookup',
  authLevel: 'anonymous',
  handler: profileByOidHandler,
});
