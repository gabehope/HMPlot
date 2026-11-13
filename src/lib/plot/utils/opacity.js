// @ts-check
import { float } from "three/tsl";

/**
 * An opacity in 0..1: clamped, and 0 where it is not finite (TODO 136.3: an opacity expression
 * above 1 speckled; only outlines clamped). The one rule for every opacity a mark reads.
 * @param {any} node
 */
export const unitOpacity = (node) =>
  float(node).abs().lessThan(1e30).select(float(node).clamp(0, 1), float(0));
