# True Tunes MCP

An MCP server on Vercel that lets Claude search YouTube Music and queue to the office Sonos, as the
person who asked: every track is credited to their True Tunes name, exactly as if they had used the app.

**Status: reachability test only.** `api/spike.ts` checks that a Vercel function can reach Sonos with the
office session. It reads only; it never queues, plays or changes anything. The MCP itself comes next.

## Design

- **No office hardware.** The desktop app reaches Sonos only through the Sonos cloud (`play.sonos.com` and
  `api.ws.sonos.com`) with the session cookie of a signed-in Sonos account, so a Vercel function can do the
  same. `lib/sonos.ts` is the Electron-free copy of what `src/sonos-api.ts` and `src/sonos-ws.ts` do.
- **One Sonos account**, the office one. Its session cookie lives server side only.
- **Users sign in with Entra** (TrueNorth tenant) when they add the connector in Claude. The MCP checks the token
  as `server/src/shared/auth.ts` does, then calls the functions on the user's behalf (Entra on-behalf-of), so
  `log-event` resolves the same `oid` to the same profile name as the app. No user, no queue.
- **Plays are logged the same way as the app** (`src/pubsub.ts`): a `log-event` POST (Cosmos: leaderboard,
  Queuedle, DJ history) and a Web PubSub `sendToGroup` so open apps show the "queued by" badge live.
- **Same queue rules as the app** (`renderer/src/hooks/useQueueActions.tsx`): If-Match etag with one retry,
  user picks go in front of the DJ filler, stations are refused (they replace the whole queue), albums log one
  event per track. Skip, pause, volume, remove and reorder are left out: the speakers are the whole office's.

## Vercel project

Import `TrueNorthIT/TrueTunes` into Vercel with **Root Directory `mcp`** and Framework Preset **Other**.

- Pushes to `main` that touch `mcp/` deploy to production; other commits are skipped (`ignoreCommand` in
  `vercel.json`). Other branches get preview deployments.
- Functions run in London (`lhr1`) on Node 24.
- **Give Sonos secrets to Production only.** A preview runs unreviewed branch code, and the office session
  controls the office speakers.

| Variable               | Scope      | What                                                                          |
| ---------------------- | ---------- | ----------------------------------------------------------------------------- |
| `SPIKE_KEY`            | Production | Any long random string; callers send it as `Authorization: Bearer …`          |
| `SONOS_SESSION_TOKEN`  | Production | Office account's `__Secure-next-auth.session-token` cookie (see below)        |
| `SONOS_COORDINATOR_ID` | Production | Optional: the office group's coordinator `RINCON_…` id (default: first group) |
| `SONOS_HOUSEHOLD_ID`   | Production | Optional: used only if the WebSocket step fails                               |

To get the cookie: sign in to <https://play.sonos.com> in Chrome with the office account, open DevTools →
Application → Cookies → `https://play.sonos.com`, and copy the value of `__Secure-next-auth.session-token`.
Treat it like the account password.

## Run the test

```bash
curl -s -H "Authorization: Bearer $SPIKE_KEY" https://<production-url>/api/spike
```

| Step                     | Tells us                                                                                       |
| ------------------------ | ---------------------------------------------------------------------------------------------- |
| `sign-in flow`           | What kind of Sonos login it is: `credentials` could be automated, `oauth` needs a browser page |
| `mfe`                    | The cookie works from a Vercel IP. A 403 with `text/html` is bot protection                    |
| `websocket`              | The control socket opens from Vercel; household and groups                                     |
| `groups (http)`          | Groups over plain HTTP, which would let the MCP skip the socket                                |
| `integrations`, `search` | Content calls work: what `search_music` needs                                                  |
| `queue`                  | Reading the office queue works: what `get_queue` and adding need                               |
| `playback state (http)`  | Now playing over plain HTTP (the app's path is marked unverified)                              |

`sessionCookieRotated: true` means Sonos re-issued the cookie, so the MCP has to save new values in a store
rather than keep the cookie in an env var. Run it again a day later to see if the original cookie still works.
