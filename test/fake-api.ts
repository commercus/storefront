/** A storefront API in memory, enough for the client's tests: carts, items, checkout, prices. */
export interface Call {
  method: string;
  path: string;
  headers: Record<string, string>;
  body: unknown;
}

export function fakeApi() {
  const calls: Call[] = [];
  const carts = new Map<string, { token: string; status: string; lines: { id: string; variantId: string; quantity: number }[] }>();
  let next = 1;
  const view = (cart: NonNullable<ReturnType<typeof carts.get>>) => ({
    token: cart.token,
    status: cart.status,
    lines: cart.lines.map((l) => ({ ...l, unitPrice: 10, lineTotal: 10 * l.quantity, problem: null })),
    subtotal: cart.lines.reduce((s, l) => s + 10 * l.quantity, 0),
    itemCount: cart.lines.reduce((s, l) => s + l.quantity, 0),
    ready: cart.lines.length > 0,
    expiresAt: "2030-01-01T00:00:00Z",
  });
  const json = (status: number, body?: unknown) =>
    new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

  const fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    const headers = Object.fromEntries(Object.entries((init?.headers ?? {}) as Record<string, string>));
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ method, path: url.pathname + url.search, headers, body });
    if (headers["X-Shop-Key"] !== "pk_test") return json(401, { detail: "Unknown key" });

    const parts = url.pathname.split("/").filter(Boolean); // v1, carts, token, items, lineId
    if (method === "POST" && url.pathname === "/v1/carts") {
      const token = `cart_${next++}`;
      carts.set(token, { token, status: "ACTIVE", lines: [] });
      return json(201, view(carts.get(token)!));
    }
    if (parts[1] === "carts" && parts[2]) {
      const cart = carts.get(parts[2]);
      if (!cart) return json(404, { detail: "No such cart" });
      if (method === "GET" && parts.length === 3) return json(200, view(cart));
      if (method === "POST" && parts[3] === "items") {
        if (cart.status !== "ACTIVE") return json(409, { detail: "The cart has been checked out" });
        const { variantId, quantity } = body as { variantId: string; quantity: number };
        if (variantId === "sold-out") return json(409, { detail: "Only 0 in stock" });
        const line = cart.lines.find((l) => l.variantId === variantId);
        if (line) line.quantity += quantity;
        else cart.lines.push({ id: `line_${next++}`, variantId, quantity });
        return json(200, view(cart));
      }
      if (method === "PATCH" && parts[3] === "items") {
        const { quantity } = body as { quantity: number };
        cart.lines = cart.lines.flatMap((l) => (l.id === parts[4] ? (quantity === 0 ? [] : [{ ...l, quantity }]) : [l]));
        return json(200, view(cart));
      }
      if (method === "POST" && parts[3] === "checkout") {
        return json(200, { checkoutUrl: `https://api.test/checkout/chk_${cart.token}`, expiresAt: "2030-01-01T00:00:00Z" });
      }
    }
    if (method === "GET" && url.pathname === "/v1/variants") {
      return json(200, url.searchParams.getAll("id").map((id) => ({ id, productId: "p", priceGross: 12.5, available: true, stock: null })));
    }
    return json(404, { detail: "Not here" });
  };

  return { fetch, calls, carts };
}
