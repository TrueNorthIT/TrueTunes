# Handover: brief D (pages by eye, part 1): finished

Branch `feature/pwa-phone-d-pages1`. Dependencies were reinstalled after the reboot (`npm ci --ignore-scripts` at the root, then `server`: `npm ci && npm run build`).

## Per item

- **Home: partly.**
  - Pick cards: the fan cloud was sized for a desktop print. Six faces stand about 10.6em tall, taller than the ~200px phone card, so with 3+ fans it would run over the caption and the +. `FanBubbles` now scales the cloud on the phone (`--cloud-scale: 0.72`, phone shell only) and sits it nearer the edge (`right: 1em`). `FanBubbles.tsx` takes the scale through a CSS variable (default 1, desktop unchanged). The demo only has 2 fans per card, so the 3 to 6 fan case is by arithmetic only (see Unverified).
  - "Jump back in": two columns of 185px squares took a screen and a half. Now one swipe row of 9em tiles (the clipped third tile says it swipes). Home is 4,637px long instead of 5,755px (1,118px shorter).
  - Judged acceptable: "What people are queuing" (3 tiles per person, titles truncated, + on the art), "Trending" (10 rows), "For you".
- **Discover: done, nothing to fix.** Lower half checked (per-artist cards), tidy and uncramped.
- **Leaderboard: done, nothing to fix.** Standings, top artists and tracks checked.
- **Music stats: done.**
  - Cards ran 6px past the right gutter: `.twoUp` used `minmax(26em, 1fr)`, wider than the phone. Phone: one column (`MusicStats.module.css`). Measured before: 8 cards at right=380 (gutter edge is 374), after: none.
  - `BarList` (`components/stats`): in phone, a sub-value ("49 artists from 136 songs") had squeezed the bar to a dot and was cut off. It now has its own line. The empty place column of unranked lists (a 6px indent) is dropped. `data-ranked` added to the list root.
- **Queuedle stats: done.** Same `.twoUp` fix. Picker rows no longer carry an extra gap. Rating chart: its 150px of end labels left a plot a third of the card wide; on the phone they shrink to the value in the line's colour (`data-shell` check in `QueuedleStatsPanel.tsx`). Daily scores heatmap checked and fine.
- **"My scores": not found.** There is no "My scores" text anywhere in `renderer/src` (grepped, case-insensitive). The nearest section is "Daily scores" (the heatmap), which was looked at. If it means another page, it is not in my files.
- **Tooltips on touch: done.** The charts used `pointerenter` and `pointerleave`; on a touch the pointer "leaves" at lift, closing the readout at once. `ChartTooltip.tsx` now has `clearUnlessTouch` and `useDismissOnOutsideTap`; used by `Heatmap`, and the Queuedle rating chart (also opens on `pointerdown`, with `touch-action: pan-y` so a vertical drag still scrolls) and scatter. A tap elsewhere closes it. Not tried on a real touchscreen.
- **What a touch user still loses:** `BarList` row `title=` hovers (long names), the Home pick "why this pick" info (the (i) button is tappable), the fan bubbles' name-on-hover tips (the card's accessible name still lists everyone).

## Checks (all run at the end, from the repo root)

- `npm run typecheck`: clean.
- `npm run lint`: 0 errors, 135 warnings (existing).
- `npm run format:check`: all files match.
- `vitest --maxWorkers=2` on stats, musicStats, queuedle, `components/__tests__`, `lib`: 68 files, 1017 tests passed.
- `NODE_ENV=production npm run build:web`: ok.
- `journey.mjs --local` at 390x844: all steps passed (the two flaky queue-menu steps passed). Run at 1280x800: all passed, 4 phone-only steps skipped.

## Screenshots

All in `C:\Users\JOSEPH~1\AppData\Local\Temp\claude\bf829d869854efdf\be5ee6da-af84-47ed-837e-e87a6683388d\scratchpad\shots\`.

- Before (Chromium, no insets): `b-c-home-0..8.png` (Home). Other pages: `a-c-<page>-N.png` (`discover`, `leaderboard`, `leaderboard_stats`, `queuedle_stats`; taken with the Home change only, which does not touch them).
- After: `n-c-queuedle_stats-N.png`, `n-c-leaderboard_stats-N.png`; Home `a-c-home-N.png`.
- WebKit (iPhone 14 descriptor): `w-wk-home-0..8.png`.
- Safe-area: only `g-c-leaderboard-0..N.png` is valid. The journey's way of setting the insets (an inline style on the root) is overridden by the shell; the shoot script now adds a `!important` stylesheet instead. The `f-c-*` safe-area shots are invalid, because the insets did not apply (the first lines of the pages were at the same height as with no insets).
- Looked at: b-c-home-0/1/2/4/6, a-c-home-1, a-c-discover-1, a-c-leaderboard-2, a-c-leaderboard_stats-1/3, n-c-queuedle_stats-0/1, n-c-leaderboard_stats-4/5, w-wk-home-1/4/5, g-c-leaderboard-0. Not opened: the rest.

## Files outside my ownership: changes needed

- `SectionCard` / `Carousel` header (brief A): "Trending in the office · this week" wraps to two lines and "See all" drops to its own row far below it ("Picks for who's in" has the same header with a large gap before the "Queue all" / "See all" row). Fix is in the shared header, phone shell: keep the title and action on one row and let the title truncate or wrap under the action.
- `ArtCard` (brief A): on the phone the 16:9 pick print draws the large circular artist art in the centre, which overlaps the reason line at the top left ("...love The Velvet..." is partly under the disc). Not the fan bubbles. (This may be demo art only: real photos fill the card.)

## Unverified / for the owner

- Fan clouds of 3 to 6 faces on a phone card: the demo has at most 2. Computed height 10.6em x 1.3 x 0.72 at the card's font size should clear the caption and +, but it was not seen.
- The Queuedle rating chart's value-only end labels, and the touch tooltips, need a real phone.
- Playwright's WebKit showed no `aspect-ratio` collapse on Home's pick cards (full width, 16:9), the jump tiles or the person tiles. The `ArtCard` rule from the base branch already holds.
- Nothing of mine is listening on port 9104 (only TIME_WAIT leftovers).
