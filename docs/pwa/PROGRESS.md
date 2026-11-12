# True Tunes PWA: progress

The brief is `docs/pwa-build-prompt.md`. The checklist is `docs/pwa/features.json` (51 entries; `passes` is true only
once the named check has run). This file says where the work stands and why things were decided the way they were.

**Starting a fresh session:** read this file and `features.json`, read `git log`, run the suites
(`npm run typecheck && npm run lint && npm run format:check && npm run test:run && npm run test:main`, then
`cd server && npm test`), and carry on from "Next".

## Status

| # | Piece | Branch / PR | State |
| --- | --- | --- | --- |
| 1 | Gateway: static hosting, `/fn`, `/img`, browser auth for the relay | `feature/pwa-gateway` | in progress |
| 2 | Web scaffold: web build, browser bridge, demo route | | not started |
| 3 | Sign-in and our Functions through `/fn` | | not started |
| 4 | Sonos reads through the gateway | | not started |
| 5 | Sonos commands (mock only) | | not started |
| 6 | Phone layout | | not started |
| 7 | Installability | | not started |

## Next

Piece 1: merge the pull request, watch the deploy, run the production checks for the `gw-*` entries. Then piece 2.

## Decisions, and why

### Gateway (piece 1)

- **Paths.** `/healthz`, `/sonos/api/*` and `/sonos/ws` stay as they are. New: `/fn/*`, `/img`, and static files for
  everything else. `/sonos`, `/fn`, `/img` and `/healthz` are reserved: a miss under them is a 404, never the app
  shell, so a typo in an API path cannot come back as HTML with a 200.
- **`/fn/*` needs a valid Entra ID token at the gateway**, although most read functions are anonymous upstream. The
  brief's production check is that unauthenticated calls to `/fn` are refused, and it keeps the gateway from being an
  anonymous proxy to the Function App. The `Authorization` header is forwarded untouched; nothing is added.
- **`/fn/sonos-session` is refused (404).** That function hands the Sonos session to the desktop's `direct` mode. The
  web app must never hold the session, so the gateway does not forward it.
- **`/img?url=`**: https only, an exact-match host list, default port, no redirects followed, image content types
  only, 10 MB cap. The host is checked before the token, so "a host that is not on the list is refused" can be shown
  on production without signing in; a listed host still needs a token.
- **Browser auth on the relay: a WebSocket subprotocol value**, `bearer.<ID token>`, offered beside
  `v1.api.smartspeaker.audio`. The server answers with the Sonos protocol only. A JWT is base64url and dots, which are
  legal subprotocol characters, and the value is a request header, like `Authorization`: it is not in the URL and the
  gateway logs no headers. Chosen over a first-message handshake because the upgrade is still refused with a 401
  before any relay or Sonos socket exists, exactly as for the desktop, and the relay itself does not change.
  (Kubernetes authenticates browser WebSockets the same way.)
- **`/fn` and `/img` answers carry `nosniff` and a sandboxing Content-Security-Policy**: they are data on the app's
  own origin and must never run as a page. `/fn` also refuses any `%25` in the path (double encoding).
- **One spelling per static file.** Percent-encoded, doubled-slash and trailing-slash spellings are refused, so the
  in-memory file cache holds each file once (the independent review showed it could otherwise be grown without
  signing in).
- **Static files are read from `WEB_ROOT`** (default `<server>/web`), loaded into memory on first use. With no such
  folder the gateway answers 404 as it does today, so piece 1 deploys with nothing using it.

### Web target (piece 2 onwards)

- **One renderer, two entries.** `renderer/web/index.html` + `renderer/src/web/main.tsx` is the web entry;
  `renderer/index.html` + `renderer/src/main.tsx` stays the Electron entry. Both render the same `<App />`.
  `npm run build:web` writes `renderer/dist-web/`; the deploy job copies it to `server/web/` inside the gateway zip.
- **Bridge selection:** Electron's preload defines `window.sonos` before any script runs. The web entry defines it
  itself: the browser bridge normally, the demo backend (dynamic import) when the path starts with `/demo`.
  `document.documentElement.dataset.platform = 'web'` is how components and CSS tell the two apart.
- **The main process is not restructured, so the browser bridge re-implements what it needs** (the operation table,
  the relay bootstrap, the reorder batches). A test compares the web operation table with `src/sonos-api.ts` so the
  two cannot drift silently.
- **Demo route:** `/demo`. The Storybook mock backend never settles writes (by design, for stories). The demo needs
  controls that work, so it adds an in-memory simulation of playback, volume and the queue on top of the same
  fixtures. Nothing in it touches the network.
- **The web client never takes the DJ enqueue lease.** A phone that sleeps while holding it would stall the office's
  filler until the lease lapsed. It shows the preview only, like a dev build.
- **Live attribution events** on the desktop come from Azure Web PubSub. A browser connecting to
  `*.webpubsub.azure.com` would break the one-origin rule, so the first release loads the map from `/fn/attribution`
  on every queue change (the app already asks for that) and a gateway relay for the socket is its own entry in
  `features.json` (`gw-pubsub-relay`).

## Things a reader might not expect

(Filled in as they happen.)

## Waiting for the owner

(Nothing yet.)
