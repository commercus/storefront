import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createStorefront, formatPrice, StorefrontError, type TokenStorage } from "../src/index.js";
import { fakeApi } from "./fake-api.js";

function memory(): TokenStorage & { values: Map<string, string> } {
  const values = new Map<string, string>();
  return { values, getItem: (k) => values.get(k) ?? null, setItem: (k, v) => void values.set(k, v), removeItem: (k) => void values.delete(k) };
}

function setup(storage = memory()) {
  const api = fakeApi();
  const storefront = createStorefront({ apiBase: "https://api.test/", shopKey: "pk_test", storage, fetch: api.fetch });
  return { api, storefront, storage };
}

describe("the cart", () => {
  it("is made on the first add, kept by its token, and merges lines", async () => {
    const { api, storefront, storage } = setup();
    expect(await storefront.cart()).toBeNull();
    await storefront.add("v1", 2);
    const cart = await storefront.add("v1");
    expect(cart.itemCount).toBe(3);
    expect(cart.lines).toHaveLength(1);
    expect(storage.values.get("commercus-cart:pk_test")).toBe(cart.token);
    expect(api.calls.filter((c) => c.method === "POST" && c.path === "/v1/carts")).toHaveLength(1);
  });

  it("sends a fresh Idempotency-Key with every write that may be retried", async () => {
    const { api, storefront } = setup();
    await storefront.add("v1");
    await storefront.add("v2");
    const keys = api.calls.filter((c) => c.method === "POST").map((c) => c.headers["Idempotency-Key"]);
    expect(keys.every(Boolean)).toBe(true);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("starts afresh when its cart expired or was checked out", async () => {
    const storage = memory();
    storage.setItem("commercus-cart:pk_test", "cart_gone");
    const { storefront } = setup(storage);
    expect(await storefront.cart()).toBeNull();
    expect(storage.values.has("commercus-cart:pk_test")).toBe(false);

    const added = await storefront.add("v1");
    const { api: other, storefront: again } = setup(storage);
    other.carts.set(added.token, { token: added.token, status: "CHECKED_OUT", lines: [] });
    expect(await again.cart()).toBeNull();
  });

  it("adds to a new cart when the old one vanished meanwhile", async () => {
    const { api, storefront } = setup();
    const first = await storefront.add("v1");
    api.carts.delete(first.token);
    const second = await storefront.add("v2");
    expect(second.token).not.toBe(first.token);
    expect(second.itemCount).toBe(1);
  });

  it("tells listeners about every change, and removes a line at quantity 0", async () => {
    const { storefront } = setup();
    const seen: (number | null)[] = [];
    const off = storefront.onChange((cart) => seen.push(cart ? cart.itemCount : null));
    const cart = await storefront.add("v1", 2);
    await storefront.update(cart.lines[0]!.id, 5);
    await storefront.remove(cart.lines[0]!.id);
    off();
    await storefront.add("v1");
    // The new, empty cart is a change too: 0 before the first add.
    expect(seen).toEqual([null, 0, 2, 5, 0]);
    expect(storefront.cartSnapshot()?.itemCount).toBe(1);
  });

  it("checks out to the hosted checkout", async () => {
    const { storefront } = setup();
    await expect(storefront.checkout({ navigate: false })).rejects.toBeInstanceOf(StorefrontError);
    const cart = await storefront.add("v1");
    expect(await storefront.checkout({ navigate: false })).toBe(`https://api.test/checkout/chk_${cart.token}`);
  });
});

describe("errors and prices", () => {
  it("turns an API refusal into a StorefrontError with its status and detail", async () => {
    const { storefront } = setup();
    const error = await storefront.add("sold-out").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(StorefrontError);
    expect((error as StorefrontError).outOfStock).toBe(true);
    expect((error as StorefrontError).detail).toBe("Only 0 in stock");
  });

  it("asks for each variant's price once, and nothing for no variants", async () => {
    const { api, storefront } = setup();
    expect(await storefront.prices([])).toEqual([]);
    const prices = await storefront.prices(["a", "b", "a"]);
    expect(prices.map((p) => p.id)).toEqual(["a", "b"]);
    expect(api.calls.at(-1)!.path).toBe("/v1/variants?id=a&id=b");
  });

  it("formats euros the Dutch way", () => {
    expect(formatPrice(12.5).replace(/\s/g, " ")).toBe("€ 12,50");
    expect(formatPrice("1234.5", "nl-NL").replace(/\s/g, " ")).toBe("€ 1.234,50");
  });
});

describe("the contract", () => {
  it("only calls paths the storefront API describes", () => {
    const spec = readFileSync(new URL("../api/storefront.yaml", import.meta.url), "utf8");
    const described = [...spec.matchAll(/^ {2}(\/v1\/[^:]+):$/gm)].map((m) => m[1]);
    const used = [
      "/v1/shop", "/v1/products", "/v1/products/{slug}", "/v1/categories", "/v1/variants", "/v1/carts",
      "/v1/carts/{token}", "/v1/carts/{token}/items", "/v1/carts/{token}/items/{lineId}", "/v1/carts/{token}/checkout",
      "/v1/orders/{id}", "/v1/orders/{id}/invoice",
    ];
    expect(used.filter((path) => !described.includes(path))).toEqual([]);
  });
});
