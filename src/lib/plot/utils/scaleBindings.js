import { scaleTransform } from "./scaleTransforms.js";
import { Array as JaxArray, numpy as np } from "@hmplot/jax";
import { asArray, shapeOf, isChannelScalar } from "./data.js";
import { diagnostic } from "./diagnostics.js";
import { kindsWith } from "./markKinds.js";
import { isExpression } from "./names.js";
import { extentSummary } from "./extentSummary.js";
import { AUTOMATIC_RANGES, continuous } from "./scaleResources.js";

const channels = {
  fill: "color",
  color: "color",
  size: "size",
  width: "width",
};
const normalizationOptions = {
  color: ["valueBounds", "valueTransform"],
  size: ["scaleBounds", "scaleTransform"],
  width: ["widthBounds", "widthTransform"],
};
const encodingOptions = {
  color: ["cmapIndex", "quantize", "levels"],
  size: ["scaleRange"],
  width: ["widthRange"],
};
// Prism and Rect read `width` (like `depth`) as a size in data units, not as a stroke width:
// they have no width scale, and binding one would set options they do not have.
const GEOMETRIC_WIDTH_KINDS = new Set(kindsWith("geometricWidth"));

export function scaleOptions(scale, family, preview = undefined, local = {}) {
  const domain = preview ?? scale.domain ?? [0, 1];
  const { transform, constant = 1, midpoint = null } = scale.normalization;
  const prefix = family === "color" ? "value" : family === "size" ? "scale" : "width";
  // symlog's constant and the midpoint (TODO 39.1-39.2) reach the mark as uniforms.
  return { ...familyOptions(scale, family, domain, transform, local),
    [`${prefix}TransformConstant`]: constant, [`${prefix}Midpoint`]: midpoint };
}
function familyOptions(scale, family, domain, transform, local) {
  if (family === "color")
    return { valueBounds: domain, valueTransform: transform,
      // Without an explicit colormap the mark keeps its inherited one (a theme default).
      cmapIndex: local.cmapIndex ?? (scale.colormapExplicit === false ? undefined : scale.colormap),
      quantize: local.quantize ?? scale.quantize,
      levels: local.levels ?? scale.levels,
      // A missing value's color (TODO 73.3): the scale's, else the inherited theme color.
      valueMissing: scale.missing };
  if (family === "size")
    return { scaleBounds: domain, scaleTransform: transform,
      scaleRange: local.scaleRange ?? scale.range ?? local.automaticRange };
  return { widthBounds: domain, widthTransform: transform,
    widthRange: local.widthRange ?? scale.range ?? local.automaticRange };
}

/**
 * The finite extent of `input` under `transform`. `rows` (a padded view's valid mask, int32 0/1)
 * leaves out rows that are not shown. Immutable/current-revision summaries share in-flight
 * work, including masked summaries; output encoding is independent of this domain inference.
 */
export async function numericExtent(input, transform, signal, rows = null, revision = {}) {
  if (signal?.aborted) throw new DOMException("Canceled", "AbortError");
  const host = isChannelScalar(input) ? input.value : input;
  if (!shapeOf(input).length && typeof host !== "number" && !(input instanceof JaxArray))
    throw Error("Continuous scales require numeric array data.");
  if (typeof host === "number" && !rows)
    return Number.isFinite(host) && scaleTransform(transform ?? "linear").inDomain(host) ? [host, host] : null;
  if (shapeOf(input).some((dimension) => dimension === 0)) return null;
  const result = await extentSummary.request(host, { ...revision, transform: transform ?? "linear", valid: rows });
  if (signal?.aborted) throw new DOMException("Canceled", "AbortError");
  return result;
}

const missingCache = new WeakMap();
/**
 * Whether `input` holds a missing value (NaN or an infinity: not finite), which a colormapped
 * channel draws in its missing color (TODO 73.3): a colorbar's "Missing" swatch. One reduction
 * and a one-value readback, shared while pending and cached for immutable columns. Mutable
 * host inputs are rechecked. Canceling one caller does not discard another caller's work.
 */
export async function hasMissingValues(input, signal) {
  if (signal?.aborted) throw new DOMException("Canceled", "AbortError");
  if (isChannelScalar(input) || typeof input === "number")
    return !Number.isFinite(isChannelScalar(input) ? input.value : input);
  if ((!shapeOf(input).length && !(input instanceof JaxArray)) || shapeOf(input).some((dimension) => dimension === 0)) return false;
  const cached = input instanceof JaxArray;
  if (cached && input.refCount <= 0) throw Error("Cannot inspect missing values in a disposed column.");
  let work = cached && missingCache.get(input);
  if (!work) {
    work = (async () => {
      const source = asArray(input);
      let finite, all;
      try {
        finite = np.isfinite(source.ref);
        all = np.all(finite.ref);
        const [value] = await all.ref.data();
        return !value;
      } finally {
        all?.dispose(); finite?.dispose(); source.dispose();
      }
    })();
    if (cached) {
      missingCache.set(input, work);
      work.catch(() => { if (missingCache.get(input) === work) missingCache.delete(input); });
    }
  }
  const missing = await work;
  if (signal?.aborted) throw new DOMException("Canceled", "AbortError");
  return missing;
}

