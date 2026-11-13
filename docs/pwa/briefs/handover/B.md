# Brief B handover (wound down part-way; half-finished)

Branch `feature/pwa-phone-b-webkit`, based on `origin/feature/pwa-phone-followup`. Only `scripts/web/journey.mjs` changed (no queue files).
Setup note: after the machine reboot `node_modules/.bin` and `server/node_modules` were missing, so `npm ci` was run once in the root and once in `server/`.

## Items

1. WebKit run: done. 844 (`--device "iPhone 14" --height 844`): before my fixes 4 of 13 failed; now only two fail, see below. Note the device descriptor's own viewport is 390x664, so without `--height 844` it is the short-Safari case.
2. Queue failure diagnosis: partly. Established:
   - WebKit (Playwright, Windows): a script's `scrollTo` on the queue scroller does not always dispatch a `scroll` event (an `addEventListener('scroll')` of my own counted 1 event over 4 scrollTo calls; resizing the viewport made the list update). The virtual list is never told, keeps its old window of rows, so the new row (index 23) was never mounted. Same app in Chromium updates. A finger scroll in Safari fires the event, so I treat this as a harness quirk, not an app bug. Fix in script: `scrollQueue` dispatches a `scroll` event.
   - rAF in that WebKit build is very slow (about 7 frames in 1s on Home) and was 1 frame in 2s on the queue page; Playwright's actionability "stable" check runs on animation frames, hence "waiting for element to be visible, enabled and stable" hanging. NOT yet settled: whether this is the build/machine load or something the queue page does (coordinator asked: compare rAF on Home vs Queue, and on Queue with the now-playing animation paused). Not done.
   - Chromium (found with `--cpu 6`, a new flag that throttles page CPU 6x, which reproduces exactly the two failures agent E and G saw: "move a queue row" `null.getAttribute`, and "a long press" menu not visible in 3s): cause is the script, not the app. (a) `scrollQueue` found the scroller by walking up from `[data-playing]`, which is unmounted while the list is scrolled away from it, so the `scrollTo(0,0)` silently did nothing. (b) After a scroll the virtual list takes about 380ms to re-render its window under 6x throttle (probe log: scroll at t=20056, playing row mounted at 20436), but the steps slept a fixed 400ms. Rows are steady once mounted (box top constant at 462), so the row does not move under a finger in the probes; I found no app bug. Fix: `scrollQueue` finds the scroller from any `[data-index]` row and waits until the window covers the target and two looks 150ms apart show identical rows and positions. Chromium `--cpu 6` passed after that.
3. Whole journey passing: partly. Chromium 390x844: passed (last full run), 1280x800: passed. 10 consecutive Chromium runs (unthrottled): stopped at 7 by the wind-down: runs 1-5 and 7 passed, run 6 FAILED in "queue a track from it and see the queue grow": my new `waitForFunction` in `scrollQueue('end')` timed out after 10s. That is a bug in my new wait condition (the `end` test: scroller at bottom and last mounted row's bottom >= virtual list container bottom - 2, plus an unchanged signature on two looks); likely the signature never settled while something (the now-playing row's animation, a re-fetch, or the new row arriving) moved rows. Next step: log the signature on timeout to see what keeps changing, and loosen to what a tap needs (the target row mounted and its box unchanged). WebKit: not re-run after the last change.
4. Safe areas: done in Chromium and WebKit at 844 with `--safe-area`; nothing sits under the top 47px (content starts about 75px, the Demo chip at about 50-70px) or hits the status strip. Bottom: the dock leaves the 34px as blank bar; content shows through below the tab labels (in Chromium, where there is blur, it is faint "Queue all / See all" text; this is brief A's). Not looked at: the open sheet and dialogs under safe areas (the journey audits the sheet but I did not view its screenshot).
5. 390x664: partly. In Chromium not run. In WebKit run three times; failures there were all the "stable" hang plus, when I forced taps globally, worse. Pages not reviewed visually.
6. Landscape 844x390: not done.
7. Font-size 16px check on text fields: done (in `auditInPage`, phone shell only). Dock hides while the search field is focused and returns after: already asserted by the existing search step. Both pass in Chromium.

## Journey changes (all in `scripts/web/journey.mjs`)

- `--safe-area` init script no longer throws when the document has no root yet (it caused a bogus "no uncaught errors" failure).
- `audit` retries up to 3s if the only problems are "hidden control" (fade-ins slower in WebKit).
- `scrollQueue` as above (async, with wait), `--cpu <rate>` flag, 16px field check.
- `press` in WebKit: tries the normal tap with a 6s timeout; only if the failure mentions "stable" does it wait for visible and tap with `force: true`. **This is the one forced tap that remains** (WebKit only, fallback only). Chromium taps are plain; the explicit `{ force: true }` on the row-menu taps were removed. The coordinator asked that forced taps go unless justified: the justification is the rAF stall above, still unproven to be the build rather than the page.
- Remaining stale bits: the `await page.waitForTimeout(400)` after `scrollQueue` calls are redundant.

## Checks run (tails)

- Chromium 390x844 `node scripts/web/journey.mjs --local`: "All journey steps passed" (before the final `scrollQueue` rewrite), and 6 of 7 after it (run 6 failed as above).
- Chromium `--cpu 6` after the rewrite: "All journey steps passed at 390x844".
- Chromium 1280x800: "All journey steps passed ... (4 phone-only step(s) skipped)".
- Chromium `--safe-area`: all passed.
- WebKit 844 (before the last `press` change): 2 failed: the row-menu step (stable hang), and "every page" on Search: `section.card.withArt "Top result..." runs from 16 to 412` which the coordinator says brief E fixes (commit f3113f2): expected to pass once E is merged.
- NOT run: `npm run typecheck`, `npm run lint`, `npm run format:check`, vitest, final `build:web` on the final tree (the dist-web in the worktree is from the base tree, unchanged by me).

## Screenshots (looked at the ones marked *)

Chromium safe-area, `C:\Users\JOSEPH~1\AppData\Local\Temp\b\cr-safe\`: *page-home, *page-now-playing, *page-album, *page-artist, *page-search, *page-more, *07-move-a-queue-row...; the rest (discover, leaderboard, lyrics, music-stats, playlist, profile, queue, queuedle, queuedle-stats, search-empty, shelf-container) not looked at.
WebKit safe-area 844, `...\Temp\b\wk-safe\`: *page-search (shows the top-result overflow), *page-now-playing, *page-home; others not looked at.
WebKit 664, `...\Temp\b\wk664\` (last run was killed part-way): not looked at.

## Changes needed in files I do not own

- None from me. Search Top result width is brief E's (already fixed on E's branch). Dock bottom area (content visible below the tab labels with 34px inset) is brief A's to judge.

## Scratch / unverified

- `scripts/web/_probe.mjs` was deleted; nothing else scratch is committed. No processes of mine should be left (checked 9102, 9103, the 87xx journey ports).
- Everything above about WebKit not delivering scroll events/frames is from Playwright's Windows WebKit; the owner confirmed long-press and menus work on a real iPhone 14.
