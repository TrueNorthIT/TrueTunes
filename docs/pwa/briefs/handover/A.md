# Handover: brief A (shell and shared components)

Branch `feature/pwa-phone-a-shared`, from `origin/feature/pwa-phone-followup`. Wound down on the coordinator's
instruction; nothing is half-written in the code, but the last verification steps were not run (see "Next step").

Reinstalled: a reboot left a partial `node_modules`; I deleted it, then ran `npm ci --ignore-scripts` at the root and
`npm ci && npm run build` in `server/` (msal-browser 5.29.0, `server/dist/gateway/main.js` built). Everything below
after "Checks" ran against that install; the screenshots were taken earlier against a build made with the main
checkout's packages, so the owner-visible CSS/DOM they show should be re-taken (cheap).

## Items

Feedback (mine):

- **5, top offset: done.** `global.css`: `--safe-top-extra` (24px only in `display-mode: standalone` + `@supports (-webkit-touch-callout: none)`),
  `--status-h` (inset + demo strip), `--phone-top = --status-h + --safe-top-extra`. `.statusBar` stays at `--status-h`
  (kept in the installed app: iOS's own edge is only a soft blur, so our strip still keeps scrolling content off the clock;
  not removed). `DESIGN.md` names both tokens and the source of 24px. Checked in Chromium with the inset and the extra
  forced on: Discover title cap top at about 119px (Demo strip included), Home greeting likewise, all >= 71px. Needs the owner's phone.
- **3, dock space: done.** `PhoneShell.module.css`, `global.css`: padding `6px 8px var(--dock-pad)`, gap 2px, mini 52px,
  tab 50px; `--dock-pad: max(10px, safe-bottom - 13px)` (21px at 34); `--dock-h: 110px`; `--player-h = dock-h + dock-pad`.
  Measured dock heights: 121px with inset 0 (was 125) and 132px with the 34px inset (was 159): 27px of content back
  when installed, 4px in Safari. Labels end about 24px above the edge. No side-by-side before/after image was made.
- **7, swipe down: done.** New `renderer/src/lib/swipeDismiss.ts` (`swipeIntent`, `shouldDismiss`, `installSwipeDismiss`,
  `useSwipeDismiss`) and `lib/__tests__/swipeDismiss.test.ts` (15 tests pass). Used by `NowPlayingPage.tsx` (grab handle
  added, chevron kept) and `ContextMenu.tsx` (sheet). Proved with CDP touch swipes in Chromium: a long drag closes Now
  playing, a short slow drag and a 30px twitch stay, a drag on the seek bar stays, a long drag on the sheet closes it.
  Scrolled-content and horizontal cases are in the unit tests. `overscroll-behavior: contain` on both. Dialogs untouched (brief F;
  suggestion: only a field-less dialog presented as a sheet may call `useSwipeDismiss`). Needs a real phone (pull to refresh).
