import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { patchAppDelegate, MARKER } = require('../withIosSceneDelegate');

// The relevant part of the AppDelegate.swift `expo prebuild` generates for SDK 57.
const TEMPLATE = `@main
class AppDelegate: ExpoAppDelegate {
  var window: UIWindow?

  public override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    reactNativeFactory = factory

#if os(iOS) || os(tvOS)
    window = UIWindow(frame: UIScreen.main.bounds)
    factory.startReactNative(
      withModuleName: "main",
      in: window,
      launchOptions: launchOptions)
#endif

    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }
}
`;

describe('withIosSceneDelegate', () => {
  it('moves window creation to a SceneDelegate', () => {
    const out = patchAppDelegate(TEMPLATE);
    expect(out).toContain('class AppDelegate: ExpoAppDelegate, ExpoReactNativeFactoryProvider {');
    expect(out).not.toContain('UIWindow(frame:');
    expect(out).not.toContain('startReactNative');
    expect(out).toContain('class SceneDelegate: ExpoAppSceneDelegate {}');
  });

  it('is idempotent', () => {
    const once = patchAppDelegate(TEMPLATE);
    expect(patchAppDelegate(once)).toBe(once);
    expect(once.split(MARKER)).toHaveLength(2);
  });

  it('throws when the template changes', () => {
    expect(() => patchAppDelegate('class AppDelegate: Something {}')).toThrow(/no longer matches/);
  });
});
