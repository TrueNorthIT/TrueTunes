import { useState } from 'react';
import type { Preview } from '@storybook/react-vite';
import { action } from 'storybook/actions';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { createSonosFake } from '../src/test/sonosFake';
import '@fontsource-variable/manrope';
import '../src/styles/global.css';
import '../src/styles/depth.css';

// There is no Electron here, so window.sonos is the shared fake: every method keeps its default behaviour and
// logs its call to the Actions panel. Providers, hooks and players all reach Sonos through it, so nothing in a
// story can touch the office speakers.
Object.defineProperty(window, 'sonos', {
  writable: true,
  value: createSonosFake((name, impl) => (...args) => {
    action(`sonos.${name}`)(...args);
    return impl(...args);
  }),
});

/** A fresh query client per story (so no cache or retry leaks between them), the router, and the app's page root. */
function StoryShell({ children }: { children: React.ReactNode }) {
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false } } }));
  return (
    <QueryClientProvider client={client}>
      <MemoryRouter>
        {/* global.css sets body to 100vh with no scroll, as in the app, so the story scrolls itself. */}
        <div className="page-scale" style={{ height: '100vh', overflow: 'auto', padding: 24, background: 'var(--bg)', color: 'var(--text)' }}>
          {children}
        </div>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

const preview: Preview = {
  decorators: [(Story, { id }) => <StoryShell key={id}><Story /></StoryShell>],
  parameters: {
    layout: 'fullscreen',
    backgrounds: { disabled: true },
  },
};

export default preview;
