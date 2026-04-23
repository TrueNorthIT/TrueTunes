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
npm run test:run     # full test suite once
npm run lint         # ESLint
```

The renderer is **never type-checked by Vite** (esbuild strips types). `npm run typecheck` is the only way to catch renderer type errors — always run it.

---

## Architecture

### IPC bridge

`src/preload.ts` exposes `window.sonos` via `contextBridge.exposeInMainWorld`. Every renderer→main call goes through this.

- Add a new capability: declare it in `SonosAPI` in `preload.ts`, implement it in the `contextBridge.exposeInMainWorld` call, add an `ipcMain.handle` in `main.ts`, and add the type to `renderer/src/types/globals.d.ts` (`SonosPreload` interface).
- `globals.d.ts` must NOT have `export {}` — it is a pure ambient file. Adding `export {}` turns it into a module and breaks all global type visibility.

### Sonos API

All Sonos HTTP calls go through `src/main.ts` → `sonosFetch()` → play.sonos.com BFF. The renderer calls `window.sonos.fetch({ operationId, pathParams, query, body })` — operationIds are defined in `SonosWebPlayerAPI.yaml` at the repo root.

`renderer/src/lib/sonosApi.ts` is the typed wrapper around `window.sonos.fetch` — add new API calls here.

### React Query

All data fetching in the renderer uses React Query (`@tanstack/react-query`). Query options factories (e.g. `trackQueryOptions`, `albumQueryOptions`) live alongside their hooks and can be called directly in tests without a QueryClient — just call `opts.queryFn()`.

### Attribution / office presence

`src/pubsub.ts` connects to Azure Web PubSub. When a track is queued, the renderer calls `window.sonos.publishQueued()` → `ipcMain` → `pubsub.ts` → Azure Function (`log-event`) → Cosmos DB. The leaderboard reads from Cosmos via the `stats` Azure Function.

### Telemetry

`src/telemetry.ts` wraps the Application Insights Node.js SDK. It is a complete no-op when `APPINSIGHTS_CONNECTION_STRING` is not set — never guard call sites for this. The renderer fires events via `window.sonos.trackEvent()` → IPC → `telemetry.event()`.

---

## Tests

Tests live in `renderer/src/**/__tests__/`. There are no main process tests.

```bash
npm run test:run     # run all tests once
npm test             # watch mode
```

### Setup

`renderer/src/test/setup.ts` mocks all of `window.sonos`. Every mock is a `vi.fn()`. If you add a method to `SonosPreload` you must also add it here or tests that import anything using `window.sonos` will fail.

### How to test hooks

Don't use `renderHook` for data-fetching hooks. Call the query options factory directly:

```ts
import { trackQueryOptions } from '../useTrackDetails';

const mockFetch = vi.mocked(window.sonos.fetch);
mockFetch.mockResolvedValueOnce({ data: { ... } });
const result = await trackQueryOptions('id', 'serviceId', 'accountId').queryFn();
expect(result?.trackName).toBe('...');
```

### How to test pure lib functions

Import directly and call. No mocking needed unless the function calls `window.sonos`. See `queueHelpers.test.ts` for an example.

### How to test components

Use `@testing-library/react` with `render`. The `window.sonos` mock in setup.ts handles the bridge. Override individual mocks per test with `vi.mocked(window.sonos.X).mockResolvedValueOnce(...)`.

Reset mocks between tests when a test sets up a pending promise (the default) and a later test needs a resolved one — use `vi.mocked(window.sonos.X).mockReset()` in `beforeEach`.

### What's not tested

Main process (`src/`), IPC handlers, WebSocket bootstrap, auth flow, and most hooks and components. 85% of the codebase has no tests. Prioritise `usePlayback`, `useQueue`, `useGroups`, and `useAuth` if adding coverage.

---

## Adding a new feature — checklist

1. If it needs a new IPC call:
   - Add to `SonosAPI` interface in `src/preload.ts`
   - Add to `contextBridge.exposeInMainWorld` in `src/preload.ts`
   - Add `ipcMain.handle(...)` in `src/main.ts`
   - Add to `SonosPreload` interface in `renderer/src/types/globals.d.ts`
   - Add mock to `renderer/src/test/setup.ts`

2. If it makes Sonos API calls:
   - Add the method to `renderer/src/lib/sonosApi.ts`

3. If it needs Azure infrastructure:
   - Add the resource to `server/azuredeploy.json`
   - Redeploy: `az deployment group create --resource-group truetunes-rg --template-file server/azuredeploy.json --mode Incremental`

4. Run `npm run typecheck && npm run test:run` before committing.

---

## Gotchas

- **`globals.d.ts` must stay ambient** — no `export {}`, no `import`. Adding either makes it a module and breaks global type resolution silently in the renderer.
- **Renderer typecheck is separate** — `tsc` at the root only checks `src/`. Always run `npm run typecheck` (which checks both) not just `tsc`.
- **`applyReorderLocally` index math** — `insertAt` is the count of non-selected items whose *original* index is less than `toIndex`, not `toIndex` itself. See `queueHelpers.ts` for comments.
- **Image cache is a singleton module** — tests that import `imageCache` must use `vi.resetModules()` and dynamic `import()` in `beforeEach` to avoid state leaking between tests.
- **Sandbox mode** — both `uiWin` and `miniWin` have `sandbox: true`. The preload script runs in the sandboxed context; do not use Node.js APIs directly in `preload.ts`.
- **Debug windows are intentionally insecure** — `nodeIntegration: true` on the WS/HTTP debug windows is by design and guarded by `app.isPackaged` check. Do not "fix" this.

---

## Infrastructure

Resource group: `truetunes-rg` (uksouth)

| Resource | Name |
|---|---|
| Function App | `truetunes-fn` |
| Web PubSub | `truetunes-wps` |
| Cosmos DB | `truetunes-cosmos` |
| Storage | `truetunesfoywo62izs34i` |
| App Insights | `truetunes-ai` |
| Log Analytics | `truetunes-law` |

Deploy: `cd server && npm run deploy` — wraps `az deployment group create` and reads `VESTABOARD_API_KEY` from the root `.env`, passing it as the `vestaboardApiKey` ARM parameter so the secret is never committed.