- **4, Now playing redesign: done.** `NowPlayingPage.tsx`, `PhoneNowPlaying.module.css`; `common/SeekBar.tsx` gained an
  optional `thumbClassName` (thumb and pointer drag, seeks on release; desktop unchanged). Bands: handle/chevron, art with
  a 32px queuer face on its corner (44px target, name "Queued by X", champion ring kept), centred title and one
  "Artist · Album" line, progress with thumb, prev/play/next, quieter volume (no number), one tonal tool bar
  (shuffle, repeat, heart, lyrics, queue; on = chip plus dot, heart also fills). Fits 390x664 without scrolling
  (scrollHeight == clientHeight at 664 and 844). `DESIGN.md` Now playing bullet rewritten, Swipe to dismiss bullet added.
  I judged it calm, close to the reference. Not done: screenshot beside the owner's two images; no WebKit run.
  **Journey change needed (brief B's file `scripts/web/journey.mjs`):** Now playing's shuffle, repeat and heart are now
  icon buttons in a `role=toolbar` ("More player controls") and keep their aria-labels; Lyrics and Queue are icon
  buttons named "Lyrics" and "Queue" (were pills); the queued-by chip is now a button named "Queued by X, open profile"
  with no visible text; the volume number is gone; previous/next remain but shuffle/repeat are no longer in the transport row.
  Also add: drag Now playing down and see it close; drag the sheet down and see it gone (my `swipe.cjs` does this with CDP).

Brief's own:

- **1, More button order: done in CSS, partly proved.** `rows.module.css`: `:global(:root) .more { display: none }` beats
  `MoreButton.module.css` whatever the bundle order. Proved in a built bundle at 1280x800 with a mouse: 0 displayed "More for" buttons
  on `#/`, `#/discover`, `#/leaderboard` (15, 21, 10 in the DOM). At 390x844 touch: 21 of 21 shown on Discover.
- **2, transparency check: partly.** Looked at the open sheet (opaque, last item clears the 34px inset) and the dock over
  Discover content (legible). Not done: Home/Queue/Search/Album scrolled shots in the default headless shell versus full Chromium.
- **3, `-webkit-backdrop-filter`: done.** `InfoTip.module.css` had it missing; `Toast.module.css` already had it.
- **4, InfoTip by touch: done.** `InfoTip.tsx`: a touch tap pins it open, a tap on the button again or anywhere else closes it
  (pointerdown capture); mouse unchanged. Test added. Checked in Chromium on Home picks: one tap opens it (screenshot taken).
- **5, rows: done.** `rows.module.css`: + and ⋯ overlap 10px past the gap (tracks: `calc(-0.75em - 10px)`; chart: `-10px`), each target
  still 44px; chart grid's last two columns are `auto` and the spacer is hidden on the phone, so no empty column.
  The overlap fix was written after the last screenshot: re-check by eye (the earlier screenshot showed glyphs still 44px apart, which is why it was changed).
- **6: superseded by feedback 4.**
- **7, Back button: done, not eyeballed.** `PhoneShell.tsx` (`backStrip`, `onScrollCapture`) and `PhoneShell.module.css`: a dense frosted strip
  behind Back fades in once the page scrolls more than 8px (ignores sideways shelves); at rest there is none, so Artist/Profile heroes still run under the top.
  My last screenshot run (album/artist scrolled) used the scroller that I then fixed; **look at `album-scrolled` and `artist-scrolled` again.**
- **8, Demo badge at 1280x800: looked, no change.** Bottom-left in the margin under the player bar, covers nothing.
- **9, DESIGN.md: done** for dock, tokens, Now playing, swipe.

## Checks (against the proper install)

- `npm run typecheck`: passes (no output after the two tsc commands).
- `npm run lint`: 0 errors, 133 warnings (existing); designmd lint 0 errors.
- `npm run format:check`: found two files, fixed with `prettier --write` (NowPlayingPage.tsx, swipeDismiss.ts): **that fix is in the final commit, re-run to confirm clean**.
- `npx vitest run ... --project unit --maxWorkers=2 renderer/src/components/common renderer/src/lib/__tests__/swipeDismiss.test.ts renderer/src/components/phone`: passed, exit 0 (earlier common-only run: 12 files, 95 tests).
- Not run: `NODE_ENV=production npm run build:web` against the proper install, `journey.mjs --local` at 390x844 and 1280x800
  (so no data on the queue-menu flake), the story suite (`--project stories --maxWorkers=2`, required last, and needed since
  `common/` changed and `PhoneDock.stories.tsx`, plus a Now playing story, may need updating), WebKit.

## Next step

1. `npx prettier --check` on touched files; `NODE_ENV=production npm run build:web`.
2. `node scripts/web/journey.mjs --local` and `--width 1280 --height 800`; update the Now playing steps (or report to B as above).
3. Re-take screenshots (scratch scripts in `C:\Users\JOSEPH~1\AppData\Local\Temp\claude\bf829d869854efdf\be5ee6da-af84-47ed-837e-e87a6683388d\scratchpad\a\`: `shots.cjs`, `more.cjs`, `swipe.cjs`; they serve `renderer/dist-web` on 9101 and need `playwright` from the root install); look at album/artist scrolled and the row pair; WebKit pass.
4. Brief item 2 shots; the story suite last.

## Screenshots (all in `...\scratchpad\a\out\`, from the earlier build)

Looked at: `chromium-844safe-nowplaying.png`, `chromium-664-nowplaying.png`, `chromium-844safe-discover.png`, `chromium-album-scrolled.png` (not actually scrolled),
`chromium-discover-rows.png`, `chromium-sheet.png`, `chromium-desktop-home.png`, `chromium-844safe-home.png`. Taken, not looked at: the rest in that folder.

## Files I do not own

None changed. Needed: `scripts/web/journey.mjs` (see feedback 4 above).

## Unverified / concerns

- Everything touch-specific on a real iPhone (swipe, pull to refresh, the 24px extra, tap-to-open InfoTip).
- Playwright's chromium `shots.cjs` simulates safe areas by overriding `--safe-top`/`--safe-bottom`; the standalone extra was forced the same way.
- The overlapped + hit area is 34px wide where the pair meets (brief allows it).
- Row `.more` base rule now uses `:global(:root)` for specificity; the queue's own `MoreButton` has no rows class and is unchanged.
