// Registers the service worker that caches the static app shell only (see vite.config.ts).
// Fails quietly where service workers are unavailable (some embedded previews).
export function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || import.meta.env.DEV) return;
  import('virtual:pwa-register')
    .then(({ registerSW }) => registerSW({ immediate: true }))
    .catch(() => undefined);
}
