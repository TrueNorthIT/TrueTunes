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
npm run lint         # ESLint
npm run storybook    # component workshop on :6006
```

The renderer is **never type-checked by Vite** (esbuild strips types). `npm run typecheck` is the only way to catch renderer type errors — always run it.

---

## Visual verification (Claude Code)

**The live app drives the office speakers.** Never press (or script a click on) add, queue, play next, station, transport or seek controls, and never play or submit Queuedle, feedback or polls. Navigate and hover only. To see a control's states, use its story in Storybook (below), where nothing reaches Sonos.

`npm run dev` enables Chrome DevTools Protocol on port 9333 (`curl -s http://localhost:9333/json/version` to check).

```bash
node scripts/screenshot.mjs shot.png                    # current page
node scripts/screenshot.mjs shot.png leaderboard        # after moving to #/leaderboard ("" for Home)
```

Give the route without `#/`: Git Bash rewrites path-like arguments, so `'#/leaderboard'` arrives as `#C:/Program Files/Git/leaderboard`.

Live data (now playing, queue, picks) changes between shots, so for before/after comparisons of a component prefer its stories. If Vite serves stale modules after big edits, stop dev and delete `node_modules/.vite`.

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

`renderer/src/test/setup.ts` mocks all of `window.sonos`, wrapping each method of `renderer/src/test/sonosFake.ts` in a `vi.fn()`. If you add a method to `SonosPreload` add it to `sonosFake.ts` (typecheck fails until you do), not to setup.ts.

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

### Story tests

`npm run test:run` also runs every story in real Chromium (Playwright) as the second Vitest project, `stories`; a story that throws on render fails, named by its title. First run on a machine needs `npx playwright install chromium`. Run just them with `npx vitest run --config renderer/vitest.config.ts --project stories`.

### What's not tested

Main process (`src/`), IPC handlers, WebSocket bootstrap, auth flow, and most hooks and components. 85% of the codebase has no tests. Prioritise `usePlayback`, `useQueue`, `useGroups`, and `useAuth` if adding coverage.

---

## UI: design system and shared components

**DESIGN.md is the spec** ("After-Hours Gallery"): colours, type roles, shadow vocabulary, radius scale, components and the do/don't rules (no text under 13px, shadows only on artwork and floating surfaces, no purple/neon/glow). Read it before UI work. If you change a design rule, update DESIGN.md in the same commit.

**Tokens, not values.** Every colour, shadow, border radius and font size in renderer CSS comes from a token in `renderer/src/styles/global.css` (`:root`) or `depth.css` (shell materials), so one edit retunes the app.

- Colours: `var(--text*)`, `--on-art*`, `--glass*`, `--overlay*`, and tints as `rgba(var(--tint), a)`. Shadows: `--art-shadow`, `--hero-shadow`, `--float-shadow` and friends. Radii: `--r-*`. Type: `--fs-*` (smaller steps are already `max(13px, …)`).
- `renderer/src/__tests__/cssTokens.test.ts` fails on any raw hex/rgb/hsl/named colour outside those two files (mask gradients exempt). Radii and font sizes aren't test-enforced, so use the tokens anyway.
- Need a value no token covers? Use the nearest token first. If it is a genuinely new role, add it beside its siblings in `global.css` with a one-line comment, and name it in DESIGN.md.

**Reuse before you build.** Shared components live in `renderer/src/components/common/`, and Storybook is the catalogue of what exists and its states. Before writing a card, tile, row, button, chip, dialog, menu, artwork or seek/transport control, check there.

- Extend a shared component with a prop rather than copying it. Promote a page-local component to `common/` once a second page needs it.
- Data helpers too: `lib/itemHelpers.ts` has `trackPayload()` (context-menu track), `albumItem()` and `artistItem()` (navigable `SonosItem`s). Don't hand-build those objects.
- A new shared component gets a story (see below).

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

## Adding a new feature — checklist

1. If it needs a new IPC call:
   - Add to `SonosAPI` interface in `src/preload.ts`
   - Add to `contextBridge.exposeInMainWorld` in `src/preload.ts`
   - Add `ipcMain.handle(...)` in `src/main.ts`
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

Deploy: `cd server && npm run deploy` — wraps `az deployment group create` and reads `VESTABOARD_API_KEY` from the root `.env`, passing it as the `vestaboardApiKey` ARM parameter so the secret is never committed.
