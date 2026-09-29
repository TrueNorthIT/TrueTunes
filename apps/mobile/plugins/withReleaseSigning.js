// Expo config plugin: sign release builds with our own keystore.
//
// The generated android/ project is disposable (Continuous Native Generation), and its `release` build type
// signs with the debug key. This patches app/build.gradle on every `expo prebuild` so that, when
// ANDROID_KEYSTORE_PATH is set (CI release builds, or a local build with the key from 1Password), the release
// variant is signed with it. Without it, a local `assembleRelease` still builds, signed with the debug key.
//
// It fails loudly if the template ever changes shape, rather than silently shipping a debug-signed release.

const { withAppBuildGradle } = require('@expo/config-plugins');

const MARKER = '// true-tunes: release signing';

const DEBUG_KEY_END = "            keyPassword 'android'\n        }\n";
const RELEASE_SIGNING_CONFIG = `        release {
            ${MARKER}
            def releaseKeystorePath = System.getenv('ANDROID_KEYSTORE_PATH')
            if (releaseKeystorePath) {
                storeFile file(releaseKeystorePath)
                storePassword System.getenv('ANDROID_KEYSTORE_PASSWORD')
                keyAlias System.getenv('ANDROID_KEY_ALIAS')
                keyPassword System.getenv('ANDROID_KEY_PASSWORD')
            }
        }
`;

const TEMPLATE_RELEASE_SIGNING = `            // Caution! In production, you need to generate your own keystore file.
            // see https://reactnative.dev/docs/signed-apk-android.
            signingConfig signingConfigs.debug
`;
const OUR_RELEASE_SIGNING = `            // Release key when ANDROID_KEYSTORE_PATH is set, otherwise the debug key so local builds still work.
            signingConfig System.getenv('ANDROID_KEYSTORE_PATH') ? signingConfigs.release : signingConfigs.debug
`;

function patchBuildGradle(src) {
  if (src.includes(MARKER)) return src; // already patched (prebuild without --clean)

  if (!src.includes(DEBUG_KEY_END) || !src.includes(TEMPLATE_RELEASE_SIGNING)) {
    throw new Error(
      'withReleaseSigning: android/app/build.gradle no longer matches the Expo template this plugin patches. ' +
        'Update plugins/withReleaseSigning.js - refusing to build a release signed with the debug key.'
    );
  }
  return src
    .replace(DEBUG_KEY_END, DEBUG_KEY_END + RELEASE_SIGNING_CONFIG)
    .replace(TEMPLATE_RELEASE_SIGNING, OUR_RELEASE_SIGNING);
}

module.exports = function withReleaseSigning(config) {
  return withAppBuildGradle(config, (cfg) => {
    cfg.modResults.contents = patchBuildGradle(cfg.modResults.contents);
    return cfg;
  });
};
module.exports.patchBuildGradle = patchBuildGradle;
module.exports.MARKER = MARKER;
