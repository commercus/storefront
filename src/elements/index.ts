/**
 * Web components for a site without a framework (Hugo, plain HTML). Configure once in the page:
 *
 *   <meta name="commercus:api" content="https://api.commercus.nl">
 *   <meta name="commercus:key" content="pk_…">
 *   <script type="module" src="https://esm.sh/@commercus/storefront/elements"></script>
 *
 * then use <commercus-cart-count>, <commercus-price variant="…">, <commercus-add-to-cart
 * variant="…">In winkelwagen</commercus-add-to-cart> and <commercus-checkout-button>.
 * They dispatch `commercus:added` and `commercus:error` events, which bubble.
 */
import { createStorefront, type Storefront } from "../storefront.js";
import { formatPrice } from "../format.js";
import { StorefrontError } from "../errors.js";

let shared: Storefront | undefined;

/** The page's storefront, from its `commercus:api` and `commercus:key` meta tags. */
export function pageStorefront(): Storefront {
  if (!shared) {
    const meta = (name: string) => document.querySelector<HTMLMetaElement>(`meta[name="commercus:${name}"]`)?.content ?? "";
    shared = createStorefront({ apiBase: meta("api"), shopKey: meta("key") });
  }
  return shared;
}

const locale = () => document.documentElement.lang || "nl-NL";

/** The number of items in the cart; hidden while it is zero. */
class CartCount extends HTMLElement {
  #off?: () => void;

  connectedCallback() {
    const storefront = pageStorefront();
    const show = (count: number) => {
      this.textContent = String(count);
      this.hidden = count === 0;
    };
    this.#off = storefront.onChange((cart) => show(cart?.itemCount ?? 0));
    storefront.cart().then((cart) => show(cart?.itemCount ?? 0), () => show(0));
  }

  disconnectedCallback() {
    this.#off?.();
  }
}

/** Today's price of `variant`; the page's own text stays until it is known. Requests are batched. */
class Price extends HTMLElement {
  static #pending = new Map<string, Price[]>();

  connectedCallback() {
    const id = this.getAttribute("variant");
    if (!id) return;
    const waiting = Price.#pending.get(id) ?? [];
    waiting.push(this);
    Price.#pending.set(id, waiting);
    if (Price.#pending.size === 1 && waiting.length === 1) queueMicrotask(Price.#flush);
  }

  static #flush = () => {
    const batch = new Map(Price.#pending);
    Price.#pending.clear();
    pageStorefront().prices([...batch.keys()]).then((prices) => {
      for (const price of prices) {
        for (const element of batch.get(price.id) ?? []) {
          element.textContent = formatPrice(price.priceGross, locale());
          element.toggleAttribute("sold-out", !price.available);
        }
      }
    }).catch(() => {});
  };
}

/**
 * Runs `build` once the element's children are there: an element may be connected before the parser
 * reached its content (a script that runs while the page loads).
 */
function whenParsed(build: () => void) {
  if (typeof document !== "undefined" && document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", build, { once: true });
  } else {
    queueMicrotask(build);
  }
}

/** A button that adds `variant` (and `quantity`, default 1) to the cart; its content is the label. */
class AddToCart extends HTMLElement {
  #built = false;

  connectedCallback() {
    whenParsed(() => {
      if (this.#built) return;
      this.#built = true;
      let button = this.querySelector("button");
      if (!button) {
        button = document.createElement("button");
        button.type = "button";
        button.append(...Array.from(this.childNodes));
        if (!button.textContent?.trim()) button.textContent = "In winkelwagen";
        this.append(button);
      }
      button.addEventListener("click", this.#add);
    });
  }

  #add = async () => {
    const button = this.querySelector("button")!;
    const variant = this.getAttribute("variant");
    if (!variant) return;
    button.disabled = true;
    try {
      const cart = await pageStorefront().add(variant, Number(this.getAttribute("quantity") ?? 1));
      this.dispatchEvent(new CustomEvent("commercus:added", { bubbles: true, detail: { cart, variant } }));
    } catch (error) {
      this.dispatchEvent(new CustomEvent("commercus:error", {
        bubbles: true,
        detail: { error, outOfStock: error instanceof StorefrontError && error.outOfStock },
      }));
    } finally {
      button.disabled = false;
    }
  };
}

/** A button to the platform's hosted checkout. */
class CheckoutButton extends HTMLElement {
  #built = false;

  connectedCallback() {
    whenParsed(() => this.#build());
  }

  #build() {
    if (this.#built) return;
    this.#built = true;
    if (!this.querySelector("button")) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = this.textContent?.trim() || "Afrekenen";
      this.replaceChildren(button);
    }
    this.querySelector("button")!.addEventListener("click", async (event) => {
      const button = event.currentTarget as HTMLButtonElement;
      button.disabled = true;
      try {
        await pageStorefront().checkout();
      } catch (error) {
        button.disabled = false;
        this.dispatchEvent(new CustomEvent("commercus:error", { bubbles: true, detail: { error } }));
      }
    });
  }
}

const define = (name: string, element: CustomElementConstructor) => {
  if (typeof customElements !== "undefined" && !customElements.get(name)) customElements.define(name, element);
};
define("commercus-cart-count", CartCount);
define("commercus-price", Price);
define("commercus-add-to-cart", AddToCart);
define("commercus-checkout-button", CheckoutButton);
