// @vitest-environment happy-dom
import { h, render } from "preact";
import { act } from "preact/test-utils";
import { beforeEach, describe, expect, it } from "vitest";
import { createStorefront } from "../src/index.js";
import { useCart } from "../src/hooks/preact.js";
import { fakeApi } from "./fake-api.js";

describe("the Preact hook", () => {
  it("shows the cart and follows its changes", async () => {
    const api = fakeApi();
    const storefront = createStorefront({ apiBase: "https://api.test", shopKey: "pk_test", storage: null, fetch: api.fetch });
    function Badge() {
      const { count, loading } = useCart(storefront);
      return h("span", null, loading ? "…" : String(count));
    }
    const root = document.createElement("div");
    await act(async () => render(h(Badge, null), root));
    expect(root.textContent).toBe("0");
    await act(async () => {
      await storefront.add("v1", 3);
    });
    expect(root.textContent).toBe("3");
  });
});

describe("the web components", () => {
  beforeEach(() => {
    document.head.innerHTML = '<meta name="commercus:api" content="https://api.test"><meta name="commercus:key" content="pk_test">';
  });

  it("add to the cart from plain HTML and count it", async () => {
    const api = fakeApi();
    globalThis.fetch = api.fetch as typeof fetch;
    await import("../src/elements/index.js");
    document.body.innerHTML = '<commercus-cart-count></commercus-cart-count><commercus-add-to-cart variant="v1">Koop</commercus-add-to-cart><commercus-price variant="v9">€ 0</commercus-price>';
    const added = new Promise((resolve) => document.addEventListener("commercus:added", resolve, { once: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    document.querySelector<HTMLButtonElement>("commercus-add-to-cart button")!.click();
    await added;
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(document.querySelector("commercus-cart-count")!.textContent).toBe("1");
    expect(document.querySelector("commercus-add-to-cart button")!.textContent).toBe("Koop");
    expect(document.querySelector("commercus-price")!.textContent!.replace(/\s/g, " ")).toBe("€ 12,50");
  });
});
