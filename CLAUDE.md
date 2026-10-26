# Claude Notes — True Tunes 2

## What this is

Electron desktop Sonos client. Three distinct environments that compile and run separately:

- **Main process** (`src/`) — Node.js, TypeScript, compiled by `tsc`
- **Renderer** (`renderer/`) — React + Vite, compiled by Vite/esbuild
- **Server** (`server/`) — Azure Functions, separate `package.json` and `tsconfig.json`

The renderer never imports from `src/` and vice versa. Communication is strictly through IPC (`ipcMain.handle` / `ipcRenderer.invoke`) with the bridge defined in `src/preload.ts` and the renderer-side types in `renderer/src/types/globals.d.ts`.

---

## Running and building

```bash
npm run dev          # build main + start Vite + Electron concurrently
npm run build:main   # tsc only (main process)
npm run build        # main + renderer
npm run typecheck    # tsc --noEmit for both main AND renderer (run this before committing)
npm run test:run     # full test suite once: the jsdom suite AND the story tests
npm run lint         # ESLint + Stylelint (design tokens) + designmd lint of DESIGN.md
npm run storybook    # component workshop on :6006
```

The renderer is **never type-checked by Vite** (esbuild strips types). `npm run typecheck` is the only way to catch renderer type errors — always run it.

---

## Visual verification (Claude Code)

**The live app drives the office speakers.** Never press (or script a click on) add, queue, play next, station, transport or seek controls, and never play or submit Queuedle, feedback or polls. Navigate and hover only. To see a control's states, use its story in Storybook (below), where nothing reaches Sonos.

In dev builds the DJ autoplay client never requests the enqueue lease (preview only), so a dev instance can't add filler to the real queue; set `VITE_DJ_AUTOPLAY_IN_DEV=true` to opt in.

`npm run dev` enables Chrome DevTools Protocol on port 9333 (`curl -s http://localhost:9333/json/version` to check).

```bash
node scripts/screenshot.mjs shot.png                    # current page
node scripts/screenshot.mjs shot.png leaderboard        # after moving to #/leaderboard ("" for Home)
node scripts/perf-trace.mjs perf.json love              # perf baseline <out.json> <searchTerm>: reloads, navigates and scrolls only
```

Give the route without `#/`: Git Bash rewrites path-like arguments, so `'#/leaderboard'` arrives as `#C:/Program Files/Git/leaderboard`.

Live data (now playing, queue, picks) changes between shots, so for before/after comparisons of a component prefer its stories. If Vite serves stale modules after big edits, stop dev and delete `node_modules/.vite`.

---

## Architecture

### IPC bridge

`src/preload.ts` exposes `window.sonos` via `contextBridge.exposeInMainWorld`. Every renderer→main call goes through this.

- Add a new capability: declare it in `SonosAPI` in `preload.ts`, implement it in the `contextBridge.exposeInMainWorld` call, add an `ipcMain.handle` in the matching `src/ipc/<domain>.ts` module's `register()`, and add the type to `renderer/src/types/globals.d.ts` (`SonosPreload` interface).
- `main.ts` keeps app lifecycle, window creation and wiring only. Handlers live in `src/ipc/*.ts` (one module per domain, each exporting `register()`); shared config and runtime state live in `src/state.ts`; the Sonos HTTP and WebSocket clients in `src/sonos-api.ts` and `src/sonos-ws.ts`. No circular imports: a module needing something from `main.ts` gets it through its `init`/`register` deps.
- `installIpcGuard()` (`src/ipc/guard.ts`) wraps `ipcMain.handle` with the sender check. `main.ts` calls it before any `register()`; a handler registered before it gets no check. `src/ipc-channels.test.ts` fails if a preload channel has no registered handler.
- `globals.d.ts` must NOT have `export {}` — it is a pure ambient file. Adding `export {}` turns it into a module and breaks all global type visibility.

### Sonos API

