# Brief C: the More page, the Update row and the speaker picker

Read `COMMON.md` in this folder first.

- **Branch:** `feature/pwa-phone-c-more`
- **Port:** 9103
- **Model:** Sonnet

## You own

- `renderer/src/components/phone/MorePage.tsx` and a new `MorePage.stories.tsx` and tests beside it
- `renderer/src/styles/PhoneMore.module.css`
- `scripts/web/pwa.mjs`

Nothing else. In particular not `PhoneShell.tsx` (brief A) and not `renderer/src/web/demo/**`.

## Background

The More page (`/more`, phone shell only) lists: profile and playlists, a waiting poll, Leaderboard, Queuedle, the
speaker (group) picker when there is more than one group, Reconnect, Send feedback, the Update row when a new
version is waiting, Sign out, and the version.

Three of those rows were written but have **never been seen working**, because the demo cannot produce their
conditions:

- **Update**: appears when the bridge's `onUpdateDownloaded` fires; pressing it calls `installUpdate`. On the web
  those come from the service worker (`renderer/src/web/updates.ts`): a new version found at launch takes over by
  itself, one found later waits for this button. `PhoneShell` subscribes and passes it down; read how.
- **Speakers**: appears when `onWsGroups` delivers more than one group; choosing one calls the same handler the
  desktop's nav uses (`handleGroupChange` in `App.tsx`). The demo and the mock backend have one group.
- **Sign out**: clears the session and reloads. Never exercised.

`scripts/web/pwa.mjs` proves the update flow in Chromium, but only at 1280x800, where the Update button is the
desktop's (`WindowControls`). Nothing proves a phone user can reach it.

## What to do, in this order

1. Read `MorePage.tsx`, `PhoneShell.tsx`, `App.tsx` (how groups, polls, feedback and the update are wired),
   `WindowControls.tsx` (the desktop's Update and Poll buttons) and `TopNav.tsx` (the desktop's group picker, sign
   in/out and Reconnect) so that every row does what its desktop equivalent does.

2. **Stories with fakes** (`MorePage.stories.tsx`, in the phone shell: see how `App.phone.stories.tsx` and
   `renderer/.storybook/preview.tsx` set `parameters.platform` / `shell`): the default page; with an update
   waiting; with three speaker groups and the second active; with no poll waiting; signed out, if the page can be
   shown in that state. Override the fake bridge per story (the preview installs `window.sonos` from
   `renderer/src/test/sonosFake.ts` and the mock backend; a story can replace individual methods in a decorator or
   `beforeEach`, restoring them afterwards). Each story needs a `play` assertion that the row is there, is at
   least 44px high, and that tapping it calls the right bridge method with the right argument (`installUpdate`,
   `setGroup` with that group's id, `entraSignOut`). Story tests run axe: no violations.

3. Look at each of those stories at 390x844 (Storybook, or a screenshot through Playwright) and fix what is wrong
   in the page: order of the rows, the Update row's prominence (it uses the Success green tonally, as the desktop's
   Update button does: see DESIGN.md), the picker's selected state not relying on colour alone, long group names,
   long display names.

4. **The update flow on a phone.** Extend `scripts/web/pwa.mjs` with a check at 390x844 with touch: a version that
   arrives after the user has tapped something waits; the More tab shows that something is waiting (the tab
   carries a dot today: confirm what it means and that it appears); the Update row is on More; tapping it
   activates the new version and the page comes back on it. Follow the script's existing pattern exactly: it waits
   for outcomes by watching the caches, never for a `load` event, and never messages the service worker while
   waiting (a waiting worker only takes over once the old one is idle; see the comment on `reaches`). Run the
   whole script three times in a row; it gates deploys, so it must not be flaky.

5. **Sign out.** Read what the row does against the real bridge (`renderer/src/web/bridge/index.ts`,
   `entraSignOut`; `renderer/src/web/main.tsx`). After sign-out the user must land on the sign-in screen, not on a
   broken app. If the row only reloads and relies on something else to show sign-in, trace it and say whether it
   works; fix it in `MorePage.tsx` if the fix belongs there, otherwise describe it in your report.

## Extra proof for this brief

- `npx vitest run --config renderer/vitest.config.ts --project stories -t "More"` (only your stories), and the unit
  tests in `renderer/src/components/phone`.
- `node scripts/web/pwa.mjs` three times, all passing, with the new check's lines.
- Screenshots of each story state, looked at.
