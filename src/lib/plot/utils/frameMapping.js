// @ts-check
/** Coordinate-frame primitives shared by rendering, bounds, and export.
 * Definitions contain source-domain mappings, never camera state.
 */
import { LIMITS, limitError } from "./limits.js";
import {
  SCALE_TRANSFORMS,
  DEFAULT_TRANSFORM_CONSTANT,
  transformPair,
} from "./scaleTransforms.js";
/** Borrowed options needed by numerical mapping; placement matrices stay with coordinateOperations.
 * @typedef {{get(key: string): unknown, defaults?: FrameMappingOptions|null,
 *   values?: ReadonlyMap<string, unknown>, frameDefinition?: {
 *     parent?: FrameMappingOptions|null, placement?: unknown, ranges?: ReadonlySet<string>,
 *     owns(axis: string): boolean
 *   }}} FrameMappingOptions
 * @typedef {{forward(value: number): number, inverse(value: number): number}} NumericalMapping
 * @typedef {NumericalMapping & {readonly domain: readonly number[], readonly range: readonly number[],
 *   readonly transform: string, readonly constant: number}} NumericalFrameScale
 * @typedef {{domain?: readonly number[]|"auto"|null, range?: readonly number[],
 *   transform?: string, constant?: number, scale?: unknown, [key: string]: unknown}} DimensionConfig
 * @typedef {{source: FrameMappingOptions, rangeKey: string}} FrameScaleStage
 */
/** @type {readonly import("./internalTypes.js").AxisName[]} */
export const FRAME_DIMENSIONS = Object.freeze(["x", "y", "z"]);

/** Errors for domains or ranges a scale cannot represent; callers may degrade instead of crash.
 * @param {string} message
 */
function degenerateFrame(message) {
  const error = /** @type {Error & {code: string}} */ (new Error(message));
  error.code = "frame.degenerate";
  return error;
}
/** @param {unknown} error */
export const isDegenerateFrameError = (error) =>
  /** @type {{code?: unknown}|null|undefined} */ (error)?.code ===
  "frame.degenerate";

/** @param {unknown} value @param {string} label @returns {number[]} */
export function validateFrameInterval(value, label) {
  if (
    !Array.isArray(value) ||
    value.length !== 2 ||
    !value.every(Number.isFinite) ||
    value[0] === value[1]
  )
    throw degenerateFrame(`${label} requires two distinct finite values.`);
  return [...value];
}

/** A scale transform's forward and inverse (utils/scaleTransforms.js): NaN outside its
 * domain, a missing value. `constant`: symlog's c.
 * @param {string} [kind] @param {number} [constant] @returns {NumericalMapping}
 */
export function frameTransform(
  kind = "linear",
  constant = DEFAULT_TRANSFORM_CONSTANT,
) {
  if (!SCALE_TRANSFORMS[/** @type {keyof typeof SCALE_TRANSFORMS} */ (kind)])
    throw new Error(`Unsupported frame transform: ${kind}.`);
  return transformPair(kind, constant);
}

/** An immutable numerical scale. Reversed domains and destinations are valid.
 * Domain/range inputs are validated before becoming immutable numerical intervals.
 * @param {{domain: unknown, range: unknown, transform?: string, constant?: number}} config
 * @returns {NumericalFrameScale}
 */
export function createFrameScale({
  domain,
  range,
  transform = "linear",
  constant = DEFAULT_TRANSFORM_CONSTANT,
}) {
  const input = validateFrameInterval(domain, "Frame domain");
  const output = validateFrameInterval(range, "Frame range");
  const mapping = frameTransform(transform, constant);
  const low = mapping.forward(input[0]),
    high = mapping.forward(input[1]);
  if (!Number.isFinite(low) || !Number.isFinite(high) || low === high)
    throw degenerateFrame(
      `Frame ${transform} transform is incompatible with its domain.`,
    );
  return Object.freeze({
    domain: Object.freeze(input),
    range: Object.freeze(output),
    transform,
    constant,
    forward(value) {
      return (
        output[0] +
        ((mapping.forward(value) - low) / (high - low)) *
          (output[1] - output[0])
      );
    },
    inverse(value) {
      return mapping.inverse(
        low + ((value - output[0]) / (output[1] - output[0])) * (high - low),
      );
    },
  });
}

