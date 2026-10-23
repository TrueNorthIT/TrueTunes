import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HashRouter } from 'react-router-dom';
import { App } from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import '@fontsource-variable/manrope';
import './styles/global.css';
import './styles/depth.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1 },
  },
});

const root = document.getElementById('root');
if (!root) throw new Error('No #root element found');
createRoot(root).render(
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <HashRouter>
        <App />
      </HashRouter>
    </QueryClientProvider>
  </ErrorBoundary>
);

// Quietly load face detection once the app is idle; artist heroes use it to crop photos. Not in the mini player.
if (!location.hash.startsWith('#/mini')) requestIdleCallback(() => { void import('./lib/faceDetector').then(m => m.warmFaceDetector()); }, { timeout: 5000 });
