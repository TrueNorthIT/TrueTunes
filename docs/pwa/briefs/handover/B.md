# Brief B handover (updated: items 1 to 7 done except where marked)

Branch `feature/pwa-phone-b-webkit`, based on `origin/feature/pwa-phone-followup`. Only `scripts/web/journey.mjs` and this file changed. No queue or app files: the causes were the script and a page-wide filter (below).
After the reboot `node_modules/.bin` and `server/node_modules` were missing, so `npm ci` ran once in the root and once in `server/`.
Not yet adapted to other briefs: A's redesigned Now playing and F's one-column Queuedle bonus round (the coordinator will ask for that after merging).

## Items

1. WebKit run: done. Now at 390x844 and at 390x664, with `--no-ambient-filter` (see item 3), 12 of 13 steps pass and no forced tap is used. The one failure is Search "Top result" (`section.card.withArt` runs 16 to 412px in a 390px window): brief E's, fixed on E's branch (f3113f2), expected to pass once E is merged.
2. Queue failure: done (cause found, no app bug).
   - Chromium: the script. `--cpu 6` (new flag) reproduces exactly agent E's and G's failures ("move a queue row": `null.getAttribute`; "long press": menu not visible). (a) `scrollQueue` found the scroller from `[data-playing]`, which is unmounted while the list is scrolled away, so `scrollTo(0,0)` silently did nothing; (b) the virtual list re-renders its row window about 380ms after a scroll under 6x throttle (probe: scroll at t=20056, playing row mounted at t=20436) but the steps slept a fixed 400ms; (c) the end of the list moves while it grows (re-fetch after an add, DJ rows), so a one-off `scrollTo(end)` can leave it short. Rows do not move once mounted (box top constant), so nothing jumps under a finger. Fix: `scrollQueue` finds the scroller from any `[data-index]` row, scrolls again each poll until at the target, and waits until two looks 150ms apart show the same rows in the same places; on timeout the error includes the last signature.
   - WebKit (Playwright, Windows): a script's `scrollTo` does not always dispatch a `scroll` event (own listener counted 1 event over 4 calls), so the virtual list kept its old window and the new row was never mounted. The script dispatches a `scroll` event itself. Not an app bug: a finger's scroll fires it.
3. Frame stall: settled. It is the page's cost in a software-rendered browser, triggered by one CSS rule, not a loop. Measured rAF frames per second in WebKit (iPhone 14 descriptor, 390x844): blank page 62, Home 10, Queue 0.7, Queue with all CSS animations and transitions off 0.3, Queue with `filter: none` everywhere 18, Queue with only the ambient backdrop image's filter off (`img[class*="_img_"]{filter:none}`) **59**, with that filter reduced to `blur(24px)` 0.7. Chromium on the same machine: 60 on Home and Queue. So the culprit is `.img` in `renderer/src/styles/AmbientBackdrop.module.css`: `filter: blur(120px) saturate(1.4) brightness(0.8)` on a full-screen oversized image. It is not mine to edit. Real Safari has a GPU, and the owner confirms the phone works, so this is probably invisible on his phone, but it is a large always-on cost and the first thing to look at if a phone feels slow (a cheaper look: pre-blur or use a much smaller image and scale it, or a radial gradient). Flagged for the coordinator.
   Consequence for the script: Playwright's "stable" tap check waits on animation frames, so it hung at about 1 fps. New flag `--no-ambient-filter` injects `img[class*="_img_"]{filter:none !important}`; with it WebKit needs **no** forced tap (the journey prints a NOTE with the count if any is used). Without it the WebKit run still has one fallback in `press`: if the tap fails with a "stable" timeout it waits for the target to be visible and taps with `force: true` (count printed). Chromium taps are all plain. Recommended use: run WebKit with `--no-ambient-filter`; the fallback is left only so a run without the flag does not hang. Remove it if you prefer a hard failure.
   Note: screenshots taken with that flag show the unblurred backdrop image (an enlarged square outline over the page): ignore that, it is the flag.
