<!-- Paste everything below this line as one message in a new Claude Code session opened at the repo root, on a fresh branch off main. -->

<context>
True Tunes is an Electron desktop Sonos client used by one office (about 15 people, one Entra ID tenant). The repo has three parts: the Electron main process (`src/`), the React renderer (`renderer/`), and the server (`server/`: Azure Functions, plus the Sonos gateway in `server/src/gateway/`). Infrastructure is Terraform in `infra/`, and merging to `main` deploys everything through `.github/workflows/publish.yml`. Read `CLAUDE.md`, `DESIGN.md`, `.claude/rules/ui.md` and `infra/README.md` before anything else: they are accurate and they contain rules you must follow.

What already exists and works in production:
- The gateway at `https://truetunes.tnapps.co.uk` (Azure App Service, always on). `/sonos/api/...` forwards to Sonos with a server-held session; `/sonos/ws` relays the Sonos WebSocket; `/healthz`. Every Sonos path requires an Entra ID token. The desktop app already uses it by default (`src/sonos-transport.ts`).
- The renderer talks to the outside world only through `window.sonos` (contract in `renderer/src/types/globals.d.ts`, desktop implementation in `src/preload.ts`, one shared fake in `renderer/src/test/sonosFake.ts`, a complete mock backend in `renderer/src/test/mockBackend.ts`). Storybook already runs the whole app in a plain browser against that mock.

Why a PWA needs the gateway, measured on 12 November 2026 from a browser:
- Sonos's WebSocket answers 403 to any page origin except its own, and tickets are single-use. A browser cannot connect to it directly; it must use the relay.
- Sonos's web API and our Azure Functions send no CORS headers. Artwork on `www.gstatic.com` and Genius's unofficial API are also unreadable from a browser. Artwork on `i.ytimg.com`, `i.scdn.co` and `mzstatic`, lyrics from `lrclib.net`, our blob storage, Microsoft Graph and the Entra sign-in endpoints all work directly.
</context>

<goal>
Ship True Tunes as an installable web app (PWA), designed for phones first and working on desktop browsers too, served from `https://truetunes.tnapps.co.uk` by the existing gateway. It uses the same design language and the same shared components as the desktop app: one renderer, two shells. The Electron app keeps working exactly as it does today.

Done means all of this is true, and you have shown it with tool output, not asserted it:
1. `https://truetunes.tnapps.co.uk/` serves the web app; it has a valid manifest and service worker and is installable.
2. A signed-in colleague on a phone can see what is playing, control playback and volume, browse and search, queue tracks, see the queue and who queued what, and use the leaderboard, Queuedle, polls, playlists, profile and feedback. Every routed page is usable at 390px wide with touch only.
3. Everything is on one origin: the browser only ever calls `truetunes.tnapps.co.uk`, plus the third-party hosts listed above that already allow it.
4. The Sonos session never reaches the browser.
5. The desktop app's behaviour and tests are unchanged.
6. All of it is merged to `main` and deployed by the pipeline, with `docs/pwa/features.json` showing every feature passing, or naming exactly what is not.
</goal>

<decisions_already_made>
These were decided with the owner. Build to them; do not reopen them.
- Hosting: the gateway serves the built web app's static files itself. One origin, so no CORS anywhere. The existing Functions are reached through the gateway under `/fn/...` (a pass-through to `truetunes-fn.azurewebsites.net/api/...` that forwards the caller's `Authorization` header untouched and adds no credentials).
- The Sonos pass-through stays "dumb": fixed upstream host, the server adds the credential, and the client chooses the path. New proxied upstreams follow the same rule. Keep the existing refusal of `/api/auth/...`.
- Artwork that browsers cannot read goes through an image path on the gateway limited to a named list of hosts. It must not become an open proxy.
- Browser sign-in: `@azure/msal-browser`, redirect flow (never popups: they fail in installed iOS web apps), on the existing Entra app registration, with the cache in `localStorage`. The gateway and Functions already accept that registration's ID token. The registration already has these single-page-app redirect addresses, and you cannot add more, so use one of them exactly: `https://truetunes.tnapps.co.uk/`, `https://truetunes.tnapps.co.uk/auth/redirect`, `http://localhost:5173/`, `http://localhost:5173/auth/redirect`. Read the tenant and client ids from the GitHub repository variables `ENTRA_TENANT_ID` and `ENTRA_CLIENT_ID`; they are not secrets and may be built into the web bundle.
- The WebSocket relay needs a way to authenticate a browser, which cannot set headers on a WebSocket. Add one that keeps the token out of the URL (for example a first-message handshake, or a subprotocol value) and keep the header path the desktop uses.
- Genius features are left out of the web app for this release (its token cannot ship in a web bundle). The existing handlers already tolerate "no result"; the web bridge returns that.
- Electron-only features are hidden on the web: window controls, the mini player window, the debug windows, taskbar and media-key integration.
- A demo route that runs the app against the bundled mock backend (lazy-loaded, no sign-in, clearly labelled as a demo) ships in production, because it is how you and the pipeline verify the deployed app without touching the office speakers.
</decisions_already_made>

