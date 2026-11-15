import { StorefrontError } from "./errors.js";
import type { Cart, Category, Order, Product, ProductSummary, Shop, VariantPrice } from "./types.js";

/** Where the cart's token is kept; `localStorage` by default. */
export interface TokenStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface StorefrontOptions {
  /** The API, e.g. `https://api.commercus.nl`. */
  apiBase: string;
  /** The shop's public key, `pk_…`: safe in a page, it identifies the shop and grants nothing more. */
  shopKey: string;
  /** Where the cart token lives; `null` keeps it in memory only (tests, server-side rendering). */
  storage?: TokenStorage | null;
  /** Defaults to the global `fetch`. */
  fetch?: typeof fetch;
}

/** The cart as last seen: `undefined` before the first look, `null` when the visitor has none. */
export type CartSnapshot = Cart | null | undefined;

export interface Storefront {
  readonly apiBase: string;
  readonly shopKey: string;

  shop(): Promise<Shop>;
  /** The products for sale, by title; optionally those in one category. */
  products(options?: { category?: string }): Promise<ProductSummary[]>;
  product(slug: string): Promise<Product>;
  categories(): Promise<Category[]>;
  /** Today's price and stock of variants, for a page built earlier. Unknown ids are left out. */
  prices(variantIds: string[]): Promise<VariantPrice[]>;

  /** The visitor's cart, or `null` when there is none (yet). Fetched once, then kept up to date. */
  cart(options?: { refresh?: boolean }): Promise<Cart | null>;
  /** The cart as last seen, synchronously; for hooks and components. */
  cartSnapshot(): CartSnapshot;
  /** Calls `listener` after every change of the cart; returns the unsubscribe. */
  onChange(listener: (cart: Cart | null) => void): () => void;
  /** Adds `quantity` of a variant, on its line if the cart has one; makes the cart on first use. */
  add(variantId: string, quantity?: number): Promise<Cart>;
  /** Sets a line's quantity; 0 removes the line. */
  update(lineId: string, quantity: number): Promise<Cart | null>;
  remove(lineId: string): Promise<Cart | null>;
  /**
   * Starts the platform's hosted checkout for the cart and, in a browser, goes there: payment and
   * personal details never touch the site. Returns the checkout's address.
   */
  checkout(options?: { navigate?: boolean }): Promise<string>;
  /** Forgets the cart, e.g. on the thank-you page: the next `add` starts a new one. */
  forgetCart(): void;

  /** The order the hosted checkout sent the buyer back with (`?order=…&token=…`). */
  order(id: string, token: string): Promise<Order>;
  /** The order's invoice as PDF; 404 until it is issued, shortly after the payment. */
  invoice(id: string, token: string): Promise<Blob>;
  /** Downloads the invoice in a browser, as `factuur.pdf`. */
  downloadInvoice(id: string, token: string, filename?: string): Promise<void>;
}

/** The browser's `localStorage`; never Node's own (which warns when it is touched), so `window` first. */
function browserStorage(): TokenStorage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function memoryStorage(): TokenStorage {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => void values.set(key, value),
    removeItem: (key) => void values.delete(key),
  };
}

const newKey = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);

