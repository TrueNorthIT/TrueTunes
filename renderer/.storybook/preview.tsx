import { useState } from 'react';
import type { Preview } from '@storybook/react-vite';
import { action } from 'storybook/actions';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { createSonosFake, sonosDefaults } from '../src/test/sonosFake';
import { createMockBackend } from '../src/test/mockBackend';
import { installMockRuntime } from '../src/test/mockRuntime';
import appStyles from '../src/styles/App.module.css';
import '@fontsource-variable/manrope';
import '../src/styles/global.css';
import '../src/styles/depth.css';

// There is no Electron here, so window.sonos is the shared fake: every method keeps its default behaviour and
// logs its call to the Actions panel. Providers, hooks and players all reach Sonos through it, so nothing in a
// story can touch the office speakers.
const logCalls = (name: string, impl: (...args: never[]) => unknown) => {
  return (...args: never[]) => {
    action(`sonos.${name}`)(...args);
    return impl(...args);
  };
};

Object.defineProperty(window, 'sonos', {
  writable: true,
  value: createSonosFake(logCalls),
});

/**
 * Where a page story renders: `parameters.route` puts the story at a route of a MemoryRouter, as the app does,
 * so `useParams`, `useSearchParams` and `location.state` (the item a page was opened with) all work.
 * `pattern` is the route's path pattern (`/album/:id`); `path` is the URL visited, `?query` included.
 * `parameters.frame` is 'padded' (default: a scrolling box), 'page' (the routed area of the app shell; the default for
 * mock stories) or 'bare' (nothing around it, for a story that renders the whole app).
 */
interface StoryRoute {
  path: string;
  pattern?: string;
  state?: unknown;
}

/** A fresh query client per story (so no cache or retry leaks between them), the router, and the app's page root. */
type Frame = 'padded' | 'page' | 'bare';

function StoryShell({ children, route, frame }: { children: React.ReactNode; route?: StoryRoute; frame: Frame }) {
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false } } }));
  const routed = route ? (
    <Routes>
      <Route path={route.pattern ?? route.path.split('?')[0]} element={children} />
    </Routes>
  ) : (
    children
  );
  return (
    <QueryClientProvider client={client}>
      <MemoryRouter
        initialEntries={[
          route
            ? {
                pathname: route.path.split('?')[0],
                search: route.path.includes('?') ? `?${route.path.split('?')[1]}` : '',
                state: route.state,
              }
            : '/',
        ]}
      >
        {frame === 'bare' ? (
          routed
        ) : frame === 'page' ? (
          // A page as the app frames it (App.module.css): the routed area of the shell, filling the window.
          <div className={appStyles.shell}>
            <div className={appStyles.body}>
              <main className={appStyles.main}>{routed}</main>
            </div>
          </div>
        ) : (
          /* global.css sets body to 100vh with no scroll, as in the app, so the story scrolls itself. */
          <div
            className="page-scale"
            style={{ height: '100vh', overflow: 'auto', padding: 24, background: 'var(--bg)', color: 'var(--text)' }}
          >
            {routed}
          </div>
        )}
      </MemoryRouter>
    </QueryClientProvider>
  );
}

const preview: Preview = {
  decorators: [
    (Story, { id, parameters }) => (
      <StoryShell
        key={id}
        route={parameters.route as StoryRoute | undefined}
        frame={(parameters.frame as Frame | undefined) ?? (parameters.backend === 'mock' ? 'page' : 'padded')}
      >
        <Story />
      </StoryShell>
    ),
  ],
  // `parameters.backend = 'mock'` (the page stories) swaps in the synthetic backend (src/test/mockBackend.ts), freezes
  // the clock at 2026-10-26T12:00:00Z and serves artwork and lyrics locally. Every other story keeps the plain fake.
  beforeEach: ({ parameters }) => {
    if (parameters.backend !== 'mock') return;
    const previous = window.sonos;
    window.sonos = createSonosFake(logCalls, { ...sonosDefaults, ...createMockBackend() });
    const undoRuntime = installMockRuntime();
    return () => {
      window.sonos = previous;
      undoRuntime();
    };
  },
  parameters: {
    layout: 'fullscreen',
    backgrounds: { disabled: true },
    // axe runs on every story in the story tests: a violation fails the test. Narrow exceptions go on the story, with a reason.
    a11y: { test: 'error' },
  },
};

export default preview;
