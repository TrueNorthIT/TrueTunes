# Handover: brief A (shell and shared components): finished

Branch `feature/pwa-phone-a-shared` (from `origin/feature/pwa-phone-followup`). Reinstalled at the coordinator's request:
`npm ci --ignore-scripts` at the root and `npm ci && npm run build` in `server/` (msal-browser 5.29.0).

## Items

Feedback items:

- **5 top offset: done.** `global.css`: `--safe-top-extra` (24px only in `display-mode: standalone` with `@supports (-webkit-touch-callout: none)`),
  `--status-h`, `--phone-top = --status-h + --safe-top-extra`. `.statusBar` stays at `--status-h`. DESIGN.md names both. Checked with an
  injected stylesheet (`--safe-top: 47px !important`, extra forced on): first lines of Discover/Home sit at or below about 119px (demo strip included). Needs the owner's phone.
- **3 dock: done.** Padding `6px 8px var(--dock-pad)`, gap 2, mini 52, tab 50, `--dock-pad: max(10px, safe-bottom - 13px)`, `--dock-h: 110px`.
  Measured (injected stylesheet, so the layout really moved): 121px with inset 0 (was 125), 132px with the 34px inset (was 159): 27px back installed.
- **7 swipe down: done.** `lib/swipeDismiss.ts` (+15 tests), used by Now playing and the bottom sheet; proved with CDP touch swipes in Chromium. Dialogs untouched (brief F: only a field-less dialog sheet could use `useSwipeDismiss`). Real phone needed.
- **4 Now playing: done.** See DESIGN.md. Fits 390x664 (no scroll). `SeekBar` got an optional `thumbClassName` (drag). Artist/album links are 44px.
  Small "Now playing" label under the grab handle (the story test needs a visible h1).

Brief items: 1 done (More button order proved in a built bundle: 0 shown at 1280x800 with a mouse, 21 of 21 by touch); 2 done (below); 3 done (InfoTip prefix; Toast had it);
4 done (InfoTip tap, test); 5 done (+ and ⋯ overlap 10px, 34px glyph gap; no empty chart column); 6 superseded; 7 done (frosted strip behind Back once the page scrolls;
looked at Album and Artist scrolled in Chromium and WebKit); 8 looked, no change; 9 done.

Item 2, transparency: in the default headless shell (no blur) page text read through the dock's tab row and its bottom area (0.88 alpha).
Fixed: `--material-bg-dense` is now 0.98 (depth.css, DESIGN.md). Re-shot: nothing readable; a 2% ghost remains in Playwright WebKit. This also answers brief B's report about the bottom 34px of the dock.

Additions from others: `common/README.md` Dialog line (done); section headers (`SectionCard`, `Carousel`) keep the action on the title's row (phone only, looked at on Home: "Trending in the office · this week" wraps beside See all; "Picks for who's in" wraps beside Queue all/See all with the faces strip under);
ArtCard overlap: looked, it is the demo's art (a big flat circle in the cover image under the text), not a layout bug, not changed; Public checkbox row (`ContextMenu.module.css`): row and box 44px, tapped the label in the demo at 390x844 and the box checked;
DESIGN.md Heroes/Top result line added.

