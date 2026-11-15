import type { components } from "./generated/storefront.js";

type Schemas = components["schemas"];

/** The shop the public key belongs to. */
export type Shop = Schemas["StorefrontShop"];
/** A product in a list: lowest price, first image, categories. */
export type ProductSummary = Schemas["StorefrontProductSummary"];
/** A product with its options, variants and images. */
export type Product = Schemas["StorefrontProduct"];
export type Variant = Schemas["StorefrontVariant"];
export type ProductOption = Schemas["OptionResponse"];
export type ProductImage = Schemas["ImageResponse"];
export type Category = Schemas["StorefrontCategory"];
/** Today's price and stock of a variant. */
export type VariantPrice = Schemas["VariantPrice"];
/** The visitor's cart, priced from today's catalogue. */
export type Cart = Schemas["CartView"];
export type CartLine = Schemas["CartLineView"];
/** An order as its buyer sees it on the thank-you page. */
export type Order = Schemas["BuyerOrder"];
export type OrderLine = Schemas["OrderLineResponse"];
