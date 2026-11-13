// Swiggy Instamart cart builder over the official Swiggy Builders Club MCP server
// (https://mcp.swiggy.com/im). It turns an approved NourishCart basket into an Instamart cart:
//
//   get_addresses -> search_products (per line) -> pick a safe variant -> update_cart -> get_cart
//   -> person reviews and confirms -> checkout (once, never retried)
//
// Safety: every variant title goes through the same matcher the evaluation scores
// (match.ts). A variant is only added when it maps to the SAME ingredient as the basket
// line AND passes the person's diet, allergy and exclusion rules, including allergens and
// egg/meat/fish words found in the product title itself. Anything unsure is left out and
// shown to the person instead of guessed.
//
// Transport is injected (`McpCall`), so the same code runs against the in-app sandbox
// (mock) and, once Builders Club access is granted, a server-side proxy holding the
// person's Swiggy OAuth token. The browser never sees that token.
import type { Allergen, Ingredient } from "../types.ts";
import type { BasketLine } from "../grocery/optimise.ts";
import { ingredientRejection, type Restrictions } from "../diet.ts";
import { matchProductTitle, type MatchResult } from "./match.ts";

export type McpCall = (
  tool: string,
  args?: Record<string, unknown>,
) => Promise<unknown>;

/** One sellable SKU. Instamart adds variants (spinId) to the cart, not parent products. */
export interface StoreVariant {
  spinId: string;
  title: string; // product name + variant label, e.g. "Aashirvaad Atta 5 kg"
  priceInr: number;
  inStock: boolean;
}

export interface CartItemPlan {
  ingredientId: string;
  lineName: string;
  spinId: string;
  title: string;
  quantity: number; // number of packs
  packQty: number;
  unit: string;
  priceInr: number;
  coveredQty: number;
  demandQty: number;
  confidence: MatchResult["confidence"];
}

export interface SkippedLine {
  ingredientId: string;
  lineName: string;
  reason: string;
  /** Variants that were seen but refused, with why. Shown to the person, never added. */
  refused: { title: string; reason: string }[];
}

export interface CartPlan {
  addressId: string;
  items: CartItemPlan[];
  skipped: SkippedLine[];
  estimatedTotalInr: number;
}

export interface CartReview {
  items: {
    spinId: string;
    title: string;
    quantity: number;
    priceInr: number;
  }[];
  itemTotalInr: number;
  feesInr: number;
  totalInr: number;
  problems: string[]; // e.g. minimum order not met, out of stock, not serviceable
}

// ------------------------------------------------------------------ response parsing
// Instamart responses are read defensively: field names below follow the Builders Club
// docs (products[].variants[].spinId). Anything we can't read is dropped, not guessed.

const num = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v)
    ? v
    : typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))
      ? Number(v)
      : null;
const str = (v: unknown): string | null =>
  typeof v === "string" && v.trim() ? v.trim() : null;
const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" ? (v as Record<string, unknown>) : {};
const data = (v: unknown): Record<string, unknown> => obj(obj(v).data ?? v);

export function parseSearch(raw: unknown): StoreVariant[] {
  const products = data(raw).products;
  if (!Array.isArray(products)) return [];
  const out: StoreVariant[] = [];
  for (const p of products) {
    const po = obj(p);
    const name = str(po.name) ?? str(po.displayName) ?? "";
    const brand = str(po.brand);
    for (const v of Array.isArray(po.variants) ? po.variants : []) {
      const vo = obj(v);
      const spinId = str(vo.spinId);
      const label =
        str(vo.quantityDescription) ??
        str(vo.quantity) ??
        str(vo.displayName) ??
        "";
      const price =
        num(obj(vo.price).offerPrice) ?? num(vo.offerPrice) ?? num(vo.price);
      if (!spinId || price == null) continue;
      const fullName = `${brand && !name.toLowerCase().startsWith(brand.toLowerCase()) ? `${brand} ` : ""}${name}`;
      out.push({
        spinId,
        title: `${fullName} ${label}`.trim(),
        priceInr: price,
        inStock: vo.inStock !== false && vo.isAvailable !== false,
      });
    }
  }
  return out;
}

