// Which shell the renderer is running in. Electron's preload gives the desktop app `window.sonos`; the web app
// (PWA) installs its own in renderer/src/web/main.tsx and marks the document before React renders.

/** True in the web app, false in the Electron app. */
export const isWeb = (): boolean => document.documentElement.dataset.platform === 'web';

/** True while the web app shows the phone shell (PhoneShell marks the document). Read it in handlers, not in render. */
export const isPhoneShell = (): boolean => document.documentElement.dataset.shell === 'phone';