function sourceScopeFor(scope, field, fullSource) {
  const identity = scope?.columnIdentity?.(field);
  let current = scope;
  while (identity && current?.parent && current.parent.columnIdentity?.(field) === identity)
    current = current.parent;
  if (fullSource?.columnIdentity?.(field) === identity) current = fullSource;
  return current?.has?.(field) ? current : scope;
}

/**
 * Whether `channel` is an expression the mark maps through a scale of its own. An expression
 * stands where a column would: a numeric fill or color is mapped, and a size or width when the
 * mark asks for scaling (a range, domain or transform); an unscaled size stays pixels
 * (where("@hovered", 11, 5)). It has no column identity to share a scale by, so it normalizes
 * on its own (eval pilot 2026-10-12: a population size drew as one point filling the plot).
 * @param {Record<string, unknown>} props @param {string} channel
 */
export function scaledExpression(props, channel) {
  const family = channels[channel];
  if (!family || !isExpression(props[channel])) return false;
  return family === "color" ||
    [...normalizationOptions[family], ...encodingOptions[family]].some((key) => props[key] !== undefined);
}

/**
 * Whether a mark maps `channel` through a continuous scale: an explicit one, a numeric column
 * of `scope` (not one whose values are categories or RGB), or a scaled expression.
 * @param {Record<string, any>} props @param {string} channel @param {any} scope
 * @param {{ rgb?: Record<string, unknown> | null, metadata?: Record<string, unknown> | null }} prepared
 */
export function needsContinuousScale(props, channel, scope, prepared) {
  if (prepared.rgb?.[channel]) return false;
  return Boolean(props[`${channel}Scale`]?.isContinuous ||
    (typeof props[channel] === "string" && scope?.has?.(props[channel]) && !prepared.metadata?.[channel]) ||
    scaledExpression(props, channel));
}

