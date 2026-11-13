# Brief G: the playing track loses its time and progress

Read `COMMON.md` and `FEEDBACK.md` (item 6) in this folder first.

- **Branch:** `feature/pwa-phone-g-position`
- **Port:** 9107
- **Model:** Sonnet

This is the only brief about a **functional bug**, not styling, and the only one allowed to change code the
desktop app also runs. Read "The desktop" below before touching anything.

## You own

- `renderer/src/hooks/usePlayback.ts`, `renderer/src/hooks/playbackPosition.ts` and their tests in
  `renderer/src/hooks/__tests__/`
- `renderer/src/providers/sonos/**` (the normalising of Sonos's playback payloads)
- `renderer/src/web/bridge/sonosSocket.ts`, `renderer/src/web/bridge/index.ts` and their tests
- `renderer/src/App.tsx`, for two things only: the effect that refreshes playback when the window regains focus,
  and adding one route
- a new `renderer/src/components/phone/DiagnosticsPage.tsx` (and stylesheet, story and test if it needs them)

Nothing else. Not `src/` (the Electron main process), not `server/`.

## The bug

On the owner's iPhone the app shows the right track, artist, art and who queued it, and knows it is playing (the
pause button shows), but has **no time and no progress**: Home's Now playing card shows an empty bar and no
"0:42 / 3:12", and the mini player's progress hairline is empty. See the screenshot in `FEEDBACK.md`. His words:
it "knows the song is playing but not the progress"; it happens "occasionally on desktop and switching speaker
groups fixes it", but "a lot on mobile".

Switching groups makes the app re-subscribe to `playbackExtended`, and Sonos answers a subscription with a full
status. So the state is being damaged by something between two full statuses, and a fresh full status repairs it.

## A lead, from reading the code (confirm it; do not assume it)

`applyState` in `usePlayback.ts` treats every push as the whole truth:

- `normalizePlaybackPayload` (`providers/sonos/SonosProvider.ts`) fills what a payload lacks with zeros:
  `positionMs: payload?.playback?.positionMillis ?? 0`, `durationMs: track?.durationMillis ?? 0`.
- `applyState` writes `positionMsRef` and `durationMsRef` from that **before** its guard
  `if (!currentTrack?.title) return`. So a push that carries no track (or a track with no duration) zeroes the
  duration even though the hook then decides to keep the previous track on screen.
- The one-second tick then computes `Math.min(positionMsRef + elapsed, durationMsRef || 1)` with a zero duration,
  and `positionOf(…, 0)` yields an empty label and 0%. The track stays on screen; its time and bar are gone until
  the next full status. That is exactly the screenshot.

So any partial `playbackExtended` message after a full one would do it. Candidates for where a partial one comes
from, most likely first:

1. **The bootstrap's re-broadcast.** After subscribing, both the desktop (`src/sonos-ws.ts`, `runBootstrap`) and
   the web bridge (`sonosSocket.ts`) re-send the *response to the subscribe command* to the renderer as a
   `playbackExtended` message for the active group. If Sonos's real status push has already arrived (and been
   forwarded) by then, and the command response is empty or partial, the response lands second and wipes it. On
   the desktop this happens once per connection; on a phone the socket drops every time the app is backgrounded
   or the phone locks, so every return to the app runs the bootstrap again.
2. **The web bridge's sticky replay.** For subscribers that attach late it replays "the last `playbackExtended`
   message". If the last one was partial, that is what gets replayed.
3. **Sonos's own partial pushes** (a metadata-only or playback-only event on a track change, an error status).

Why the desktop recovers and the phone does not: `App.tsx` calls `window.sonos.refreshPlayback()` when the window
gets `focus`, which re-subscribes and brings a full status. A phone coming back from the background does not
reliably fire `focus`; it fires `visibilitychange` and `pageshow`.

## What to do, in this order

1. **Read** `usePlayback.ts`, `playbackPosition.ts`, `providers/sonos/*`, `sonosSocket.ts`, `index.ts`, the
   desktop's `src/sonos-ws.ts` and `src/ipc/sonos.ts` (`playback:refresh`, `ws:resync`, `group:set`), the payload
   types in `src/getPlaybackExtended.d.ts`, the fixtures in `renderer/src/test/fixtures/sonosShapes.ts`, and the
   existing tests in `renderer/src/hooks/__tests__/usePlayback*.test.*`. Extend those test files; do not start new
   ones for the hook.

