// In-app sandbox that behaves like the Instamart MCP server (same tool names and response
// shape as the Builders Club docs), so the full cart flow can be shown and tested without
// Swiggy access. It sells our simulated catalogue PLUS look-alike "trap" products taken from
// the matcher test set (egg masala noodles, eggless mayo, chicken masala and so on), so the
// safety checks are exercised on every search. Nothing here talks to Swiggy.
import { CATALOGUE } from '../../data/catalogue.ts';
import { STORE_TITLES } from '../../eval/datasets/storeTitles.ts';
import type { McpCall } from './instamart.ts';
import type { Allergen } from '../types.ts';

interface MockProduct { spinId: string; name: string; price: number; inStock: boolean }

/** Hand labels for every sandbox product. Used only by the evaluation, never by the cart builder. */
export interface SandboxGold {
  ingredientIds: string[]; // acceptable canonical ingredients; empty = must never be bought for any line
  allergens: Allergen[];
  egg: boolean;
  meat: boolean;
  fish: boolean;
  packQty: number | null; // in the ingredient's unit basis
}

const PRODUCTS: MockProduct[] = [
  ...CATALOGUE.map((p) => ({ spinId: `spin_${p.id}`, name: p.title, price: p.priceInr, inStock: p.available })),
  // Every labelled store title becomes a sellable look-alike. Many are traps.
  ...STORE_TITLES.map((t, i) => ({ spinId: `spin_${t.id}`, name: t.title, price: realisticPrice(t.gold.ingredientId, t.gold.qty) ?? 40 + ((i * 37) % 160), inStock: true })),
];

/** Branded look-alikes cost about 10% more per gram than our cheapest sample pack. */
function realisticPrice(ingredientId: string | null, qty: number | undefined): number | null {
  if (!ingredientId || !qty) return null;
  const per = CATALOGUE.filter((p) => p.ingredientId === ingredientId).map((p) => p.priceInr / p.packQty);
  return per.length ? Math.round(Math.min(...per) * qty * 1.1) : null;
}

export const SANDBOX_GOLD: Map<string, SandboxGold> = new Map([
  ...CATALOGUE.map((p): [string, SandboxGold] => [`spin_${p.id}`, { ingredientIds: [p.ingredientId], allergens: p.allergens, egg: false, meat: false, fish: false, packQty: p.packQty }]),
  ...STORE_TITLES.map((t): [string, SandboxGold] => [
    `spin_${t.id}`,
    { ingredientIds: t.gold.ingredientId ? [t.gold.ingredientId, ...(t.gold.acceptable ?? [])] : [], allergens: t.gold.allergens ?? [], egg: !!t.gold.egg, meat: !!t.gold.meat, fish: !!t.gold.fish, packQty: t.gold.qty ?? null },
  ]),
]);

const STOP = new Set(['and', 'the', 'with', 'fresh', 'whole', 'dal', 'rice', 'oil']);

export interface MockInstamart {
  call: McpCall;
  /** Test hooks */
  checkoutCalls: () => number;
  cart: () => { spinId: string; quantity: number }[];
}

export function createMockInstamart(opts: { minOrderInr?: number } = {}): MockInstamart {
  let cart: { spinId: string; quantity: number }[] = [];
  let checkouts = 0;
  const minOrder = opts.minOrderInr ?? 99;
  const byId = new Map(PRODUCTS.map((p) => [p.spinId, p]));

  function bill() {
    const items = cart.map((c) => ({ ...c, p: byId.get(c.spinId)! })).filter((x) => x.p);
    const itemTotal = items.reduce((s, x) => s + x.p.price * x.quantity, 0);
    const delivery = itemTotal >= 199 ? 0 : 30;
    const errors = itemTotal > 0 && itemTotal < minOrder ? [{ message: `Minimum order not met: add ₹${minOrder - itemTotal} more` }] : [];
    return { data: { items: items.map((x) => ({ spinId: x.spinId, name: x.p.name, quantity: x.quantity, price: x.p.price })), bill: { itemTotal, deliveryFee: delivery, toPay: itemTotal + delivery }, errors } };
  }

  const call: McpCall = async (tool, args = {}) => {
    switch (tool) {
      case 'get_addresses':
        return { data: { addresses: [{ id: 'addr_sandbox_home', label: 'Home (sandbox)', area: 'Madhapur, Hyderabad' }] } };
      case 'search_products': {
        const q = String(args.query ?? '').toLowerCase();
        const words = q.split(/\s+/).filter((w) => w.length >= 3);
        const key = words.filter((w) => !STOP.has(w));
        const hits = PRODUCTS.filter((p) => {
          const n = p.name.toLowerCase();
          // like a real store: anything sharing the main word, so near-misses show up too
          return (key.length ? key : words).some((w) => n.includes(w));
        }).slice(0, 12);
        return { data: { products: hits.map((p) => ({ name: p.name, variants: [{ spinId: p.spinId, quantityDescription: '', price: { offerPrice: p.price }, inStock: p.inStock }] })) } };
      }
      case 'update_cart': {
        const items = Array.isArray(args.items) ? (args.items as { spinId: string; quantity: number }[]) : [];
        cart = items.filter((i) => byId.has(i.spinId) && i.quantity > 0).map((i) => ({ spinId: i.spinId, quantity: i.quantity }));
        return { data: { ok: true } };
      }
      case 'get_cart':
        return bill();
      case 'clear_cart':
        cart = [];
        return { data: { ok: true } };
      case 'checkout': {
        checkouts++;
        const b = bill();
        if (!cart.length) throw new Error('Cart is empty');
        if (b.data.errors.length) throw new Error(b.data.errors[0].message);
        const orderId = `SANDBOX-${String(1000 + checkouts)}`;
        cart = [];
        return { data: { orderId, message: 'Sandbox order placed. Nothing was bought.' } };
      }
      default:
        throw new Error(`Unknown tool ${tool}`);
    }
  };
  return { call, checkoutCalls: () => checkouts, cart: () => cart };
}
