import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { CosmosClient } from '@azure/cosmos';

export async function usersListHandler(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  const connStr = process.env['COSMOS_CONNECTION_STRING'];
  const dbName  = process.env['COSMOS_DATABASE'] ?? 'truetunes';

  if (!connStr) return { status: 500, jsonBody: { error: 'Cosmos not configured' } };

  const exclude = request.query.get('exclude') ?? '';

  try {
    const client = new CosmosClient(connStr);
    const eventsContainer   = client.database(dbName).container('events');
    const profilesContainer = client.database(dbName).container('profiles');

    const { resources } = await eventsContainer.items
      .query<{ userId: string; lastQueued: number }>({
        query: 'SELECT c.userId, MAX(c.timestamp) AS lastQueued FROM c GROUP BY c.userId',
      })
      .fetchAll();

    const sorted = resources
      .filter(r => r.userId && r.userId !== exclude)
      .sort((a, b) => b.lastQueued - a.lastQueued);

    const result = await Promise.all(
      sorted.map(async (r) => {
        try {
          const { resource } = await profilesContainer
            .item(r.userId, r.userId)
            .read<{ id: string; imageUrl?: string | null }>();
          return { userId: r.userId, lastQueued: r.lastQueued, imageUrl: resource?.imageUrl ?? null };
        } catch {
          return { userId: r.userId, lastQueued: r.lastQueued, imageUrl: null };
        }
      }),
    );

    context.log(`[users-list] count=${result.length} exclude=${exclude}`);

    return {
      jsonBody: result,
      headers: { 'Access-Control-Allow-Origin': '*' },
    };
  } catch (err) {
    context.error('[users-list] failed:', err);
    return { status: 500, jsonBody: { error: 'Internal server error' } };
  }
}

app.http('users-list', {
  methods: ['GET'],
  route: 'users',
  authLevel: 'anonymous',
  handler: usersListHandler,
});
