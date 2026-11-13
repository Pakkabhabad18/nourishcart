// Runs inside the NourishCart web page only (see "matches" in manifest.json).
// Passes requests from the page to the extension's background worker and streams results
// back with window.postMessage. The page never gets direct access to the extension.
const VERSION = chrome.runtime.getManifest().version;

window.addEventListener('message', (event) => {
  // Only messages from this same page, tagged as coming from the NourishCart app.
  if (event.source !== window || event.data?.source !== 'nourishcart-app') return;
  const msg = event.data;

  if (msg.type === 'PING') {
    window.postMessage({ source: 'nourishcart-shopper', type: 'PONG', version: VERSION }, window.location.origin);
    return;
  }

  if (msg.type === 'READ_PAGES' && Array.isArray(msg.jobs)) {
    // One port per request so progress can be streamed back as each page is read.
    const port = chrome.runtime.connect({ name: 'read-pages' });
    port.onMessage.addListener((m) => window.postMessage({ source: 'nourishcart-shopper', requestId: msg.requestId, ...m }, window.location.origin));
    port.postMessage({ jobs: msg.jobs });
  }
});

// Announce ourselves so the page can show "extension ready" without waiting for a ping.
window.postMessage({ source: 'nourishcart-shopper', type: 'PONG', version: VERSION }, window.location.origin);
