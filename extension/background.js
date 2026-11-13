// Background worker: opens store search pages in background tabs of the person's own browser,
// waits for the results to render, copies the visible text and closes the tab.
//
// Limits on purpose:
//  - only Zepto and Swiggy Instamart SEARCH pages can be opened (checked below), so a web page
//    cannot use this extension to open or read anything else
//  - reading is read-only. The one write action is "fill cart", started by the person with a
//    confirmation in NourishCart: on each store search page it clicks that product's own Add
//    button (and "+" for more packs), after checking the product name and price on the card.
//    It never opens the cart, checkout or payment pages, and never types anything.
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

// ------------------------------------------------------------------ fill cart

/**
 * Runs inside the store page. Finds the product card whose name is exactly `title` and whose
 * card shows `price`, clicks its Add button, then "+" until `packs` are in the cart.
 * Returns what happened; it clicks nothing if the card isn't found exactly.
 */
async function addOnPage(title, price, packs) {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const norm = (s) => s.replace(/\s+/g, ' ').trim().toLowerCase();
  const leaves = [...document.querySelectorAll('body *')].filter((e) => e.children.length === 0 && norm(e.textContent || '') === norm(title));
  for (const leaf of leaves) {
    // the card = the nearest ancestor that holds exactly one button (its Add button)
    let card = leaf;
    while (card && card.querySelectorAll('button').length !== 1) card = card.parentElement;
    if (!card) continue;
    const lines = (card.innerText || '').split('\n').map((l) => l.trim());
    if (!lines.some((l) => l === `₹${price}` || l === `₹ ${price}` || l === String(price))) continue; // another pack size of the same product
    const add = card.querySelector('button');
    if (!/^add$/i.test((add.innerText || '').trim())) return { status: 'already_in_cart' };
    add.click();
    await wait(1500);
    const dialog = [...document.querySelectorAll('[role=dialog],[aria-modal=true]')].map((d) => d.innerText || '').join(' ');
    if (/log ?in|sign ?in|phone number|location|address/i.test(dialog)) return { status: 'needs_login_or_location' };
    for (let n = 1; n < packs; n++) {
      // after Add, the card shows a quantity stepper; its increase button is "+" or labelled so
      const plus = [...card.querySelectorAll('button')].find((b) => (b.innerText || '').trim() === '+' || /increase|add one|increment/i.test(b.getAttribute('aria-label') || ''));
      if (!plus) return { status: 'added', packs: n, note: 'could not find the + button for more packs' };
      plus.click();
      await wait(900);
    }
    return { status: 'added', packs };
  }
  return { status: 'not_found' };
}

async function fillOne(item) {
  if (!ALLOWED.some((re) => re.test(item.url))) return { ...item, status: 'not_allowed' };
  // Opened in the foreground so the person can watch every click.
  const tab = await chrome.tabs.create({ url: item.url, active: true });
  try {
    await waitForLoad(tab.id);
    const started = Date.now();
    while (Date.now() - started < MAX_WAIT_MS) {
      const [res] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => (document.body ? document.body.innerText : '') });
      if (looksReady(res?.result || '')) break;
      await sleep(800);
    }
    const [res] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: addOnPage, args: [String(item.title), Number(item.price), Math.max(1, Math.min(10, Number(item.packs) || 1))] });
    return { id: item.id, ...(res?.result || { status: 'error' }) };
  } catch (e) {
    return { id: item.id, status: 'error', error: String(e?.message || e) };
  } finally {
    await sleep(600);
    chrome.tabs.remove(tab.id).catch(() => {});
  }
}

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'fill-cart') return;
  port.onMessage.addListener(async ({ items }) => {
    const list = (Array.isArray(items) ? items : []).slice(0, 60);
    // one at a time, so the person can follow along
    for (let i = 0; i < list.length; i++) {
      const res = await fillOne(list[i]);
      try {
        port.postMessage({ type: 'ADDED', done: i + 1, total: list.length, ...res });
      } catch {
        return;
      }
      if (res.status === 'needs_login_or_location') break; // no point continuing; tell the person
    }
    try {
      port.postMessage({ type: 'FILL_DONE' });
    } catch {
      /* page gone */
    }
  });
});
