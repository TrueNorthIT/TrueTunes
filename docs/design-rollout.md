# Design rollout: decisions log

Applying the After-Hours Gallery design system (`DESIGN.md`) across the app, on branch `feature/jdp/design-rollout`. There's one commit per batch, so any batch can be rolled back on its own.

From batch 3 onwards Joe asked for the work to continue unattended overnight (2026-10-22). An independent Impeccable critique replaces his sign-off, and any immediate concerns it raises are fixed straight away. Decisions made without him are marked **(unattended)** so he can review them.

Standing rules:
- No purple, neon or glow.
- Nothing under 13px.
- No borders: soft cards.
- Sentence case.
- Apple Music macOS is the craft bar, not a template.
- Every page gets a "what is it for" brief and at least one structural change with a reason. A reskin doesn't count.
- In the live app, never press add, queue or transport controls: it plays on the office speakers.

## Batch 1: foundation and shell
Shared tokens, `.page-scale`, the shared components in `components/common/`, and the queue sidebar, player bar and top nav. Approved.

## Batch 2: Artist, Album, Playlist
- **Artist hero.** A full-bleed photo with the name, a "Queued here" chip and Radio/Shuffle pills (which only navigate). Joe found the split layout "pasted on". Artists without a photo get the cover as a print over a colour wash.
- **Hero crop.** Comes from MediaPipe BlazeFace full-range: CPU, bundled offline, warmed when the app is idle at startup. Falls back to a detail-energy band, then `center 25%`. Electron's own `FaceDetector` has no backend.
- **Hero photo priority.** It jumps the image queue, which only fetches 4 at a time.
- **Latest release.** Now the newest album or single from the year-sorted shelves, never a live version. The Genius year lookup only accepts a hit from the same artist.
- **Album.** "More by" is grouped and leaves out the album's own versions. The tracklist is capped at 68em. The per-track "queued here" column needs a server change (a `track-counts` function), so it's deferred.
- **Playlist.** "Play all" is now "Add all to queue", because it adds to the shared queue.

## Batch 3: Search, Discover
- **Search purpose.** Finding music you already know, fast and precisely (Joe). Discovery lives on Discover; Search only touches it in the empty state.
- **Top result.** Chosen by match, not position. An artist only counts when the service ranks it first: under the rule as agreed, "Mr Brightside" picked a tribute act called "Mr. Brightside".
- **Top result card.** The art fills the card, with the text over a scrim (Joe chose this).
- **Search as you type.** 300ms debounce, minimum 2 characters, previous results kept on screen while new ones load (Joe).
- **Videos and uploads.** Tracks with no album are collapsed under their own heading (Joe).
- **Discover.** Grouped by act, with the room's faces leading. "Office favourites" is dropped, because Home's trending covers it (Joe). "Queue all" is a quiet button with an undo toast.

### Batch 3 review (unattended)
The Impeccable critique scored both Search and Discover 25/40. Fixes:
- **Search: no false top results.** A top result needs a real word in common with the query, so gibberish no longer gets a one-click Add to queue.
- **Search: artist results.** An artist top result leads Songs with the artist's own top songs.
- **Search: titles.** Search titles wrap to 2 lines so version suffixes show. This was chosen over moving the suffix to a second line, which would have meant changing TrackRow.
- **Search: Esc.** Goes back when search was opened from another page.
- **Search: errors and accessibility.** Errors show Retry. Added a hidden h1 and a live result count, and a focus ring that stays visible on pale art.
- **No violets.** Avatar and playlist colour hues skip 250–330°. PersonCard's wash is now 0.3.
- **Discover: what it offers.** It drops songs already in the queue and shows each song only once, matched on a version-blind key. Home's picks skip queued songs too.
- **Discover: Queue all.** Queues exactly what's shown, as "Queue all (N)".
- **Discover: loading.** Cards stay on screen while a new room loads.
- **Discover: Shuffle.** Refresh couldn't reshuffle, because the server's DJ set is deterministic. It's now Shuffle, which moves each act on to its next unheard songs.

