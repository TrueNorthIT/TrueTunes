// Opens GitHub issues as a GitHub App: a short-lived installation token minted from the
// App's private key (RS256 JWT -> POST /app/installations/{id}/access_tokens), cached in
// memory until shortly before it expires. fetch and the clock are injected for tests.
// Neither the key nor any token is ever put in a log line, error or response.
import { createSign } from 'node:crypto';

export interface GithubAppConfig {
  appId: string;
  installationId: string;
  privateKey: string;
}

/** The App settings, or null unless all three are set. The key may arrive with literal "\n" sequences. */
export function githubAppConfigFromEnv(env: NodeJS.ProcessEnv = process.env): GithubAppConfig | null {
  const appId = env['GITHUB_APP_ID']?.trim();
  const installationId = env['GITHUB_APP_INSTALLATION_ID']?.trim();
  const key = env['GITHUB_APP_PRIVATE_KEY']?.trim();
  if (!appId || !installationId || !key) return null;
  return { appId, installationId, privateKey: key.replace(/\\n/g, '\n') };
}

/** GitHub's username rules: alphanumeric and single hyphens, no leading or trailing hyphen, up to 39 characters. */
export function isGithubLogin(value: unknown): value is string {
  return typeof value === 'string' && /^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}$/i.test(value);
}

/** The "Raised by" footer: the reporter's name and, when we know it, an @mention so GitHub notifies them. */
export function buildIssueBody(description: string, raisedBy: string | null, login: string | null): string {
  const who = [raisedBy, login ? `@${login}` : null].filter(Boolean);
  return [description, who.length ? `---\n**Raised by:** ${who.join(' ')}` : ''].filter(Boolean).join('\n\n');
}

const b64url = (input: string) => Buffer.from(input).toString('base64url');

/** An RS256 JWT for the App: issued 60s ago (clock drift), valid for 9 minutes from now (GitHub's maximum is 10). */
export function mintAppJwt(config: GithubAppConfig, nowMs: number): string {
  const iat = Math.floor(nowMs / 1000) - 60;
  const data = `${b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${b64url(
    JSON.stringify({ iat, exp: iat + 60 + 9 * 60, iss: config.appId })
  )}`;
  try {
    return `${data}.${createSign('RSA-SHA256').update(data).sign(config.privateKey).toString('base64url')}`;
  } catch {
    throw new Error('could not sign the GitHub App JWT: check GITHUB_APP_PRIVATE_KEY');
  }
}

export interface IssueInput {
  title: string;
  body: string;
  labels: string[];
  /** Checked against GitHub's username rules; anything else is ignored. */
  assignee?: string | null;
}

export interface GithubIssuer {
  createIssue(input: IssueInput): Promise<{ html_url: string }>;
}

/** A GitHub call that came back with an error status. The message carries the status only, never the response. */
export class GithubError extends Error {
  constructor(
    readonly status: number,
    readonly step: 'installation token' | 'issue creation'
  ) {
    super(`GitHub ${step} failed (${status})`);
  }
}

const REFRESH_MARGIN_MS = 5 * 60_000;
const API = 'https://api.github.com';
const headers = (bearer: string) => ({
  Authorization: `Bearer ${bearer}`,
  Accept: 'application/vnd.github+json',
  'Content-Type': 'application/json',
  'User-Agent': 'TrueTunes-feedback',
  'X-GitHub-Api-Version': '2022-11-28',
});

export function createGithubIssuer(
  config: GithubAppConfig,
  repo: string,
  deps: { fetch?: typeof fetch; now?: () => number } = {}
): GithubIssuer {
  const doFetch = deps.fetch ?? fetch;
  const now = deps.now ?? Date.now;
  let cached: { token: string; expiresAt: number } | undefined;
  let minting: Promise<string> | undefined;

  async function mint(): Promise<string> {
    const jwt = mintAppJwt(config, now());
    const res = await doFetch(`${API}/app/installations/${encodeURIComponent(config.installationId)}/access_tokens`, {
      method: 'POST',
      headers: headers(jwt),
    });
    if (!res.ok) throw new GithubError(res.status, 'installation token');
    const { token, expires_at } = (await res.json()) as { token?: string; expires_at?: string };
    const expiresAt = Date.parse(expires_at ?? '');
    if (!token || Number.isNaN(expiresAt)) throw new Error('GitHub returned no usable installation token');
    cached = { token, expiresAt };
    return token;
  }

  function installationToken(): Promise<string> {
    if (cached && now() < cached.expiresAt - REFRESH_MARGIN_MS) return Promise.resolve(cached.token);
    minting ??= mint().finally(() => {
      minting = undefined;
    });
    return minting;
  }

  return {
    async createIssue({ title, body, labels, assignee }) {
      const token = await installationToken();
      const post = (assignees: string[]) =>
        doFetch(`${API}/repos/${repo}/issues`, {
          method: 'POST',
          headers: headers(token),
          body: JSON.stringify({ title, body, labels, ...(assignees.length ? { assignees } : {}) }),
        });
      const login = isGithubLogin(assignee) ? assignee : null;
      let res = await post(login ? [login] : []);
      // GitHub rejects an assignee who can't be assigned (e.g. not a collaborator): file it unassigned.
      if (res.status === 422 && login) res = await post([]);
      if (!res.ok) throw new GithubError(res.status, 'issue creation');
      return (await res.json()) as { html_url: string };
    },
  };
}