/** Prepare numeric mappings before making replacement mark data visible. */
export async function bindContinuousScales({ props, prepared, scope, frame, kind, owners, signal }) {
  const bindings = [], pending = [];
  for (const [channel, family] of Object.entries(channels)) {
    if (family === "width" && GEOMETRIC_WIDTH_KINDS.has(kind)) continue;
    const supplied = props[`${channel}Scale`];
    if (supplied?.isCategorical || prepared.metadata?.[channel] || prepared.rgb?.[channel]) continue;
    const field = typeof props[channel] === "string" && scope?.has?.(props[channel])
      ? props[channel] : null;
    const expression = !supplied && !field && scaledExpression(props, channel);
    if (!supplied && !field && !expression) continue;
    if (supplied && !supplied.isContinuous)
      throw Error(`${channel}Scale must be a continuous or categorical scale.`);
    const normalizationOverrides = normalizationOptions[family].filter((key) => props[key] !== undefined);
    const encodingOverrides = encodingOptions[family].filter((key) => props[key] !== undefined);
    const conflicts = [...normalizationOverrides, ...encodingOverrides];
    if (conflicts.length) {
      if (supplied)
        throw diagnostic("scale.conflicting_options",
          `${channel}Scale conflicts with ${conflicts.join(", ")}. Configure the scale resource instead.`, {
            component: kind, property: `${channel}Scale`,
            suggestion: "Move the domain and encoding options onto the explicit scale resource.",
            details: { conflicts },
          });
    }
    // A grid table's field (TODO 51) is drawn as a raster; its extent is over its values per row.
    const input = channel === "fill" && prepared.gridValues ? prepared.gridValues : prepared.props[channel];
    if (input === undefined) continue;
    // A constant color, or a literal size or width (pixels), is not scaled: a scale kept beside
    // it (fill={random ? "random" : "#547ba2"} fillScale={...}) applies once a column returns.
    if (supplied && (typeof input === "string" || (typeof input === "number" && family !== "color")))
      continue;
    // Domain and transform overrides deliberately create independent normalization, and so
    // does an expression; one without a domain takes its own values' extent under its
    // transform (a transform alone left the default [0, 1], and every value saturated).
    // Palette/range overrides remain a local encoding on the inferred shared normalization.
    if (expression || (!supplied && normalizationOverrides.length)) {
      const [boundsKey, transformKey] = normalizationOptions[family];
      if (props[boundsKey] === undefined) {
        const extent = await numericExtent(input, props[transformKey] ?? "linear", signal, prepared.valid);
        if (signal?.aborted) throw new DOMException("Canceled", "AbortError");
        if (extent) prepared.props[boundsKey] = extent;
      }
      // A size or width normalized on its own (size_domain) is a scale of its own: it takes the
      // automatic scale's output range, and its legend finds it (135.10, TODO 136.13). It drew
      // with the mark's [0, 0.5] px, and its legend said size was not mapped.
      // A domain or range the scale cannot take (one value, a log domain through 0) draws as
      // before, without a legend.
      const domain = props[boundsKey] ?? prepared.props[boundsKey];
      let scale = null;
      if (family !== "color" && domain) {
        const [rangeKey] = encodingOptions[family];
        try {
          scale = continuous({ domain, transform: props[transformKey] ?? "linear",
            range: props[rangeKey] ?? frame?.scaleDefaults?.()?.[family]?.range ?? AUTOMATIC_RANGES[family] });
        } catch { /* drawn by the mark's own options */ }
      }
      if (scale) {
        prepared.own(() => scale.dispose());
        Object.assign(prepared.props, scaleOptions(scale, family, undefined, props));
        bindings.push({ channel, family, scale, encodingOverrides,
          localEncoding: Object.fromEntries(encodingOverrides.map((key) => [key, props[key]])) });
      }
      continue;
    }
    if (input?.categories || Array.isArray(input) && input.some((value) =>
      typeof value === "string" || typeof value === "boolean"))
      throw diagnostic("scale.invalid_input",
        `${channel}Scale is continuous and requires numeric values; use categorical() or ordinal() for categories.`, {
          component: kind, property: channel,
          suggestion: "Use categorical() or ordinal(), or supply numeric values.",
        });
    const shape = shapeOf(input);
    if (shape.length !== 1 && !(shape.length === 0 && prepared.channelResults?.[channel]?.cardinality === "scalar") && !(
      family === "color" && channel === "fill" &&
      ["Heatmap", "Surface"].includes(kind) && shape.length === 2))
      throw Error(`${channel}Scale requires a one-dimensional numeric field or array.`);
    const defaults = frame?.scaleDefaults?.()?.[family] ?? {};
    if (defaults && (typeof defaults !== "object" || Array.isArray(defaults)))
      throw Error(`Axes scales.${family} must be a configuration object.`);
    const identity = field && scope.columnIdentity?.(field);
    const scale = supplied ?? frame?.scaleFor?.(identity, family, defaults);
    if (!scale) throw Error(`${channel} needs an Axes frame or an explicit scale.`);
    if (family === "color" && !scale.colormap)
      throw Error(`${channel} needs a color encoding.`);
    // A size or width scale given without a range (sizeScale=continuous({ domain }), TODO 137.4)
    // draws at the automatic scale's range, as an unscaled column does.
    // It is a fallback, not a local override: a later update({ range }) on the scale wins.
    let automaticRange;
    if (family !== "color" && !scale.range) {
      const [rangeKey] = encodingOptions[family];
      if (!supplied) throw Error(`${channel} needs a numeric range encoding.`);
      if (props[rangeKey] === undefined) automaticRange = defaults.range ?? AUTOMATIC_RANGES[family];
    }
    let preview;
    if (!scale.normalization.explicit) {
      // A scale family shared across a Facet's cells reads the Facet's whole data.
      const fullSource = frame?.facet?.sharedSource(family) ?? undefined;
      const sharedFacet = Boolean(fullSource);
      const origin = field && (scale.normalization.domainSource === "source" || sharedFacet)
        ? sourceScopeFor(scope, field, fullSource) : scope;
      const pipeline = scale.normalization.domainSource === "source"
        ? origin?.pipeline ?? [] : scope?.pipeline ?? [];
      const extentInput = field && origin !== scope ? origin.get(field) : input;
      const extentRows = origin === scope || !field ? prepared.valid : null;
      const extent = field && sharedFacet && pipeline.length
        ? await frame.facet.scaleExtent(pipeline, field, scale.normalization.transform)
        : await numericExtent(extentInput, scale.normalization.transform, signal, extentRows, {
              valueRevision: field && !(extentInput instanceof JaxArray)
                ? origin.version ?? origin.view?.version ?? origin.identity?.generation : undefined,
              maskRevision: extentRows && !(extentRows instanceof JaxArray) ? scope?.view?.version ?? scope?.version : undefined,
              batch: frame ?? scope,
            });
      if (signal?.aborted) throw new DOMException("Canceled", "AbortError");
      const owner = owners[channel] ??= {};
      preview = scale.normalization.preview(owner, extent);
      pending.push({ normalization: scale.normalization, owner, extent });
    }
    Object.assign(prepared.props, scaleOptions(scale, family, preview, { ...props, automaticRange }));
    if (family === "color" && channel === "fill" && ["Heatmap", "Surface"].includes(kind))
      prepared.props.normalization = "none";
    bindings.push({ channel, family, scale, encodingOverrides,
      localEncoding: { ...Object.fromEntries(encodingOverrides.map((key) => [key, props[key]])), automaticRange } });
  }
  prepared.commitScales = () => {
    for (const { normalization, owner, extent } of pending)
      prepared.own(normalization.contribute(owner, extent));
    pending.length = 0;
  };
  prepared.scaleBindings = bindings;
  return prepared;
}
