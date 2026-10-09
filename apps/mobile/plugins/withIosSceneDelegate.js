// Expo config plugin: adopt the UIScene life cycle on iOS.
//
// Apps built with the iOS 27 SDK hit a UIKit assertion at launch (EXC_BREAKPOINT in
// _UIApplicationEvaluateRuntimeIssueForNoSceneLifecycleAdoption) unless they use scenes. Expo 57 ships the
// runtime for this (ExpoAppSceneDelegate, ExpoReactNativeFactoryProvider) but its prebuild template still
// creates the window in the app delegate; the SDK 58 template does it properly. This applies the SDK 58
// shape to the SDK 57 template: the app delegate only builds the React Native factory, a SceneDelegate
// creates the window and starts React Native, and Info.plist declares the scene. Delete this plugin when
// moving to SDK 58. It throws if the generated AppDelegate stops matching the template.

const { withAppDelegate, withInfoPlist } = require('@expo/config-plugins');

const MARKER = '// true-tunes: scene delegate';

const TEMPLATE_CLASS = 'class AppDelegate: ExpoAppDelegate {';
const OUR_CLASS = 'class AppDelegate: ExpoAppDelegate, ExpoReactNativeFactoryProvider {';

const TEMPLATE_START = `#if os(iOS) || os(tvOS)
    window = UIWindow(frame: UIScreen.main.bounds)
    factory.startReactNative(
      withModuleName: "main",
      in: window,
      launchOptions: launchOptions)
#endif
`;
const OUR_START = `    // The window is created and React Native is started by SceneDelegate (UIScene life cycle).
`;

const SCENE_DELEGATE = `
${MARKER}
@objc(SceneDelegate)
class SceneDelegate: ExpoAppSceneDelegate {}
`;

function patchAppDelegate(src) {
  if (src.includes(MARKER)) return src; // already patched (prebuild without --clean)
  if (!src.includes(TEMPLATE_CLASS) || !src.includes(TEMPLATE_START)) {
    throw new Error(
      'withIosSceneDelegate: ios/<app>/AppDelegate.swift no longer matches the Expo template this plugin patches. ' +
        'If the template now adopts UIScene itself (SDK 58+), delete this plugin; otherwise update it.'
    );
  }
  return src.replace(TEMPLATE_CLASS, OUR_CLASS).replace(TEMPLATE_START, OUR_START) + SCENE_DELEGATE;
}

const SCENE_MANIFEST = {
  UIApplicationSupportsMultipleScenes: false,
  UISceneConfigurations: {
    UIWindowSceneSessionRoleApplication: [
      { UISceneConfigurationName: 'Default Configuration', UISceneDelegateClassName: 'SceneDelegate' },
    ],
  },
};

module.exports = function withIosSceneDelegate(config) {
  config = withAppDelegate(config, (cfg) => {
    if (cfg.modResults.language !== 'swift') throw new Error('withIosSceneDelegate: expected a Swift AppDelegate');
    cfg.modResults.contents = patchAppDelegate(cfg.modResults.contents);
    return cfg;
  });
  return withInfoPlist(config, (cfg) => {
    cfg.modResults.UIApplicationSceneManifest = SCENE_MANIFEST;
    return cfg;
  });
};
module.exports.patchAppDelegate = patchAppDelegate;
module.exports.MARKER = MARKER;
