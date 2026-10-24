// Deploy the Azure Functions infrastructure AND publish the function code.
//
// Step 1: `az deployment group create` — applies the ARM template.
//         Reads VESTABOARD_API_KEY, GITHUB_ISSUES_TOKEN, ENTRA_TENANT_ID,
//         ENTRA_CLIENT_ID and AUTH_ENFORCE from the root .env (gitignored) and
//         passes them as ARM parameters, so the secrets are never committed.
// Step 2: `func azure functionapp publish <appName>` — uploads the compiled
//         function code to the Function App.

import { readFileSync, existsSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const serverDir = resolve(__dirname, '..');
const repoRoot = resolve(serverDir, '..');
const envPath = resolve(repoRoot, '.env');
const templatePath = resolve(serverDir, 'azuredeploy.json');
const resourceGroup = process.env.TRUETUNES_RG ?? 'truetunes-rg';
const functionAppName = process.env.TRUETUNES_FN_APP ?? 'truetunes-fn';
// Optional: target a subscription other than the az CLI default, without changing that default.
const subscription = process.env.TRUETUNES_SUBSCRIPTION;
const subscriptionArgs = subscription ? ['--subscription', subscription] : [];

function readEnvFile(path) {
  if (!existsSync(path)) return {};
  const raw = readFileSync(path, 'utf8');
  const env = {};
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx < 0) continue;
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

function runChild(commandLabel, command, args, options = {}) {
  return new Promise((resolveP, rejectP) => {
    // Windows .cmd shims must run via the shell, otherwise child_process throws EINVAL on Node 24+.
    const child = spawn(command, args, {
      stdio: 'inherit',
      shell: process.platform === 'win32',
      ...options,
    });
    child.on('exit', (code) => {
      if (code === 0) resolveP();
      else rejectP(new Error(`${commandLabel} exited with code ${code}`));
    });
    child.on('error', (err) => rejectP(new Error(`${commandLabel} failed to spawn: ${err.message}`)));
  });
}

// `func publish` replaces every function with this checkout's, so a stale or dirty tree deletes or
// ships code that isn't on main (a feature branch behind main once removed music-stats and track-meta).
function assertDeployableTree() {
  const git = (...args) => spawnSync('git', args, { cwd: repoRoot, encoding: 'utf8' });
  const fetch = git('fetch', 'origin', 'main');
  if (fetch.status !== 0) {
    throw new Error(`Refusing to deploy: could not fetch origin/main.\n${fetch.stderr || fetch.error?.message || ''}`);
  }
  if (git('merge-base', '--is-ancestor', 'origin/main', 'HEAD').status !== 0) {
    throw new Error(
      'Refusing to deploy: HEAD does not contain origin/main. Deploying would delete or roll back ' +
        'functions that are on main. Merge main into this branch (or deploy from main) and try again.'
    );
  }
  const status = git('status', '--porcelain');
  if (status.status !== 0 || status.stdout.trim()) {
    throw new Error(
      'Refusing to deploy: the working tree has uncommitted changes. Commit or stash them so the deploy ' +
        `matches a commit.\n${status.stdout}`
    );
  }
}

async function main() {
  assertDeployableTree();
  const env = readEnvFile(envPath);
  const fromEnv = (name) => env[name] ?? process.env[name] ?? '';

  // ARM parameter ← .env variable. Secrets are redacted in the printed command.
  const params = [
    {
      param: 'vestaboardApiKey',
      env: 'VESTABOARD_API_KEY',
      secret: true,
      ifEmpty: 'Vestaboard messages will be disabled',
    },
    { param: 'githubIssuesToken', env: 'GITHUB_ISSUES_TOKEN', secret: true, ifEmpty: 'in-app feedback will fail' },
    { param: 'entraTenantId', env: 'ENTRA_TENANT_ID', ifEmpty: 'caller tokens cannot be verified' },
    { param: 'entraClientId', env: 'ENTRA_CLIENT_ID', ifEmpty: 'caller tokens cannot be verified' },
    // Transitional: 'true' rejects requests without a token. Unset means 'false'.
    { param: 'authEnforce', env: 'AUTH_ENFORCE', default: 'false' },
  ].map((p) => ({ ...p, value: fromEnv(p.env) || p.default || '' }));

  for (const p of params) {
    if (!p.value) console.warn(`[deploy] ${p.env} is empty — ${p.ifEmpty} in this deploy.`);
  }

  const azCommand = process.platform === 'win32' ? 'az.cmd' : 'az';
  const azArgs = [
    'deployment',
    'group',
    'create',
    '--resource-group',
    resourceGroup,
    '--template-file',
    templatePath,
    '--mode',
    'Incremental',
    '--parameters',
    ...params.map((p) => `${p.param}=${p.value}`),
    ...subscriptionArgs,
  ];

  const secretPrefixes = params.filter((p) => p.secret).map((p) => `${p.param}=`);
  const printableArgs = azArgs.map((a) => {
    const prefix = secretPrefixes.find((s) => a.startsWith(s));
    return prefix ? `${prefix}***REDACTED***` : a;
  });
  console.log(`[deploy] Step 1/2 — ARM deploy`);
  console.log(`[deploy] az ${printableArgs.map((a) => (a.includes(' ') ? `"${a}"` : a)).join(' ')}`);
  await runChild('az deployment', azCommand, azArgs);

  console.log(`\n[deploy] Step 2/2 — Build & publish function code`);
  const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  await runChild('npm build', npmCommand, ['run', 'build'], { cwd: serverDir });

  // Functions Core Tools ships as func.exe on Windows; with shell:true the bare name resolves correctly.
  const funcCommand = 'func';
  // Project compiles TypeScript → dist/ via `tsc`, so we publish the JS output.
  const funcArgs = ['azure', 'functionapp', 'publish', functionAppName, '--javascript', ...subscriptionArgs];
  console.log(`[deploy] (cwd=${serverDir}) func ${funcArgs.join(' ')}`);
  await runChild('func publish', funcCommand, funcArgs, { cwd: serverDir });

  console.log('\n[deploy] Done.');
}

main().catch((err) => {
  console.error(`[deploy] ${err.message}`);
  process.exit(1);
});