2. **Tests first.** Write failing tests that reproduce the symptom with message sequences, for the hook and the
   normaliser:
   - a full status, then a payload with no `metadata` (playback only): the track, its duration and its progress
     must survive, and the position must follow the new payload's `positionMillis` if it has one;
   - a full status, then a payload with the same track but no `durationMillis`: duration survives;
   - a full status, then an empty object (`{}`), as a command response might be: nothing changes;
   - a full status for track A, then a full status for track B: everything moves to B (a real change must still
     apply), and B with no duration shows no stale duration from A;
   - a seek, a pause and a resume still move the position as they do today;
   - a group switch still clears and restores as it does today (`applyGroupCache`).
   Then fix `applyState` and the normaliser so that a field a payload does not carry is "unknown", not zero, and
   unknown never overwrites what is known for the same track. Keep the existing tests passing unmodified; if one
   encodes the bug, say which and why you changed it.

3. **The bootstrap re-broadcast and the sticky replay in the web bridge** (`sonosSocket.ts`): do not hand the
   renderer a subscribe response that is older or emptier than a status push already forwarded for that group in
   this connection, and make the sticky replay keep the last *full* status per group (merging later partial
   messages into it) rather than the last message. Tests against the fake WebSocket, including the ordering
   "push arrives before the bootstrap finishes". Do not change `src/sonos-ws.ts`.

4. **Coming back to the app on a phone** (web only, behind `isWeb()` or inside the bridge):
   - when the page becomes visible again (`visibilitychange` to visible, and `pageshow`), ask for a fresh status
     (`refreshPlayback`) if the relay is open; if it is closed or half-open, reconnect at once instead of waiting
     out the backoff, and reset the backoff;
   - detect a half-open socket (the phone slept, the socket object still says OPEN but nothing arrives): if no
     frame has arrived for longer than the gateway's ping interval allows after becoming visible, close and
     reconnect. Read how the gateway pings (`server/src/gateway/main.ts`, `HEARTBEAT_MS`) but do not change it;
   - do the same for the attribution socket only if it is a one-line reuse; otherwise leave it.
   Debounce it: several of these events fire together. Tests with fake timers and a fake `document.visibilityState`.

5. **A diagnostics page**, so the next occurrence can be read off the phone, which has no console: a web-only route
   `/diagnostics` (add it to the routes in `App.tsx`) showing, from a small ring buffer kept in the bridge (last
   50 events, in memory only, no tokens, no URLs with queries): the relay's state and how long since the last
   frame, each connect / bootstrap / close with its time and close code, and for each `playbackExtended` message
   its time, whether it was a push, a command response or a replay, and which fields it carried (state, position,
   track id, duration, queue version) as yes/no. Plain rows, the existing tokens, 16px gutter, selectable text so
   it can be screenshotted or copied. Brief C owns the More page: do not edit it; say in your report that it needs
   a "Diagnostics" row.

6. Say in your report **which candidate it was**, as far as tests and reading can show, and what only real frames
   from the owner's phone (through the diagnostics page) can settle.

## The desktop

**The owner has approved this for both the desktop and the web** (13 November: "Desktop and web for the fix").

The fix in `usePlayback.ts` and the normaliser changes what the Electron app does in one way: it stops losing the
time and progress in the same situation, which the owner reports as an occasional bug there too. That is the
intent. It must change **nothing else** on the desktop: no new subscriptions, no different calls to
`window.sonos`, the same behaviour on seek, pause, track change and group switch. Steps 3 to 5 are web only.
List every line of shared code you changed in your report so the coordinator can have it reviewed against the
desktop before it merges.

## Extra proof for this brief

- `npx vitest run --config renderer/vitest.config.ts --project unit renderer/src/hooks renderer/src/providers
  renderer/src/web renderer/src/components/phone`.
- The journey (Chromium, 390x844 and 1280x800): the demo's progress bar and times still move, pause and seek.
- A screenshot of `/demo#/diagnostics` at 390x844, looked at.
