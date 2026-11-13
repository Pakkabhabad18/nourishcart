// Provider adapter contract (FR-020, prompt section 9). Every retailer integration
// implements this interface. Unsupported operations return NOT_SUPPORTED, never fake success.
// Disabled adapters make no network calls.
import type { CatalogueProduct } from '../types.ts';
import { CATALOGUE } from '../../data/catalogue.ts';

export type Capability =
  | 'searchProducts'
  | 'getProductDetails'
  | 'checkAvailability'
  | 'createCart'
  | 'getCart'
  | 'checkout'
  | 'trackOrder'
  | 'getMinimumOrder'
  | 'getDeliveryFee';

export type AdapterResult<T> = { ok: true; data: T } | { ok: false; code: 'NOT_SUPPORTED' | 'DISABLED' | 'NOT_FOUND'; message: string };

export interface ProviderAdapter {
  code: string;
  displayName: string;
  mode: 'simulated' | 'live';
  enabled: boolean;
  capabilities: Record<Capability, boolean>;
  status: string; // human-readable access status
  searchProducts(query: string): Promise<AdapterResult<CatalogueProduct[]>>;
  getProductDetails(id: string): Promise<AdapterResult<CatalogueProduct>>;
  checkAvailability(ids: string[]): Promise<AdapterResult<Record<string, boolean>>>;
  getMinimumOrder(): Promise<AdapterResult<{ amountInr: number | null }>>;
  getDeliveryFee(): Promise<AdapterResult<{ amountInr: number | null; known: boolean }>>;
  checkout(): Promise<AdapterResult<never>>;
}

const notSupported = <T,>(name: string): Promise<AdapterResult<T>> => Promise.resolve({ ok: false, code: 'NOT_SUPPORTED', message: `${name} is not supported by this provider` });
const disabled = <T,>(provider: string): Promise<AdapterResult<T>> =>
  Promise.resolve({ ok: false, code: 'DISABLED', message: `${provider} integration is disabled: no approved access` });

export const simulatedProvider: ProviderAdapter = {
  code: 'SIMULATED',
  displayName: 'NourishCart simulated catalogue',
  mode: 'simulated',
  enabled: true,
  capabilities: { searchProducts: true, getProductDetails: true, checkAvailability: true, createCart: true, getCart: true, checkout: true, trackOrder: false, getMinimumOrder: true, getDeliveryFee: true },
  status: 'Active. All products and prices are simulated.',
  async searchProducts(q) {
    const s = q.trim().toLowerCase();
    return { ok: true, data: CATALOGUE.filter((p) => !s || p.title.toLowerCase().includes(s) || p.brand.toLowerCase().includes(s) || p.ingredientId.includes(s)) };
  },
  async getProductDetails(id) {
    const p = CATALOGUE.find((x) => x.id === id);
    return p ? { ok: true, data: p } : { ok: false, code: 'NOT_FOUND', message: 'No such simulated product' };
  },
  async checkAvailability(ids) {
    return { ok: true, data: Object.fromEntries(ids.map((id) => [id, CATALOGUE.find((p) => p.id === id)?.available ?? false])) };
  },
  async getMinimumOrder() {
    return { ok: true, data: { amountInr: null } };
  },
  async getDeliveryFee() {
    return { ok: true, data: { amountInr: null, known: false } };
  },
  // Checkout for the simulated provider runs through domain/orders/checkout.ts.
  checkout: () => notSupported('Direct adapter checkout'),
};

/** Placeholder only. See COMMERCE_ADAPTERS.md for the official Swiggy Builders Club path. */
function disabledAdapter(code: string, displayName: string, status: string): ProviderAdapter {
  return {
    code,
    displayName,
    mode: 'live',
    enabled: false,
    capabilities: { searchProducts: false, getProductDetails: false, checkAvailability: false, createCart: false, getCart: false, checkout: false, trackOrder: false, getMinimumOrder: false, getDeliveryFee: false },
    status,
    searchProducts: () => disabled(displayName),
    getProductDetails: () => disabled(displayName),
    checkAvailability: () => disabled(displayName),
    getMinimumOrder: () => disabled(displayName),
    getDeliveryFee: () => disabled(displayName),
    checkout: () => disabled(displayName),
  };
}

export const PROVIDERS: ProviderAdapter[] = [
  simulatedProvider,
  disabledAdapter('SWIGGY_INSTAMART', 'Swiggy Instamart', 'Cart builder ready (src/domain/commerce/instamart.ts) and running on an in-app sandbox. Live use needs Swiggy Builders Club approval.'),
  disabledAdapter('AMAZON_IN', 'Amazon.in (Creators API)', 'Catalogue discovery only; no grocery checkout API verified.'),
  disabledAdapter('BIGBASKET', 'BigBasket', 'Partnership required; no public ordering API verified.'),
  disabledAdapter('ZEPTO', 'Zepto', 'No public ordering API. Hand-off links to Zepto search only.'),
  disabledAdapter('ONDC', 'ONDC buyer app', 'Future; requires an authorised network participant.'),
];
