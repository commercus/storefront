import { useEffect, useState } from "react";
import { type HookRuntime, makeHooks } from "./core.js";

/** The storefront's hooks for React. */
export const { useCart, usePrices, useProduct, useOrder } = makeHooks({ useState, useEffect } as unknown as HookRuntime);
export type { AsyncState, CartState } from "./core.js";
