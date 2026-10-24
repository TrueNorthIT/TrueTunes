import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { authenticate, entraCheckFromEnv } from '../shared/auth';
import { displayNameForOid } from '../lib/caller';

// POST /api/feedback
// Body: { type: 'bug' | 'feature', title: string, description?: string }
//
// Opens an issue on the True Tunes repo for the in-app feedback dialog, so the GitHub
// token stays on the server (GITHUB_ISSUES_TOKEN: fine-grained, Issues read/write on
// this one repo). Always needs a valid Entra token, even while AUTH_ENFORCE is off:
// no client released before tokens calls this function.
//
// Returns:
//   201 { url }   — the new issue
//   400           — bad body
//   401           — no or invalid token
//   502           — GitHub refused

const REPO = 'TrueNorthIT/TrueTunes';
const LABELS = { bug: 'bug', feature: 'enhancement' } as const;

export async function feedbackHandler(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const auth = await authenticate(request, context, entraCheckFromEnv(), true);
  if ('response' in auth) return auth.response;
  if (!auth.oid) return { status: 401, jsonBody: { error: 'sign-in required' } };

  const token = process.env['GITHUB_ISSUES_TOKEN'];
  if (!token) return { status: 500, jsonBody: { error: 'Feedback is not configured' } };

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
  try {
    raisedBy = await displayNameForOid(auth.oid);
  } catch (err) {
    context.warn('[feedback] profile lookup failed, sending unsigned:', err);
  }
  const issueBody = [description, raisedBy ? `---\n**Raised by:** ${raisedBy}` : ''].filter(Boolean).join('\n\n');

  try {
    const res = await fetch(`https://api.github.com/repos/${REPO}/issues`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
        'User-Agent': 'TrueTunes-feedback',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      body: JSON.stringify({ title, body: issueBody, labels: [LABELS[type]] }),
    });
    if (!res.ok) {
      context.error(`[feedback] GitHub ${res.status}: ${await res.text()}`);
      return { status: 502, jsonBody: { error: `GitHub refused the issue (${res.status})` } };
    }
    const issue = (await res.json()) as { html_url: string };
    context.log(`[feedback] ${type} issue ${issue.html_url} by oid=${auth.oid}`);
    return { status: 201, jsonBody: { url: issue.html_url } };
  } catch (err) {
    context.error('[feedback] failed:', err);
    return { status: 502, jsonBody: { error: 'Could not reach GitHub' } };
  }
}

app.http('feedback', {
  methods: ['POST'],
  route: 'feedback',
  authLevel: 'anonymous',
  handler: feedbackHandler,
});
