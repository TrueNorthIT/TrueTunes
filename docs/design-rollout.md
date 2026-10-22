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
