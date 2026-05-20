# Claude Notes — True Tunes 2

## What this is

Tauri 2 desktop Sonos client. Three distinct environments that compile and run separately:

- **Rust backend** (`src-tauri/src/`) — Tauri commands, Sonos HTTP client, WebSocket supervisor, Azure Web PubSub, keyring auth storage
- **Renderer** (`renderer/`) — React + Vite, compiled by Vite/esbuild
- **Server** (`server/`) — Azure Functions, separate `package.json` and `tsconfig.json`

The renderer never imports from `src-tauri/` and vice versa. Communication is strictly through Tauri's `invoke` (commands) and `listen` (events). The renderer-side bridge that shims `window.sonos` over `invoke`/`listen` lives at `renderer/src/lib/tauriBridge.ts`; the renderer-side types are in `renderer/src/types/globals.d.ts`.

---

## Running and building

```bash
npm run dev          # tauri dev (Vite + Rust backend)
npm run build        # vite build only (renderer)
npm run tauri:build  # full Tauri bundle (NSIS on Windows)
npm run typecheck    # tsc --noEmit on renderer
npm run test:run     # full test suite once
npm run lint         # ESLint
```

The renderer is **never type-checked by Vite** (esbuild strips types). `npm run typecheck` is the only way to catch renderer type errors — always run it.

Rust side: `cargo check` / `cargo clippy` from `src-tauri/`.

---

## Architecture

### Tauri bridge

`renderer/src/lib/tauriBridge.ts` exposes `window.sonos` by wrapping `invoke`/`listen`. Every renderer→backend call goes through this shim, so existing renderer code that uses `window.sonos.X` keeps working.

- Add a new capability:
  1. Add the Rust command in `src-tauri/src/commands/<area>.rs`
  2. Register it in `tauri::generate_handler![...]` in `src-tauri/src/lib.rs`
  3. Add the wrapper in `renderer/src/lib/tauriBridge.ts`
  4. Add the type to `SonosPreload` in `renderer/src/types/globals.d.ts`
  5. Add a mock in `renderer/src/test/setup.ts`

- `globals.d.ts` must NOT have `export {}` — it is a pure ambient file. Adding `export {}` turns it into a module and breaks all global type visibility.

### Sonos API

All Sonos HTTP calls go through the Rust `SonosClient` (`src-tauri/src/sonos/`) → play.sonos.com BFF. The renderer calls `window.sonos.fetch({ operationId, pathParams, query, body })` which routes to the `api_fetch` Tauri command — operationIds are defined in `SonosWebPlayerAPI.yaml` at the repo root.

`renderer/src/lib/sonosApi.ts` is the typed wrapper around `window.sonos.fetch` — add new API calls here.

### React Query

All data fetching in the renderer uses React Query (`@tanstack/react-query`). Query options factories (e.g. `trackQueryOptions`, `albumQueryOptions`) live alongside their hooks and can be called directly in tests without a QueryClient — just call `opts.queryFn()`.

### Attribution / office presence

`src-tauri/src/pubsub/` connects to Azure Web PubSub. When a track is queued, the renderer calls `window.sonos.publishQueued()` → `pubsub_publish_queued` command → Azure Function (`log-event`) → Cosmos DB. The leaderboard reads from Cosmos via the `stats` Azure Function.

### Telemetry

`telemetry_event` (Rust command in `src-tauri/src/commands/telemetry.rs`) forwards events to Application Insights. The renderer fires events via `window.sonos.trackEvent()`.

### Auth

OAuth tokens are stored in the OS keyring (`keyring` crate, `windows-native` feature). See `src-tauri/src/auth/`. The Rust side emits `auth:ready` / `auth:expired` events the renderer subscribes to via `tauriBridge`.

---

## Tests

Tests live in `renderer/src/**/__tests__/`. There are no Rust tests yet.

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

Rust backend, WebSocket bootstrap, auth flow, and most hooks and components. Most of the codebase has no tests. Prioritise `usePlayback`, `useQueue`, `useGroups`, and `useAuth` if adding coverage.

---

## Adding a new feature — checklist

1. If it needs a new bridge call:
   - Add the Rust command in `src-tauri/src/commands/<area>.rs`
   - Register it in `tauri::generate_handler![...]` in `src-tauri/src/lib.rs`
   - Add the wrapper to `renderer/src/lib/tauriBridge.ts`
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
- **Renderer typecheck is separate from Rust** — `npm run typecheck` checks the renderer; use `cargo check` (inside `src-tauri/`) for the backend.
- **`applyReorderLocally` index math** — `insertAt` is the count of non-selected items whose _original_ index is less than `toIndex`, not `toIndex` itself. See `queueHelpers.ts` for comments.
- **Image cache is a singleton module** — tests that import `imageCache` must use `vi.resetModules()` and dynamic `import()` in `beforeEach` to avoid state leaking between tests.
- **Auto-updater pubkey is a placeholder** — `tauri.conf.json` still has `REPLACE_ME_WITH_TAURI_SIGNING_PUBLIC_KEY`. Updates won't verify until a real signing key is generated and wired into CI.

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

Deploy: `cd server && npm run deploy` — wraps `az deployment group create` and reads `VESTABOARD_API_KEY` from the root `.env`, passing it as the `vestaboardApiKey` ARM parameter so the secret is never committed.
