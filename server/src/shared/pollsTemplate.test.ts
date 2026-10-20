// Run: npm test (from server/).
//
// P-11 "Poll data never expires: new Cosmos container `polls` (partition /id) with no
// defaultTtl, declared in server/azuredeploy.json (follow the existing container resources;
// plus an app setting COSMOS_POLLS_CONTAINER)."
//
// A plain JSON assertion on server/azuredeploy.json (resolves the same from src/shared and from
// dist-test/shared). The developer must add the container resource and the app setting there.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

interface Resource {
  type: string;
  name?: string;
  dependsOn?: string[];
  properties?: {
    resource?: { id?: string; partitionKey?: { paths?: string[]; kind?: string }; defaultTtl?: number };
    siteConfig?: { appSettings?: Array<{ name: string; value: string }> };
  };
}

const template = JSON.parse(readFileSync(path.resolve(__dirname, '..', '..', 'azuredeploy.json'), 'utf8')) as { resources: Resource[] };
const CONTAINER_TYPE = 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers';
const pollsContainer = () => template.resources.find((r) => r.type === CONTAINER_TYPE && r.properties?.resource?.id === 'polls');

test('P-11 template: declares a Cosmos container "polls" in the truetunes database', () => {
  const c = pollsContainer();
  assert.ok(c, 'Expected a Microsoft.DocumentDB .../sqlDatabases/containers resource with id "polls" in server/azuredeploy.json');
  assert.equal(c?.name, "[concat(variables('cosmosName'), '/truetunes/polls')]", 'Expected the resource name to follow the existing containers (database truetunes)');
  assert.ok(
    (c?.dependsOn ?? []).some((d) => d.includes("sqlDatabases") && d.includes("'truetunes'")),
    'Expected the container to depend on the truetunes database like the other containers',
  );
});

test('P-11 template: the polls container is partitioned on /id', () => {
  assert.deepEqual(pollsContainer()?.properties?.resource?.partitionKey, { paths: ['/id'], kind: 'Hash' }, 'Expected a Hash partition key on /id');
});

test('P-11 template: the polls container has no defaultTtl so poll data never expires', () => {
  const resource = pollsContainer()?.properties?.resource;
  assert.ok(resource, 'Expected the polls container to exist');
  assert.ok(!('defaultTtl' in (resource ?? {})), 'Expected no defaultTtl property on the polls container (as on the games container)');
});

test('P-11 template: the function app has the COSMOS_POLLS_CONTAINER app setting set to polls', () => {
  const site = template.resources.find((r) => r.type === 'Microsoft.Web/sites');
  const setting = site?.properties?.siteConfig?.appSettings?.find((s) => s.name === 'COSMOS_POLLS_CONTAINER');
  assert.equal(setting?.value, 'polls', 'Expected an app setting COSMOS_POLLS_CONTAINER = polls');
});
