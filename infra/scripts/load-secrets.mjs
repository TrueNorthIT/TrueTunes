// Loads the Function App's secrets from the root .env into Key Vault. Run by a person, once, and again
// whenever a secret changes. The Function App's settings are Key Vault references, so the vault must
// hold all four before the app can read them. Nothing in CI or Terraform ever holds a value.
//
//   node infra/scripts/load-secrets.mjs
//
// Needs the TrueNorth admin Azure CLI identity (the azswap `tnit-admin` profile) to be signed in, and
// "Key Vault Secrets Officer" on the vault (list your object id in `key_vault_secrets_officers`).
// Values are never printed and never appear on a command line: each one goes through a private
// temporary file that is deleted straight after. Nothing is written unless every secret is present.
//
// Optional: TRUETUNES_KV (default truetunes-kv), TRUETUNES_SUBSCRIPTION.

import { existsSync, readFileSync, rmSync, writeFileSync, mkdtempSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const vault = process.env.TRUETUNES_KV ?? 'truetunes-kv';
const subscription = process.env.TRUETUNES_SUBSCRIPTION;

// .env variable => Key Vault secret name. Keep in step with `key_vault_secrets` in infra/keyvault.tf.
const secrets = {
  VESTABOARD_API_KEY: 'vestaboard-api-key',
  GITHUB_ISSUES_TOKEN: 'github-issues-token',
  SONOS_USERNAME: 'sonos-username',
  SONOS_PASSWORD: 'sonos-password',
};

function readEnvFile(path) {
  if (!existsSync(path)) throw new Error(`${path} not found.`);
  const env = {};
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx < 0) continue;
    let value = trimmed.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    env[trimmed.slice(0, idx).trim()] = value;
  }
  return env;
}

const env = readEnvFile(resolve(repoRoot, '.env'));
const missing = Object.keys(secrets).filter((name) => !env[name]);
if (missing.length) {
  console.error(
    `[load-secrets] Not writing anything: ${missing.join(', ')} empty or missing in .env. ` +
      'A Key Vault reference to a secret that does not exist would break the setting, so load all four or none.'
  );
  process.exit(1);
}

const az = process.platform === 'win32' ? 'az.cmd' : 'az';
const quote = (s) => (process.platform === 'win32' ? `"${s}"` : s);
const dir = mkdtempSync(join(tmpdir(), 'tt-secret-'));
try {
  for (const [name, secretName] of Object.entries(secrets)) {
    const file = join(dir, secretName);
    writeFileSync(file, env[name], { encoding: 'utf8', mode: 0o600 });
    const args = [
      'keyvault', 'secret', 'set',
      '--vault-name', vault,
      '--name', secretName,
      '--file', quote(file),
      '--encoding', 'utf-8',
      '--output', 'none',
      ...(subscription ? ['--subscription', subscription] : []),
    ];
    const result = spawnSync(az, args, { stdio: ['ignore', 'ignore', 'inherit'], shell: process.platform === 'win32' });
    rmSync(file, { force: true });
    if (result.status !== 0) throw new Error(`az keyvault secret set failed for ${secretName}.`);
    console.log(`[load-secrets] ${secretName} set in ${vault}.`);
  }
} catch (err) {
  console.error(`[load-secrets] ${err.message}`);
  process.exitCode = 1;
} finally {
  rmSync(dir, { recursive: true, force: true });
}
