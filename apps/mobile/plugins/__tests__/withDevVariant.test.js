import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { patchBuildGradle: patchDev, MARKER, DEBUG_STRINGS } = require('../withDevVariant');
const { patchBuildGradle: patchSigning } = require('../withReleaseSigning');

// The relevant part of the Gradle file `expo prebuild` generates for SDK 57.
const TEMPLATE = `android {
    signingConfigs {
        debug {
            storeFile file('debug.keystore')
            storePassword 'android'
            keyAlias 'androiddebugkey'
            keyPassword 'android'
        }
    }
    buildTypes {
        debug {
            signingConfig signingConfigs.debug
        }
        release {
            // Caution! In production, you need to generate your own keystore file.
            // see https://reactnative.dev/docs/signed-apk-android.
            signingConfig signingConfigs.debug
            minifyEnabled enableMinifyInReleaseBuilds
        }
    }
}
`;

describe('withDevVariant', () => {
  it('gives the debug build type its own application id and version suffix', () => {
    const out = patchDev(TEMPLATE);
    expect(out).toContain(MARKER);
    expect(out).toMatch(/debug \{[^}]*applicationIdSuffix '\.dev'[^}]*\}/);
    expect(out).toMatch(/debug \{[^}]*versionNameSuffix '-dev'[^}]*\}/);
  });

  it('leaves the release build type on the production application id', () => {
    const out = patchDev(TEMPLATE);
    const release = out.slice(out.indexOf('release {'));
    expect(release).not.toContain('applicationIdSuffix');
    expect(release).not.toContain('-dev');
  });

  it('keeps debug builds signed with the debug key', () => {
    expect(patchDev(TEMPLATE)).toMatch(/debug \{[^}]*signingConfig signingConfigs\.debug[^}]*\}/);
  });

  it('is idempotent', () => {
    const once = patchDev(TEMPLATE);
    expect(patchDev(once)).toBe(once);
  });

  it('fails loudly when the template changes', () => {
    expect(() => patchDev('android { buildTypes { debug { } } }')).toThrow(/no longer matches/);
  });

  it('labels the debug app so the two are told apart on the home screen', () => {
    expect(DEBUG_STRINGS).toContain('<string name="app_name">True Tunes (dev)</string>');
  });

  it('composes with the release signing plugin in either order', () => {
    const a = patchSigning(patchDev(TEMPLATE));
    const b = patchDev(patchSigning(TEMPLATE));
    expect(a).toBe(b);
    expect(a).toContain("applicationIdSuffix '.dev'");
    expect(a).toContain('signingConfigs.release');
  });
});
