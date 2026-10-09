# True Tunes

A desktop Sonos client for the office. Plays music through your Sonos system, tracks who queued what, and shows a leaderboard of top tracks and listeners.

Built with Electron + React. Requires a Sonos system on the local network and a Sonos account.

---

## Features

- Full Sonos playback control — queue, skip, shuffle, volume
- Browse YouTube Music, albums, artists, playlists, and history
- See who queued each track (office presence / attribution)
- Leaderboard — top tracks, artists, albums, and listeners
- Mini player — compact always-on-top window
- Auto-updates via GitHub Releases

---

## Installation

Download the latest installer from [GitHub Releases](https://github.com/TrueNorthIT/TrueTunes/releases).

- **Windows** — run the `.exe` installer
- **macOS** — open the `.dmg` and drag to Applications

On first launch you will be prompted to sign in with your Sonos account. After signing in, set a display name so your queues appear on the leaderboard.

---

## Development setup

**Prerequisites:** Node 24, npm

```bash
git clone https://github.com/TrueNorthIT/TrueTunes
cd TrueTunes
npm install            # one install at the root for every workspace
npm run desktop        # same as: cd apps/desktop && npm run dev
```

The repo is an npm-workspaces monorepo: the desktop app is in `apps/desktop`, the Android/iOS app in `apps/mobile`, and
`server/` is a separate package with its own lockfile. Run desktop scripts from `apps/desktop` (or with `-w apps/desktop`
from the root). `npm run desktop` builds the main process then starts the Vite dev server and Electron concurrently. Hot module replacement works in the renderer; main process changes require restarting.

### Environment variables (optional)

Create a `.env` file in the repo root (it is gitignored; `server/scripts/deploy.mjs` reads it too). The desktop build
bakes the values into `dist/build-env.json`, so `npm run dev` picks them up:

```
APPINSIGHTS_CONNECTION_STRING=InstrumentationKey=...
```

Without this the app works normally — telemetry is a silent no-op.

---

## Project structure

```
apps/desktop/         Desktop Electron app (paths below are relative to it)
src/                  Main process (Electron, Node.js)
  main.ts             Entry point — BrowserWindow, IPC handlers, WebSocket, auth
  preload.ts          contextBridge — exposes window.sonos API to renderer
  pubsub.ts           Azure Web PubSub client (office presence / attribution)
  telemetry.ts        Azure Application Insights wrapper (no-op without connection string)
  types.ts            Shared types used across main process

renderer/src/         Renderer process (React + Vite)
  App.tsx             Root component — layout, group selection, queue management
  hooks/              Data-fetching hooks (React Query)
  lib/                Pure utilities — sonosApi, itemHelpers, queueHelpers, imageCache
  components/         UI components
  styles/             CSS Modules
  types/              Ambient type declarations (globals.d.ts — window.sonos shape)
  test/setup.ts       Vitest global setup — mocks window.sonos

apps/mobile/          React Native (Expo) Android/iOS app — see apps/mobile/CLAUDE.md
packages/core/        @truetunes/core — platform-neutral Sonos/Azure/session modules (used by mobile)

server/               Azure Functions (office presence backend)
  src/functions/
    connect.ts        Web PubSub connection negotiation
    log-event.ts      Records queue events to Cosmos DB
    stats.ts          Queries Cosmos DB for leaderboard data
  azuredeploy.json    ARM template — deploys all Azure infrastructure

.github/workflows/
  desktop.yml         CI — validate (lint + typecheck + tests) → version bump → publish (desktop paths only)
  mobile-ci.yml       Mobile app CI (apps/mobile)
  core.yml            packages/core lint, typecheck and tests
  mobile-release.yml  Signed APK release on an android-vX.Y.Z tag
```

---

## Scripts

Run these from `apps/desktop`. At the root, `npm run lint`, `npm run typecheck` and `npm run test:run` run every
workspace (lint also covers `server/`).

| Command                      | What it does                      |
| ---------------------------- | --------------------------------- |
| `npm run dev`                | Start Electron app in dev mode    |
| `npm run build`              | Build main process + renderer     |
| `npm test`                   | Run tests in watch mode           |
| `npm run test:run`           | Run tests once (used in CI)       |
| `npm run typecheck`          | Type-check both main and renderer |
| `npm run lint`               | ESLint                            |
| `npm run format`             | Prettier                          |
| `npm run electron:build`     | Package for current platform      |
| `npm run electron:build:win` | Package for Windows               |
| `npm run electron:build:mac` | Package for macOS                 |

---

## Infrastructure

All Azure resources are defined in `server/azuredeploy.json`. Deploy with:

```bash
az deployment group create \
  --resource-group <your-rg> \
  --template-file server/azuredeploy.json \
  --mode Incremental
```

Resources created:

- **Azure Function App** — presence/attribution backend
- **Azure Web PubSub** — real-time office presence events
- **Cosmos DB** — stores queue event history
- **Log Analytics Workspace + Application Insights** — telemetry

The deployment outputs `APPINSIGHTS_CONNECTION_STRING` — add it as a GitHub Actions secret and to your local `.env`.

---

## CI / CD

Every PR to `main` or `develop` runs lint, typecheck, and tests. Merging to `main` additionally bumps the patch version and publishes signed installers to GitHub Releases via electron-builder.

The publish job requires these GitHub Actions secrets:

| Secret                          | Description              |
| ------------------------------- | ------------------------ |
| `GITHUB_TOKEN`                  | Auto-provided by Actions |
| `APPINSIGHTS_CONNECTION_STRING` | From ARM template output |
