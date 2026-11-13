// @ts-check
/** Input preparation shared by mark channels. RGB normalization returns an owned device
 * matrix; its caller owns range-check timing, alpha and color-space policy. Temporal binding
 * borrows an axis settings owner and returns an origin shift without touching column arrays.
 */
import { numpy as np, Array as JaxArray } from "@hmplot/jax";
import { asArray } from "../utils/data.js";

/** @typedef {JaxArray | ArrayLike<unknown>} RgbComponent */
/** @typedef {JaxArray | ArrayLike<ArrayLike<unknown>>} RgbRows */
/** @typedef {{array: JaxArray, integer: boolean, where: string}} RgbRangeCheck */

/**
 * Borrow a device RGB matrix or component columns and return a new float32 matrix in [0, 1].
 * Shape, equal row counts, dtype consistency and value ranges are checked by the consumer.
 * JAX operations consume only the references acquired here, never the borrowed inputs.
 * @param {RgbRows} input
 * @param {readonly RgbComponent[] | null} components
 * @param {boolean} integer
 * @returns {JaxArray}
 */
export function normalizeRgbMatrix(input, components, integer) {
  const stacked = components
    ? np.stack(
        components.map((component) => asArray(component).astype(np.float32)),
        1,
      )
    : asArray(input).astype(np.float32);
  return integer ? stacked.mul(1 / 255) : stacked;
}

/**
 * @typedef {{get(key: string): number, derive(key: string, value: unknown): unknown,
 *   isExplicit?(key: string): boolean}} TemporalAxisOptions
 * @typedef {{origin?: number, timezone?: string}} TemporalMetadata
 */
/**
 * Bind datetime settings and return the column-to-axis origin shift in milliseconds.
 * Explicit axis origins/zones win; an automatic origin adopts the column's origin.
 * The caller applies the shift to columns, scalar dates or grid extents as appropriate.
 * @param {TemporalAxisOptions} axisOptions
 * @param {string} dimension
 * @param {TemporalMetadata} logical
 * @returns {number}
 */
export function bindDatetimeAxis(axisOptions, dimension, logical) {
  const axis = dimension.toUpperCase();
  // Derived from the column (TODO 136.7): an authored or edited axis setting stays above it.
  axisOptions.derive(`axis${axis}Type`, "datetime");
  const origin = logical.origin ?? 0;
  let shift = 0;
  // The first column bound sets the origin; later ones shift onto it.
  if (!axisOptions.isExplicit?.(`axis${axis}TimeOrigin`)) {
    axisOptions.derive(`axis${axis}TimeOrigin`, origin);
  } else {
    shift = origin - axisOptions.get(`axis${axis}TimeOrigin`);
  }
  if (!axisOptions.isExplicit?.(`axis${axis}Timezone`)) {
    axisOptions.derive(`axis${axis}Timezone`, logical.timezone ?? "UTC");
  }
  return shift;
}
