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
- **The web client takes part in the DJ's enqueue lease like the desktop.** First decided the other way (preview
  only, in case a sleeping phone held the lease), then reversed on reading the server: the lease lasts 30 seconds
  (`LEASE_MS` in `server/src/shared/autoplay.ts`), so a sleeping phone delays the filler by half a minute at most,
  while a client that never asks the coordinator does not learn `fillerUri` and would queue people's picks behind
  the DJ's filler. `features.json` (`web-dj-autoplay`) was reworded to match.
- **Live attribution events** on the desktop come from Azure Web PubSub. A browser connecting to
  `*.webpubsub.azure.com` would break the one-origin rule, so the first release loads the map from `/fn/attribution`
  on every queue change (the app already asks for that) and a gateway relay for the socket is its own entry in
  `features.json` (`gw-pubsub-relay`).

### Phone shell (piece 6): the structure, decided before building

On the web, a window too narrow for the full layout (under 1,144px, the same test as skinny mode) gets the phone
shell instead of `SkinnyShell`. The desktop app keeps skinny mode untouched.

```
┌──────────────────────────┐
│ page (scrolls)           │  the same routed panels as the desktop: Home, Search, Album, Artist, ...
│                          │
├──────────────────────────┤
│ ▣ Title · Artist    ⏸    │  mini player: always there, one tap opens Now playing
├──────────────────────────┤
│ Home Search Queue Discover More │  tab bar, in the thumb's reach, above the home indicator
└──────────────────────────┘
```

- **Five tabs: Home, Search, Queue, Discover, More.** The first four are what someone does with a phone in the
  office: see what is on, find a song, look at the queue, get a suggestion. Leaderboard, Queuedle, the profile (which
  holds playlists), speakers, feedback and sign-out are on the More page, two taps away. Five is the most a 390px bar
  holds at 44px targets with labels; labels stay, because icons alone made the desktop nav need tooltips.
- **Tabs are routes** (`/queue`, `/more` and `/now-playing` are new, web-only routes), not local state, so the
  phone's back gesture and the browser's back button do what people expect, and a page can be linked.
- **Now playing is one tap away everywhere**: the mini player sits above the tab bar on every page. It shows art,
  title, artist, play/pause and a hairline of progress. Tapping it opens `/now-playing`: the art large, title and
  artist (links), who queued it, the seek bar, previous / play-pause / next, volume, shuffle and repeat, the heart,
  lyrics, and a way to the queue. Back closes it.
- **The queue is a page**, not a drawer: the same `QueueSidebar` list (virtualised, with who queued each track), at
  full width, with rows tall enough to tap.
- **Search is a page with its own field at the top** (the desktop keeps the field in the nav pill). Opening the
  Search tab focuses nothing until tapped, so the keyboard does not jump up uninvited; recent searches show first.
- **Touch equivalents.** Hover-revealed controls (the quiet + on rows, the corner + on tiles) are always visible when
  the device has no hover. Every context menu opens from a long-press and from a visible "more" button on the row,
  and on a phone it is a bottom sheet rather than a popover at the pointer. The queue reorders without dragging: the
  row's menu has Play next, Move up, Move down and Remove.
- **Sizes.** Tap targets at least 44px (`--tap`, a new token), text never under 13px (already the rule), the page
  gutter drops from 28px to 16px, and the shell pads for `env(safe-area-inset-*)`. Heights use `dvh`, so nothing
  hides behind the browser's bars. Motion follows `prefers-reduced-motion` as elsewhere.
- **Same materials.** The tab bar and the mini player are the frosted shell material (`--material-bg`,
  `--material-filter`), like the desktop's nav pill and player bar; the ambient artwork layer sits behind the
  whole shell. No new colours.
- **The desktop browser** (1,144px and wider) gets the desktop layout unchanged, minus the window buttons.

## Things a reader might not expect

(Filled in as they happen.)

## Waiting for the owner

(Nothing yet.)