function parseCart(raw: unknown): CartReview {
  const d = data(raw);
  const items = (Array.isArray(d.items) ? d.items : []).map((i) => {
    const o = obj(i);
    return {
      spinId: str(o.spinId) ?? "",
      title: str(o.name) ?? str(o.title) ?? "",
      quantity: num(o.quantity) ?? 0,
      priceInr: num(o.price) ?? num(obj(o.price).offerPrice) ?? 0,
    };
  });
  const bill = obj(d.bill);
  const itemTotal =
    num(bill.itemTotal) ??
    items.reduce((s, i) => s + i.priceInr * i.quantity, 0);
  const total = num(bill.toPay) ?? num(bill.total) ?? itemTotal;
  const problems = (Array.isArray(d.errors) ? d.errors : []).map(
    (e) => str(obj(e).message) ?? String(e),
  );
  return {
    items,
    itemTotalInr: itemTotal,
    feesInr: Math.max(0, total - itemTotal),
    totalInr: total,
    problems,
  };
}

// ------------------------------------------------------------------ safety

/** Why a store product must not go into this person's cart, or null if it is fine. */
export function variantRejection(
  m: MatchResult,
  lineIngredientId: string,
  ingredients: Map<string, Ingredient>,
  r: Restrictions,
): string | null {
  if (!m.ingredientId)
    return m.blockedBy
      ? `not matched (${m.blockedBy})`
      : "not recognised as this item";
  if (m.ingredientId !== lineIngredientId)
    return `looks like ${ingredients.get(m.ingredientId)?.name ?? m.ingredientId}, not this item`;
  const ing = ingredients.get(m.ingredientId)!;
  const base = ingredientRejection(ing, r);
  if (base) return base.detail;
  // Words in the title can reveal more than the ingredient record (e.g. "with egg").
  if (r.dietPattern !== "non_vegetarian" && (m.markers.meat || m.markers.fish))
    return "title mentions meat or fish";
  if (
    (r.dietPattern === "vegetarian" || r.dietPattern === "vegan") &&
    m.markers.egg
  )
    return "title mentions egg";
  if (r.dietPattern === "vegan" && m.markers.dairy)
    return "title mentions dairy";
  const hit = m.markers.allergens.find((a: Allergen) =>
    r.allergies.includes(a),
  );
  if (hit) return `title mentions ${hit.replace("_", " ")}`;
  if (!m.pack) return m.packNote ?? "pack size unknown";
  return null;
}

// ------------------------------------------------------------------ the flow

/**
 * Search queries for a basket line, most specific first: "Semolina (rava / sooji)" gives
 * ["semolina", "rava", "sooji"]. The next one is only tried if the previous found nothing usable.
 */
export function searchQueries(line: Pick<BasketLine, "name">): string[] {
  const main = line.name
    .replace(/\(.*?\)/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  const inner = [...line.name.matchAll(/\(([^)]*)\)/g)]
    .flatMap((m) => m[1].split(/[/,]/))
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);
  return [...new Set([main, ...inner])];
}