4. Safe areas: done. Retaken after changing the flag. The flag's old inline `style.setProperty` did apply in my runs (the dock gap and the top strip were there), but D reports it did not on his tree; it is now an injected `!important` stylesheet, and the first step asserts it worked: with the insets on, the tab bar's gap to the screen's bottom is 34px against 0 with them off (same page, toggled), and the `--safe-top/--safe-bottom` values are read back. It fails if nothing moved. Screenshots (Chromium `...\Temp\b\safe2\`, WebKit 844 `...\Temp\b\wk844b\`): the status strip and Demo chip sit in the top 47px, the first content from about 75px; at the bottom the tab labels end about 34+ px above the screen edge. Looked at: Chromium Home (safe2), and earlier Chromium/WebKit Home, Now playing, Search, Album, Artist, More, Queue. Under the bottom 34px the dock bar is blank with page content showing faintly through it in the WebKit/Chromium shots (brief A's "empty space" item). Not looked at: dialogs and the open sheet under the insets.
5. 390x664 (Safari with its toolbar): done in WebKit with `--no-ambient-filter`: journey 12 of 13 (same Search card). Looked at Home, Now playing, Queue (`...\Temp\b\wk664b\`). Now playing fits with no scrolling (ends about 643 of 664px, nothing under the dock because the page has none); Home and Queue are fine and scroll under the dock. Not looked at: the open sheet at this height.
6. Landscape (WebKit "iPhone 14 landscape", a 750x340 viewport): not fixed, as asked; reported. The phone shell is on. It is usable but cramped: the dock (mini player 56 + tab bar 56 + gaps) takes roughly 43% of the 340px, leaving one or two rows of the queue and the greeting plus one card on Home; Now playing shows only the art and title in the first screen, with the controls, volume and the Lyrics/Queue buttons below the fold (it scrolls, there is no sideways overflow). No Now playing dock. Screenshots: `C:\Users\JOSEPH~1\AppData\Local\Temp\b\land\{home,now-playing,queue}.png`, all looked at.
7. 16px text fields and dock-hides-while-searching: done (the field check is in `auditInPage`; the dock check was already in the search step).

## Proof

- Chromium 390x844 `node scripts/web/journey.mjs --local`: **10 of 10** in a row (one after another), plus the final run on the last tree.
- Chromium `--cpu 6`: 4 of 5 earlier; the one failure was the Leaderboard heading wait of 8s, now 20s. One more run on the final tree passed (so 5 of 6 in all, the failure fixed).
- Chromium 1280x800: passed on the final tree.
- WebKit 844 and 664 with `--no-ambient-filter`: 12 of 13 (Search card only, expected fixed by E).
- `npm run typecheck`: passed. `npm run lint`: 0 errors, 16 warnings (not mine). `npm run format:check`: all files formatted. `NODE_ENV=production npm run build:web`: built, 0 errors.
- Not run: vitest (no test files touched; no app code changed).

## Journey changes (`scripts/web/journey.mjs`)

`--cpu <n>`, `--no-ambient-filter`, `--safe-area` as an !important stylesheet plus an assertion, `scrollQueue` rewrite, WebKit-only fallback in `press`, audit retry for fade-ins, text-field size check, Leaderboard heading wait 20s.

## Changes needed in files I do not own

- `renderer/src/styles/AmbientBackdrop.module.css`: the `.img` filter above (see item 3). Suggest measuring a cheaper backdrop; not required for correctness.
- Search Top result width: brief E (done on their branch).

## Unverified / wrong outside my brief

- The frame-rate numbers are from Playwright's software-rendered WebKit on a loaded Windows machine; real iPhone behaviour not measured.
- Nothing of mine is left running (checked 9102, 9103; the journey's own 87xx gateways exit with it). Scratch files were deleted.
