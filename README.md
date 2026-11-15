# @commercus/storefront

The storefront API of [Commercus](https://commercus.nl), the webshop platform for small makers, as
one small library: the catalogue, today's prices and stock, the visitor's cart, and the hosted
checkout. It works in any frontend, with hooks for Preact and React and web components for plain
HTML. No runtime dependencies.

Payment, address and shipping happen on the platform's hosted checkout: your site never handles
personal or payment details, and there is nothing for it to get wrong.

```bash
npm install @commercus/storefront
```

## The client

```ts
import { createStorefront, formatPrice } from "@commercus/storefront";

const shop = createStorefront({
  apiBase: "https://api.commercus.nl",
  shopKey: "pk_…", // the shop's public key: safe in the page
});

const products = await shop.products();          // what is for sale
const product = await shop.product("draak");      // options, variants, images
const [price] = await shop.prices([variantId]);   // today's price and stock, for a page built earlier

await shop.add(variantId, 1);                     // the cart is made on first use
shop.onChange((cart) => console.log(cart?.itemCount));
await shop.checkout();                            // off to the hosted checkout

formatPrice(product.variants[0].priceGross);      // "€ 12,50"
```

The cart's token lives in `localStorage`, per shop. A cart that expired or became an order is
forgotten, and the next `add` starts a new one. Every write carries an `Idempotency-Key`, so a retry
after a network error does not add twice. A refusal is a `StorefrontError` with `status` and
`detail`; `error.outOfStock` is the one to show visitors.

On the thank-you page the checkout sends the buyer back with `?order=…&token=…`:

```ts
const order = await shop.order(id, token);
await shop.downloadInvoice(id, token);            // the invoice PDF
```

## Preact and React

```tsx
import { useCart, usePrices } from "@commercus/storefront/hooks/preact"; // or /hooks/react

function CartBadge() {
  const { count } = useCart(shop);
  return <a href="/winkelwagen/">🛒 {count}</a>;
}
```

`useCart(shop)` (the cart, kept in step across components, with `add`, `update`, `remove`,
`checkout`), `usePrices(shop, ids)`, `useProduct(shop, slug)`, `useOrder(shop, id, token)`.

## Plain HTML (Hugo, anything)

```html
<meta name="commercus:api" content="https://api.commercus.nl">
<meta name="commercus:key" content="pk_…">
<script type="module" src="https://esm.sh/@commercus/storefront/elements"></script>

<commercus-price variant="…">€ 12,50</commercus-price>
<commercus-add-to-cart variant="…">In winkelwagen</commercus-add-to-cart>
<commercus-cart-count></commercus-cart-count>
<commercus-checkout-button>Afrekenen</commercus-checkout-button>
```

The elements dispatch `commercus:added` and `commercus:error` (with `detail.outOfStock`).

## A shop of your own

The [storefront template](https://github.com/commercus/storefront-template) is a complete shop on
this library (Astro, static, for any S3-style hosting): fork it and make it yours.

## Developing

`npm test`, `npm run typecheck`, `npm run build`. The API's types in `src/generated/` are generated
from `api/storefront.yaml`: `npm run sync-api` fetches the current spec and regenerates them; CI fails
when they are out of step. Releases: add a changeset (`npm run changeset`); a version tag publishes
to npm with provenance.

MIT licensed.
