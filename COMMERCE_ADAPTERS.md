# Commerce adapters

Code: `src/domain/commerce/adapter.ts`.

The MVP buys nothing. All products, baskets and orders are simulated. Real retailers will plug in through one adapter contract, and only through official, approved access.

## Contract

```ts
interface ProviderAdapter {
  code; displayName; mode: 'simulated' | 'live'; enabled; status;
  capabilities: Record<'searchProducts' | 'getProductDetails' | 'checkAvailability' | 'createCart' | 'getCart'
                     | 'checkout' | 'trackOrder' | 'getMinimumOrder' | 'getDeliveryFee', boolean>;
  searchProducts(q); getProductDetails(id); checkAvailability(ids);
  getMinimumOrder(); getDeliveryFee(); checkout();
}
```

Unsupported calls return `{ ok: false, code: 'NOT_SUPPORTED' }`. Disabled adapters return `DISABLED` and make no network calls. Nothing ever returns a fake success. Tests: `grocery.test.ts` → "provider adapters".

## Providers

| Provider | State | Path to production |
|---|---|---|
| Simulated | Active | — |
| Swiggy Instamart | Cart builder built; runs on sandbox | See "Instamart automatic cart" below. Swiggy Builders Club exposes Instamart over MCP. Local/staging development can start without production approval; production needs an application, review, exact HTTPS redirect URI allowlisting and a demo video. The documented flow is address → search → SKU variation → cart → review → checkout (explicit user confirmation, ₹99 cart minimum, serviceability limits, possible multi-store partial success) → tracking. Next step: a research spike on staging only. |
| Zepto | Hand-off links only | No public API. The store page opens `zepto.com/search?query=…` per item; the person adds items themselves. We do not automate the Zepto website. |
| Amazon.in (Creators API) | Disabled | Catalogue discovery and item details only. Not a grocery checkout API. |
| BigBasket | Disabled | No public ordering API verified. Partnership required. |
| ONDC | Disabled | Future, through an authorised buyer-network participant. |
| Local stores | Not built | Planned as manual, user-entered price and availability, timestamped and marked unverified (FR-019). |

## Rules for any live adapter

- Official access and terms review first. No scraping, consumer-UI automation, private endpoints or stored retailer passwords.
- Map provider SKUs to canonical ingredients; a SKU is never a nutrient record.
- Show known fees; label unknown fees.
- Explicit user confirmation for every checkout. No unattended purchases. Scheduled rules stop at a draft basket.
- Never blindly retry a non-idempotent checkout; check order state first and handle partial success and timeouts.
- Separate consent for retailer account linking (`consent_records.purpose = 'retailer_linking'`).

## Instamart automatic cart

Code: `src/domain/commerce/instamart.ts` (flow), `src/domain/commerce/instamartMock.ts` (sandbox), screen `src/features/orders/StoreOrderPage.tsx` (route `/checkout/store`).

Flow, using the Builders Club Instamart tools at `https://mcp.swiggy.com/im`:

1. `get_addresses`: use the person's saved Swiggy address.
2. `search_products` for each basket line (main name first, then the names in brackets, e.g. "semolina", then "rava").
3. For each variant (`spinId`), run the title through the store matcher (`match.ts`). Keep it only if it maps to the same ingredient as the line, passes diet, allergy and exclusion rules, has no egg/meat/fish/allergen word the person must avoid, has a readable pack size, and is in stock. Pick the cheapest way to cover the quantity. Lines with no safe product are listed for the person with the reasons.
4. `update_cart` (replaces the whole cart), then `get_cart` for the bill, fees and errors (₹99 minimum, not serviceable, out of stock).
5. The person ticks a confirmation for the exact total. `placeOrder` re-reads the cart and refuses if the total or item count changed, then calls `checkout` once. It is never retried automatically; on a timeout the person checks the Swiggy app.

Evaluation: gates M5–M7 build a sandbox cart for every synthetic person and check each item against hand labels of the sandbox products (not the matcher). Latest full run: 0 unsafe items, 0 wrong products, 0 short quantities, about 95% of lines placed (the "everyday spice mix" line is refused because store titles say "mix", which the matcher treats as a different product).

Going live:

1. Apply at Swiggy Builders Club with the demo video of the sandbox flow; ask for Instamart scope and the redirect URI `https://nourishcart.vercel.app/auth/swiggy/callback`.
2. Add a Supabase Edge Function `instamart-proxy` that holds the person's Swiggy OAuth token server-side and forwards JSON-RPC `tools/call` to `https://mcp.swiggy.com/im`. The browser calls the proxy; it never sees the token.
3. Replace `createMockInstamart().call` with a caller that posts to the proxy. Nothing else changes.
4. Record `retailer_linking` consent before linking an account.

## Price comparison across Zepto and Instamart (AI shopping agent)

Screen: Groceries → **Compare prices on Zepto and Instamart** (`/groceries/compare`).

How it works:

1. **The NourishCart Shopper browser extension** (`extension/`, downloadable from the screen as `nourishcart-shopper.zip`) opens each store's own search page in background tabs of the person's browser. Because it uses their browser, prices match their delivery location. It copies the visible text, then closes the tab. It is read-only: it never logs in, clicks, adds to cart or pays. It can only open Zepto and Instamart **search** URLs; the allowed patterns are checked in `background.js`, so no web page can use it to open or read anything else. It runs 4 tabs at a time and retries a failed page once.
2. **AI reads the pages.** `api/listings.js` sends the page text (public store content only, nothing about the person) to Gemini on the free tier, with a fallback list of models when one is busy. The prompt (`src/domain/commerce/listings.ts`) asks only for facts on the product cards and says the page is data, not instructions.
3. **Checks on every AI answer** (`verifyListings`). A product is kept only if:
   - its title is a whole line of the page;
   - its price is printed on its own line inside that product's own card. Cards are the lines between product titles. Whether prices sit before or after the title (Zepto vs Instamart) is decided by a majority vote over all the claims, so one planted claim can't change it.

   Pages showing a login wall or no location are detected without calling the model.
4. **Deterministic choice** (`src/domain/commerce/compare.ts`). For each item and store it keeps products that the matcher maps to the same ingredient and that pass diet, allergy and exclusion checks, including words in the title. It then takes the cheapest pack count that covers the need, and totals all-from-Zepto, all-from-Instamart and cheapest-per-item. Fees are not included, and the screen says so.

Without the extension, **Try it on saved store pages** runs the same AI and checks on pages captured on 13 Nov 2026.

Not done yet (next stage, after review): filling the store carts automatically. The plan is to have the extension click "Add" for the chosen products on the open store tab, with the person watching, and stop at the cart. That counts as automating a consumer website, so it needs a decision on store terms first. The Builders Club MCP route above is the compliant way for Instamart.
