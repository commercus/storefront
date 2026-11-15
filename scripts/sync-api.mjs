// Fetches the storefront API's OpenAPI spec into api/storefront.yaml; `npm run sync-api` then
// regenerates src/generated/storefront.ts from it. Commit both. The default source is staging, which
// runs the Commercus repository's main branch; COMMERCUS_SPEC_URL names another.
import { writeFile } from "node:fs/promises";

const source = process.env.COMMERCUS_SPEC_URL ?? "https://api.commercus.ruddur.cloud/docs.yaml/storefront";
const response = await fetch(source);
if (!response.ok) throw new Error(`Could not fetch ${source}: ${response.status}`);
await writeFile(new URL("../api/storefront.yaml", import.meta.url), await response.text());
console.log(`api/storefront.yaml updated from ${source}`);
