// The web app's entry point. Electron's preload gives the desktop app `window.sonos`; here we install it
// ourselves before React renders: the browser bridge (everything through the gateway on this origin) or, under
// /demo, a simulated office that touches no network. Both render the same <App />.
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HashRouter } from 'react-router-dom';
import { App } from '../App';
import { STALE } from '../lib/queryDefaults';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { SignIn } from './SignIn';
import { DemoBadge } from './DemoBadge';
import '@fontsource-variable/manrope';
import '../styles/global.css';
import '../styles/depth.css';

declare const __APP_VERSION__: string;

document.documentElement.dataset.platform = 'web';

/** The demo lives at /demo: the real app shell, a pretend office. */
const isDemo = /^\/demo(\/|$)/.test(location.pathname);

function renderApp(root: Root, demo: boolean): void {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, staleTime: STALE.default } } });
  root.render(
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <HashRouter>
          <App />
        </HashRouter>
      </QueryClientProvider>
      {demo && <DemoBadge />}
    </ErrorBoundary>
  );
  requestIdleCallback?.(() => void import('../lib/faceDetector').then((m) => m.warmFaceDetector()), {
    timeout: 5000,
  });
}

async function boot(): Promise<void> {
  const el = document.getElementById('root');
  if (!el) throw new Error('No #root element found');
  const root = createRoot(el);

  if (isDemo) {
    document.documentElement.dataset.demo = '';
    // Loaded only here, so the real app never downloads the demo's catalogue.
    const { createDemoBackend, installDemoRuntime } = await import('./demo');
    installDemoRuntime();
    window.sonos = createDemoBackend();
    renderApp(root, true);
    return;
  }

  const [{ createWebBridge }, { createMsalAuth }] = await Promise.all([import('./bridge'), import('./bridge/auth')]);
  const auth = createMsalAuth({
    clientId: import.meta.env.VITE_ENTRA_CLIENT_ID ?? '',
    tenantId: import.meta.env.VITE_ENTRA_TENANT_ID ?? '',
    redirectUri: `${location.origin}/auth/redirect`,
  });
  const signIn = (failed = false) =>
    root.render(<SignIn failed={failed} onSignIn={() => auth.signIn().catch(() => signIn(true))} />);

  let user: EntraUser | null;
  try {
    user = await auth.init();
  } catch {
    signIn(true);
    return;
  }
  // The way back from Microsoft lands on /auth/redirect; the app itself lives at /.
  if (location.pathname !== '/') history.replaceState(null, '', '/');

  const bridge = createWebBridge({ auth, version: __APP_VERSION__ });
  window.sonos = bridge;
  if (!user) {
    signIn();
    return;
  }
  // A silent refresh that needs the user (about once a day in a browser): back to the sign-in screen.
  bridge.onAuthExpired(() => {
    bridge.stop();
    signIn();
  });
  bridge.start();
  renderApp(root, false);
}

void boot();
