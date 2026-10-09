import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { patchBuildGradle, MARKER } = require('../withReleaseSigning');

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

describe('withReleaseSigning', () => {
  it('adds a release signing config driven by the environment', () => {
    const out = patchBuildGradle(TEMPLATE);
    expect(out).toContain(MARKER);
    expect(out).toContain("System.getenv('ANDROID_KEYSTORE_PATH')");
    for (const v of ['ANDROID_KEYSTORE_PASSWORD', 'ANDROID_KEY_ALIAS', 'ANDROID_KEY_PASSWORD']) {
      expect(out).toContain(`System.getenv('${v}')`);
    }
  });

  it('signs release with the release key when configured, and only falls back to debug otherwise', () => {
    const out = patchBuildGradle(TEMPLATE);
    expect(out).toContain("signingConfig System.getenv('ANDROID_KEYSTORE_PATH') ? signingConfigs.release : signingConfigs.debug");
    // the debug build type is untouched
    expect(out).toMatch(/debug \{\n\s+signingConfig signingConfigs\.debug\n\s+\}/);
    // the template's "debug key for release" line is gone
    expect(out).not.toContain('Caution! In production');
  });

  it('keeps the debug signing config that debug builds need', () => {
    expect(patchBuildGradle(TEMPLATE)).toContain("storeFile file('debug.keystore')");
  });

  it('is idempotent', () => {
    const once = patchBuildGradle(TEMPLATE);
    expect(patchBuildGradle(once)).toBe(once);
  });

  it('fails loudly when the template changes, instead of shipping a debug-signed release', () => {
    expect(() => patchBuildGradle('android { buildTypes { release { } } }')).toThrow(/no longer matches/);
  });
});