/** Decide ownership without treating an axis decoration as a scale override.
 * @param {Record<string, unknown>} [config] @param {boolean} [hasParent]
 */
export function frameDimensionMode(config = {}, hasParent = true) {
  if (!hasParent) return "local";
  return ["domain", "range", "transform", "scale"].some(
    (key) => config[key] !== undefined,
  )
    ? "local"
    : "inherited";
}

/**
 * Compose one dimension into its parent's space. An inherited destination
 * uses the parent output extent, avoiding duplicate parent scaling.
 * An explicit local transform replaces, rather than compounds, the inherited
 * transform when the destination is inherited. A range explicitly expressed
 * in parent coordinates intentionally composes both transformations.
 * @param {DimensionConfig} [config]
 * @param {NumericalFrameScale|null} [parent]
 * @param {readonly number[]|null} [inferred]
 * @returns {NumericalFrameScale|null}
 */
export function createFrameDimension(
  config = {},
  parent = null,
  inferred = null,
) {
  if (frameDimensionMode(config, !!parent) === "inherited") return parent;
  if (config.scale !== undefined)
    throw new Error(
      "Resolve explicit scale resources before preparing a numerical frame dimension.",
    );
  const automatic =
    config.domain === "auto" ||
    (config.domain === undefined && (config.range !== undefined || !parent));
  const domain = automatic ? inferred : (config.domain ?? parent?.domain);
  if (!domain) throw new Error("An automatic frame domain is not ready.");
  // A child that sets its own domain owns a linear scale unless it names a transform;
  // only a child without a domain (range-only) inherits the parent's transform.
  const inherits =
    config.transform === undefined && config.domain === undefined;
  const transform =
    config.transform ?? (inherits ? parent?.transform : undefined) ?? "linear";
  const constant =
    config.constant ??
    (inherits ? parent?.constant : undefined) ??
    DEFAULT_TRANSFORM_CONSTANT;
  const output = config.range ?? parent?.range ?? [-1, 1];
  const local = createFrameScale({
    domain,
    range: output,
    transform,
    constant,
  });
  if (!parent || config.range === undefined) return local;
  return Object.freeze({
    domain: local.domain,
    range: Object.freeze(output.map((value) => parent.forward(value))),
    transform,
    constant,
    forward: (value) => parent.forward(local.forward(value)),
    inverse: (value) => local.inverse(parent.inverse(value)),
  });
}

/** Resolve a scale chain without copying numerical data or baking camera state.
 * Each stage references its owning OptionsNode, so uniforms remain live.
 * @param {FrameMappingOptions} options @param {string} axis
 * @returns {FrameScaleStage[]}
 */
export function frameDimensionStages(options, axis) {
  /** @type {FrameMappingOptions|null|undefined} */
  let frame = options;
  while (frame && !frame.frameDefinition) frame = frame.defaults;
  /** @param {FrameMappingOptions} source @param {string} [rangeKey] */
  const flat = (source, rangeKey = axis + "range") => ({ source, rangeKey });
  if (!frame) return [flat(options)];
  // Programmatic mark overrides intentionally own an independent normalization.
  for (
    let node = /** @type {FrameMappingOptions|null|undefined} */ (options);
    node && node !== frame;
    node = node.defaults
  )
    if (
      [axis + "bounds", axis + "range", axis + "Transform"].some((k) =>
        node.values?.has(k),
      )
    )
      return [flat(options)];
  const definition =
    /** @type {NonNullable<FrameMappingOptions["frameDefinition"]>} */ (
      frame.frameDefinition
    );
  /** @type {FrameScaleStage[]|undefined} */
  let chain;
  if (definition.parent && !definition.owns(axis))
    chain = frameDimensionStages(definition.parent, axis);
  else if (
    definition.parent &&
    /** @type {ReadonlySet<string>} */ (definition.ranges).has(axis)
  )
    chain = [
      flat(frame, "_frame" + axis.toUpperCase() + "Range"),
      ...frameDimensionStages(definition.parent, axis),
    ];
  if (chain) {
    if (
      chain.every(
        ({ source }) =>
          (source.get(axis + "Transform") ?? "linear") === "linear",
      )
    )
      return [flat(options)];
    if (chain.length > LIMITS.coordinateStages.value)
      throw limitError("coordinateStages", {
        what: "a frame mapping's nonlinear scales",
        count: chain.length,
      });
    return chain;
  }
  return [flat(options)];
}

