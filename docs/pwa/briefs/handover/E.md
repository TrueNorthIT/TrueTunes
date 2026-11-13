# Handover: brief E (detail pages), second pass half-finished

Branch `feature/pwa-phone-e-pages2`. First pass (feedback 1 and 2, accepted) is commit f3113f2. The second pass was
stopped mid-way: the only uncommitted-until-now change is the Artist "Top songs" CSS (item 1 below), **built but not
yet looked at in a screenshot**. Treat it as half-finished.

## First pass (accepted)

- Feedback 1 (album/playlist hero): done. `common/HeroBand.module.css`, `album/AlbumPanel.tsx`,
  `styles/AlbumPanel.module.css`, `PlaylistPanel.tsx`, `styles/PlaylistPanel.module.css`.
- Feedback 2 (top result card full width): done. `common/TopResultCard.module.css`. WebKit card 348px in 390.
- Page review: Album done; Artist, Profile, Search looked at (no change except below); Lyrics and Container not verified.

## Second pass, item by item

1. Artist "Top songs" titles truncated: **half-finished, unverified.** Added to `styles/ArtistPanel.module.css` (phone
   shell only): `.songsList > li > :nth-child(4) { display: none }` (hides the duration cell; the shared phone chart
   row in `common/rows.module.css` places cells in explicit grid columns, so hiding it leaves an empty `auto` column).
   Why drop rather than shrink: the title cell was about 130px, shrinking the duration gains only a few px. The
   duration is on the album page. `NODE_ENV=production npm run build:web` ran fine with it. Next step: run the
   screenshot script (below) with `--only=more` in Chromium, look at `cr-artist-1.png` against the before shot, then
   WebKit. If it looks wrong, delete the rule.
2. Playlist stranded "with": **not done.** In `PlaylistPanel.tsx` the `.people` row is flex-wrap; "with" is a sibling of
   the `.collabs` list (which is `display: contents` on the phone). Idea: wrap "with" and the first collaborator in one
   nowrap flex group, or make "with" `white-space: nowrap` and glue it to the first collaborator's button so it never
   ends a line; also stop the "·" before "Created …" orphaning (put the dot inside the Created span).
3. Container page: **not done.** Route `/container/:id` needs `location.state.item`; reach it by tapping a Discover or
   Search tile that opens a container. It does not use HeroBand.
4. Lyrics (synced, plain, none): **not done.** My one WebKit look showed an empty lyrics card (probably not loaded yet at
   1.2s, or the demo has no lyrics for the playing track). See `renderer/src/test/fixtures` for how to get each case.
5. Safe areas: **not done.** My earlier attempt was invalid (inline `--safe-top` was reset by the shell). Use
   `node scripts/web/journey.mjs --local --safe-area --shots <dir>` (it injects the insets itself, read how at about
   line 80 of the script) or copy its mechanism into the screenshot script.
6. Cross-branch fact (read-only, done). On `origin/feature/pwa-phone-a-shared`: `global.css` has
   `--safe-top-extra: 0px` (24px in installed iOS), `--status-h`, `--phone-top: calc(var(--status-h) + var(--safe-top-extra))`,
   and `--nav-h: var(--phone-top)`. `PhoneShell.module.css` additionally sets `.page[data-back] { --nav-h: calc(var(--phone-top) + var(--tap) + 4px) }`
   and `.searchPage { --nav-h: calc(var(--phone-top) + 48px + 4px) }`. My HeroBand margin is
   `calc(-1 * (var(--nav-h) + 16px))`, and AlbumPanel/PlaylistPanel pad their top by `calc(var(--nav-h) + 16px)`, both
   read in the same scope, so the hero still reaches the top edge after A merges, with no change needed. My scrim height
   is `calc(var(--nav-h) + var(--tap) + 16px)`, so it just gets a bit taller there (harmless). Only break: if A (or
   anyone) changes the panels' top padding away from `nav-h + 16px`, the margin must match it.
7. WebKit for everything: first-pass pages were checked in WebKit; second-pass items not yet.

## Checks run (first pass, at f3113f2; not re-run after the Artist CSS)

- `npm run typecheck`: pass. `npm run lint`: 0 errors, 16 warnings (pre-existing). `npm run format:check`: pass.
- `npx vitest run --config renderer/vitest.config.ts --project unit --maxWorkers=2 renderer/src/components/album renderer/src/components/artist renderer/src/components/search renderer/src/components/__tests__`: 22 files, 367 tests pass.
- `NODE_ENV=production npm run build:web`: ok (also after the Artist CSS).
- `node scripts/web/journey.mjs --local`: flaky: passes on some runs; when it fails it is the two queue-menu steps ("move a queue row from its menu", "a long press opens the same menu"). Desktop `--width 1280 --height 800`: pass.
- Still to run after finishing: typecheck, lint, format:check, the vitest line above, both journeys.

## Screenshot script (outside the repo)

`C:\Users\JOSEPH~1\AppData\Local\Temp\claude\bf829d869854efdf\be5ee6da-af84-47ed-837e-e87a6683388d\scratchpad\shots.cjs`
Usage: `node shots.cjs "$(pwd)" chromium|webkit <outdir> <tag> [--only=search|album|playlist|more]`. It starts the local
gateway on port 9105 itself, closes the browser and kills the gateway at the end. It also prints any element whose
aspect-ratio box does not match (the WebKit bug pattern). The `--safe` flag does NOT work (see item 5).
Needs `renderer/dist-web` built first.

## Screenshots (absolute; all under the scratchpad `after\` folder above)

Looked at: `cr-album-0.png`, `cr-playlist-0.png`, `cr-artist-0.png`, `cr-artist-1.png` (this is the "before" for item 1),
`cr-profile-0.png`, `cr-profile-2.png`, `cr-search-none-0.png`, `wk-search-velvet-0.png`, `wk-album-0.png`,
`wk-playlist-0.png`, `wk-lyrics-0.png`, `wk-search-seeall-0.png`, `safe-album-0.png` (invalid safe-area attempt).
Taken but not looked at: other numbered scroll shots (`*-1.png` ...) and `wk-artist-*`, `wk-profile-*`.
None exists for the Artist change (item 1).

## Changes needed in files I do not own

- DESIGN.md (brief A): Phone shell section should say Album/Playlist heroes are full bleed (5/4 art, folded meta line,
  top scrim) and the Top result card has no aspect-ratio on the phone.
- None for code.

## Unverified or wrong

- Item 1 unverified (above). Journey flake in the queue-menu steps (brief B/A area), not investigated.
- WebKit on Windows shows a scrollbar gutter and thin text; the real phone does not.
- First-pass gaps still open: album with a very long title, playlist being renamed (hero), top result with an artist
  photo / no art in WebKit.
- node_modules was half-installed after the reboot; I re-ran `npm ci` at root and `server/` (complete now).