export async function planInstamartCart(
  call: McpCall,
  lines: BasketLine[],
  ingredients: Map<string, Ingredient>,
  r: Restrictions,
  addressId?: string,
): Promise<CartPlan> {
  let address = addressId;
  if (!address) {
    const a = data(await call("get_addresses"));
    const list = Array.isArray(a.addresses) ? a.addresses : [];
    address = str(obj(list[0]).id) ?? undefined;
    if (!address)
      throw new Error(
        "No saved Swiggy delivery address. Add one in the Swiggy app first.",
      );
  }
  const items: CartItemPlan[] = [];
  const skipped: SkippedLine[] = [];
  for (const line of lines) {
    if (line.demandQty <= 0) continue;
    const refused: SkippedLine["refused"] = [];
    let best: {
      v: StoreVariant;
      m: MatchResult;
      packs: number;
      cost: number;
      leftover: number;
    } | null = null;
    let seen = 0;
    for (const query of searchQueries(line)) {
      if (best) break;
      const variants = parseSearch(
        await call("search_products", { addressId: address, query }),
      );
      seen += variants.length;
      for (const v of variants) {
        const m = matchProductTitle(v.title, ingredients);
        const why =
          variantRejection(m, line.ingredientId, ingredients, r) ??
          (v.inStock ? null : "out of stock");
        if (why) {
          refused.push({ title: v.title, reason: why });
          continue;
        }
        const packs = Math.max(1, Math.ceil(line.demandQty / m.pack!.qty));
        const cost = packs * v.priceInr;
        const leftover = packs * m.pack!.qty - line.demandQty;
        // Cheapest way to cover the need; on a tie, less left over; then prefer exact-phrase matches.
        if (
          !best ||
          cost < best.cost - 0.01 ||
          (Math.abs(cost - best.cost) <= 0.01 &&
            (leftover < best.leftover ||
              (leftover === best.leftover &&
                m.confidence === "high" &&
                best.m.confidence !== "high")))
        ) {
          best = { v, m, packs, cost, leftover };
        }
      }
    }
    if (!best) {
      skipped.push({
        ingredientId: line.ingredientId,
        lineName: line.name,
        reason: seen
          ? "No product passed the safety and match checks"
          : "Nothing found on Instamart for this item",
        refused: refused.filter(
          (x, i, a) => a.findIndex((y) => y.title === x.title) === i,
        ),
      });
      continue;
    }
    items.push({
      ingredientId: line.ingredientId,
      lineName: line.name,
      spinId: best.v.spinId,
      title: best.v.title,
      quantity: best.packs,
      packQty: best.m.pack!.qty,
      unit: best.m.pack!.unit,
      priceInr: best.v.priceInr,
      coveredQty: best.packs * best.m.pack!.qty,
      demandQty: line.demandQty,
      confidence: best.m.confidence,
    });
  }
  return {
    addressId: address,
    items,
    skipped,
    estimatedTotalInr: items.reduce((s, i) => s + i.quantity * i.priceInr, 0),
  };
}

/** Puts the planned items into the Instamart cart (replaces the whole cart) and reads it back for review. */
export async function pushCart(
  call: McpCall,
  plan: CartPlan,
): Promise<CartReview> {
  await call("update_cart", {
    selectedAddressId: plan.addressId,
    items: plan.items.map((i) => ({ spinId: i.spinId, quantity: i.quantity })),
  });
  return parseCart(await call("get_cart", { addressId: plan.addressId }));
}

/** What the person saw and agreed to. Checkout refuses if the cart changed since. */
export interface Confirmation {
  confirmedByUser: true;
  totalInr: number;
  itemCount: number;
}

/**
 * Places the order. Checkout is not idempotent, so it is called at most once and never
 * retried automatically; on a timeout the person is told to check the Swiggy app.
 */
export async function placeOrder(
  call: McpCall,
  plan: CartPlan,
  confirmation: Confirmation,
): Promise<{ orderId: string | null; message: string }> {
  if (!confirmation.confirmedByUser)
    throw new Error("Explicit confirmation is required");
  const fresh = parseCart(
    await call("get_cart", { addressId: plan.addressId }),
  );
  const count = fresh.items.reduce((s, i) => s + i.quantity, 0);
  if (
    Math.abs(fresh.totalInr - confirmation.totalInr) > 0.5 ||
    count !== confirmation.itemCount
  ) {
    throw new Error(
      "The cart changed after you reviewed it. Review it again before ordering.",
    );
  }
  if (fresh.problems.length) throw new Error(fresh.problems.join(" "));
  const res = data(await call("checkout", { addressId: plan.addressId }));
  return {
    orderId: str(res.orderId) ?? str(obj(res.order).id),
    message: str(res.message) ?? "Order placed",
  };
}

// ------------------------------------------------------------------ hand-off links (no API needed)

/** Opens the store's own search in a new tab. The person adds the item themselves. */
export const STORE_LINKS = {
  instamart: (q: string) =>
    `https://www.swiggy.com/instamart/search?custom_back=true&query=${encodeURIComponent(q)}`,
  zepto: (q: string) =>
    `https://www.zepto.com/search?query=${encodeURIComponent(q)}`,
} as const;
