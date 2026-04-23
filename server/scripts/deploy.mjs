// Deploy the Azure Functions infrastructure AND publish the function code.
//
// Step 1: `az deployment group create` — applies the ARM template.
//         Reads VESTABOARD_API_KEY from the root .env (gitignored) and passes
//         it as the `vestaboardApiKey` parameter so the secret is never committed.
// Step 2: `func azure functionapp publish <appName>` — uploads the compiled
//         function code to the Function App.

import { readFileSync, existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const serverDir = resolve(__dirname, '..');
const repoRoot = resolve(serverDir, '..');
const envPath = resolve(repoRoot, '.env');
const templatePath = resolve(serverDir, 'azuredeploy.json');
const resourceGroup = process.env.TRUETUNES_RG ?? 'truetunes-rg';
const functionAppName = process.env.TRUETUNES_FN_APP ?? 'truetunes-fn';

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
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
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

async function main() {
  const env = readEnvFile(envPath);
  const vestaboardKey = env.VESTABOARD_API_KEY ?? process.env.VESTABOARD_API_KEY ?? '';

  if (!vestaboardKey) {
    console.warn('[deploy] VESTABOARD_API_KEY is empty — Vestaboard messages will be disabled in this deploy.');
  }

  const azCommand = process.platform === 'win32' ? 'az.cmd' : 'az';
  const azArgs = [
    'deployment', 'group', 'create',
    '--resource-group', resourceGroup,
    '--template-file', templatePath,
    '--mode', 'Incremental',
    '--parameters', `vestaboardApiKey=${vestaboardKey}`,
  ];

  const printableArgs = azArgs.map((a) =>
    a.startsWith('vestaboardApiKey=') ? 'vestaboardApiKey=***REDACTED***' : a,
  );
  console.log(`[deploy] Step 1/2 — ARM deploy`);
  console.log(`[deploy] az ${printableArgs.map((a) => (a.includes(' ') ? `"${a}"` : a)).join(' ')}`);
  console.log(`[deploy] (vestaboardApiKey ${vestaboardKey ? 'set' : 'empty'})`);
  await runChild('az deployment', azCommand, azArgs);

  console.log(`\n[deploy] Step 2/2 — Build & publish function code`);
  const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  await runChild('npm build', npmCommand, ['run', 'build'], { cwd: serverDir });

  // Functions Core Tools ships as func.exe on Windows; with shell:true the bare name resolves correctly.
  const funcCommand = 'func';
  // Project compiles TypeScript → dist/ via `tsc`, so we publish the JS output.
  const funcArgs = ['azure', 'functionapp', 'publish', functionAppName, '--javascript'];
  console.log(`[deploy] (cwd=${serverDir}) func ${funcArgs.join(' ')}`);
  await runChild('func publish', funcCommand, funcArgs, { cwd: serverDir });

  console.log('\n[deploy] Done.');
}

main().catch((err) => {
  console.error(`[deploy] ${err.message}`);
  process.exit(1);
});
