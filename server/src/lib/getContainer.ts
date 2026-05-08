import { CosmosClient, Container } from '@azure/cosmos';

let _container: Container | undefined;

export function getPlaylistContainer(): Container {
  if (!_container) {
    const connStr = process.env['COSMOS_CONNECTION_STRING'];
    if (!connStr) throw new Error('Cosmos not configured');
    _container = new CosmosClient(connStr)
      .database(process.env['COSMOS_DATABASE'] ?? 'truetunes')
      .container('playlists');
  }
  return _container;
}