## Batch 4: Leaderboard, Profile, Queuedle (unattended)
- **Leaderboard.**
  - Top queuers are now person cards with their top 3 artists. Artists carry the signal; nearly every track is queued once.
  - Places 7–10 show as face pills.
  - Queuedle standings moved out of the period tabs into their own card.
  - "This week" is now "Past 7 days", because the server uses a rolling 7 days.
  - Charts can queue: there's a + on rows and tiles.
  - The medals and the refresh button are gone.
- **Profile.**
  - Face-led hero matching the Artist hero.
  - A facts line, e.g. "1,937 plays · 72 this week · 2nd most active".
  - Top tracks is a ranked chart, beside a new "Lately" card of the last 7 days.
  - The page is keyed on the person, so switching profiles resets scroll and selection.
  - Office rank shows only for the top ten, because the server returns only ten.
  - The name uses weight 800, which DESIGN.md reserves for artist names. Revert if you want 800 kept exclusive.
- **Queuedle.**
  - Results lead with a score hero ("Joint 1st of 5 today") beside the round distributions.
  - The leaderboard has faces and shared places for ties, with no medals.
  - The play screen states the question.
  - The calendar is a "Past games" dialog.
  - Right and wrong use a local soft mint and `--danger`, always paired with ✓ and ✗.
  - The in-game screens couldn't be captured live, because playing would spend a real attempt. They're covered by component tests; "Play again (dev)" shows them.

### Batch 4 review (unattended)
The critique scored Leaderboard 26/40, Profile 26/40 and Queuedle 25/40. Fixes:
- **Counts.** Profile and the Leaderboard count queued tracks from `topUsers` and say "queued". The server's `totalEvents` includes album adds. The Leaderboard's total is "At least N" once the server's top-ten cap is reached.
- **Tier badges.** The raster tier art (purple neon, uppercase text baked in) is replaced on all three pages by a sentence-case tonal chip. This is an unattended call; redrawn badges would be the long-term fix.
- **Dialogs.** The rank and Past games dialogs use the new shared `common/Dialog`.
- **Leaderboard and Queuedle.** Artists are merged case-insensitively in the renderer, as a stopgap until the server fix (flag 1). Tied players share a place. Skeletons replace "Loading…". Queuedle's lavender fallback wash is removed, and played days get a ✓.

## Batch 5: Lyrics, Container, mini player, skinny, dialogs (unattended)
- **Lyrics page.** The Home now-playing band at full size: a Now Playing card (art, links, queued-by, About this song) beside a lyrics card. The live-lyrics logic is shared with Home through `hooks/useLiveLyrics.ts`. Plain, unsynced lyrics now show in full instead of a blank page.
- **Container page.** One section per kind of item: song rows, then album, playlist and station tiles.
  - **Safety fix.** The old "+" on a station replaced the entire shared queue. Stations now open as track lists instead.
- **Mini player.**
  - The art fills the left edge.
  - The transport sits over the art, shown on hover and always while paused, which frees the width for title, artist, queuer and time left.
  - It asks for attribution again when it opens, otherwise the queuer was always blank.
- **Skinny mode.**
  - The current track gets a Now Playing card with a queued-by chip, laid out in one row from 640px wide.
  - The centred radial glow is replaced by the shared artwork backdrop.
- **Dialogs.**
  - One shared native `<dialog>` with `showModal()`: Tab is trapped, Esc and backdrop close it, and focus returns to the opener. Form dialogs don't close on an outside click.
  - The context menu is a real `role=menu`, and Enter right after a right-click can't queue anything.
  - Feedback: Send works again after an error.
  - What's new: links open in the browser.
  - The unused `DisplayNameModal` is deleted.
  - Poll admin keeps `window.confirm` for delete, because a pinned requirement says so.

