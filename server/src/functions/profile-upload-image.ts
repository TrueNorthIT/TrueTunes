import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import {
  BlobServiceClient,
  StorageSharedKeyCredential,
  BlobSASPermissions,
  generateBlobSASQueryParameters,
} from '@azure/storage-blob';
import { CosmosClient } from '@azure/cosmos';

const ALLOWED_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg':  'jpg',
  'image/png':  'png',
  'image/webp': 'webp',
  'image/gif':  'gif',
};

function parseConnStr(s: string): { accountName: string; accountKey: string } {
  const parts = Object.fromEntries(
    s.split(';').filter(Boolean).map(p => {
      const idx = p.indexOf('=');
      return [p.slice(0, idx), p.slice(idx + 1)] as [string, string];
    })
  );
  return { accountName: parts['AccountName'] ?? '', accountKey: parts['AccountKey'] ?? '' };
}

export async function profileUploadImageHandler(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  const userName = request.params['userName'];
  if (!userName) return { status: 400, jsonBody: { error: 'userName required' } };

  const storageConn = process.env['STORAGE_CONNECTION_STRING'];
  const cosmosConn  = process.env['COSMOS_CONNECTION_STRING'];
  const dbName      = process.env['COSMOS_DATABASE'] ?? 'truetunes';

  if (!storageConn || !cosmosConn) {
    return { status: 500, jsonBody: { error: 'Storage or Cosmos not configured' } };
  }

  const mimeType = request.headers.get('content-type')?.split(';')[0]?.trim() ?? '';
  const ext = ALLOWED_TYPES[mimeType];
  if (!ext) return { status: 400, jsonBody: { error: `Unsupported image type: ${mimeType}` } };

  const body = await request.arrayBuffer();
  if (!body || body.byteLength === 0) return { status: 400, jsonBody: { error: 'Empty body' } };
  if (body.byteLength > 5 * 1024 * 1024) return { status: 413, jsonBody: { error: 'Image must be under 5 MB' } };

  try {
    const { accountName, accountKey } = parseConnStr(storageConn);
    const sharedKeyCredential = new StorageSharedKeyCredential(accountName, accountKey);
    const blobServiceClient = new BlobServiceClient(
      `https://${accountName}.blob.core.windows.net`,
      sharedKeyCredential,
    );

    const containerClient = blobServiceClient.getContainerClient('profile-images');
    await containerClient.createIfNotExists();

    const blobName  = `${userName}.${ext}`;
    const blockBlob = containerClient.getBlockBlobClient(blobName);
    await blockBlob.upload(body, body.byteLength, {
      blobHTTPHeaders: { blobContentType: mimeType },
    });

    const expiresOn = new Date();
    expiresOn.setFullYear(expiresOn.getFullYear() + 20);
    const sas = generateBlobSASQueryParameters(
      {
        containerName: 'profile-images',
        blobName,
        permissions: BlobSASPermissions.parse('r'),
        startsOn: new Date(),
        expiresOn,
      },
      sharedKeyCredential,
    );
    const imageUrl = `${blockBlob.url}?${sas}`;

    const cosmos = new CosmosClient(cosmosConn);
    await cosmos.database(dbName).container('profiles').items.upsert({
      id: userName,
      imageUrl,
      updatedAt: Date.now(),
    });

    context.log(`[profile-upload-image] userName=${userName} ext=${ext} size=${body.byteLength}`);

    return {
      jsonBody: { imageUrl },
      headers: { 'Access-Control-Allow-Origin': '*' },
    };
  } catch (err) {
    context.error('[profile-upload-image] failed:', err);
    return { status: 500, jsonBody: { error: String(err) } };
  }
}

app.http('profile-upload-image', {
  methods: ['POST'],
  route: 'profile/{userName}/image',
  authLevel: 'anonymous',
  handler: profileUploadImageHandler,
});
