import type { CartSnapshot, Storefront } from "../storefront.js";
import type { Cart, Order, Product, VariantPrice } from "../types.js";

/** The two hooks the bindings need; Preact and React both have them with the same shape. */
export interface HookRuntime {
  useState<T>(initial: T | (() => T)): [T, (value: T) => void];
  useEffect(effect: () => void | (() => void), deps?: unknown[]): void;
}

export interface AsyncState<T> {
  data: T | undefined;
  error: unknown;
  loading: boolean;
}

export interface CartState {
  /** `undefined` while loading, `null` when the visitor has no cart. */
  cart: CartSnapshot;
  loading: boolean;
  /** Item count, for a header badge. */
  count: number;
  add: Storefront["add"];
  update: Storefront["update"];
  remove: Storefront["remove"];
  checkout: Storefront["checkout"];
}

export function makeHooks({ useState, useEffect }: HookRuntime) {
  /** Runs `load` when `key` changes; the state of the latest call. */
  function useAsync<T>(load: () => Promise<T>, key: string): AsyncState<T> {
    const [state, setState] = useState<AsyncState<T>>({ data: undefined, error: undefined, loading: true });
    useEffect(() => {
      let current = true;
      setState({ data: undefined, error: undefined, loading: true });
      load().then(
        (data) => current && setState({ data, error: undefined, loading: false }),
        (error: unknown) => current && setState({ data: undefined, error, loading: false }),
      );
      return () => {
        current = false;
      };
    }, [key]);
    return state;
  }

  /** The visitor's cart, kept up to date across every component that uses it. */
  function useCart(storefront: Storefront): CartState {
    const [cart, setCart] = useState<CartSnapshot>(storefront.cartSnapshot());
    useEffect(() => {
      const off = storefront.onChange(setCart);
      storefront.cart().then(setCart, () => setCart(null));
      return off;
    }, [storefront]);
    return {
      cart,
      loading: cart === undefined,
      count: cart?.itemCount ?? 0,
      add: storefront.add,
      update: storefront.update,
      remove: storefront.remove,
      checkout: storefront.checkout,
    };
  }

  /** Today's price and stock of variants, by id. */
  function usePrices(storefront: Storefront, variantIds: string[]): AsyncState<Record<string, VariantPrice>> {
    return useAsync(
      () => storefront.prices(variantIds).then((prices) => Object.fromEntries(prices.map((p) => [p.id, p]))),
      [...variantIds].sort().join(","),
    );
  }

  function useProduct(storefront: Storefront, slug: string): AsyncState<Product> {
    return useAsync(() => storefront.product(slug), slug);
  }

  /** The order on the thank-you page; the cart is forgotten, as it became this order. */
  function useOrder(storefront: Storefront, id: string | null, token: string | null): AsyncState<Order> {
    return useAsync(async () => {
      if (!id || !token) throw new Error("No order in the address");
      storefront.forgetCart();
      return storefront.order(id, token);
    }, `${id}:${token}`);
  }

  return { useCart, usePrices, useProduct, useOrder };
}

export type { Cart };
