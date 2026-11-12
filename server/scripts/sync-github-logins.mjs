// Fills `githubLogin` on True Tunes profiles so the feedback function can assign and
// @mention reporters on the issues it opens.
//
// Run by hand by a GitHub enterprise owner (TrueNorthIT), from server/:
//   node scripts/sync-github-logins.mjs            dry run (the default): counts and GitHub logins only
//   node scripts/sync-github-logins.mjs --write    apply the updates
//
// Needs:
//   - `gh` on PATH, signed in with the admin:enterprise (or read:enterprise) scope.
//   - `az` on PATH, signed in to the TrueNorth tenant. Set AZURE_CONFIG_DIR for the right
//     profile before running (see the azswap profiles); it is used only to resolve a
//     sign-in address to an Entra object id.
//   - COSMOS_CONNECTION_STRING in the environment (COSMOS_DATABASE optional, default
//     'truetunes'), the same settings the functions use. This script never reads .env.
//
// How: the enterprise's SAML identities give { GitHub login, nameId } where nameId is the
// person's Entra sign-in address. Each is resolved to an object id with
// `az ad user show`, and the profile whose `entraOid` equals it gets `githubLogin`.
// Profiles hold no email, so the object id is the only safe join. Output never includes
// sign-in addresses or object ids.
import { spawnSync } from 'node:child_process';
import { CosmosClient } from '@azure/cosmos';

const ENTERPRISE = 'TrueNorthIT';
const write = process.argv.includes('--write');

// Same rule as isGithubLogin in src/shared/githubIssues.ts (restated: nothing is imported from dist).
const LOGIN = /^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}$/i;
// A plain sign-in address. Anything odder is skipped as unresolved: on Windows `az` is a .cmd
// and needs a shell, so only characters that are inert there are let through.
const SIGN_IN = /^[\w.+~]+(?:[-\w.+~]*[\w.+~])?@[a-z\d](?:[a-z\d.-]*[a-z\d])?$/i;
const shell = process.platform === 'win32';

function run(cmd, args) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', shell, windowsHide: true });
  if (r.status !== 0) return null;
  return r.stdout.trim();
}

const QUERY = `query($cursor: String) {
  enterprise(slug: "${ENTERPRISE}") { ownerInfo { samlIdentityProvider {
    externalIdentities(first: 100, after: $cursor) {
      pageInfo { hasNextPage endCursor }
      nodes { user { login } samlIdentity { nameId } }
    }
  } } }
}`;

function fetchPairs() {
  const pairs = [];
  let cursor = null;
  for (;;) {
    const args = ['api', 'graphql', '-f', `query=${QUERY.replace(/\s+/g, ' ')}`];
    if (cursor) args.push('-f', `cursor=${cursor}`);
    // gh's own arguments here are fixed; the query is passed as one argv entry.
    const out = shell ? runGhWindows(args) : run('gh', args);
    if (!out) throw new Error('gh api graphql failed: is gh signed in with an enterprise scope?');
    const page = JSON.parse(out).data?.enterprise?.ownerInfo?.samlIdentityProvider?.externalIdentities;
    if (!page) throw new Error('No SAML identities returned: are you an enterprise owner with SAML configured?');
    for (const n of page.nodes) {
      if (n.user?.login && n.samlIdentity?.nameId) pairs.push({ login: n.user.login, nameId: n.samlIdentity.nameId });
    }
    if (!page.pageInfo.hasNextPage) return pairs;
    cursor = page.pageInfo.endCursor;
  }
}

// gh is a real .exe on Windows, so it needs no shell (which would mangle the query).
function runGhWindows(args) {
  const r = spawnSync('gh', args, { encoding: 'utf8', shell: false, windowsHide: true });
  return r.status === 0 ? r.stdout.trim() : null;
}

function resolveOid(nameId) {
  if (!SIGN_IN.test(nameId)) return null;
  const oid = run('az', ['ad', 'user', 'show', '--id', nameId, '--query', 'id', '-o', 'tsv']);
  return oid && /^[0-9a-f-]{36}$/i.test(oid) ? oid : null;
}

const connStr = process.env['COSMOS_CONNECTION_STRING'];
if (!connStr) {
  console.error('COSMOS_CONNECTION_STRING is not set.');
  process.exit(1);
}
const profiles = new CosmosClient(connStr)
  .database(process.env['COSMOS_DATABASE'] ?? 'truetunes')
  .container('profiles');

const counts = { pairs: 0, resolved: 0, matched: 0, wouldUpdate: 0, alreadyCorrect: 0, unresolved: 0, noProfile: 0 };
const updated = [];

for (const { login, nameId } of fetchPairs()) {
  counts.pairs++;
  if (!LOGIN.test(login)) {
    counts.unresolved++;
    continue;
  }
  const oid = resolveOid(nameId);
  if (!oid) {
    counts.unresolved++;
    continue;
  }
  counts.resolved++;
  const { resources } = await profiles.items
    .query({ query: 'SELECT * FROM c WHERE c.entraOid = @oid', parameters: [{ name: '@oid', value: oid }] })
    .fetchAll();
  if (resources.length !== 1) {
    counts.noProfile++;
    continue;
  }
  counts.matched++;
  const profile = resources[0];
  if (profile.githubLogin === login) {
    counts.alreadyCorrect++;
    continue;
  }
  counts.wouldUpdate++;
  if (write) await profiles.items.upsert({ ...profile, githubLogin: login });
  updated.push(login);
}

console.log(write ? 'WRITE' : 'DRY RUN (use --write to apply)');
console.log(
  `pairs ${counts.pairs}, resolved ${counts.resolved}, profiles matched ${counts.matched}, ` +
    `${write ? 'updated' : 'would update'} ${counts.wouldUpdate}, already correct ${counts.alreadyCorrect}, ` +
    `unresolved ${counts.unresolved}, no profile ${counts.noProfile}`
);
if (updated.length) console.log(`${write ? 'Updated' : 'Would update'}: ${updated.join(', ')}`);