/** A client of a shop's storefront API. Make one per shop and page, and share it. */
export function createStorefront(options: StorefrontOptions): Storefront {
  const apiBase = options.apiBase.replace(/\/+$/, "");
  const shopKey = options.shopKey;
  const doFetch = options.fetch ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
  const storage: TokenStorage = (options.storage === undefined ? browserStorage() : options.storage) ?? memoryStorage();
  const cartKey = `commercus-cart:${shopKey}`;

  let snapshot: CartSnapshot;
  let loading: Promise<Cart | null> | undefined;
  const listeners = new Set<(cart: Cart | null) => void>();

  async function request<T>(method: string, path: string, body?: unknown, headers?: Record<string, string>): Promise<T> {
    const response = await doFetch(apiBase + path, {
      method,
      headers: {
        "X-Shop-Key": shopKey,
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!response.ok) {
      const problem = (await response.json().catch(() => ({}))) as { detail?: string };
      throw new StorefrontError(response.status, problem.detail);
    }
    return (response.status === 204 ? null : await response.json()) as T;
  }

  function settle(cart: Cart | null): Cart | null {
    snapshot = cart;
    if (cart) storage.setItem(cartKey, cart.token);
    else storage.removeItem(cartKey);
    listeners.forEach((listener) => listener(cart));
    return cart;
  }

  async function load(): Promise<Cart | null> {
    const token = storage.getItem(cartKey);
    if (!token) return settle(null);
    try {
      const cart = await request<Cart>("GET", `/v1/carts/${encodeURIComponent(token)}`);
      // A checked-out cart became an order: the visitor starts afresh.
      return settle(cart.status === "ACTIVE" ? cart : null);
    } catch (e) {
      if (e instanceof StorefrontError && e.status === 404) return settle(null);
      throw e;
    }
  }

  async function current(create: boolean): Promise<Cart | null> {
    const cart = snapshot === undefined ? await storefront.cart() : snapshot;
    if (cart || !create) return cart;
    return settle(await request<Cart>("POST", "/v1/carts", undefined, { "Idempotency-Key": newKey() }));
  }

  const storefront: Storefront = {
    apiBase,
    shopKey,

    shop: () => request("GET", "/v1/shop"),
    products: (opts) => request("GET", "/v1/products" + (opts?.category ? `?category=${encodeURIComponent(opts.category)}` : "")),
    product: (slug) => request("GET", `/v1/products/${encodeURIComponent(slug)}`),
    categories: () => request("GET", "/v1/categories"),
    prices: (ids) =>
      ids.length === 0
        ? Promise.resolve([])
        : request("GET", "/v1/variants?" + [...new Set(ids)].map((id) => `id=${encodeURIComponent(id)}`).join("&")),

    cart(opts) {
      if (opts?.refresh || snapshot === undefined) {
        loading ??= load().finally(() => {
          loading = undefined;
        });
        return loading;
      }
      return Promise.resolve(snapshot);
    },
    cartSnapshot: () => snapshot,
    onChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    async add(variantId, quantity = 1) {
      let cart = (await current(true))!;
      try {
        cart = await request<Cart>("POST", `/v1/carts/${cart.token}/items`, { variantId, quantity }, { "Idempotency-Key": newKey() });
      } catch (e) {
        // The cart expired or was checked out meanwhile: once more, on a new one.
        if (!(e instanceof StorefrontError) || e.status !== 404) throw e;
        settle(null);
        const fresh = (await current(true))!;
        cart = await request<Cart>("POST", `/v1/carts/${fresh.token}/items`, { variantId, quantity }, { "Idempotency-Key": newKey() });
      }
      return settle(cart)!;
    },
    async update(lineId, quantity) {
      const cart = await current(false);
      if (!cart) return null;
      return settle(await request<Cart>("PATCH", `/v1/carts/${cart.token}/items/${encodeURIComponent(lineId)}`, { quantity }));
    },
    remove: (lineId) => storefront.update(lineId, 0),
    async checkout(opts) {
      const cart = await current(false);
      if (!cart) throw new StorefrontError(404, "There is no cart to check out");
      const { checkoutUrl } = await request<{ checkoutUrl: string }>("POST", `/v1/carts/${cart.token}/checkout`);
      if (opts?.navigate !== false && typeof window !== "undefined") window.location.assign(checkoutUrl);
      return checkoutUrl;
    },
    forgetCart: () => void settle(null),

    order: (id, token) => request("GET", `/v1/orders/${encodeURIComponent(id)}?token=${encodeURIComponent(token)}`),
    async invoice(id, token) {
      const response = await doFetch(`${apiBase}/v1/orders/${encodeURIComponent(id)}/invoice?token=${encodeURIComponent(token)}`, {
        headers: { "X-Shop-Key": shopKey },
      });
      if (!response.ok) throw new StorefrontError(response.status);
      return response.blob();
    },
    async downloadInvoice(id, token, filename = "factuur.pdf") {
      const url = URL.createObjectURL(await storefront.invoice(id, token));
      const link = Object.assign(document.createElement("a"), { href: url, download: filename });
      document.body.append(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    },
  };
  return storefront;
}
