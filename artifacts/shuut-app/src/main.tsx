import { createRoot } from 'react-dom/client';

import App from './App';
import { ErrorBoundary } from '@/components/error-boundary';

import './index.css';

// An open tab may still run the previous release after a publish. If it then
// navigates to a lazy route, its old chunk URL may no longer exist. Reload the
// current URL once to pick up the new entry point; never loop on a bad build.
window.addEventListener('vite:preloadError', (event) => {
  const bundle = document.querySelector('script[type="module"][src]')?.getAttribute('src');
  if (!bundle) return;
  try {
    const key = 'shuut:stale-chunk-retry';
    if (sessionStorage.getItem(key) === bundle) return;
    sessionStorage.setItem(key, bundle);
  } catch {
    return;
  }
  event.preventDefault();
  window.location.reload();
});

createRoot(document.getElementById('root')!, {
  // Keeps caught errors off reportError(), which would raise the dev overlay.
  onCaughtError: (error, errorInfo) => {
    console.error(error, errorInfo.componentStack);
  },
}).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
);
