# Handover: brief F (Queuedle mid-game and the dialogs)

Branch `feature/pwa-phone-f-queuedle-dialogs`, from `origin/feature/pwa-phone-followup`. Work was stopped part-way:
the Queuedle fixes and the autofocus change are done; the checks in "Before you finish" have **not** been run
(the unit run was stopped), and nothing has been looked at in WebKit.

## Items

| # | Item | State | Files | How checked |
|---|------|-------|-------|-------------|
| 1-2 | Play a whole game and look at every state | Mostly done | none (screenshots) | Chromium, 390x844 at 3x, demo. Intro, 10 questions (before, right/wrong, carry-over), bonus round, bonus results, rank update, summary, leaderboard, "Past games" calendar all looked at. **Not looked at:** "My scores" (it lives in `QueuedleStatsPanel`, brief D's file, so my script never reached it), a game already played today, and the calendar with a played day picked. |
| 3 | Question cards: stack or side by side | Done | `renderer/src/styles/Queuedle.module.css` | Stacked, each card a compact row (art 5.5em left, name and sub-line right, count and "Pick" cue under). The `.question` grid sits at the foot of the page (`margin-top: auto`) so the pick is in the lower half. Right and wrong already carry a tick or cross ("Your pick" chip, "Not this time"), seen in the screenshots. Looked at. |
| 4 | Dock, safe-area, 390x664 | Partly | same | Dock visible in all shots. Page now scrolls on the phone (`.pageStage { height: auto }`). **Not run:** `--safe-area` and 390x664 for Queuedle. |
| 5-6 | Each dialog: empty, filled, validation, submitting, at 390x844 and 390x420 | Partly | none needed so far | Feedback, poll answer (opened only, the "picked" shot was not produced), poll admin list and new/edit form, New playlist (from own profile): empty, submit-empty, filled, at both sizes, in Chromium. All fit with the 16px gutter, title and action row stay in view at 420px high (body scrolls), fields 16px and 44px, close 44px. Looked at: feedback filled (both sizes), poll admin form filled (both), new playlist empty-submit and filled. **Not looked at:** poll answer with a long question/choices, the "submitting" state. New playlist's Create is disabled when empty, so there is no validation message to see. |
| 7 | No autofocus of a text field on the phone shell | Done | `renderer/src/components/common/Dialog.tsx`, test added in `common/__tests__/Dialog.test.tsx` | In the built demo every dialog opens with focus on `DIALOG` (the printout in my script). Desktop behaviour unchanged (selector unchanged when not `isPhoneShell()`). Callers read with `grep -rn "common/Dialog"`. The new unit test has **not been run**. |

Also added: `.body { overscroll-behavior: contain }` on the phone shell in `Dialog.module.css` (not rebuilt or looked at).

## Real defects found and fixed in Queuedle (phone shell)

1. The bonus round's last row of cards was unreachable: the stage was height-bound. Fixed by letting the page scroll on the phone.
2. Bonus choices were about 26px high. Now one column, a 2x2 grid of 44px choices per card (names rarely truncate; the full name is in `title`).
3. Submit was at the top, far from the last card. `QueuedleBonusScreen.tsx` now wraps the count and Submit in `.stageActions`; on the phone it is a sticky bar above the dock. Note: Chrome counts the scroller's padding for `position: sticky`, so `bottom: 0` is right (the panel's bottom padding already clears the dock).
4. The Today leaderboard card was `position: sticky` and rode over the answers list when stacked in one column (height >= 820px). Now static on the phone.

## Commits

`44fcee5` autofocus; then Queuedle phone layout; then leaderboard sticky fix; then the final commit with this file, the Dialog CSS line and the test (see `git log`).

## Checks run

- `npx prettier --write` on the changed CSS and TSX: clean.
- `NODE_ENV=production npm run build:web`: built (no errors) twice. The last build includes everything except the `Dialog.module.css` overscroll line.
- Not run: `npm run typecheck`, `npm run lint`, `npm run format:check`, the unit run (`--maxWorkers=2` on queuedle, polls, common, `components/__tests__`: stopped), the story tests (`-t "Dialog"`, `-t "Queuedle"`), `journey.mjs --local` at 390x844 and 1280x800, any WebKit run.

