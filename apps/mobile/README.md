# True Tunes — Android

Sideloaded Android client for True Tunes (a Sonos web-player client). It lives in `apps/mobile` of the
`TrueNorthIT/TrueTunes` monorepo, beside the desktop app; see `docs/android-plan.md` on that repo's
`plan/android-react-native` branch for the original plan. **Distribution is sideload-only (APK), never the Play Store.**

## Status

Runs end to end on a Pixel 10 Pro XL: Sonos sign-in (WebView) or restored session, WebSocket bootstrap,
groups, queue, playback control, Home/Search/Queue/More tabs, Now Playing, room picker, and the
album/artist/container/playlist detail screens. All of it is untested on a device beyond Home, Queue and
the shell - see "Verify on device" below.

### Layout

- `src/sonos/` - Sonos client, WebSocket session, queue reorder (ported from desktop `main.ts`, unit tested)
- `src/office/` - Azure Functions client, pubsub, Genius, Graph presence, telemetry
- `src/core/` - session/auth manager, event hub, `createCore` (composes everything into a `window.sonos` bridge)
- `src/platform/` - React Native adapters (SecureStore, sockets, cookies, login WebView) and the auth gate
- `src/logic/` - hooks/lib/providers ported from the desktop renderer, plus `useRemote` and add-to-queue
- `src/ui/` + `src/app/` - screens (expo-router) and shared components
- `src/app/spike.tsx` - the Phase 0 connectivity spike, kept as a debug route

### Not done / needs input

- **Entra sign-in**: needs an Android platform + redirect URI on the app registration, then an `EntraProvider`
  (see `src/core/createCore.ts`). Until then: no display-name claim, no office presence, Home "Recently
  Played" and playlists stay empty (they key off the display name).
- **Genius** (lyrics text, artist bios, album year) and **App Insights**: set `EXPO_PUBLIC_*` in `.env`
  (see `.env.example`).
- Lock-screen/notification controls (needs a MediaSession + foreground service).
- Queue: multi-item drag; Album/artist headers have no colour tint (needs a native pixel sampler).

### Verify on device

Search, Now Playing (seek/volume gestures), room picker, queue drag-reorder and multi-select, add-to-queue
+ attribution, lyrics, leaderboard, profile image upload, Queuedle, and every modal presentation.

### Spike results (Pixel 10 Pro XL, Android, 2026-09-29)

| Check | Result |
| --- | --- |
| Sonos sign-in in an embedded WebView | PASS - normal Okta flow (login.sonos.com) works, not blocked |
| Read HttpOnly `__Secure-next-auth.session-token` natively | PASS - visible via `@preeternal/react-native-cookie-manager`; cookie `expires` ~10 days out |
| RN `fetch` `/api/mfe` with manual `Cookie` + spoofed UA | PASS - 200, ticket found |
| WebSocket with custom `Origin` + `v1.api.smartspeaker.audio` | PASS - opened, subprotocol negotiated |
| Desktop bootstrap (households -> devices -> playbackExtended) | PASS - groups discovered, live `PLAYBACK_STATE_*` pushes |
| `pause` command | PASS - acknowledged |
| `play` command | PASS - acknowledged; live state `BUFFERING -> PLAYING`, then `pause` -> `PAUSED` |
| Token survives app restart (SecureStore) | PASS - after force-stop, restored token drove `/api/mfe` + full WS bootstrap (WebView cookie jar also still held the cookie, so this proves SecureStore holds a valid token, not that it is the only working source) |
| Ported client (`src/sonos/sonosClient.ts`) vs real Sonos | PASS - `getQueueResources`, `getFavoriteResources`, on-demand service discovery (serviceId 72711). `getGroups` returns a non-JSON 200 but is unused on desktop (groups come from the WS). |
| Session lifetime / silent refresh | open - watch whether the cookie slides or hard-expires at ~10 days |

## Building locally (command-line tools only, no Android Studio)

One-time setup (already done on the dev machine, all user-level, no admin):

- JDK 17 (Microsoft OpenJDK zip) -> `%LOCALAPPDATA%\Programs\jdk17`, `JAVA_HOME` set
- Android command-line tools -> `%LOCALAPPDATA%\Android\Sdk`, `ANDROID_HOME` set, `platform-tools` on PATH
- SDK packages: `platforms;android-36`, `build-tools;36.0.0`, `ndk;27.1.12297006`, `cmake;3.22.1`
  (versions come from `node_modules/react-native/gradle/libs.versions.toml`; re-check after an SDK bump).
  Note `sdkmanager.bat` splits on `;` in PowerShell - call it via `cmd /c` with quoted package names.

Build and install (phone needs USB debugging on; `adb devices` must list it):

```bash
npx expo prebuild --platform android --no-install   # generates android/ (gitignored)
cd android && ./gradlew assembleDebug -PreactNativeArchitectures=arm64-v8a
adb install app/build/outputs/apk/debug/app-debug.apk
npx expo start --dev-client                          # then open the app on the phone
```

This is Continuous Native Generation: `android/` is generated - never edit it by hand. For a standalone
sideload APK use `./gradlew assembleRelease` (configure a real keystore before distributing).
We chose local builds over EAS so source and signing keys stay on our machines.

## Notes

- Expo SDK 57 / RN 0.86 is New Architecture only. `@react-native-cookies/cookies` is unmaintained and
  unsupported there, so this uses `@preeternal/react-native-cookie-manager`.
- `src/sonos/` mirrors constants and helpers from `TrueTunes/src/main.ts`. It is meant to become the
  shared `core` package once the spike passes.
