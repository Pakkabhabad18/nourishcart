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
| Swiggy Instamart | Disabled placeholder | Swiggy Builders Club exposes Instamart over MCP. Local/staging development can start without production approval; production needs an application, review, exact HTTPS redirect URI allowlisting and a demo video. The documented flow is address → search → SKU variation → cart → review → checkout (explicit user confirmation, ₹99 cart minimum, serviceability limits, possible multi-store partial success) → tracking. Next step: a research spike on staging only. |
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
