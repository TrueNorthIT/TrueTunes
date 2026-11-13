# Handover: brief F (Queuedle mid-game and the dialogs)

Branch `feature/pwa-phone-f-queuedle-dialogs`, from `origin/feature/pwa-phone-followup`. All checks have been run (below).

## Items

| # | Item | State | Files | How checked |
|---|------|-------|-------|-------------|
| 1-2 | Play a whole game and look at every state | Done, except "My scores" | `renderer/src/styles/Queuedle.module.css`, `renderer/src/components/queuedle/QueuedleBonusScreen.tsx` | Chromium 390x844 at 3x (before and after), 390x664 with safe-area insets, WebKit 390x844 (Playwright's `webkit`, not the iPhone descriptor). Looked at: intro, a question before and after an answer, bonus, bonus results, rank update, summary, leaderboard and answers list, "Past games" calendar. "My scores" is in brief D's `QueuedleStatsPanel`, left alone. |
| 3 | Question cards | Done | same | Stacked, each a compact row (4em art left, text right, count and cue under), at the foot of the page so the pick is in the lower half. Tick or cross already marks right and wrong ("Your pick", "Not this time"). |
| 4 | Dock, safe area, 390x664 | Done | same | At 390x664 with insets the revealed counts, verdict and Next all fit above the dock without scrolling (Next is also sticky, so it stays above the dock on any screen). The bonus round scrolls; Submit is a sticky bar above the dock. |
| 5-6 | Each dialog at 390x844, 390x664, 390x420, plus WebKit 390x844 | Done | none needed | Feedback, poll answer, poll admin (list and form), New playlist: empty, submit-empty, filled. All fit with the 16px gutter; title and action row stay in view at 420px high (body scrolls); fields 16px and 44px; close 44px. Looked at in Chromium and WebKit. No "submitting" state captured (the demo completes at once); New playlist's Create is disabled when empty, so there is no validation message to see. |
| 7 | No keyboard on open | Done | `Dialog.tsx`, `common/__tests__/Dialog.test.tsx` | Phone shell: focus lands on the dialog (named by its title), never a text field; desktop selector unchanged. Verified in the built demo (focus printed as DIALOG in all runs) and by a unit test. |

Other change: `Dialog.module.css` `.body { overscroll-behavior: contain }` on the phone shell.

## Defects found and fixed (phone shell)

1. Bonus round: the last row of cards was unreachable (height-bound stage). The page now scrolls.
2. Bonus choices were about 26px high. Now one column, 2x2 grid of 44px choices per card.
3. Submit was at the top of a long list. Now a sticky bar above the dock (`.stageActions`, a new wrapper in `QueuedleBonusScreen.tsx`). Chrome counts the scroller's padding for sticky, so `bottom: 0`.
4. The Today leaderboard card stayed `position: sticky` and rode over the answers list when stacked. Now static on the phone.
5. At 390x664 the revealed count of the second print was hidden by the dock/Next row. Prints are tighter and the verdict and Next row is a sticky bar.

## Checks run on this branch (final state)

- `npm run typecheck`: clean.
- `npm run lint`: 0 errors, 16 warnings (none in my files; not mine). Needed `server/dist-test` deleted first, as `COMMON.md` says.
- `npm run format:check`: all files use Prettier code style.
- `npx vitest run --config renderer/vitest.config.ts --project unit --maxWorkers=2 renderer/src/components/queuedle renderer/src/components/polls renderer/src/components/common renderer/src/components/__tests__`: 41 files, 484 tests passed.
- Stories, `--project stories --maxWorkers=2 Dialog.stories QueuedlePanel`: 3 files, 14 tests passed (axe clean). Run before the last CSS tweak (prints and Next row); only CSS changed since.
- `NODE_ENV=production npm run build:web`: built, no errors.
- `node scripts/web/journey.mjs --local`: first run, two queue-menu steps failed ("move a queue row from its menu", "a long press opens the same menu"; brief B's known flaky steps) and failed again on a re-run; the last run (after the final CSS) passed every step ("All journey steps passed at 390x844"). Queuedle and dialog steps passed throughout.
- `node scripts/web/journey.mjs --local --width 1280 --height 800`: all steps passed (4 phone-only skipped), before and after the final CSS.
- Gateway on 9106 stopped; nothing of mine is listening.

## Needs changes in files I do not own

- `renderer/src/components/common/ContextMenu.tsx` (brief A), the "Public" checkbox in the New playlist dialog (around line 521, class `checkSub`): the checkbox input measures 18px high. The label row may give a bigger hit area but I did not test a tap; make the row at least 44px high on the phone shell. Not fixed by me: not my file.
- `renderer/src/components/common/README.md`: the Dialog entry says focus goes to the first text field; add "never on the phone shell".
- Journey (brief B): the bonus round now has a sticky Submit bar and one-column cards; any step that clicks bonus choices by position may need a scroll-into-view.
- `QueuedleStatsPanel.tsx` / `ScoreDistribution.tsx` (brief D): "My scores" not looked at.

## Screenshots (absolute paths; scratchpad `C:\Users\JOSEPH~1\AppData\Local\Temp\claude\bf829d869854efdf\be5ee6da-af84-47ed-837e-e87a6683388d\scratchpad\`)

- Before: `before\q-02-q0-before.png`, `before\q-03-q0-after.png`, `before\q-32-bonus.png`, `before\q-33-bonus-bottom.png` (looked at).
- After, 390x844: `after\q-02-q0-before.png`, `after\q-33-bonus-bottom.png`, `after\q-35-bonus-results.png`, `after\q-36-after-0.png`, `after\q-38-summary.png`, `after\q-41-lb2.png` (shows the overlap, taken before the fix), `after\q-43-calendar.png` (looked at).
- Final 390x664 with insets: `final\c664-02-q0-before.png`, `final\c664-03-q0-after.png`, `final\c664-33-bonus-bottom.png`, `final\c664-41-lb2.png` (the first two looked at after the last fix; the last two before it).
- Final WebKit 390x844: `final\wk-03-q0-after.png`, `final\wk-33-bonus-bottom.png`, `final\dwk-feedback-3-filled.png` (looked at). The rest of `final\wk-*` and `final\dwk-*` taken, not looked at.
- Dialogs: `dbefore\d-*.png` (844), `dbefore\k-*.png` (420), `final\d664-*.png` (664). Looked at: `d-feedback-3-filled`, `d-polladmin-form-3-filled`, `d-newplaylist-3-filled`, `d-newplaylist-2-submit-empty`, `k-feedback-3-filled`, `k-polladmin-form-3-filled`, `d664-polladmin-form-3-filled`, `d664-poll-1-answer`.
- Scripts: `scratchpad\qshots.cjs` (Queuedle) and `scratchpad\dshots.cjs` (dialogs).

## Unverified or outside the brief

- Artwork shows as a broken-image icon in my screenshots: the local gateway refuses `/img`, so this is the demo, not a regression.
- The Back button overlays content that has scrolled under it (top left): brief A's area.
- I used Playwright's WebKit at 390x844, not `devices['iPhone 14']`. WebKit draws no backdrop blur and a thin font on Windows: ignored as `COMMON.md` says.
- Real-phone behaviour (keyboard not rising on dialog open; sticky bars over the dock with the real home indicator) needs the owner's phone.