All Sonos HTTP calls go through `src/sonos-api.ts` → `sonosFetch()` → play.sonos.com BFF. The renderer calls `window.sonos.fetch({ operationId, pathParams, query, body })` — operationIds are defined in `SonosWebPlayerAPI.yaml` at the repo root.

`renderer/src/lib/sonosApi.ts` is the typed wrapper around `window.sonos.fetch` — add new API calls here.

### React Query

All data fetching in the renderer uses React Query (`@tanstack/react-query`). Each query is a factory wrapped in `queryOptions()` (e.g. `trackQueryOptions`), living alongside its hook with an `xxxKeys` key factory in the same file (e.g. `playlistKeys.owned(id)`). Use the key factory for every invalidation and `setQueryData`; never type a key out by hand. The QueryClient default `staleTime` is 5 minutes (`renderer/src/main.tsx`); only a query that deliberately differs sets one, using `STALE` / `GC_HOUR` from `lib/queryDefaults.ts`. The signed-in name comes from `useDisplayName()`.

### Playback position (the per-second tick)

`PlaybackState` (from `usePlayback`) changes only when Sonos pushes an update. The moving position (`positionMs`, `progressPct`, `timeLabel`, `trackEndsAtMs`) lives in `hooks/playbackPosition.ts`, a tiny external store: read it with `usePlaybackPosition(select)` (pick a primitive so you re-render only when it changes), or `getPlaybackPosition()` inside an effect or handler. Never add the position back into `PlaybackState`, or every page and queue row re-renders each second. `LiveSeekBar`, `PlaybackTime` and `PlaybackRemaining` in `common/SeekBar.tsx` are the ready-made readers.

The queue list is virtual (`@tanstack/react-virtual`, in `QueueSidebar`): rows exist only near the viewport, so reach a row through `scrollToNowPlaying` or the virtualizer, not by querying the DOM. `EqBars` takes `paused` and only animates while audio is really playing.

### Attribution / office presence

`src/pubsub.ts` connects to Azure Web PubSub. When a track is queued, the renderer calls `window.sonos.publishQueued()` → `ipcMain` → `pubsub.ts` → Azure Function (`log-event`) → Cosmos DB. The leaderboard reads from Cosmos via the `stats` Azure Function.

### Telemetry

`src/telemetry.ts` wraps the Application Insights Node.js SDK. It is a complete no-op when `APPINSIGHTS_CONNECTION_STRING` is not set — never guard call sites for this. The renderer fires events via `window.sonos.trackEvent()` → IPC → `telemetry.event()`.

---

## Tests

Renderer tests live in `renderer/src/**/__tests__/` (Vitest). Main-process tests are `src/*.test.ts` (`node:test`, run with `npm run test:main`), and the Azure Functions have their own (`cd server && npm test`).

```bash
npm run test:run     # run all tests once
npm test             # watch mode
```

### Setup

`renderer/src/test/setup.ts` mocks all of `window.sonos`, wrapping each method of `renderer/src/test/sonosFake.ts` in a `vi.fn()`. If you add a method to `SonosPreload` add it to `sonosFake.ts` (typecheck fails until you do), not to setup.ts.

### How to test hooks

Don't use `renderHook` for data-fetching hooks. Run the query options factory through `runQueryFn` (`queryOptions` types `queryFn` as optional, so calling it directly doesn't typecheck):

```ts
import { trackQueryOptions } from '../useTrackDetails';
import { runQueryFn } from '../../test/queryFn';

const mockFetch = vi.mocked(window.sonos.fetch);
mockFetch.mockResolvedValueOnce({ data: { ... } });
const result = await runQueryFn(trackQueryOptions('id', 'serviceId', 'accountId'));
expect(result?.trackName).toBe('...');
```

### How to test pure lib functions

Import directly and call. No mocking needed unless the function calls `window.sonos`. See `queueHelpers.test.ts` for an example.

### How to test components

Use `@testing-library/react` with `render`. The `window.sonos` mock in setup.ts handles the bridge. Override individual mocks per test with `vi.mocked(window.sonos.X).mockResolvedValueOnce(...)`.

