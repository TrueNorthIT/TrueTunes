import { headers } from 'next/headers';
import { env } from '@/lib/env';
import { hasSession, lastLogin } from '@/lib/sonos/http';

export const dynamic = 'force-dynamic';

async function sonosStatus(): Promise<string> {
  try {
    if (!(await hasSession())) return 'not signed in yet (it signs in on first use)';
    const at = await lastLogin();
    return at ? `signed in (last sign-in ${new Date(at).toUTCString()})` : 'signed in';
  } catch {
    return 'storage not configured';
  }
}

export default async function Home() {
  const h = await headers();
  const origin = env.publicUrl() ?? `${h.get('x-forwarded-proto') ?? 'https'}://${h.get('host')}`;
  const mcpUrl = `${origin}/mcp`;
  const status = await sonosStatus();

  return (
    <main>
      <h1>TrueTunes MCP</h1>
      <p>
        Play music on the TrueNorth office Sonos from Claude or any MCP chat client. You sign in with your TrueNorth
        Microsoft account, and everything you queue is credited to you on the TrueTunes leaderboard.
      </p>

      <h2>Connect</h2>
      <p>
        Server URL: <code>{mcpUrl}</code>
      </p>
      <ul>
        <li>
          <strong>Claude (web or desktop):</strong> Settings → Connectors → Add custom connector, paste the URL, then
          Connect and sign in with Microsoft.
        </li>
        <li>
          <strong>Claude Code:</strong> <code>claude mcp add --transport http truetunes {mcpUrl}</code>, then{' '}
          <code>/mcp</code> to sign in.
        </li>
        <li>
          <strong>Other clients:</strong> add it as a Streamable HTTP server with OAuth.
        </li>
      </ul>

      <h2>Try</h2>
      <ul>
        <li>&ldquo;What&rsquo;s playing in the office?&rdquo;</li>
        <li>&ldquo;Queue Mr Brightside next.&rdquo;</li>
        <li>&ldquo;Add Daft Punk&rsquo;s Discovery to the end of the queue.&rdquo;</li>
        <li>
          &ldquo;Turn it down a bit.&rdquo; / &ldquo;Who queued this?&rdquo; / &ldquo;Who&rsquo;s top of the leaderboard
          this week?&rdquo;
        </li>
        <li>&ldquo;Announce that pizza is here.&rdquo;</li>
      </ul>

      <p style={{ opacity: 0.7, fontSize: '0.9em' }}>Sonos: {status}</p>
    </main>
  );
}
