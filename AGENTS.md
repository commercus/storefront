# Notes for AI agents

`@commercus/storefront`: the client of the Commercus storefront API, published to npm. Shops and
agents depend on it, so its behaviour is a contract.

## Layout

- `src/storefront.ts`: the client. The only place that calls `fetch`.
- `src/types.ts`: the public types, named on top of `src/generated/storefront.ts`.
- `src/generated/`: generated from `api/storefront.yaml` by `npm run generate`. Never edit by hand.
  `npm run sync-api` fetches the current spec (from staging, which runs Commercus' main) first.
- `src/hooks/`: `core.ts` holds the hooks once, against `useState` and `useEffect`; `preact.ts` and
  `react.ts` only pass those in.
- `src/elements/`: web components for sites without a framework.
- `test/`: vitest; `fake-api.ts` is the API in memory. `test/ui.test.ts` runs in happy-dom.

## Rules

- No runtime dependencies. React and Preact are optional peer dependencies.
- Keep the cart's behaviour: token in storage per shop, a stale cart forgotten, an Idempotency-Key on
  every POST that may be retried, every change through `settle()` so listeners hear of it.
- Errors are `StorefrontError` with the API's status and detail; never swallow one silently.
- Every change that users notice gets a changeset (`npm run changeset`): a patch for a fix, a minor
  for a new capability while we are at 0.x.
- `npm run typecheck && npm test && npm run build` before a commit.
