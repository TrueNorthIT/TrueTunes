# Handover: brief D (pages by eye, part 1)

Branch `feature/pwa-phone-d-pages1` (from `origin/feature/pwa-phone-followup`). Port 9104. Stopped early at the coordinator's request.

## Status per item: nothing in the brief is done

- Home, Discover, Leaderboard, Music stats, Queuedle stats, FanBubbles on pick cards, chart tooltip on tap: **not done**. No source file has been changed.
- Done so far: set-up only.
  - After the reboot `node_modules` was half-installed, so I ran `npm ci --ignore-scripts` at the root, then `cd server && npm ci && npm run build`. Both succeeded.
  - `NODE_ENV=production npm run build:web` succeeded (`renderer/dist-web` is built).
  - Wrote a screenshot script (see below) and took the first "before" shots of Home in Chromium, no safe area.

## Checks run

None of the COMMON.md checks (typecheck, lint, format, vitest, journey) have been run, because no code changed.

## Screenshot tooling

Script: `C:\Users\JOSEPH~1\AppData\Local\Temp\claude\bf829d869854efdf\be5ee6da-af84-47ed-837e-e87a6683388d\scratchpad\shoot.cjs`

Usage: `node shoot.cjs <repo abs path> <outdir> <tag> <chromium|webkit> <safe 0|1> <route without leading slash, "" for Home> ...`

It starts the local gateway on 9104, opens `/demo` at 390x844 3x (WebKit uses the iPhone 14 descriptor), sets `--safe-top` / `--safe-bottom` through an init script exactly as `journey.mjs --safe-area` does, finds the page's scroller, and screenshots a screen at a time. It kills the gateway and the browser at the end. Routes: `discover`, `leaderboard`, `leaderboard/stats`, `queuedle/stats`.

Home scroller: scrollHeight 5755 over a 844 viewport; no sideways overflow (docW 390).

## Screenshots taken (none looked at yet)

In `C:\Users\JOSEPH~1\AppData\Local\Temp\claude\bf829d869854efdf\be5ee6da-af84-47ed-837e-e87a6683388d\scratchpad\shots\`: `b-c-home-0.png` to `b-c-home-8.png` (Home, Chromium, before, no safe area). I have not opened any of them.

## Next step

1. Open `b-c-home-*.png` and write down what is wrong (known: the centre fan bubble overlaps the pick card title; "What people are queuing" and "For you" never looked at).
2. Repeat for Discover, Leaderboard, Music stats, Queuedle stats; then the top and bottom screens with safe-area `1`; then WebKit (one browser at a time) to look for the `aspect-ratio` plus `max-height` collapse on pick cards and image tiles.
3. Fix in the owned files, scoped under `:root[data-shell='phone']`. Existing phone rules sit at the end of `renderer/src/styles/HomePanel.module.css` (from line ~727) and `DiscoverPanel.module.css` (~273). `FanBubbles` positions itself with `.cloud` in `renderer/src/components/common/FanBubbles.module.css`; its size comes from `layoutBubbles` in `lib/pickBubbles` (not mine) and `BUBBLE_SCALE` in `FanBubbles.tsx`. A phone-scoped override of `.cloud` is the likely fix.
4. `ChartTooltip` (`renderer/src/components/stats/ChartTooltip.tsx`) is hover-only; check the chart components for a tap path.
5. Commit after each page, then run the COMMON.md checks with `--maxWorkers=2`, one heavy thing at a time.

## Notes for the coordinator

- Files I do not own that I need changed: none identified yet.
- The tree was last known clean apart from this file; `node_modules` is not tracked.
- Nothing is believed wrong or unverified beyond the above; nothing in my branch is half-finished code.