Reset mocks between tests when a test sets up a pending promise (the default) and a later test needs a resolved one — use `vi.mocked(window.sonos.X).mockReset()` in `beforeEach`.

### Story tests

`npm run test:run` also runs every story in real Chromium (Playwright) as the second Vitest project, `stories`; a story that throws on render, or has an axe accessibility violation (`parameters.a11y.test: 'error'`), fails, named by its title. Disable a rule per story (`parameters.a11y.config.rules`) with a reason, never globally. First run on a machine needs `npx playwright install chromium`. Run just them with `npx vitest run --config renderer/vitest.config.ts --project stories`.

### What's not tested

Most of the main process (only `genius-match`, `graph-presence` and `nav-guard` have tests), IPC handlers, WebSocket bootstrap, and most components. `usePlayback`, `useQueue`, `useGroups` and `useAuth` already have tests in `renderer/src/hooks/__tests__/`: extend those files rather than writing new ones.

---

## UI: design system and shared components

See `.claude/rules/ui.md` (loads when you touch `renderer/src`). DESIGN.md is the spec.

## Storybook

```bash
npm run storybook         # http://localhost:6006; config in renderer/.storybook/
npm run build-storybook   # static build to storybook-static/ (gitignored)
```

Stories sit beside the component as `Foo.stories.tsx` (CSF, `args` for controls, `fn()` for callbacks) and are typechecked and linted with the rest of `renderer/`. Use them to tweak a component in isolation and to screenshot a deterministic state: the live app's data changes under you, and its transport controls play on the office speakers.

- **Nothing in Storybook may reach Sonos.** There is no Electron, so `renderer/.storybook/preview.tsx` installs a fake `window.sonos` built from `renderer/src/test/sonosFake.ts`; every call is logged in the Actions panel and does nothing else. `getActiveProvider()` goes through it, so `TransportButtons` and `SeekBar` only log. Never point a story at a real bridge or URL.
- Art comes from the SVG data URIs in `renderer/.storybook/fixtures.ts`, so stories render the same offline. They go through the real `useImage` cache.
- The preview loads `global.css`, `depth.css` and the Manrope font, wraps each story in a fresh `QueryClient` (retries off), a `MemoryRouter` and a `page-scale` root on `--bg`.
- Add a story when you add a shared component in `common/`, covering its real states (default, no art, long title, disabled, playing and so on).

### Page stories and the mock backend

Every routed page has a story under `Pages/` (`*.page.stories.tsx` beside the panel), plus `Pages/App shell` (the whole `<App />`). They set `parameters.backend = 'mock'`, which makes `.storybook/preview.tsx` swap in `renderer/src/test/mockBackend.ts` for `window.sonos`: an invented catalogue, office and Azure data (`renderer/src/test/fixtures/`), the initial playback, queue, group and attribution pushes, and nothing that writes. `mockRuntime.ts` freezes `Date` at 2026-10-26T12:00:00Z, reports reduced motion, serves art and LRCLIB lyrics locally and refuses any other external URL. Everything is deterministic: no `Math.random`, no ticking position (playback is paused).

