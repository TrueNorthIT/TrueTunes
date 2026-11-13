# Phone shell follow-ups: what every agent needs

Read this whole file, then your own brief (`A` to `E` in this folder), before you touch anything. You start with no
other context.

## What this is

True Tunes is an Electron desktop Sonos client for one office. Its React renderer (`renderer/src`) also ships as a
web app (PWA) at `https://truetunes.tnapps.co.uk`, served by a gateway. On the web, a narrow window gets a **phone
shell**: a bottom tab bar (Home, Search, Queue, Discover, More), a mini player above it, a Now playing page, a queue
page, a More page, and context menus as a bottom sheet. It shipped on 13 November as work in progress
(pull request #269). You are finishing one slice of it. The target device is an **iPhone 14**: 390x844 CSS pixels at
3x in Safari and installed to the home screen, with safe areas of 47px (top) and 34px (bottom).

Read first, in full: `CLAUDE.md` (its rules apply), `DESIGN.md` (the design spec, including its "Phone shell"
section), `.claude/rules/ui.md`, and `docs/pwa/PROGRESS.md` ("Phone shell (piece 6)" and "Next").

## Safety: real consequences

- The live system plays music in a real office. **Never** run the Electron app (`npm run dev`), and never send a
  request to `truetunes.tnapps.co.uk`, Sonos, Azure or Microsoft. Everything you need runs against the demo, an
  in-memory pretend office (`renderer/src/web/demo/`).
- Do not read or print the root `.env`.
- Never force-push, never touch `main`, never open a pull request, never merge. Push only your own branch.

## Set-up

1. You are in an isolated git worktree. Run:
   `git fetch origin && git checkout -b <your branch> origin/feature/pwa-phone-followup`
   (your brief names the branch). Work only there.
2. `npm ci` at the repo root, then `cd server && npm ci && npm run build && cd ..`.
3. `npx playwright install chromium` if Chromium is missing.

## How to see the phone shell

```bash
NODE_ENV=production npm run build:web        # this shell sets NODE_ENV=development; without the prefix there is no service worker
PORT=<your port> WEB_ROOT="$(pwd)/renderer/dist-web" node server/dist/gateway/main.js   # then open http://127.0.0.1:<port>/demo
```

- The gateway keeps files in memory: **restart it after every rebuild**. Stop it when you finish.
- Use the port your brief gives you, so agents running at the same time do not collide.
- `node scripts/web/journey.mjs --local` builds nothing but starts its own gateway and drives `/demo` by touch at
  390x844. Options: `--shots <dir>` (a screenshot per step and per page), `--safe-area` (simulates the iPhone 14
  insets), `--device "iPhone 14"` (WebKit with Playwright's descriptor), `--width 1280 --height 800` (the desktop
  layout). Read the script before using it.
- For your own screenshots use Playwright with `viewport: { width: 390, height: 844 }, deviceScaleFactor: 3,
  isMobile: true, hasTouch: true`, and launch with `chromium.launch({ channel: 'chromium' })`: the default headless
  shell draws **no backdrop blur**, so frosted surfaces look transparent in it when they are not.
- `npm run storybook` (port 6006) has `Pages/Phone shell` (every route in the shell) and `Phone/Dock`.
- **Look at your screenshots.** Open them with the Read tool and judge them: alignment, nothing clipped or
  overlapping, nothing cramped, text legible, a thumb can reach and hit things. "It renders" and "the automated
  check passes" are not the bar.
- Git Bash rewrites arguments that look like paths: pass routes without a leading slash.

## Rules for the code

- **The desktop app must not change.** `isWeb()` (`renderer/src/lib/platform.ts`) is true only in the web app.
  Scope CSS under `:root[data-shell='phone']` (the phone shell) or `:root[data-platform='web']`, never a bare
  `@media (hover: none)` (that also matches a touchscreen laptop running Electron). Do not touch `src/` (the
  Electron main process), `server/`, `infra/` or `.github/`.
- The web app at desktop width (1,144px and wider) is confirmed working by the owner. Do not change it.
- Every colour, shadow, radius and font size is an existing token; the lint enforces it. Tap targets at least 44px
  (`--tap`), no text under 13px, text fields at least 16px on the phone shell (Safari zooms otherwise), safe areas
  through `--safe-top` / `--safe-bottom` / `--safe-left` / `--safe-right`, never raw `env()`. Heights in `dvh`.
- A new token or shared component needs a line in `DESIGN.md` and a story; `designSync.test.ts` checks tokens.
- Never add a control that replaces the shared queue, and never put a + on a station.
- **Edit only the files your brief says you own.** Other agents are editing the rest at the same time. If you need
  a change in a file you do not own, do not make it: describe it exactly in your report (file, what, why).
- Keep it as small as the fix allows. UK English.

## Before you finish

From the repo root, all must pass:

```bash
npm run typecheck
npm run lint            # delete server/dist-test first if it reports errors there
npm run format:check
npx vitest run --config renderer/vitest.config.ts --project unit <the folders you touched>
NODE_ENV=production npm run build:web
node scripts/web/journey.mjs --local
node scripts/web/journey.mjs --local --width 1280 --height 800
```

Do **not** run the full `npm run test:run` (the story tests in Chromium are heavy and several agents run at once);
the coordinator runs it after merging everyone's work. If your brief says to run something else, run that too.

Commit as you go. Push your branch at the end.

## Your report (all the coordinator will see)

1. Branch and final commit hash, pushed.
2. The tail of each command above.
3. For each item in your brief: done / partly / not done, what you changed (files), and how you checked it.
4. The screenshots you took in the final state, as absolute paths, and which you looked at.
5. Changes you needed in files you do not own, described exactly.
6. Anything you could not do or verify, and anything you think is wrong that is outside your brief.