<safety>
The reasons matter here, so they are given.
- The live Sonos system plays music in a real office. Do not send any command that changes playback, volume, the queue or groups on the real system: no play, pause, skip, seek, volume, add, remove, reorder or clear, and never submit Queuedle answers, polls or feedback against production. Reading (browsing, searching, observing state) is fine. Exercise every control against the mock backend instead; it exists for this.
- Do not run the Electron dev app to test controls. If you need the desktop app for a regression check, launch it, look, and close it.
- Do not read or print the root `.env`, and do not print tokens, tickets, keys or app settings. If you need a value, read it from the GitHub repository variables or Terraform outputs.
- Azure and Terraform commands must be prefixed with `AZURE_CONFIG_DIR=~/.azure-tnit-admin`. Do not sign in or change accounts; if a command says sign-in is needed, park that item and continue with the rest.
- Do not publish desktop releases (they are created as drafts; leave them as drafts), do not force-push, and do not delete branches you did not create.
</safety>

<authorised_without_asking>
I am the owner of this repository and of the Azure resources it deploys to, and I will be away while you work. I am giving you my explicit approval, now and for the whole of this task, for each of the following. You do not need to ask me again before doing any of them, and I do not want the work to wait for me:
- Create branches, commit, push, and open pull requests on `TrueNorthIT/TrueTunes`.
- Merge your own pull requests for this task into `main`, without waiting for a human review, once every required check is green and you have reviewed the diff yourself (use a subagent for an independent read of anything touching authentication or the gateway). I understand that each merge deploys to production through the pipeline and creates a draft desktop release; I want that to happen.
- After each merge, watch the `deploy` job and the gateway's `/healthz` until both are good before starting the next piece. If a deploy leaves production worse than it was, fix forward or revert with a new pull request and merge that too; this approval covers the revert.
- Re-run a failed pipeline job once when the failure is transient; otherwise fix the cause.
- Let the pipeline apply Terraform for this task. Check the pull request's plan comment first: it should contain only what you intended and must not destroy or replace anything.
- Set or change GitHub repository variables that this work needs (not secrets).
- Run read-only `az`, `gh` and `terraform plan` commands.

This approval is for this task on this repository only. It does not extend to anything in the list below.

These need the owner, so do not do them; record them in the final report and carry on with everything else:
- Any Terraform change that adds a role assignment or another resource the pipeline's identity cannot create (see `infra/README.md`). Design to avoid these. If one is unavoidable, leave that pull request open and unmerged.
- Changes to the Entra app registration, DNS, or anyone's permissions.
- Anything that would change what the desktop app does for its users.

If the session's permission settings still refuse an action I have approved above (for example a merge), do not look for another route to the same effect. Leave the work in the most finished state you can (pull request open, checks green, plan reviewed), record it in `docs/pwa/PROGRESS.md`, and continue with work that does not depend on it: stack the next branch on the unmerged one so nothing is lost, and say in the final report which pull requests are waiting for me and in what order to merge them.
</authorised_without_asking>

<how_to_work>
Keep state on disk, because this will span several context windows:
- First, create `docs/pwa/features.json`: a list of every user-visible capability and every piece of plumbing, each with `id`, `description`, `how_verified`, `passes: false` and `evidence`. Derive it from the full `SonosPreload` contract and the routed pages, so nothing is forgotten. Set `passes` to true only after the verification named in `how_verified` has actually run and passed, and put the command or screenshot path in `evidence`. Never delete or loosen an entry to make the list look finished.
- Keep `docs/pwa/PROGRESS.md`: what is done, what is in flight, decisions you made and why, and what to do next. Update it at the end of each piece of work.
- Commit both with the work. At the start of any fresh context window: read `PROGRESS.md` and `features.json`, read `git log`, run the test suites, then continue from the next unfinished feature.
- Work in small pull requests that each leave `main` working and deployable. Suggested order, cheapest proof of the riskiest thing first:
  1. Gateway: static hosting with correct cache headers, `/fn/...`, the image path, browser authentication for the relay. Deployed with nothing using it.
  2. Web target scaffold: a web build of the renderer, a `window.sonos` implementation for the browser that satisfies the `SonosPreload` type (typecheck fails until every method exists), bridge selection at start-up, Electron-only UI hidden, the demo route. Deployed: the demo route works on the real address.
  3. Sign-in and our own Functions through `/fn`.
  4. Sonos reads through the gateway: browse, search, queue, live playback state over the relay.
  5. Sonos commands through the same paths, verified against the mock only.
  6. The phone layout.
  7. Installability: manifest, icons, service worker, update flow, offline screen.
