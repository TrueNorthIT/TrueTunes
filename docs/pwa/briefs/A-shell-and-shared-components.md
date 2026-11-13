# Brief A: the shell and the shared components

Read `COMMON.md` in this folder first.

- **Branch:** `feature/pwa-phone-a-shared`
- **Port:** 9101
- **Model:** Sonnet

## You own

- `renderer/src/components/common/**` except `Dialog.tsx` and `Dialog.module.css` (brief F), `FanBubbles.*`
  (brief D) and `HeroBand.*` (brief E)
- `renderer/src/components/phone/PhoneShell.tsx`, `PhoneMiniPlayer.tsx`, `NowPlayingPage.tsx`, `TabBar.tsx`,
  `PhoneDock.stories.tsx`
- `renderer/src/styles/PhoneShell.module.css`, `PhoneNowPlaying.module.css`, `ContextMenu.module.css`,
  `Toast.module.css`, `global.css`, `depth.css`
- `renderer/src/web/DemoBadge.*`
- `DESIGN.md`

Not yours: page panels and their stylesheets (D, E), `MorePage.tsx` and `PhoneMore.module.css` (C),
`QueueSidebar.*`, `DraggableQueueRow.tsx` and `scripts/web/journey.mjs` (B), `scripts/web/pwa.mjs` (C).

## What to do, in this order

1. **The row "more" button must stay hidden on hover devices at desktop width.** `MoreButton.module.css` sets
   `.more { display: grid }` and `rows.module.css` sets `.more { display: none }` at equal specificity, so which
   wins depends on the order the two stylesheets are bundled in. Make it not depend on order (raise the
   specificity of the right rule, or give the two classes different names). Then prove it in a **built** bundle:
   build, serve, open `/demo` at 1280x800 with a mouse (no touch), and check that no track or chart row shows a
   "more" button, and that at 390x844 with touch every row that has a menu shows one.

2. **Confirm the transparency fix.** The base branch has a denser frosted material (`--material-bg-dense`) on the
   tab bar, mini player, bottom sheet, search field and Back button, written after the owner's review found page
   content showing through the tab labels and the sheet's foot. Nobody has looked at it since. Screenshot Home,
   Queue, Search and Album scrolled so content sits under the dock, and the open row menu on the queue, in full
   Chromium (`channel: 'chromium'`) and in the default headless shell. In both, the tab labels and the sheet's
   items must be clearly legible with nothing readable behind them. Fix it if not. Also check the sheet's last
   item clears the home-indicator area with `--safe-area` on.

3. **`-webkit-backdrop-filter`.** New phone surfaces have the prefixed property; `Toast.module.css` and
   `InfoTip.module.css` do not, and both appear on the phone. Add it there. Leave the desktop shell's stylesheets
   (`TopNav`, `PlayerBar`, `QueueSidebar`) alone.

4. **InfoTip by touch.** The "why this pick" tip (`InfoTip`, `PickInfoTip`) opens on hover or focus only. On the
   phone shell it must open on tap and close on a tap elsewhere, without changing what a mouse does. Check it on
   Home's picks.

5. **Rows.** In track and chart rows the + and the "more" button are two 44px targets side by side, so their
   glyphs sit far apart and look unrelated, and chart rows with no menu keep an empty 44px column. Tighten it:
   keep each hit area 44px, but make the pair read as a pair (overlap the hit areas' padding, or reduce the gap),
   and give no column to a button that is not there.

6. **Now playing.** The gap between the title and the artist is loose because each is a 44px link. Keep the 44px
   hit areas but set the two lines as one block, the way the desktop's Now playing card does.

7. **The Back button** floats over scrolled content and covers part of a hero's pill when the page scrolls under
   it. Decide and build the better behaviour (for example a top strip in the dense material that the page scrolls
   under, like the status strip), and make it consistent on Album, Artist, Container, Playlist and Profile.

8. **The Demo badge at desktop width** was moved to the bottom-left and has not been looked at there. Look at
   `/demo` at 1280x800: it must cover nothing and not look stranded. Fix if needed.

9. Update the Phone shell section of `DESIGN.md` for anything you changed, in the same commit.

## Extra proof for this brief

- Screenshots, looked at: Home, Queue, Search and Album at 390x844 (plain, and with `--safe-area`); the open sheet;
  an open InfoTip on Home; Now playing; a scrolled Album and Artist page showing the Back button; `/demo` at
  1280x800.
- `npx vitest run --config renderer/vitest.config.ts --project unit renderer/src/components/common` and, because
  you changed shared components, `npx vitest run --config renderer/vitest.config.ts --project stories` once at the
  end (the only brief that runs the story suite).