## Next steps

1. `npm run typecheck`, `npm run lint` (delete `server/dist-test` if it errors), `npm run format:check`.
2. `npx vitest run --config renderer/vitest.config.ts --project unit --maxWorkers=2 renderer/src/components/queuedle renderer/src/components/polls renderer/src/components/common renderer/src/components/__tests__`.
3. `NODE_ENV=production npm run build:web`, gateway on 9106, `node scripts/web/journey.mjs --local` and `--width 1280 --height 800`; stop the gateway.
4. Re-run the screenshot scripts (below) with `--safe-area`-style insets and at 390x664, and once in WebKit (`webkit` launcher, `devices['iPhone 14']`); look at Queuedle question, bonus and results, and each dialog.
5. Story tests once, `--maxWorkers=2`: `-t "Dialog"` then `-t "Queuedle"`. The bonus screen changed DOM (new wrapper div), so the Queuedle stories and `QueuedlePanel` tests are the ones to watch.
6. Report to the coordinator as `COMMON.md` asks.

Screenshot scripts (outside the repo, in the scratchpad): `C:\Users\JOSEPH~1\AppData\Local\Temp\claude\bf829d869854efdf\be5ee6da-af84-47ed-837e-e87a6683388d\scratchpad\qshots.cjs` (Queuedle, args: outDir label [w h] [safe] [webkit]; needs `BASE=http://127.0.0.1:9106`) and `...\dshots.cjs` (dialogs, args: outDir label [w h] [webkit]).

## Screenshots (absolute paths; all under `C:\Users\JOSEPH~1\AppData\Local\Temp\claude\bf829d869854efdf\be5ee6da-af84-47ed-837e-e87a6683388d\scratchpad\`)

- Queuedle before: `before\q-02-q0-before.png`, `before\q-03-q0-after.png`, `before\q-32-bonus.png` (looked at), `before\q-33-bonus-bottom.png` (looked at: last row cut off). Other `before\q-*` taken, not looked at.
- Queuedle after: `after\q-02-q0-before.png`, `after\q-33-bonus-bottom.png`, `after\q-35-bonus-results.png`, `after\q-36-after-0.png` (rank update), `after\q-38-summary.png`, `after\q-41-lb2.png` (the leaderboard overlap, taken before the fix), `after\q-43-calendar.png` all looked at. The rest of `after\q-*` taken, not looked at. There is no re-shot of the leaderboard after the sticky fix.
- Dialogs 390x844: `dbefore\d-*.png`; 390x420: `dbefore\k-*.png`. Looked at: `d-feedback-3-filled`, `d-polladmin-form-3-filled`, `d-newplaylist-3-filled`, `d-newplaylist-2-submit-empty`, `k-feedback-3-filled`, `k-polladmin-form-3-filled`. The rest taken, not looked at.
- There are no "after" dialog shots, since no dialog CSS changed apart from the one overscroll line.
- The scratchpad also holds other agents' files; ignore any not named `q-*`, `d-*` or `k-*`.

## Changes needed in files I do not own

- `renderer/src/components/common/CreatePlaylistDialog` (or wherever its "Public" checkbox is styled): the checkbox input measures 18px high (my script flagged it). The label row probably gives a bigger hit area, but this was not checked; make the whole row at least 44px high on the phone shell.
- `QueuedleStatsPanel.tsx` / `ScoreDistribution.tsx` (brief D) host "My scores": I did not see it on the phone.
- The journey (brief B): the Queuedle bonus step now has a sticky Submit bar and one-column cards; any step that clicks bonus candidates by position may need a scroll-into-view.

## Believed wrong or unverified

- In the demo the album and artist artwork on Queuedle cards shows as a broken image icon in my screenshots: the local gateway refuses `/img`. Not a regression; the real app proxies it.
- The back button overlays scrolled content (seen in `after\q-33-bonus-bottom.png`, top left): brief A's area.
- `common/README.md` says Dialog focus goes to the first text field; it needs "never on the phone shell" added (I did not edit it, it is not mine).
- WebKit, safe-area and 390x664 views of Queuedle and the dialogs are all unchecked.