## Flags for Joe
The Microsoft To Do sign-in had expired and couldn't be renewed unattended, so these are here instead.
1. **Server: artist names are case-sensitive.** `server/src/shared/aggregate.ts` keys artists by raw name, so "Fontaines D.C." and "FONTAINES D.C." count as two. The fix is a case-insensitive key, then a deploy.
2. **Queue items have no artist.** Many reach the renderer with an empty `track.artist`, which weakens title+artist matching (including undo's fallback). Look at `sonosItemToNormalizedQueueItem`, called from `App.tsx`.
3. **Album per-track "queued here".** Needs a server `track-counts` function. The shape is in the batch 2 notes.
4. **Office rank beyond the top ten.** Needs the server to return the user's own rank.
5. **Slow test.** `queuedleGenerator.requirements.test.ts` takes about 147s against a 180s hook timeout, so it's flaky under load.
6. **Dead code.** `components/CardRow.tsx` and its test are unused. Removed in the clean-up pass.
7. **No navigation guard (fixed).** `src/main.ts` had no `will-navigate` or `setWindowOpenHandler`, so a stray link would replace the app window. Fixed in the clean-up pass with `src/nav-guard.ts`.
8. **Stations replaced the whole queue (fixed).** The root cause was `App.handleAddToQueue` sending PROGRAM items through `loadContent` with `queueAction: 'REPLACE'`. That path is gone, so nothing in the renderer can replace the shared queue now.
   - **Correction:** My Supermix turned out to be a playlist, not a station.
   - **Still your call:** opening My Supermix lands on its playlist page, where "Add to queue" queues the whole mix. Artist radio and shuffle playlists behave the same way.
9. **A second private "Favourites"** appears in the Add-to-playlist submenu. Probably someone else's, coming back from the joined playlists query (`usePlaylists`).
10. **Playback stopped for a while** during the batch 5 captures, and the queue count rose from 225 to 232. No agent touched the transport or the add controls, so it was the DJ or people in the office. Mentioned in case it wasn't.
11. **YouTube Music Home came back empty** for a while during the batch 5 fixes, then recovered on its own. The service browse answers normally now. If "For you" ever goes blank again, suspect the service sign-in, not this branch.

### Batch 5 review (unattended)
The critique rated every surface Good: Lyrics 28, Container 28, mini player 26, skinny 30, dialogs 30. Fixes:
- **Queue width clamp.** A real bug, from May: after the window went narrower than 864px, the stored queue width went negative and the nav and player bar slid under the queue sidebar. The saved width is now only a preference, and the effective width is recalculated on every resize (`lib/queueWidth.ts`).
- **Playlist submenu.** It now stays on screen.
- **Lyrics.** The art grows with the window, and a solo layout replaces the empty lyrics card.
- **Mini player.** The transport shows on any hover.
- **Container.** Station tiles say "… Radio".
- **Smaller fixes.**
  - Song rows stay two lines tall.
  - The "Public" checkbox is now drawn.
  - What's new uses one version format and has one scroll region. Its rail shows the latest 8 releases, plus the installed one, and links to GitHub for older ones.

## Clean-up pass (unattended)
- **Navigation guard.** Added to the UI and mini windows: same-origin navigation is allowed, http(s) links open in the browser, and everything else is denied. `app:openExternal` is now limited to http(s). This is covered by `npm run test:main`.
- **Skinny mode.** The queue sidebar hides its own Now playing row, so the track no longer shows twice.
- **Credits.** The comma in a credit now stays with the name before it, so a line can't start with ", Snoop Dogg".
- **Sign-in popover.** Its bordered input is replaced by the shared dialog input and PillButton, and about 150 lines of dead TopNav CSS are removed.
- **Deleted, after an import-graph scan:** CardRow, MediaCard, MediaRow, AppContext, useUserStats, gameRankAssets (the PNGs are kept), and the stale `.impeccable/surfaces/`.

## DESIGN.md refresh (unattended)
- **DESIGN.md and `.impeccable/design.json`** now describe what was built: the new components (TopResultCard, OfficeChip, QueuerChip, the tier chip, Dialog, the context menu, the heroes, the mini player and the skinny card), the 0.3 wash cap and No Violet rules, and the new behaviour rules (Shared Queue, Stations Open, Not By Colour Alone).
- **Shell wash.** The `--panel-color` wash on the shell body (`styles/App.module.css`) was 0.55, which breaks the Quiet Wall rule. It's now capped at 0.3.
- **Left open for Joe:**
  - Small labels above headings ("Now playing", "Top result", HeroBand's type line). The craft floor discourages these, but they're kept.
  - Queuedle draws ✓ and ✗ as text characters.
  - The Profile name is set at weight 800.