- A page story is `pageParameters(path, { pattern, state })` (the route and the `location.state.item` the page opens with) inside `PageProviders`; `LiveShell` hands the page the playback, queue and Home shelves the shell would. See `renderer/.storybook/pageStory.tsx`.
- When a page calls something new, add the answer to the mock (`fetch` dispatches on `operationId` in `mockBackend.ts`; Azure calls are in `fixtures/azure.ts`) rather than stubbing in the story. Art URLs must come from `fixtures/art.ts`.
- `sonosDefaults` (the unit tests' `pending` reads) is untouched: only stories that opt in see the mock.

## Adding a new feature — checklist

1. If it needs a new IPC call:
   - Add to `SonosAPI` interface in `src/preload.ts`
   - Add to `contextBridge.exposeInMainWorld` in `src/preload.ts`
   - Add `ipcMain.handle(...)` in the `register()` of the matching `src/ipc/<domain>.ts` (a new module needs a `register()` call in `main.ts`, after `installIpcGuard()`)
   - Add to `SonosPreload` interface in `renderer/src/types/globals.d.ts`
   - Add to `renderer/src/test/sonosFake.ts` (the one shared `window.sonos` fake: `setup.ts` wraps it in `vi.fn()`, the Storybook preview logs it as actions)

2. If it makes Sonos API calls:
   - Add the method to `renderer/src/lib/sonosApi.ts`

3. If it needs Azure infrastructure:
   - Add the resource to `server/azuredeploy.json`
   - Redeploy: `az deployment group create --resource-group truetunes-rg --template-file server/azuredeploy.json --mode Incremental`

4. If it has UI: reuse `common/` components, style with tokens only (see "UI: design system and shared components"), and add a `Foo.stories.tsx` for any new shared component in `renderer/src/components/common/`.

5. Run `npm run typecheck && npm run test:run` before committing.

---

## Gotchas

- **`globals.d.ts` must stay ambient** — no `export {}`, no `import`. Adding either makes it a module and breaks global type resolution silently in the renderer.
- **Renderer typecheck is separate** — `tsc` at the root only checks `src/`. Always run `npm run typecheck` (which checks both) not just `tsc`.
- **`applyReorderLocally` index math** — `insertAt` is the count of non-selected items whose _original_ index is less than `toIndex`, not `toIndex` itself. See `queueHelpers.ts` for comments.
- **Image cache is a singleton module** — tests that import `imageCache` must use `vi.resetModules()` and dynamic `import()` in `beforeEach` to avoid state leaking between tests.
- **Sandbox mode** — both `uiWin` and `miniWin` have `sandbox: true`. The preload script runs in the sandboxed context; do not use Node.js APIs directly in `preload.ts`.
- **Debug windows are intentionally insecure** — `nodeIntegration: true` on the WS/HTTP debug windows is by design and guarded by `app.isPackaged` check. Do not "fix" this.

---

## Infrastructure

Resource group: `truetunes-rg` (uksouth)

| Resource      | Name                     |
| ------------- | ------------------------ |
| Function App  | `truetunes-fn`           |
| Web PubSub    | `truetunes-wps`          |
| Cosmos DB     | `truetunes-cosmos`       |
| Storage       | `truetunesfoywo62izs34i` |
| App Insights  | `truetunes-ai`           |
| Log Analytics | `truetunes-law`          |

Deploy: `cd server && npm run deploy` — wraps `az deployment group create` and reads `VESTABOARD_API_KEY`, `GITHUB_ISSUES_TOKEN`, `ENTRA_TENANT_ID`, `ENTRA_CLIENT_ID` and `AUTH_ENFORCE` from the root `.env`, passing them as ARM parameters so the secrets are never committed. It then runs `func azure functionapp publish`, which **replaces every function** with what's in this checkout.

- **Function auth.** Functions that write or act as a user check the caller's Entra ID token (`server/src/shared/auth.ts`, `lib/caller.ts`); the main process sends it via `fnFetch`. Without a token a request is let through (and logged) until `AUTH_ENFORCE=true`, which is transitional. Read-only functions stay anonymous. No browser calls the functions, so they send no CORS headers.
- **CI deploy.** `.github/workflows/deploy-server.yml` runs the same `npm run deploy` when a release is published (or by hand), with the ARM parameters and an OIDC Azure login from the `production` environment's secrets.
- **Deploy from a tree that contains `origin/main`.** Deploying a feature branch that's behind main deletes main's newer functions from production (this removed `music-stats` and `track-meta` once). Merge main first, or deploy the merge from a throwaway worktree.
- `az` and `func` use whichever Azure CLI account is active: pick the TrueNorth admin identity first (the `azswap` profiles skill).
- A fresh worktree has no `server/node_modules`; run `npm ci` in `server/` first, or tsc falls back to the root's TypeScript 6 and fails with TS5107.
