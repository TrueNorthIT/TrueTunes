# Phone shell follow-ups: the briefs

The phone shell shipped on 13 November as work in progress (#269). What is left is split into six pieces for cheaper
agents (Sonnet), each with its own files so they can run at the same time. **Nothing here has been started.**

## Base

Branch `feature/pwa-phone-followup` = `main` after #269, plus one commit the previous agent made after the version
that shipped (a denser frosted material for the tab bar and bottom sheet, a WebKit fix for Home's lead pick card,
and a timing fix in the journey). Every agent branches from it.

## The pieces

| Brief | What | Size |
| --- | --- | --- |
| [A](A-shell-and-shared-components.md) | The shell and shared components: the "more" button showing at desktop width, confirm the transparency fix, InfoTip by touch, row spacing, Now playing spacing, the Back button, the Demo badge | half a day |
| [B](B-webkit-and-safe-areas.md) | WebKit: diagnose the failing queue step, get the journey passing in Safari's engine, safe-area and short-viewport screenshots, a look at landscape | unknown: 30 minutes if it is the script, open-ended if the virtual list misbehaves in WebKit |
| [C](C-more-page-update-and-speakers.md) | The More page: the Update row, the speaker picker and Sign out, which have never been seen working; the update flow at phone width in `pwa.mjs` | an hour or two |
| [D](D-pages-home-discover-charts.md) | Pages by eye: Home, Discover, Leaderboard, Music stats, Queuedle stats | an hour or two |
| [E](E-pages-detail-pages.md) | Pages by eye: Album, Artist, Container, Playlist, Profile, Lyrics, Search | an hour or two |
| [F](F-queuedle-and-dialogs.md) | Queuedle mid-game and the dialogs (feedback, polls, new playlist), including the keyboard | an hour or two |

All six can run in parallel. If only some are started, the order of value is **A, B, F, C, E, D**: A fixes the
defects the owner has already seen, B is the only one that says anything about Safari, F covers the screens nobody
has looked at at all.

## The owner's feedback

[FEEDBACK.md](FEEDBACK.md) holds what the owner saw on his own iPhone 14, with his screenshots. Each item names the
brief that owns it; agents read it before their brief.

## How to start one

Launch a general-purpose agent on Sonnet, in its own worktree, with this prompt (change the letter):

> You are finishing one slice of True Tunes' phone layout. In the repository, on branch
> `origin/feature/pwa-phone-followup`, read `docs/pwa/briefs/COMMON.md` and then
> `docs/pwa/briefs/A-shell-and-shared-components.md`, both in full, and do exactly what they say. `COMMON.md` has
> the safety rules (the live system plays music in a real office: never touch it), the set-up, how to see the
> phone shell, the rules for the code, the checks to run and the report to send back. Edit only the files your
> brief says you own.

## Who owns what

No file is in two briefs. A file not listed belongs to nobody: an agent that needs it changed reports it.

| Area | Brief |
| --- | --- |
| `components/common/**` (except below), `components/phone/` shell files, `PhoneShell` / `PhoneNowPlaying` / `ContextMenu` / `Toast` stylesheets, `global.css`, `depth.css`, `DemoBadge`, `DESIGN.md` | A |
| `scripts/web/journey.mjs`, `components/queue/**`, `QueueSidebar.module.css` | B |
| `components/phone/MorePage.*`, `PhoneMore.module.css`, `scripts/web/pwa.mjs` | C |
| Home, Discover, Leaderboard, `musicStats/**`, `stats/**`, Queuedle stats, `common/FanBubbles.*` | D |
| Album, Artist, Container, Playlist, Profile, Lyrics, Search, `common/HeroBand.*` | E |
| `queuedle/**` (except the stats files), `common/Dialog.*`, Feedback, `polls/**` | F |

## After they report (the coordinator's part)

1. Merge the branches into `feature/pwa-phone-followup` in the order A, B, C, D, E, F, applying the changes agents
   asked for in files they did not own.
2. Run everything: `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run test:run`,
   `npm run test:main`, the server tests, both builds, the journey at 390x844 and 1280x800 (and in WebKit if B got
   it passing), and `scripts/web/pwa.mjs` three times.
3. Look at the screenshots at iPhone 14 size and at 1280x800.
4. An independent read limited to: does anything change for the Electron app or the web at desktop width.
5. One pull request, merge when green, watch the deploy, run the checks and the phone journey against production.
6. Update `docs/pwa/features.json` and `PROGRESS.md`, then the final report.

## Decisions waiting for the owner

The previous agent made two trade-offs on the phone that the briefs leave as they are until you say:

- **Artist names in track rows are not links** on the phone: the whole row is one tap target. (Artist pages are
  still reachable from the row's menu, "Go to artist".)
- **Playlist rows hide the track number and the who-added avatar**; "View X's profile" and "Remove from playlist"
  are in the row's menu.

## What no agent can do on this machine

Only a real iPhone 14 shows these. They are the owner's checks:

- the frosted bars' blur and the font weight in Safari (Playwright's WebKit on Windows draws no blur and renders
  the font too thin);
- the long-press: that it opens the menu and does not also bring up Safari's callout or select text;
- the keyboard: the dock hiding while typing, dialogs staying usable with the keyboard up;
- the real notch and home-indicator insets, in Safari and installed to the home screen;
- Add to Home Screen, and the app taking a new version when it is next opened.
