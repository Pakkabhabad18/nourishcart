// Background worker: opens store search pages in background tabs of the person's own browser,
// waits for the results to render, copies the visible text and closes the tab.
//
// Limits on purpose:
//  - only Zepto and Swiggy Instamart SEARCH pages can be opened (checked below), so a web page
//    cannot use this extension to open or read anything else
//  - read-only: nothing is clicked, typed, added to a cart or bought
//  - at most 4 tabs at a time, with a pause between pages, so stores see normal browsing
const ALLOWED = [
  /^https:\/\/www\.zepto\.com\/search\?query=[^&#]{1,80}$/,
  /^https:\/\/www\.swiggy\.com\/instamart\/search\?custom_back=true&query=[^&#]{1,80}$/,
];
const MAX_JOBS = 120;
const PARALLEL = 4;
const MAX_WAIT_MS = 15000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** True once the page shows prices, or clearly says it can't (login wall, no results). */
function looksReady(text) {
  if (!text) return false;
  const rupee = (text.match(/₹\s?\d/g) || []).length;
  const bare = text.split('\n').filter((l) => /^\s*₹?\s?\d{2,5}\s*$/.test(l)).length;
  return Math.max(rupee, bare) >= 5 || /log ?in to continue|log in with phone|no results|couldn't find/i.test(text);
}

async function waitForLoad(tabId) {
  for (let i = 0; i < 40; i++) {
    const tab = await chrome.tabs.get(tabId);
    if (tab.status === 'complete') return;
    await sleep(250);
  }
}

async function readPageOnce(url) {
  if (!ALLOWED.some((re) => re.test(url))) return { url, error: 'not an allowed store search page' };
  const tab = await chrome.tabs.create({ url, active: false });
  try {
    await waitForLoad(tab.id);
    const started = Date.now();
    let text = '';
    // Store pages are apps that fill in results after loading: poll until prices appear.
    while (Date.now() - started < MAX_WAIT_MS) {
      const [res] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => (document.body ? document.body.innerText : '') });
      text = res?.result || '';
      if (looksReady(text)) break;
      await sleep(800);
    }
    return { url, text: text.slice(0, 20000), ms: Date.now() - started };
  } catch (e) {
    return { url, error: String(e?.message || e) };
  } finally {
    chrome.tabs.remove(tab.id).catch(() => {});
  }
}

/** One retry after a short pause: a page can fail to load on a network blip. */
async function readPage(url) {
  const first = await readPageOnce(url);
  if (!first.error && first.text) return first;
  await sleep(1200);
  return readPageOnce(url);
}

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'read-pages') return;
  port.onMessage.addListener(async ({ jobs }) => {
    const list = (Array.isArray(jobs) ? jobs : []).slice(0, MAX_JOBS);
    let next = 0;
    let done = 0;
    const worker = async () => {
      while (next < list.length) {
        const job = list[next++];
        const res = await readPage(String(job.url));
        done++;
        try {
          port.postMessage({ type: 'PAGE', id: job.id, done, total: list.length, ...res });
        } catch {
          return; // the NourishCart tab was closed
        }
        await sleep(400);
      }
    };
    await Promise.all(Array.from({ length: Math.min(PARALLEL, list.length) }, worker));
    try {
      port.postMessage({ type: 'DONE', total: list.length });
    } catch {
      /* page gone */
    }
  });
});
