# Brief F: Queuedle mid-game and the dialogs

Read `COMMON.md` in this folder first.

- **Branch:** `feature/pwa-phone-f-queuedle-dialogs`
- **Port:** 9106
- **Model:** Sonnet

## You own

- `renderer/src/components/queuedle/**` except `QueuedleStatsPanel.tsx` and `ScoreDistribution.tsx` (brief D)
- `renderer/src/styles/Queuedle.module.css`
- `renderer/src/components/common/Dialog.tsx` and `Dialog.module.css` (the one shared component that is yours)
- `renderer/src/components/FeedbackDialog.tsx`, `renderer/src/styles/FeedbackDialog.module.css`
- `renderer/src/components/polls/**`, `renderer/src/styles/PollDialog.module.css`

Nothing else. The bottom sheet and its in-place playlist list are `ContextMenu` (brief A).

## Safety, specific to this brief

Queuedle, polls and feedback **write** when they are submitted. You work only in the demo (`/demo`) and Storybook,
where nothing leaves the page, so play and submit freely there. Never do any of it against the live address.

## Background

- **Queuedle** (`/queuedle`) is a daily game: an intro, a run of "Higher or Lower" question cards, a "Top Queuer"
  bonus round, a summary with the rank change, a leaderboard, a "Past games" calendar and "My scores". Only the
  **intro** has been looked at on the phone shell. The rest passed the automated size check and nothing more.
  The calendar's cells were 43px and were made 44px; not looked at since.
- **Dialogs** at phone width:
  - Feedback: looked at once, before its fields were given a 44px minimum height; not since.
  - Poll answer: its choices were 42px and were fixed; never looked at by eye.
  - Poll admin: only the list state was seen; the new/edit form was never opened.
  - "New playlist" (reached from a row's menu, Add to playlist): never looked at by eye.
  - The shared `Dialog` is a native `<dialog>` opened with `showModal()`; on the phone shell it was restyled
    towards a full-width, sheet-like panel.
- **Known defect**: opening a form dialog focuses its first field, which raises the keyboard at once and covers
  half the dialog before the user has read it.

## What to do

### Queuedle

1. Play a whole game in the demo at 390x844 with touch, screenshotting **every** state at 3x in full Chromium
   (`channel: 'chromium'`): the intro, a question card before and after answering (right and wrong), the carry-over
   between questions, the bonus round and its results, the summary, the rank change, the leaderboard, the calendar
   ("Past games"), "My scores", and a game already played today. The demo's game data is in
   `renderer/src/test/fixtures/azure.ts`; `QueuedlePanel.stories.tsx` shows how each state is reached, which may be
   quicker than playing to it.
2. **Open and look at every screenshot**, write down what is wrong, then fix it in the files you own, scoped to the
   phone shell (`:root[data-shell='phone']`). Re-take and look again.
3. The two cards of a question sit side by side on desktop. Decide whether they stack or stay side by side at
   390px so that both pieces of artwork, both names and the choice are comfortable for a thumb, and the answer
   controls are in the lower half of the screen. Right and wrong must not rely on colour alone (DESIGN.md: a tick or
   a cross as well).
4. Check the game with the dock visible and with `--safe-area` insets: nothing important under the dock or the
   home indicator, and the page does not need scrolling to reach the answer buttons on a 390x664 viewport (Safari
   with its bars showing).

### Dialogs

5. Open each dialog on the phone shell and screenshot it empty, filled, with a validation error and while
   submitting: feedback (from More), the poll answer (from More, "A poll is waiting"), poll admin including its
   new/edit form (find how `PollAdminLauncher` opens it), and "New playlist" (a row's menu, Add to playlist, New
   playlist). Do the same with the software keyboard's space taken: a 390x420 viewport approximates a phone with
   the keyboard up.
6. **Look at every screenshot**, then fix: the dialog must fit a 390px screen with the 16px gutter or go full
   width as a sheet; its title, fields and action row must all be reachable with the keyboard up (the action row
   must not be pushed off screen or hidden under the keyboard: let the body scroll and keep the actions in view);
   fields at least 16px text and 44px high; the close button 44px; long poll questions and choices wrap.
7. **Autofocus.** On the phone shell, opening a form dialog must not raise the keyboard by itself. Focus should
   land somewhere sensible for a screen reader and keyboard user (the dialog's title or the dialog itself) without
   focusing a text field. Do not change what the desktop does. `Dialog.tsx` is used by every dialog: read all its
   callers (`grep -rn "common/Dialog" renderer/src`) before changing it, and keep Esc, the backdrop tap (except on
   form dialogs, where a stray tap must not lose typed text) and focus return to the opener working.

## Extra proof for this brief

- `npx vitest run --config renderer/vitest.config.ts --project unit renderer/src/components/queuedle
  renderer/src/components/polls renderer/src/components/common renderer/src/components/__tests__`.
- `npx vitest run --config renderer/vitest.config.ts --project stories -t "Dialog"` and `-t "Queuedle"` (axe must
  stay clean).
- The before and after screenshots of every Queuedle state and every dialog state, as paths, with what you found
  and what you did about each.