/** Like frameDimensionMapping, but null when a domain or range in the chain is degenerate.
 * @param {FrameMappingOptions} options @param {string} axis
 * @returns {NumericalMapping|null}
 */
export function tryFrameDimensionMapping(options, axis) {
  try {
    return frameDimensionMapping(options, axis);
  } catch (error) {
    if (isDegenerateFrameError(error)) return null;
    throw error;
  }
}

/** The ordered scale stages (child first) that map `axis` from data to world.
 * @param {FrameMappingOptions} options @param {string} axis
 * @returns {NumericalFrameScale[]}
 */
export function frameDimensionScales(options, axis) {
  return frameDimensionStages(options, axis).map(({ source, rangeKey }) =>
    createFrameScale({
      domain: source.get(axis + "bounds"),
      range: source.get(rangeKey),
      transform: /** @type {string} */ (
        source.get(axis + "Transform") ?? "linear"
      ),
      constant: /** @type {number} */ (
        source.get(axis + "TransformConstant") ?? DEFAULT_TRANSFORM_CONSTANT
      ),
    }),
  );
}

/** @param {FrameMappingOptions} options @param {string} axis @returns {NumericalMapping} */
export function frameDimensionMapping(options, axis) {
  const stages = frameDimensionScales(options, axis);
  return {
    forward: (value) => stages.reduce((v, stage) => stage.forward(v), value),
    inverse: (value) =>
      stages.reduceRight((v, stage) => stage.inverse(v), value),
  };
}

/** Borrowed parameter identities for change detection, not an owned/camera snapshot.
 * @param {FrameMappingOptions} options
 */
export function frameMappingSnapshot(options) {
  return FRAME_DIMENSIONS.map((axis) =>
    frameDimensionStages(options, axis).map(({ source, rangeKey }) => [
      source.get(axis + "bounds"),
      source.get(rangeKey),
      source.get(axis + "Transform"),
      source.get(axis + "TransformConstant"),
    ]),
  );
}

/** @param {FrameMappingOptions} options */
export function nonlinearFrame(options) {
  return FRAME_DIMENSIONS.some((axis) => {
    const chain = frameDimensionStages(options, axis);
    return (
      chain.length > 1 &&
      chain.some(
        ({ source }) =>
          (source.get(axis + "Transform") ?? "linear") !== "linear",
      )
    );
  });
}

/** Axis strips navigate the root coordinate system. Only inherited dimensions
 * can supply its brush column; local child scales describe a different field.
 * @param {FrameMappingOptions} options @param {string} axis @returns {boolean}
 */
export function rootFrameDimension(options, axis) {
  /** @type {FrameMappingOptions|null|undefined} */
  let node = options;
  while (node && !node.frameDefinition) {
    if (
      [axis + "bounds", axis + "range", axis + "Transform"].some((key) =>
        /** @type {FrameMappingOptions} */ (node).values?.has(key),
      )
    )
      return false;
    node = node.defaults;
  }
  if (!node?.frameDefinition) return true;
  const definition = node.frameDefinition;
  if (!definition.parent) return true;
  if (definition.placement || definition.owns(axis)) return false;
  return rootFrameDimension(definition.parent, axis);
}
