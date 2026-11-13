# Brief E: pages by eye, part 2 (Album, Artist, Container, Playlist, Profile, Lyrics, Search)

Read `COMMON.md` in this folder first.

- **Branch:** `feature/pwa-phone-e-pages2`
- **Port:** 9105
- **Model:** Sonnet

## You own

- `renderer/src/components/album/**`, `renderer/src/styles/AlbumPanel.module.css`
- `renderer/src/components/artist/**`, `renderer/src/styles/ArtistPanel.module.css`
- `renderer/src/components/ContainerPanel.tsx`, `renderer/src/styles/ContainerPanel.module.css`
- `renderer/src/components/PlaylistPanel.tsx`, `renderer/src/styles/PlaylistPanel.module.css`
- `renderer/src/components/ProfilePanel.tsx`, `renderer/src/styles/ProfilePanel.module.css`
- `renderer/src/components/LyricsPanel.tsx`, `LyricsPanel.module.css`
- `renderer/src/components/search/**`
- `renderer/src/components/common/HeroBand.tsx` and `HeroBand.module.css` (the one shared component that is
  yours: the Album and Playlist hero; see item 1 in `FEEDBACK.md`)

Nothing else. Shared components (`common/**`), `global.css`, the shell and the Back button belong to brief A; the
queue to brief B.

## Background

These pages passed the automated check (no sideways scroll, 44px targets, 13px text) but only the **top** of each
has been looked at, at phone size. That check does not catch overlap, clipping, cramped rows or a hero that looks
wrong.

Known problems and open points:

- **Lyrics**: looked at before its links were made 44px high, not after.
- **Profile**: the lower half (shelves, playlists) has never been looked at.
- **Artist**: the hero was fixed once; below the top songs and the albums shelf nothing has been looked at.
- **Playlist**: on the phone the rows hide the track number and the who-added avatar; "View X's profile" and
  "Remove from playlist" moved into the row's menu. The owner has not agreed to that yet: leave it as it is, and
  in your report show a screenshot and say what it would cost in width to put the avatar back.
- **Track rows**: on the phone, artist names in track rows are not links (the whole row is one target). Same:
  leave it, show it, and say what the alternative would look like.
- The **Back button** floats over these pages' heroes. Brief A is changing how it sits. Do not move it; do make
  sure your pages leave room for a top strip of `--tap` height plus `--safe-top` and say in your report if a page
  cannot.

## What to do

For each page, in the order Album, Artist, Playlist, Profile, Container, Lyrics, Search (results, the empty state,
no results, "See all" for songs):

1. Take full-length screenshots at 390x844 at 3x in full Chromium (`channel: 'chromium'`): the top, then scroll a
   screen at a time to the end. Do the same with `--safe-area` insets simulated for the top and bottom screens.
   The page's scroller is inside the shell, not the window: scroll that element. Reach each page the way a user
   would (search, tap a result, tap an artist link), which also tests the navigation.
2. **Open and look at every screenshot.** Write down what is wrong before fixing anything.
3. Fix what is wrong, in the files you own, scoped to the phone shell (`:root[data-shell='phone']`). Re-take the
   screenshots and look again.

What "wrong" means here: anything overlapping, clipped or cut off; a hero whose text sits on bare artwork without
its scrim, or whose art is cropped badly at this width; text truncated so far it is useless (album and playlist
titles get two lines before they truncate); cramped rows; a shelf that cannot be swiped or whose tiles are too
small to read; uneven gutters (16px on the phone); pills and chips that wrap awkwardly; the lyrics' active line or
the solo layout not fitting between the top strip and the dock.

Also for this brief:

- **Search**: the field must not auto-focus when the tab opens (no keyboard jumping up uninvited), recent searches
  show first, and with the keyboard up (the dock hides while a field has focus) the results list must still be
  reachable. Check the clear button and the "See all" pages.
- **Lyrics**: check a track with synced lyrics, one with plain lyrics and one with none (the demo serves lyrics;
  see `renderer/src/test/fixtures` for how to get each case, or say which you could not produce).
- **Artist and Album**: Genius is not available on the web, so the "about" sections are absent: check the pages
  do not leave a hole where they were.
- Check each page with a long title, a shared artist credit and an artist with no photo, where the demo has them.

## Extra proof for this brief

- `npx vitest run --config renderer/vitest.config.ts --project unit renderer/src/components/album
  renderer/src/components/artist renderer/src/components/search renderer/src/components/__tests__`.
- The before and after screenshots of every screen of every page, as paths, and for each page the list of what you
  found and what you did about it. If you judged something acceptable as it is, say so and why.
