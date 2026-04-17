import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { WebPubSubServiceClient } from '@azure/web-pubsub';
import {
  BlobServiceClient,
  generateBlobSASQueryParameters,
  BlobSASPermissions,
  StorageSharedKeyCredential,
} from '@azure/storage-blob';

const HUB = 'office';
const CONTAINER = 'attribution';
const BLOB = 'attribution.json';
const TOKEN_TTL_MINUTES = 60;
const SAS_TTL_HOURS = 8;

export async function connectHandler(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  const username = request.query.get('username') ?? 'Unknown';
  context.log(`[connect] username=${username}`);

  const wpsConnStr = process.env['WEBPUBSUB_CONNECTION_STRING'];
  const storageConnStr = process.env['STORAGE_CONNECTION_STRING'];

  if (!wpsConnStr || !storageConnStr) {
    return { status: 500, jsonBody: { error: 'Server not configured' } };
  }

  try {
    // ── Web PubSub client access URL ─────────────────────────────────────────
    const wpsClient = new WebPubSubServiceClient(wpsConnStr, HUB);
    const token = await wpsClient.getClientAccessToken({
      userId: username,
      roles: [
        `webpubsub.sendToGroup.${HUB}`,
        `webpubsub.joinLeaveGroup.${HUB}`,
      ],
      expirationTimeInMinutes: TOKEN_TTL_MINUTES,
    });

    // ── Blob SAS URL ──────────────────────────────────────────────────────────
    const accountNameMatch = storageConnStr.match(/AccountName=([^;]+)/);
    const accountKeyMatch = storageConnStr.match(/AccountKey=([^;]+)/);
    if (!accountNameMatch || !accountKeyMatch) {
      return { status: 500, jsonBody: { error: 'Invalid storage connection string' } };
    }
    const accountName = accountNameMatch[1];
    const accountKey = accountKeyMatch[1];

    // Ensure container exists
    const blobServiceClient = BlobServiceClient.fromConnectionString(storageConnStr);
    const containerClient = blobServiceClient.getContainerClient(CONTAINER);
    await containerClient.createIfNotExists();

    const sharedKeyCredential = new StorageSharedKeyCredential(accountName, accountKey);
    const expiresOn = new Date(Date.now() + SAS_TTL_HOURS * 60 * 60 * 1000);
    const sasToken = generateBlobSASQueryParameters(
      {
        containerName: CONTAINER,
        blobName: BLOB,
        permissions: BlobSASPermissions.parse('rw'),
        expiresOn,
      },
      sharedKeyCredential,
    ).toString();

    const blobSasUrl = `https://${accountName}.blob.core.windows.net/${CONTAINER}/${BLOB}?${sasToken}`;

    return {
      jsonBody: {
        webPubSubUrl: token.url,
        blobSasUrl,
      },
      headers: { 'Access-Control-Allow-Origin': '*' },
    };
  } catch (err) {
    context.error('[connect] Error:', err);
    return { status: 500, jsonBody: { error: String(err) } };
  }
}

app.http('connect', {
  methods: ['GET', 'POST'],
  authLevel: 'anonymous',
  handler: connectHandler,
});
