# Releasing

Releases are signed APKs published as GitHub Releases, built by `.github/workflows/mobile-release.yml` (at the
monorepo root) when an **Android version tag** is pushed. The app is sideload-only; there is no Play Store listing.

The app lives in `apps/mobile` of the public `TrueNorthIT/TrueTunes` repo, which it shares with the desktop app. Plain
`v*` tags and the "Latest" release belong to the desktop app (its auto-updater reads `/releases/latest`), so Android tags
are prefixed `android-` and Android releases are created with `--latest=false`. Never mark an APK release as Latest.

## Cut a release

```bash
git checkout main && git pull
git tag android-v1.2.3
git push origin android-v1.2.3
```

- `android-v1.2.3` becomes a normal release; `android-v1.2.3-rc.1` becomes a **pre-release**. The version is the tag
  without the `android-v` prefix. Release notes start at the previous `android-v*` tag.
- The tag is the source of truth for the version. The workflow writes it into `app.json` (`version`, and an
  ever-increasing `versionCode`) before building, so `package.json`'s version is not used.
- `versionCode` is `MAJOR * 1,000,000 + MINOR * 10,000 + PATCH * 100 + BUILD`, where `BUILD` is `99` for a final release
  and the pre-release number for `-rc.N` (so `1.2.3-rc.1` < `1.2.3`). Keep MINOR and PATCH under 100.
- Tag from `main`. CI (`mobile-ci.yml`) runs on `main`; the release workflow runs typecheck and tests itself before the long
  native build, so a broken tag fails in minutes.

The release contains `TrueTunes-Android-vX.Y.Z.apk` and its `.sha256`. The build takes roughly 15–25 minutes on a
GitHub runner.

### Dry run

Actions → **Mobile Release** → _Run workflow_ → enter a version. This builds and signs the APK and uploads it as a workflow
artifact (kept 14 days) without creating a release or tag. It only appears once the workflow exists on `main`.

## Signing

Release builds are signed with our own key. Without it, users would have to uninstall and reinstall the app (losing local
data) to take an update.

|                         |                                                                                           |
| ----------------------- | ----------------------------------------------------------------------------------------- |
| Key store of record     | 1Password → vault **Employee** → item **True Tunes Android - release signing keystore**   |
| Contents                | `keystore_base64` (PKCS12), `store_password`, `key_alias` (`truetunes`), `key_password`   |
| Certificate fingerprint | SHA-256 `B6:F0:91:54:44:B5:1E:5B:B2:AF:22:6A:DD:B4:B5:5D:F7:B8:6A:B2:71:9A:8E:34:B7:A2:52:6A:E0:D5:67:0B` |
| Valid until             | 2054                                                                                      |

GitHub configuration (`TrueNorthIT/TrueTunes` → Settings → Secrets and variables → Actions):

| Name                         | Kind     | What                                                              |
| ---------------------------- | -------- | ----------------------------------------------------------------- |
| `ANDROID_KEYSTORE_BASE64`    | secret   | the keystore file, base64                                         |
| `ANDROID_KEYSTORE_PASSWORD`  | secret   | store password                                                    |
| `ANDROID_KEY_ALIAS`          | secret   | `truetunes`                                                       |
| `ANDROID_KEY_PASSWORD`       | secret   | key password (same as the store password for PKCS12)              |
| `ANDROID_CERT_SHA256`        | variable | expected certificate fingerprint; the build fails if it differs   |
| `GENIUS_ACCESS_TOKEN`        | secret   | optional - lyrics/bios; baked into the app as `EXPO_PUBLIC_*`     |
| `APPINSIGHTS_CONNECTION_STRING` | secret | optional - telemetry; baked into the app as `EXPO_PUBLIC_*`    |

The Gradle hook lives in `plugins/withReleaseSigning.js` (an Expo config plugin, because `android/` is generated). It
signs the release variant with the key when `ANDROID_KEYSTORE_PATH` is set, and **throws** if the generated Gradle file
no longer matches the template it patches instead of silently signing with the debug key.

### Build a signed release locally

```bash
# fetch the key from 1Password (never commit it)
op item get "True Tunes Android - release signing keystore" --vault Employee --fields label=keystore_base64 --reveal | base64 -d > /tmp/truetunes-release.jks
export ANDROID_KEYSTORE_PATH=/tmp/truetunes-release.jks
export ANDROID_KEY_ALIAS=truetunes
export ANDROID_KEYSTORE_PASSWORD=$(op item get "True Tunes Android - release signing keystore" --vault Employee --fields label=store_password --reveal)
export ANDROID_KEY_PASSWORD=$ANDROID_KEYSTORE_PASSWORD
npx expo prebuild --platform android --no-install --clean
cd android && ./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a
```

### If the key is lost or leaked

- **Lost:** there is no recovery. Generate a new key, update 1Password and the GitHub secrets/variable, and tell users
  to uninstall and reinstall once.
- **Leaked:** rotate as above; treat any APK signed after the leak as untrusted.

## Installing

Download the APK from the release page (the repo is public, so no GitHub sign-in is needed; Android releases are the
ones titled "True Tunes Android", not "Latest") and open it on the phone; allow "install unknown apps" for the browser or file manager when asked.

**Development and release builds install side by side.** A debug build is `uk.co.truenorthit.truetunes.dev`, labelled
"True Tunes (dev)", and the release build is `uk.co.truenorthit.truetunes` ("True Tunes"). They are signed with different
keys but have different package names, so neither can conflict with the other, and each keeps its own data: you sign in
to Sonos separately in each. This comes from `plugins/withDevVariant.js`.

Use the `.dev` package name in `adb` commands for debug builds (`adb shell monkey -p uk.co.truenorthit.truetunes.dev ...`).
Both apps register the `truetunes://` link scheme, so Android may ask which app should open such a link.

If you installed a debug build from before this change (package `uk.co.truenorthit.truetunes`, debug-signed), uninstall it
once - it would otherwise block installing a release build.
