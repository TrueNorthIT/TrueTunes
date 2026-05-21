import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { CosmosClient } from '@azure/cosmos';

// POST /api/profile/rename
// Body: { oid: string, oldName: string, newName: string }
//
// Migrates all Cosmos data from oldName → newName:
//   events    — re-partitions documents (userId is partition key)
//   scores    — rewrites composite id (gameId|userName)
//   profiles  — moves the document to new id
//   playlists — updates owner, members[], and track addedBy fields
//
// Returns:
//   200 { ok: true, counts: { events, scores, playlists } }
//   403 { error: 'not-owner' }  — OID doesn't own oldName
//   409 { error: 'taken' }      — newName already owned by a different OID
//   400                         — missing fields
//   500                         — Cosmos error

export async function renameUserHandler(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  const corsHeaders = { 'Access-Control-Allow-Origin': '*' };

  let body: { oid?: string; oldName?: string; newName?: string };
  try {
    body = (await request.json()) as { oid?: string; oldName?: string; newName?: string };
  } catch {
    return { status: 400, jsonBody: { error: 'Invalid JSON' }, headers: corsHeaders };
  }

  const { oid, oldName, newName } = body;
  if (!oid || !oldName || !newName) {
    return { status: 400, jsonBody: { error: 'oid, oldName, and newName required' }, headers: corsHeaders };
  }
  if (oldName === newName) {
    return { status: 200, jsonBody: { ok: true, counts: { events: 0, scores: 0, playlists: 0 } }, headers: corsHeaders };
  }

  const connStr = process.env['COSMOS_CONNECTION_STRING'];
  const dbName  = process.env['COSMOS_DATABASE'] ?? 'truetunes';
  if (!connStr) return { status: 500, jsonBody: { error: 'Cosmos not configured' }, headers: corsHeaders };

  const db = new CosmosClient(connStr).database(dbName);

  try {
    const profiles  = db.container('profiles');
    const events    = db.container('events');
    const scores    = db.container('scores');
    const playlists = db.container('playlists');

    // 1. Verify OID owns oldName.
    let oldProfile: Record<string, unknown> | undefined;
    try {
      const { resource } = await profiles.item(oldName, oldName).read<Record<string, unknown>>();
      oldProfile = resource;
    } catch (err: unknown) {
      if ((err as { code?: number }).code !== 404) throw err;
    }
    if (!oldProfile?.entraOid || oldProfile.entraOid !== oid) {
      return { status: 403, jsonBody: { error: 'not-owner' }, headers: corsHeaders };
    }

    // 2. Check newName isn't taken by a different OID.
    let newProfile: Record<string, unknown> | undefined;
    try {
      const { resource } = await profiles.item(newName, newName).read<Record<string, unknown>>();
      newProfile = resource;
    } catch (err: unknown) {
      if ((err as { code?: number }).code !== 404) throw err;
    }
    if (newProfile?.entraOid && newProfile.entraOid !== oid) {
      return { status: 409, jsonBody: { error: 'taken' }, headers: corsHeaders };
    }

    // 3. Migrate events.
    // Partition key is userId, so rename = insert into new partition + delete from old.
    const { resources: eventDocs } = await events.items
      .query<Record<string, unknown>>({
        query: 'SELECT * FROM c WHERE c.userId = @oldName',
        parameters: [{ name: '@oldName', value: oldName }],
      })
      .fetchAll();

    for (const doc of eventDocs) {
      await events.items.upsert({ ...doc, userId: newName });
      await events.item(doc.id as string, oldName).delete();
    }

    // 4. Migrate scores.
    // Partition key is gameId; id is composite "gameId|userName".
    const { resources: scoreDocs } = await scores.items
      .query<Record<string, unknown>>({
        query: 'SELECT * FROM c WHERE c.userName = @oldName',
        parameters: [{ name: '@oldName', value: oldName }],
      })
      .fetchAll();

    for (const doc of scoreDocs) {
      const newId = `${doc.gameId as string}|${newName}`;
      await scores.items.upsert({ ...doc, id: newId, userName: newName });
      await scores.item(doc.id as string, doc.gameId as string).delete();
    }

    // 5. Migrate profile document (partition key is id).
    await profiles.items.upsert({ ...oldProfile, id: newName });
    await profiles.item(oldName, oldName).delete();

    // 6. Migrate playlists: owner, members[], and track addedBy fields.
    // Single query covers owned, member, and track-addedBy cases.
    const { resources: playlistDocs } = await playlists.items
      .query<Record<string, unknown>>({
        query: `SELECT * FROM c
                WHERE c.owner = @oldName
                   OR ARRAY_CONTAINS(c.members, @oldName)
                   OR EXISTS(SELECT 1 FROM t IN c.tracks WHERE t.addedBy = @oldName)`,
        parameters: [{ name: '@oldName', value: oldName }],
      })
      .fetchAll();

    for (const pl of playlistDocs) {
      const updated = {
        ...pl,
        owner: pl.owner === oldName ? newName : pl.owner,
        members: Array.isArray(pl.members)
          ? (pl.members as string[]).map(m => (m === oldName ? newName : m))
          : pl.members,
        tracks: Array.isArray(pl.tracks)
          ? (pl.tracks as Record<string, unknown>[]).map(t =>
              t.addedBy === oldName ? { ...t, addedBy: newName } : t
            )
          : pl.tracks,
      };
      await playlists.items.upsert(updated);
    }

    context.log(
      `[rename-user] "${oldName}" → "${newName}": ` +
      `${eventDocs.length} events, ${scoreDocs.length} scores, ${playlistDocs.length} playlists`,
    );

    return {
      status: 200,
      jsonBody: { ok: true, counts: { events: eventDocs.length, scores: scoreDocs.length, playlists: playlistDocs.length } },
      headers: corsHeaders,
    };
  } catch (err) {
    context.error('[rename-user] failed:', err);
    return { status: 500, jsonBody: { error: String(err) }, headers: corsHeaders };
  }
}

app.http('rename-user', {
  methods: ['POST'],
  route: 'profile/rename',
  authLevel: 'anonymous',
  handler: renameUserHandler,
});
