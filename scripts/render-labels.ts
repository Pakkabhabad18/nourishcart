// Renders each test label (src/eval/datasets/labels.ts) to a JPEG in eval-data/labels/, in its
// photo-like style. Run: npm run render:labels (needs Playwright's Chromium).
import { chromium } from '@playwright/test';
import { LABELS, type LabelCase } from '../src/eval/datasets/labels.ts';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

function mark(m: LabelCase['mark']): string {
  if (m === 'none') return '';
  const c = m === 'green' ? '#1b8a2f' : '#7a3b12';
  const inner = m === 'green' ? `<div style="width:14px;height:14px;border-radius:50%;background:${c}"></div>` : `<div style="width:0;height:0;border-left:9px solid transparent;border-right:9px solid transparent;border-bottom:15px solid ${c}"></div>`;
  return `<div style="width:24px;height:24px;border:2px solid ${c};display:grid;place-items:center;margin-bottom:8px">${inner}</div>`;
}

function html(c: LabelCase): string {
  const font = { small: 10, clean: 15, tilted: 15, blurred: 15, lowcontrast: 15, cutoff: 15, bilingual: 15 }[c.style];
  const colors = c.style === 'lowcontrast' ? 'color:#8a8a8a;background:#d9d6cf' : 'color:#1a1a1a;background:#fbfaf6';
  const filter = c.style === 'blurred' ? 'filter:blur(1.1px);' : '';
  const tilt = c.style === 'tilted' ? 'transform:rotate(-6deg);margin:40px;' : '';
  const hindi = c.style === 'bilingual' ? '<div style="font-weight:700">सामग्री / INGREDIENTS:</div>' : '<div style="font-weight:700">INGREDIENTS:</div>';
  const cut = c.style === 'cutoff' ? 'height:68px;overflow:hidden;' : '';
  return `<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0;background:#c9c2b3;font-family:Arial,'Noto Sans Devanagari',sans-serif">
  <div id="label" style="width:520px;padding:18px;${colors};${filter}${tilt}font-size:${font}px;line-height:1.35;box-shadow:0 2px 6px rgba(0,0,0,.3)">
    ${mark(c.mark)}
    <div style="font-size:${font + 5}px;font-weight:700;margin-bottom:6px">${esc(c.product)}</div>
    <div style="${cut}">${hindi}<div>${esc(c.ingredients)}</div>
    ${c.contains && c.style !== 'cutoff' ? `<div style="margin-top:6px;font-weight:700">ALLERGEN INFORMATION: ${esc(c.contains)}</div>` : ''}
    ${c.mayContain && c.style !== 'cutoff' ? `<div style="margin-top:4px">${esc(c.mayContain)}</div>` : ''}
    </div>
    <div style="margin-top:10px;font-size:${Math.max(9, font - 4)}px">Net Qty: 200 g · Best before 9 months from manufacture · FSSAI Lic. No. 1001XXXXXXXXXX · Store in a cool, dry place.</div>
  </div></body></html>`;
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 640, height: 900 }, deviceScaleFactor: 1.5 });
for (const c of LABELS) {
  await page.setContent(html(c));
  const box = await page.locator('body').boundingBox();
  await page.screenshot({ path: `eval-data/labels/${c.id}.jpg`, type: 'jpeg', quality: 80, clip: { x: 0, y: 0, width: 640, height: Math.min(900, (await page.locator('#label').boundingBox())!.height + 100) }, omitBackground: false });
  void box;
}
await browser.close();
console.log(`Rendered ${LABELS.length} labels to eval-data/labels/`);
