# Handover: brief E (detail pages), second pass finished except Lyrics plain/none

Branch `feature/pwa-phone-e-pages2`. Commits: f3113f2 (hero, top result card), 95d4d5c (artist duration), then the
second-pass commit(s) on top (playlist "with" fix, formatting, this file).

## Items

First pass: feedback 1 (album/playlist hero) done; feedback 2 (top result card, WebKit 348px full width) done.

Second pass (coordinator's list):
1. Artist Top songs: DONE. `styles/ArtistPanel.module.css`: on the phone shell the row's 4th cell (duration) is
   hidden, because the title cell was about 130px; I dropped rather than shrank since shrinking gains only a few px
   and the duration is on the album page. Looked at in Chromium (`p2\cr-artist-1.png`) and WebKit
   (`p2\wksafe-artist-1.png`): "Distant Satellites", "Burning Morning" now whole; album subtitles still truncate
   ("Paper Lanterns at Lo…"), which is the secondary line, acceptable.
2. Playlist "with": DONE. `PlaylistPanel.tsx`, `styles/PlaylistPanel.module.css`: on the phone "with" is rendered inside
   the first collaborator's `li` as one nowrap unit (the standalone word stays for desktop); the "Created …" date is one
   nowrap span, on its own line on the phone with no leading dot. Looked at: `p2\crsafe-playlist-0.png`,
   `p2\wksafe-playlist-0.png`. Remaining small risk: the dots between "Playlist · Private · 9 tracks" are separate
   spans and could orphan at a line end on a much narrower phone (fits at 390).
3. Container page: DONE (nothing to fix). Reached from Home's "Quick picks" shelf (`#/container/shelf-quick`).
   Chromium and WebKit: heading, counts, Songs card and the two-column albums grid look right, no overflow.
   `p2\cr-container-0.png`, `cr-container-1.png`, WebKit `wksafe-container-*.png` (not individually opened).
4. Lyrics: PARTLY. Synced: looked at (`p2\crlyr2-lyrics-0.png` Chromium; first pass `wk-lyrics-0.png` WebKit). In the demo
   the first line is shown dim near the bottom of a tall, otherwise empty lyrics card and no line is highlighted, because
   the lyrics clock was before the first synced line (first line at 0:10) while the demo's progress had moved on;
   so "current line highlighted" was NOT seen, and the current line is not hidden behind the dock in what I saw.
   Plain and none: NOT produced: my script overrides `window.fetch` for lrclib after load, but all three screenshots
   (`crplain-lyrics-plain-0.png`, `crnone-lyrics-none-0.png`) show the same synced content, so the override was not
   used (cached query or a different fetch path). Text size/offset not measured. Next step: get the lyrics query to miss
   (change track or override before the app starts, e.g. `page.addInitScript` wrapping `fetch` before `/demo` runs
   its runtime install), or add a Storybook-style fixture.
5. Safe areas: DONE for the layout, using an injected stylesheet `:root{--safe-top:47px!important;--safe-bottom:34px!important}`
   (confirmed it moved the layout: `--phone-top` 73px = 47 + the 26px demo strip; album scroll height 1882 -> 1916).
   Album, Playlist, Artist, Search, Lyrics in Chromium (`p2\crsafe-*.png`) and all of Playlist, Artist, Container, Profile,
   Album, Search in WebKit (`p2\wksafe-*.png`, only playlist and artist-1 opened). Findings: the shell's own frosted
   `.statusBar` strip (`--phone-top` tall, in this build nearly opaque in screenshots) covers the top 73px, so the hero
   art visibly begins under it at y=73; the scrim and the Back button (at about y=100) are legible, and nothing
   interactive sits in the top 47px or the bottom 34px (tab labels end about 60px above the screen edge). Whether the
   art should show through the strip is brief A's call (item 5 in FEEDBACK.md); my margin already pulls the art up
   to the page's top edge.
6. Cross-branch margin: done, no change needed (see below).
7. WebKit: done for Album, Artist, Container, Playlist, Profile, Search (iPhone 14 descriptor, 390x664) plus
   Lyrics synced (first pass). Overflow check false everywhere; the aspect-ratio mismatch detector found nothing.

### The hero margin and brief A's tokens (read-only)
On `origin/feature/pwa-phone-a-shared`: `--phone-top = --status-h + --safe-top-extra` (24px extra in installed iOS),
`--nav-h = --phone-top` and `.page[data-back] { --nav-h: phone-top + tap + 4px }`, `.searchPage { --nav-h: phone-top + 48px + 4px }`.
`HeroBand.module.css` writes the art's top margin as `calc(-1 * (var(--nav-h) + 16px))` and Album/Playlist pad their top by
`calc(var(--nav-h) + 16px)`; both read the same `--nav-h` in the same scope, so the art still reaches the top after A
merges. The only break would be a change to the panels' `nav-h + 16px` padding. The scrim height uses
`--nav-h + --tap + 16px` (a little taller on A's branch, harmless).

## Checks on the final tree
- `npm run typecheck`: pass.
- `npm run lint` (after `rm -rf server/dist-test`): 0 errors, 16 warnings (pre-existing).
- `npm run format:check`: "All matched files use Prettier code style!" (after prettier on ArtistPanel.module.css).
- `npx vitest run --config renderer/vitest.config.ts --project unit --maxWorkers=2 renderer/src/components/album renderer/src/components/artist renderer/src/components/search renderer/src/components/__tests__`: 22 files, 367 tests pass.
- `NODE_ENV=production npm run build:web`: built.
- `node scripts/web/journey.mjs --local` (390x844): FAILS on 2 runs out of 2 at the end, always and only the two known queue-menu steps ("move a queue row from its menu and see the order change", "a long press opens the same menu"); every other step incl. the every-page audit passes. Earlier in this session it passed on some runs. Not investigated (brief B is fixing the script).
- `node scripts/web/journey.mjs --local --width 1280 --height 800`: "All journey steps passed" (4 phone-only skipped).

## Screenshots (absolute; scratchpad `C:\Users\JOSEPH~1\AppData\Local\Temp\claude\bf829d869854efdf\be5ee6da-af84-47ed-837e-e87a6683388d\scratchpad\`)
`p2\` holds the second pass; `after\` the first pass. Opened and judged: p2\cr-artist-1, cr-container-0, cr-container-1,
crsafe-album-0, crsafe-playlist-0, crsafe-search-0, crsafe-artist-0, wksafe-playlist-0, wksafe-artist-1,
crlyr-lyrics-0, crlyr2-lyrics-0, crplain-lyrics-plain-0, crnone-lyrics-none-0. Taken, not opened: the other numbered scroll
shots and wksafe-container/profile/album/search.
Scripts: `rest.cjs` (cases artist,container,lyrics,lyrics-plain,lyrics-none,album,playlist,search,profile; `--safe`
injects the stylesheet; starts and stops its own gateway on 9105), `shots.cjs` (first pass). Port 9105 is clear.

## Changes needed in files I do not own
- DESIGN.md (brief A): Phone shell section: album/playlist heroes full bleed (5/4 art, folded meta line, top scrim),
  Top result card without aspect-ratio on the phone. No new tokens.
- Brief A: decide whether the hero art should show through the frosted status strip in the installed app (today the
  strip hides the top 73px of the art, by design of `.statusBar`).
- Journey (brief B): `--safe-area` sets the insets inline and the shell resets them; inject a stylesheet with
  `!important` instead.

## Unverified / wrong
- Lyrics plain and none, and a highlighted synced line: not seen (above).
- Real-phone look (blur, installed iOS offset) needs the owner's phone.
- Playlist hero with a long title, owner renaming, album with a very long title, top result with an artist photo/no art
  in WebKit: not checked.