- Use subagents for work that is independent or needs its own context: parallel pieces in separate folders, broad code searches, and an independent review of each pull request before you merge it. Run them on a cheaper model (Sonnet) unless the piece is design-heavy. For a single-file or strictly sequential change, do it yourself: a subagent costs more than it saves there. When you do delegate, give each agent the repo path, the goal, the frozen contract between pieces, the folders it owns, what it must not touch, and what proof to return; tell it to find and read every relevant file in full before its first edit. Fix shared contracts before parallel work starts, and never let two agents edit the same file.
- Where the behaviour can be stated as inputs and outputs (the gateway's new paths, the browser bridge's request mapping, authentication, the relay handshake, queue reordering), write the tests first and make them pass without weakening them. If a test turns out to be wrong, say so in `PROGRESS.md` and fix the test deliberately. For layout and wiring, test alongside.
- Before every push run the same checks the pipeline runs, all of them: `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run test:run`, `npm run test:main`, and `cd server && npm test`. Most pipeline failures in this repo have been formatting or lint on files that were only unit-tested locally.
- Ordinary obstacles (a failing check, a timeout, a port in use, a flaky test) are yours to diagnose and work through. If one feature is truly blocked, record why, move to the next, and come back.
</how_to_work>

<design>
The phone layout is new design work, and it should feel like the same product, not a port.
- `DESIGN.md` is the specification ("After-Hours Gallery"). Every colour, shadow, radius and font size comes from the existing tokens; the lint rules enforce this. Reuse the components in `renderer/src/components/common/` and extend them with props before writing new ones. If a new token or shared component is truly needed, add it the way `.claude/rules/ui.md` describes, with a story, and update `DESIGN.md` in the same commit.
- Today anything narrower than about 1,144px gets `SkinnyShell`, a slim remote with no search or browse. Replace that experience on the web with a proper phone shell: primary navigation reachable by thumb, now playing always one tap away, the queue as a full view, and search and browse as first-class pages. Decide the structure yourself, then write it down in `docs/pwa/PROGRESS.md` with the reasoning before you build.
- Touch: every action that needs a right-click or a drag on desktop needs a touch equivalent (long-press or an explicit menu button for context menus; a non-drag way to reorder the queue). Tap targets at least 44px. No text under 13px. Respect safe-area insets and use dynamic viewport units so nothing hides behind browser chrome. Honour reduced motion.
- Build and judge the layout in Storybook against the mock backend, at 390x844 and 1280x800, in both a page story and the app-shell story. Look at the screenshots yourself and iterate until they are good; do not stop at "it renders". Story tests run axe, and violations fail the build.
</design>

<verification>
- Unit and story tests for everything, as the repo already does.
- A browser test (Playwright is already installed) that drives the demo route at phone size through the main journeys: open, see now playing, pause and resume, change volume, search, open an album, queue a track, reorder and remove in the queue, open the leaderboard. Run it locally against the built web app served by the gateway code, then against `https://truetunes.tnapps.co.uk` after each deploy.
- Against production, without signing in: the app shell loads, the manifest and service worker are valid, unauthenticated calls to `/sonos`, `/fn` and the relay are refused, the image path refuses hosts that are not on its list, and nothing under `/api/auth` is forwarded.
- Real sign-in needs a person, so you cannot complete it. Get as far as the Microsoft sign-in page loading with the right redirect address, and list the signed-in checks for the owner in the final report.
- Service worker: never cache anything under `/sonos`, `/fn`, the relay, sign-in responses, or any request carrying `Authorization`. `index.html`, the service worker and the manifest are served `no-cache`; hashed assets are cached long-term. Do not activate a new version mid-session without the user's say-so; reuse the app's existing update button through the bridge's update events.
- Desktop regression: the existing suites stay green, and the main process is not restructured.
</verification>

<finishing>
Keep going until the goal is met or every remaining item is blocked on something only the owner can do. Listing what is left is not a reason to stop; do the next item. When you finish, delete scratch files, make sure `features.json` and `PROGRESS.md` are current and committed, and write a final report for a reader who has not followed the work: what is live and how you verified it, the address to open, what is not done and why, the signed-in checks the owner should run on a phone, anything waiting for the owner (with the exact command or setting), and anything you changed that they might not expect.
</finishing>
