// @ts-check
/**
 * Varyings (TODO 136.9): what a mark's vertex stage hands its fragment stage takes one
 * inter-stage location per varying, and WebGPU guarantees only 16 (maxInterStageShaderVariables;
 * a location must be below it).
 *
 * three's WGSL builder numbers a varying's location by its index among all of the shader's
 * varyings, including those the fragment stage never reads (positionLocal, the model-view
 * projection): a Points shader with 14 interpolated varyings used locations up to 17, and failed
 * as a WGSL validation error naming no component. Each builder here numbers the interpolated
 * ones 0, 1, 2, ... instead (the vertex output and the fragment input list them in the same
 * order, so the two stages agree).
 *
 * Every build is then checked as it is made: one past the device's limit is the mark's error
 * (limit.varyings, naming it), withdrawn when it builds within the limit again, and the view
 * keeps the most any build used (peakVaryings), which the varyings spec reads.
 */
import { limitError } from "../utils/limits.js";

/**
 * The locations a built shader uses: one per varying the fragment stage reads.
 * @param {{ varyings?: Array<{ needsInterpolation?: boolean }> }} builder
 */
export function varyingLocations(builder) {
  return (builder.varyings ?? []).filter(
    (varying) => varying.needsInterpolation,
  ).length;
}

/** `code` (a stage's varyings, WGSLNodeBuilder.getVaryings) with its locations 0, 1, 2, ... @param {string} code */
export function compactLocations(code) {
  let next = 0;
  return code.replace(
    /@location\(\s*\d+\s*\)/g,
    () => `@location( ${next++} )`,
  );
}

/**
 * @param {import("../utils/internalTypes.js").PlotRenderer} renderer
 * @param {import("../utils/internalTypes.js").ViewServices} view
 */
export function installVaryingsCheck(renderer, view) {
  const backend = /** @type {any} */ (renderer.backend),
    original = backend.createNodeBuilder;
  if (!original) return;
  backend.createNodeBuilder = function (/** @type {any[]} */ ...args) {
    const builder = original.apply(this, args),
      build = builder.build,
      getVaryings = builder.getVaryings;
    if (getVaryings)
      builder.getVaryings = function (/** @type {any[]} */ ...stage) {
        return compactLocations(getVaryings.apply(this, stage));
      };
    builder.build = function (/** @type {any[]} */ ...buildArgs) {
      const result = build.apply(this, buildArgs);
      const owner = this.object ?? args[0];
      if (!owner || typeof owner !== "object") return result;
      const count = varyingLocations(this),
        limit = backend.device?.limits?.maxInterStageShaderVariables ?? 16;
      const counters = view.diagnostics.counters;
      counters.peakVaryings = Math.max(counters.peakVaryings, count);
      const component =
        owner.componentName ??
        owner.constructor?.componentName ??
        owner.type ??
        "Plot";
      // Keyed by material: a picking build within the limit leaves its beauty build's error.
      view.diagnostics.report(
        this.material ?? owner,
        count > limit
          ? limitError("varyings", { component, count, limit })
          : null,
      );
      return result;
    };
    return builder;
  };
}
