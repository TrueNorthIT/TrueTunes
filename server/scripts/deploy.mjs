// Build and publish the function code to the existing Function App.
//
// The Azure resources and the Function App's settings are Terraform's (infra/), not this script's:
// run `terraform apply` there for anything that is not code. An ARM deployment would overwrite
// Terraform-managed settings, so there is none.
//
// `func azure functionapp publish <appName>` uploads the compiled function code.

import { spawn, spawnSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const serverDir = resolve(__dirname, '..');
const repoRoot = resolve(serverDir, '..');
const functionAppName = process.env.TRUETUNES_FN_APP ?? 'truetunes-fn';
// Optional: target a subscription other than the az CLI default, without changing that default.
const subscription = process.env.TRUETUNES_SUBSCRIPTION;
const subscriptionArgs = subscription ? ['--subscription', subscription] : [];

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

  console.log('[deploy] Build & publish function code');
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
