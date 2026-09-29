// Expo config plugin: give debug builds their own identity so they install alongside the release app.
//
// Development and release builds are signed with different keys, so with one shared package name neither can
// update the other (INSTALL_FAILED_UPDATE_INCOMPATIBLE). This makes the debug variant
// `<package>.dev`, labelled "True Tunes (dev)", so both live on the same phone with separate data.
//
// It patches the `debug` build type in app/build.gradle (so `assembleDebug` and `assembleRelease` from the same
// generated project differ automatically - no env vars or separate prebuilds) and adds a debug-only string
// resource for the launcher label. It throws if the generated Gradle file stops matching the template.

const fs = require('node:fs');
const path = require('node:path');
const { withAppBuildGradle, withDangerousMod } = require('@expo/config-plugins');

const MARKER = '// true-tunes: dev variant';
const DEV_LABEL = 'True Tunes (dev)';

const TEMPLATE_DEBUG_BUILD_TYPE = `        debug {
            signingConfig signingConfigs.debug
        }
`;
const OUR_DEBUG_BUILD_TYPE = `        debug {
            ${MARKER}
            applicationIdSuffix '.dev'
            versionNameSuffix '-dev'
            signingConfig signingConfigs.debug
        }
`;

function patchBuildGradle(src) {
  if (src.includes(MARKER)) return src; // already patched (prebuild without --clean)
  if (!src.includes(TEMPLATE_DEBUG_BUILD_TYPE)) {
    throw new Error(
      'withDevVariant: android/app/build.gradle no longer matches the Expo template this plugin patches. ' +
        'Update plugins/withDevVariant.js so debug builds keep their own application id.'
    );
  }
  return src.replace(TEMPLATE_DEBUG_BUILD_TYPE, OUR_DEBUG_BUILD_TYPE);
}

const DEBUG_STRINGS = `<resources>
  <string name="app_name">${DEV_LABEL}</string>
</resources>
`;

module.exports = function withDevVariant(config) {
  config = withAppBuildGradle(config, (cfg) => {
    cfg.modResults.contents = patchBuildGradle(cfg.modResults.contents);
    return cfg;
  });
  // A `debug` source set overrides main's app_name for debug builds only.
  return withDangerousMod(config, [
    'android',
    (cfg) => {
      const dir = path.join(cfg.modRequest.platformProjectRoot, 'app', 'src', 'debug', 'res', 'values');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'strings.xml'), DEBUG_STRINGS);
      return cfg;
    },
  ]);
};
module.exports.patchBuildGradle = patchBuildGradle;
module.exports.MARKER = MARKER;
module.exports.DEBUG_STRINGS = DEBUG_STRINGS;
