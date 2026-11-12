import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { authenticate, entraCheckFromEnv } from '../shared/auth';
import { displayNameForOid, githubLoginForOid } from '../lib/caller';
import {
  buildIssueBody,
  createGithubIssuer,
  githubAppConfigFromEnv,
  GithubError,
  type GithubIssuer,
} from '../shared/githubIssues';

// POST /api/feedback
// Body: { type: 'bug' | 'feature', title: string, description?: string }
//
// Opens an issue on the True Tunes repo for the in-app feedback dialog, as a GitHub App
// (GITHUB_APP_ID, GITHUB_APP_INSTALLATION_ID, GITHUB_APP_PRIVATE_KEY: Issues read/write on
// this one repo), so the credentials stay on the server. The reporter is assigned and
// @mentioned when their profile has a githubLogin. Always needs a valid Entra token, even while AUTH_ENFORCE is off:
// no client released before tokens calls this function.
//
// Returns:
//   201 { url }   — the new issue
//   400           — bad body
//   401           — no or invalid token
//   502           — GitHub refused

const REPO = 'TrueNorthIT/TrueTunes';
const LABELS = { bug: 'bug', feature: 'enhancement' } as const;

// One issuer for the life of the process, so the installation token cache is shared.
let issuer: GithubIssuer | undefined;
function issuerFromEnv(): GithubIssuer | null {
  if (issuer) return issuer;
  const config = githubAppConfigFromEnv();
  return config ? (issuer = createGithubIssuer(config, REPO)) : null;
}

export async function feedbackHandler(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const auth = await authenticate(request, context, entraCheckFromEnv(), true);
  if ('response' in auth) return auth.response;
  if (!auth.oid) return { status: 401, jsonBody: { error: 'sign-in required' } };

  const github = issuerFromEnv();
  if (!github) return { status: 500, jsonBody: { error: 'Feedback is not configured' } };

  let body: { type?: string; title?: unknown; description?: unknown };
  try {
    body = ((await request.json()) ?? {}) as typeof body;
  } catch {
    return { status: 400, jsonBody: { error: 'Invalid JSON' } };
  }
  const type = body.type === 'bug' || body.type === 'feature' ? body.type : null;
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  const description = typeof body.description === 'string' ? body.description.trim() : '';
  if (!type || !title || title.length > 256 || description.length > 20_000) {
    return { status: 400, jsonBody: { error: 'type, title (up to 256 chars) and an optional description required' } };
  }

  let raisedBy: string | null = null;
  let login: string | null = null;
  try {
    raisedBy = await displayNameForOid(auth.oid);
    login = await githubLoginForOid(auth.oid);
  } catch (err) {
    context.warn('[feedback] profile lookup failed, sending unsigned:', err);
  }

  try {
    const issue = await github.createIssue({
      title,
      body: buildIssueBody(description, raisedBy, login),
      labels: [LABELS[type]],
      assignee: login,
    });
    context.log(`[feedback] ${type} issue ${issue.html_url} by oid=${auth.oid}`);
    return { status: 201, jsonBody: { url: issue.html_url } };
  } catch (err) {
    // The message carries a status at most, never a key, token or response body.
    context.error('[feedback] failed:', err instanceof Error ? err.message : 'unknown error');
    if (err instanceof GithubError && err.step === 'issue creation') {
      return { status: 502, jsonBody: { error: `GitHub refused the issue (${err.status})` } };
    }
    return { status: 502, jsonBody: { error: 'Could not reach GitHub' } };
  }
}

app.http('feedback', {
  methods: ['POST'],
  route: 'feedback',
  authLevel: 'anonymous',
  handler: feedbackHandler,
});
