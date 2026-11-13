// Talking to the NourishCart Shopper browser extension, and to the AI store-page reader.
//
//   page --postMessage--> extension (bridge.js) --> opens store search pages in background tabs
//   page <--postMessage-- extension             <-- visible text of each page
//   page --POST /api/listings--> Gemini reads products off the text (batched)
//   page: verifyModelAnswer() keeps only products really on the page
import { detectPageState, verifyModelAnswer, type PageInput, type VerifiedPage } from '../domain/commerce/listings.ts';
import type { StoreId } from '../domain/commerce/compare.ts';

export const STORE_SEARCH: Record<StoreId, (q: string) => string> = {
  zepto: (q) => `https://www.zepto.com/search?query=${encodeURIComponent(q)}`,
  instamart: (q) => `https://www.swiggy.com/instamart/search?custom_back=true&query=${encodeURIComponent(q)}`,
};

type ShopperMsg = { source?: string; type?: string; requestId?: string; id?: string; text?: string; error?: string; done?: number; total?: number; version?: string };

/** Resolves with the extension version, or null if it doesn't answer within the timeout. */
export function detectShopper(timeoutMs = 900): Promise<string | null> {
  return new Promise((resolve) => {
    const onMsg = (e: MessageEvent<ShopperMsg>) => {
      if (e.source === window && e.data?.source === 'nourishcart-shopper' && e.data.type === 'PONG') {
        window.removeEventListener('message', onMsg);
        resolve(e.data.version ?? 'unknown');
      }
    };
    window.addEventListener('message', onMsg);
    window.postMessage({ source: 'nourishcart-app', type: 'PING' }, window.location.origin);
    setTimeout(() => {
      window.removeEventListener('message', onMsg);
      resolve(null);
    }, timeoutMs);
  });
}

export interface ReadJob {
  id: string; // `${store}:${ingredientId}`
  store: StoreId;
  query: string;
  url: string;
}

/** Ask the extension to read each store page. Calls onPage as each one arrives. */
export function readStorePages(jobs: ReadJob[], onPage: (job: ReadJob, text: string | null, error: string | null, done: number, total: number) => void): Promise<void> {
  const requestId = `r${Date.now()}`;
  return new Promise((resolve) => {
    const onMsg = (e: MessageEvent<ShopperMsg>) => {
      const m = e.data;
      if (e.source !== window || m?.source !== 'nourishcart-shopper' || m.requestId !== requestId) return;
      if (m.type === 'PAGE') {
        const job = jobs.find((j) => j.id === m.id);
        if (job) onPage(job, m.text ?? null, m.error ?? null, m.done ?? 0, m.total ?? jobs.length);
      }
      if (m.type === 'DONE') {
        window.removeEventListener('message', onMsg);
        resolve();
      }
    };
    window.addEventListener('message', onMsg);
    window.postMessage({ source: 'nourishcart-app', type: 'READ_PAGES', requestId, jobs: jobs.map(({ id, url }) => ({ id, url })) }, window.location.origin);
  });
}

export interface AiReadResult {
  pages: VerifiedPage[];
  model: string | null;
  failedBatches: number;
}

/**
 * Sends readable pages to the AI reader in batches (unreadable ones are skipped without a
 * model call) and verifies every answer against its page. `onBatch` reports progress.
 */
export async function aiReadListings(pages: PageInput[], onBatch: (done: number, total: number) => void, endpoint = '/api/listings', batchSize = 4): Promise<AiReadResult> {
  const out: VerifiedPage[] = [];
  const readable = pages.filter((p) => detectPageState(p.text) === 'ok');
  for (const p of pages) if (!readable.includes(p)) out.push(...verifyModelAnswer('{}', [p]));
  const batches: PageInput[][] = [];
  for (let i = 0; i < readable.length; i += batchSize) batches.push(readable.slice(i, i + batchSize));
  let model: string | null = null;
  let failed = 0;
  let done = 0;
  onBatch(0, batches.length);
  // Two batches at a time keeps the free-tier rate limit happy.
  const queue = [...batches];
  const worker = async () => {
    while (queue.length) {
      const batch = queue.shift()!;
      try {
        const r = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pages: batch.map((p) => ({ id: p.id, query: p.query, text: p.text })) }) });
        const j = (await r.json()) as { content?: string; model?: string; error?: string };
        if (!r.ok || typeof j.content !== 'string') throw new Error(j.error ?? `status ${r.status}`);
        model = j.model ?? model;
        out.push(...verifyModelAnswer(j.content, batch));
      } catch (e) {
        failed++;
        for (const p of batch) out.push({ id: p.id, state: 'unreadable', listings: [], rejected: [{ title: '*', reason: `AI reader failed: ${e instanceof Error ? e.message : 'error'}` }] });
      }
      onBatch(++done, batches.length);
    }
  };
  await Promise.all([worker(), worker()]);
  return { pages: out, model, failedBatches: failed };
}

export interface FillItem {
  id: string; // ingredientId
  store: StoreId;
  url: string;
  title: string;
  price: number;
  packs: number;
}
export type FillStatus = 'added' | 'already_in_cart' | 'not_found' | 'needs_login_or_location' | 'not_allowed' | 'error';

/** Ask the extension to click Add for each chosen product, one store tab at a time, in view. */
export function fillStoreCart(items: FillItem[], onItem: (id: string, status: FillStatus, done: number, total: number, note?: string) => void): Promise<void> {
  const requestId = `f${Date.now()}`;
  return new Promise((resolve) => {
    const onMsg = (e: MessageEvent<ShopperMsg & { status?: FillStatus; note?: string }>) => {
      const m = e.data;
      if (e.source !== window || m?.source !== 'nourishcart-shopper' || m.requestId !== requestId) return;
      if (m.type === 'ADDED' && m.id) onItem(m.id, m.status ?? 'error', m.done ?? 0, m.total ?? items.length, m.note);
      if (m.type === 'FILL_DONE') {
        window.removeEventListener('message', onMsg);
        resolve();
      }
    };
    window.addEventListener('message', onMsg);
    window.postMessage({ source: 'nourishcart-app', type: 'FILL_CART', requestId, items }, window.location.origin);
  });
}