Also changed: `PhoneShell.module.css` `pageIn` starts at opacity 0.6 (not 0): the story test `Now Playing` asserts `toBeVisible` on the heading right at mount and flaked (also on the base branch's page: 1 of 3 runs) against a fully clear page.

## Checks (against the proper install, final tree)

- `npm run typecheck`: passes. `npm run lint`: 0 errors, 133 warnings. `format:check` on `renderer/src/**`: clean.
- unit (`--maxWorkers=2`): designSync, `components/common`, `components/phone`, swipeDismiss, HomePanel: 15 files, 175 tests pass.
- `NODE_ENV=production npm run build:web`: builds.
- story suite (`--project stories --maxWorkers=2`): 49 files, 224 tests pass.
- `journey.mjs --local --width 1280 --height 800`: all passed (4 phone-only steps skipped).
- `journey.mjs --local` (390x844): 13 steps pass except two. Fixed by me: the earlier "tap target" failures on Now playing (links were 40px; now 44px) and the first pass of this run was clean. **Then two steps began failing consistently: "move a queue row from its menu and see the order change"
  (`page.evaluate ... null reading 'getAttribute'`: the playing row's More button was not found, journey line 394) and "a long press opens the same menu" (`getByRole('menu')` not visible in 3s).**
  They failed identically with my Now playing, section-header and ContextMenu CSS changes reverted (checked), so I do not think my last changes cause them; but an earlier run on this branch passed all 13, so I cannot say they are only load flake. Please judge on the merged tree.
- `journey.mjs --local --safe-area` fails its last step "no uncaught errors" with `Cannot read properties of null (reading 'style')`: the flag's init script touches `document.documentElement` before it exists (journey.mjs line ~80, brief B). Per brief D the flag also has no effect (the shell overrides inline insets). My safe-area shots used an injected `:root { --safe-top: 47px !important; --safe-bottom: 34px !important }` and the layout moved (dock 132px).

## Journey changes needed (brief B's file)

Now playing: shuffle, repeat, heart are icon buttons in `role=toolbar` "More player controls", keeping aria-labels; Lyrics and Queue are icon buttons (names "Lyrics", "Queue"); the queued-by control is a button "Queued by X, open profile" with no visible text; no volume number. Add steps: drag Now playing down and see it close; drag the sheet down and see it gone (my CDP script `scratchpad\a\swipe.cjs` does it).

## The status strip over hero art (for the coordinator)

The frosted strip (`.statusBar`, `--status-h` high: inset plus demo strip, so 73px with the insets on) is `--material-bg-dense` (now 98% opaque navy) plus a blur, `pointer-events: none`; it is opaque in effect, so a hero running up to the top edge is hidden under it. Making it clear over a hero is a small, safe change: fade it in only once the page has scrolled, exactly as the Back strip now does
(`scrolled` state and `onScrollCapture` in `PhoneShell.tsx`; give `.statusBar` `opacity: 0` and a `[data-on]` rule, and show it on every page, not just `showBack`). At rest nothing then sits under it that is not meant to (titles start below `--phone-top`); the cost is that on the installed iOS app the system's own soft edge is all that sits under the clock until the first scroll. I did not do it.

## Screenshots (all in `C:\Users\JOSEPH~1\AppData\Local\Temp\claude\bf829d869854efdf\be5ee6da-af84-47ed-837e-e87a6683388d\scratchpad\a\out2\` and `...\out\`)

Looked at: `out\chromium-844safe-nowplaying.png`, `out\chromium-664-nowplaying.png`, `out\chromium-844safe-discover.png`, `out\chromium-sheet.png`, `out\chromium-desktop-home.png`,
`out2\chromium-album-scrolled.png`, `out2\chromium-artist-scrolled.png`, `out2\chromium-queue.png`, `out2\crop-shell-queue.png`, `out2\webkit-album-scrolled.png`, `out2\webkit-profile-scrolled.png`, `out2\home-picks.png`, `out2\home-trending.png`.
Taken, not looked at: the rest of those folders (profile-scrolled in Chromium, search, home-scrolled, `new-playlist.png`, `playlist-sheet.png`, final `np664-final.png`/`np844-final.png`). No WebKit shot of the final Now playing page, no before/after side by side, no shot beside the owner's two images. Scripts: `shots.cjs`, `back.cjs`, `more.cjs`, `home.cjs`, `swipe.cjs` in `scratchpad\a`.

## Not done / unverified

Everything touch-specific on a real iPhone (swipe, pull to refresh, the 24px extra, InfoTip tap); Container and Playlist pages with the Back strip were not opened (Album, Artist, Profile were); WebKit journey run (`--device "iPhone 14"`) was not run; no gateway or browser of mine is left running.
