import { useEffect, useState } from "preact/hooks";
import { type HookRuntime, makeHooks } from "./core.js";

/** The storefront's hooks for Preact (Astro islands with `@astrojs/preact`, for one). */
export const { useCart, usePrices, useProduct, useOrder } = makeHooks({ useState, useEffect } as unknown as HookRuntime);
export type { AsyncState, CartState } from "./core.js";
