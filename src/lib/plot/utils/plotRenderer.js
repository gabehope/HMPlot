// @ts-check
import { useThrelte } from "@threlte/core";

/**
 * Threlte's renderer and camera for a mark, with a named error outside a Plot (2026-10-22:
 * Threlte's "useRenderer can only be used in a child component to <Canvas>" named nothing the
 * author wrote).
 */
/** @param {string} kind @returns {any} */
export function usePlotRenderer(kind) {
  try {
    return useThrelte();
  } catch {
    throw Error(
      `${kind} must be inside a Plot (a <Plot> in Svelte, a with hm.Plot(): block in Python); it draws into the Plot's canvas.`,
    );
  }
}

