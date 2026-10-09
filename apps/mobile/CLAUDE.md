# Claude Notes — True Tunes Android

## What this is

Sideloaded Android client for True Tunes, the Sonos web-player client. Expo SDK 57 / React Native 0.86
(**New Architecture only**), TypeScript, expo-router. It lives in `apps/mobile` of the public `TrueNorthIT/TrueTunes`
monorepo, beside the desktop Electron app (repo root); the Azure Functions backend in the root `server/` is shared and
unchanged. Run every command below from `apps/mobile`.
**Distribution is sideload only (APK) — never the Play Store.** The Sonos "API" is the reverse-engineered
play.sonos.com BFF, exactly as on desktop.

Read `AGENTS.md` too: Expo APIs change every SDK, so check `https://docs.expo.dev/versions/v57.0.0/` rather than
trusting memory.

---

## Running and building

```bash
npm run typecheck    # tsc --noEmit (run before committing)
npm run lint         # ESLint (warnings are fine, errors are not)
npm run test:run     # full test suite once
npm run format       # Prettier
npx expo start --dev-client --port 8081   # Metro
```

There is no Expo Go: native modules (cookie manager, haptics, gradient, image colours…) need a development build.

```bash
npx expo prebuild --platform android --no-install          # generates android/ (gitignored)
cd android && ./gradlew assembleDebug -PreactNativeArchitectures=arm64-v8a
adb install -r app/build/outputs/apk/debug/app-debug.apk
adb reverse tcp:8081 tcp:8081
```

Local toolchain (no Android Studio): JDK 17 (`JAVA_HOME`), Android command-line tools (`ANDROID_HOME`) with
`platforms;android-36`, `build-tools;36.0.0`, `ndk;27.1.12297006`, `cmake;3.22.1`. See README. The first build takes ~10
minutes; later ones a few. **You only rebuild for native changes** (a new native dependency or `app.json` plugin); JS
changes come through Metro.

---

## Architecture

The desktop app's `src/main.ts` (Electron main process) is split into platform-neutral, injectable modules here, and
composed into an object with the **same `window.sonos` surface the desktop preload exposes** — so the React Query
hooks ported from the desktop renderer run unchanged.

| Folder          | What                                                                                                    |
| --------------- | ------------------------------------------------------------------------------------------------------- |
| `src/sonos/`    | Sonos HTTP client (`sonosClient`), WebSocket session (`wsSession`), queue reorder, protocol helpers     |
| `src/office/`   | Azure Functions client, Web PubSub, Genius, Graph presence, telemetry                                   |
| `src/core/`     | Session/auth manager, event hub, `createCore` (composition root → `bridge`)                             |
| `src/platform/` | React Native adapters (SecureStore, sockets, cookies, login WebView, query persister) and the auth gate |
| `src/logic/`    | Hooks/lib/providers ported from the desktop renderer, plus `useRemote` and add-to-queue                 |
| `src/ui/`       | Shared components (theme tokens, Art, Slider, MiniPlayer, media rows, queue rows, …)                    |
| `src/app/`      | **Routes only** (expo-router). Every file here is a screen — never put hooks/utils here                 |

- Everything environmental (fetch, sockets, timers, storage) is **injected**, so `sonos/`, `office/` and `core/` run in
  Node tests. `src/platform/core.ts` builds the real one and installs `window.sonos` before any hook mounts.
- Add a new capability: implement it in `sonos/` or `office/`, expose it in `createCore`'s `bridge` (it is
  `satisfies SonosPreload`, so the compiler tells you what is missing), add the type to `src/types/globals.d.ts`
  (**keep it a pure ambient file — no `import`/`export`**), and add the mock to `src/logic/test/setup.ts`.
- `src/logic/` intentionally tracks the desktop renderer. When you change something there that also exists on
  desktop, mirror it (see "Sharing code" below).

### Auth

Sonos: a login WebView on play.sonos.com; the HttpOnly `__Secure-next-auth.session-token` cookie is read natively
(`@preeternal/react-native-cookie-manager` — the older `@react-native-cookies/cookies` does not support New
Architecture) and validated against `/api/mfe`, then kept in SecureStore. A 401 anywhere drops back to sign-in.
Entra sign-in is **not implemented on Android**; the user picks an existing identity instead (trust based, no
uniqueness claim).

---

## Tests

Vitest. Two projects in `vitest.config.ts`: `node` (`src/sonos`, `src/office`, `src/core`) and `app` (jsdom, `src/logic`).
UI components (`src/ui`, `src/app`) have **no automated tests** — keep logic in plain functions/hooks under
`src/logic` (or a tested pure module) and test that. Query-option factories are tested by calling `queryFn()` directly.

---

## Adding a feature — checklist

1. Needs Sonos/Azure data? Add it to `sonos/`/`office/` with a test, expose it on the `bridge` (see above).
2. UI goes in `src/ui/` + a route in `src/app/`. Use the theme tokens in `src/ui/theme.ts`.
3. A new **native** dependency needs `npx expo install`, a clean `npx expo-doctor`, and a rebuild.
4. Run `npm run typecheck && npm run lint && npm run test:run` before committing.

---

## Gotchas

- **Metro white screen / "unexpected end of stream"**: Metro stopped answering (often after a native rebuild rewrote
  `android/`, or a cold cache). Restart it (`--clear`) and warm the bundle with `curl` before opening the app.
- **A syntax error crashes the dev client** ("keeps stopping") rather than showing a red screen.
- `src/app/` is routes only. Anything else there becomes a route.
- Queue rows have a fixed height (`ROW_HEIGHT`); scroll-to-playing depends on it.
- Buttons inside a `GestureDetector` must be `react-native-gesture-handler` `Pressable`s or the gesture eats taps.
- Sonos hands out LAN `http://` art URLs on some setups; Android blocks cleartext by default (not needed so far).
- Track details (`['track', id]` queries) are persisted for 7 days; bump `CACHE_BUSTER` if `TrackDetails` changes.
- Debug builds are `uk.co.truenorthit.truetunes.dev` ("True Tunes (dev)"), release builds are `uk.co.truenorthit.truetunes`, so
  they coexist. Use the `.dev` id for `adb ... -p`, `monkey`, `run-as`. See `docs/RELEASING.md`.
- **Releases are tagged `android-vX.Y.Z`**, never `vX.Y.Z` (that is a desktop release). CI is
  `.github/workflows/mobile-ci.yml` and `mobile-release.yml` at the repo root; the release is created with
  `--latest=false` so desktop auto-update keeps finding the desktop release. See `docs/RELEASING.md`.
- **Releases are tagged `android-vX.Y.Z`**, never `vX.Y.Z` (that is a desktop release). CI is
  `.github/workflows/mobile-ci.yml` and `mobile-release.yml` at the repo root; the release is created with
  `--latest=false` so desktop auto-update keeps finding the desktop release. See `docs/RELEASING.md`.
- The debug spike screen is at `truetunes://spike`.

---

## Sharing code with the desktop app

`src/sonos`, `src/office`, `src/core` and `src/logic` are ported from the desktop app (repo root `src/` and
`renderer/src/`) and will drift unless mirrored. The intended end state is a monorepo with a shared `packages/core`; until then, mirror protocol fixes by hand.
`OPERATIONS` in `src/sonos/operations.ts` must match the desktop table.

## Infrastructure

Shared with the desktop app — see the root `CLAUDE.md` (resource group `truetunes-rg`, Function App `truetunes-fn`).
