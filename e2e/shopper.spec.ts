// The price-comparison flow with the REAL browser extension loaded into Chromium.
// Store sites are replaced by a local server with saved pages and the AI endpoint by a fixed
// answer, so the test never touches Zepto, Swiggy or Gemini.
import { chromium, expect, test } from '@playwright/test';
import path from 'node:path';
import https from 'node:https';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { STORE_PAGES } from '../src/eval/datasets/storePages.ts';

const html = (text: string) => `<!doctype html><html><head><meta charset="utf-8"></head><body><pre style="white-space:pre-wrap;font:14px sans-serif">${text.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</pre></body></html>`;
const saved = (id: string) => STORE_PAGES.find((p) => p.id === id)!;

// eslint-disable-next-line no-empty-pattern -- this test builds its own browser context
test('compare prices with the extension (stores and AI mocked)', async ({}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'desktop only');
  test.setTimeout(360_000);
  // A local HTTPS server stands in for zepto.com and swiggy.com: Chromium is told to resolve
  // both names to it, so every tab the extension opens gets saved pages, never the real sites.
  const dir = mkdtempSync(path.join(tmpdir(), 'nc-'));
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-subj', '/CN=localhost', '-keyout', `${dir}/k.pem`, '-out', `${dir}/c.pem`], { stdio: 'ignore' });
  const added: { title: string; qty: number }[] = [];
  const server = https.createServer({ key: readFileSync(`${dir}/k.pem`), cert: readFileSync(`${dir}/c.pem`) }, (req, res) => {
    const u = new URL(req.url ?? '/', 'https://x');
    if (u.pathname === '/cart-log') {
      added.push({ title: u.searchParams.get('title') ?? '', qty: Number(u.searchParams.get('qty')) });
      res.writeHead(204);
      return res.end();
    }
    // Zepto toor dal and paneer are served as real-looking product cards with working Add
    // buttons, so the extension's "fill cart" can be tested end to end.
    if ((req.headers.host ?? '').includes('zepto') && /toor|paneer/.test(u.searchParams.get('query') ?? '')) {
      const pg = saved(u.searchParams.get('query')!.includes('toor') ? 'zepto-toor' : 'zepto-paneer');
      const lines = pg.text.split('\n');
      let from = 0;
      const cards = pg.gold.map((g) => {
        const at = lines.indexOf(g.title, from);
        from = at + 1;
        const pack = lines[at + 1] ?? '';
        return `<div class="card"><button class="add">ADD</button><p>₹${g.price}</p><span>${g.title}</span><p>${pack}</p></div>`;
      });
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(`<!doctype html><html><head><meta charset="utf-8"></head><body><p>Showing results for "${u.searchParams.get('query')}"</p>${cards.join('')}
<script>
document.querySelectorAll('.card').forEach((c) => {
  const title = c.querySelector('span').textContent;
  c.querySelector('button.add').addEventListener('click', (e) => {
    let qty = 1;
    const box = document.createElement('div');
    box.innerHTML = '<button aria-label="Decrease quantity">−</button><b>1</b><button aria-label="Increase quantity">+</button>';
    e.target.replaceWith(box);
    fetch('/cart-log?title=' + encodeURIComponent(title) + '&qty=1');
    box.querySelector('[aria-label="Increase quantity"]').addEventListener('click', () => { qty++; box.querySelector('b').textContent = qty; fetch('/cart-log?title=' + encodeURIComponent(title) + '&qty=' + qty); });
  });
});
</script></body></html>`);
    }
    const q = u.searchParams.get('query') ?? '';
    const isZepto = (req.headers.host ?? '').includes('zepto');
    const text = isZepto
      ? q.includes('toor') ? saved('zepto-toor').text : q.includes('paneer') ? saved('zepto-paneer').text : `Showing results for "${q}"\nNo results found`
      : q.includes('toor') ? saved('instamart-toor').text : saved('login-wall').text;
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html(text));
  });
  await new Promise<void>((r) => server.listen(Number(process.env.NC_STORE_PORT ?? 443), '127.0.0.1', () => r()));
  const ext = path.resolve('extension');
  const context = await chromium.launchPersistentContext('', {
    headless: true,
    channel: 'chromium', // the full Chromium build; the slim headless shell can't run extensions
    ignoreHTTPSErrors: true,
    args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`, '--host-resolver-rules=MAP www.zepto.com 127.0.0.1, MAP www.swiggy.com 127.0.0.1', '--ignore-certificate-errors', '--no-proxy-server'],
    viewport: { width: 1360, height: 900 },
  });
  // The AI reader: answer with the hand-labelled products for pages we know.
  await context.route('**/api/listings', async (route) => {
    const { pages } = route.request().postDataJSON() as { pages: { id: string; text: string }[] };
    const out = pages.map((p) => {
      const known = STORE_PAGES.find((s) => s.gold.length && s.store === (p.id.startsWith('zepto') ? 'zepto' : 'instamart') && s.gold.every((g) => p.text.includes(g.title)));
      const lines = p.text.split('\n').map((l) => l.trim()).filter(Boolean);
      const seen: Record<string, number> = {};
      // pack text = first size-looking line after the n-th occurrence of the title (as a careful reader would copy it)
      const packFor = (title: string) => {
        const n = (seen[title] = (seen[title] ?? -1) + 1);
        const at = lines.map((l, i) => (l === title ? i : -1)).filter((i) => i >= 0)[n] ?? -1;
        return lines.slice(at + 1, at + 4).find((l) => /\d+(\.\d+)?\s?(kg|g|ml|l)\b/i.test(l)) ?? '';
      };
      return { id: p.id, state: 'ok', products: (known?.gold ?? []).map((g) => ({ title: g.title, pack: packFor(g.title), price: g.price, mrp: null, soldOut: !!g.soldOut, sponsored: !!g.sponsored })) };
    });
    await route.fulfill({ json: { content: JSON.stringify({ pages: out }), model: 'mock', promptVersion: 'listings-prompt-1.0.0' } });
  });

  const page = await context.newPage();
  await page.goto('http://127.0.0.1:4173/');
  await page.getByRole('link', { name: 'Get started with email' }).click();
  await page.getByLabel('Email address').fill('shopper@example.com');
  await page.getByRole('button', { name: 'Email me a code' }).click();
  const code = (await page.getByLabel('Demo inbox').locator('p.num').first().textContent())!.trim();
  await page.getByLabel('6-digit code').fill(code);
  await page.getByRole('button', { name: 'Verify and continue' }).click();
  await page.getByLabel(/I have read the notice/).check();
  await page.getByLabel('Profile name').fill('Asha');
  await page.getByRole('button', { name: 'Create profile and continue' }).click();
  await page.getByRole('button', { name: 'Use an example' }).click();
  await page.getByRole('button', { name: 'Review' }).click();
  await page.getByRole('button', { name: 'Save and see my targets' }).click();
  await page.getByRole('button', { name: 'See meal plan options' }).click();
  await page.getByRole('button', { name: 'Show me three plans' }).click();
  await page.getByRole('button', { name: 'Choose Balanced' }).click();
  await page.getByRole('link', { name: 'Build this week’s groceries' }).click();
  await page.getByRole('link', { name: 'Compare prices on Zepto and Instamart' }).click();

  await expect(page.getByText('Extension ready')).toBeVisible({ timeout: 10_000 });
  await page.getByRole('button', { name: /Compare \d+ items now/ }).click();
  await expect(page.getByText('Everything from Zepto')).toBeVisible({ timeout: 240_000 });
  // Instamart showed a login wall for most items: the app must say so, not claim "not sold".
  await expect(page.getByText(/Swiggy Instamart asked you to log in/)).toBeVisible();
  // Toor dal is on both saved pages: a price per store and a cheapest pick must show.
  const live = page.getByRole('row', { name: /Toor dal/ });
  await expect(live.getByText('Cheapest')).toBeVisible();
  // The sponsored green moong and the chana dal are listed only under "left out", with the reason.
  await expect(live.getByText(/Green Moong Whole Pesticide Free Natural: looks like/)).toHaveCount(1);
  await expect(live.getByText(/RASOI TATTVA Chana Dal: /)).toHaveCount(1);
  await page.screenshot({ path: 'e2e/screenshots/13-compare.png', fullPage: true });

  // Fill the Zepto cart with Zepto's cheapest picks: confirmation first, then the extension clicks Add.
  await page.getByRole('button', { name: /to my Zepto cart/ }).click();
  await expect(page.getByText(/items to your Zepto cart\?/)).toBeVisible();
  await page.getByRole('button', { name: 'Yes, add them' }).click();
  await expect(page.getByText(/: added/).first()).toBeVisible({ timeout: 120_000 });
  await expect.poll(() => added.length, { timeout: 60_000 }).toBeGreaterThan(0);
  console.log('cart log', JSON.stringify(added));
  await page.screenshot({ path: 'e2e/screenshots/13b-fill-cart.png', fullPage: true });

  // Without the extension path: saved pages, same checks
  await page.getByRole('button', { name: 'Try it on saved store pages' }).click();
  await expect(page.getByText('Cheapest store for each item')).toBeVisible({ timeout: 30_000 });
  const row = page.getByRole('row', { name: /Toor dal/ });
  await expect(row.getByText('BestValue Toor Dal Bold')).toBeVisible();
  await expect(row.getByText('Popular Essentials Toor Dal (Split)')).toBeVisible();
  await page.screenshot({ path: 'e2e/screenshots/14-compare-sample.png', fullPage: true });
  await context.close();
  server.close();
});
