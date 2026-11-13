// @ts-check
/** @typedef {import("./captureTypes").CapturedField} CapturedField */
/** @typedef {import("./captureTypes").BorrowedField} BorrowedField */
/** @typedef {import("./captureTypes").CapturedMarkRows} CapturedMarkRows */
/** @typedef {import("../effectiveFieldBinding.js").EffectiveFieldBinding} EffectiveFieldBinding */
/** @typedef {import("./captureTypes").CaptureMark} CaptureMark */
/** @typedef {import("./captureTypes").CaptureOptions} CaptureOptions */
import { renderScaleValue } from "../scaleTransforms.js";
import { COLORMAP_NAMES, colormapInterpolator, colormapTexel, MISSING_COLOR, missingColorOf } from "../colormap.js";
import { Array as JaxArray } from "@hmplot/jax";
import { Color } from "three/webgpu";
import { isChannelScalar } from "../data.js";
import { acquireMarkBinding } from "../markBinding.js";
export { renderScaleValue as colormapPosition };

/** @param {unknown} value */
export const finite = (value) => Number.isFinite(Number(value));
/** @param {unknown} value */
const clamp01 = (value) => Math.max(0, Math.min(1, Number(value)));

/** @param {BorrowedField | undefined} field @returns {Promise<CapturedField>} */
export async function fieldValue(field) {
  const value = field?.data;
  // JAX-JS methods consume their Array receiver. Borrow a reference for the
  // explicit export readback so serializing a document cannot free the live
  // field retained by BufferedField.
  if (value instanceof JaxArray) {
    const data = await value.ref.data();
    return value.shape.length ? { data, shape: value.shape } : { scalar: data[0] };
  }
  if (isChannelScalar(value)) return { scalar: /** @type {{ value: unknown }} */ (value).value };
  if (typeof value === "number" || typeof value === "string") return { scalar: value };
  if (value && typeof value === "object" && "toArray" in value && typeof value.toArray === "function")
    return { scalar: value.toArray() };
  if (Array.isArray(value) || ArrayBuffer.isView(value)) {
    const data = /** @type {ArrayLike<unknown> & { shape?: readonly number[] }} */ (value);
    return { data, shape: data.shape ?? [data.length] };
  }
  return { scalar: field?.uniformNode?.value };
}

/**
 * A connection-backed or transitioning mark's drawn rows: its live GPU buffer, which the
 * gather/transition writes in place (field.data holds the uploaded target), `width`
 * components a row (3 for positions, 4 for endpoint pixel offsets). One readback per field and
 * export.
 * @param {CaptureMark} mark
 * @param {string} name
 * @returns {Promise<CapturedField>}
 */
export async function liveRows(mark, name, width = 3) {
  const field = mark.fields.get(name), attribute = field?.bufferNodeSource, backend = mark.renderer?.backend;
  const changing = mark.positionSpace === "world" || attribute && "transition" in attribute && attribute.transition;
  const buffer = changing && field?.isBufferNode && attribute
    ? backend?.get?.(attribute)?.buffer : null;
  if (!buffer || !backend || !field || !attribute || !("itemSize" in attribute)) {
    // Uniform interpolation updates the bound node while data retains its target.
    if (field?.isBufferNode === false && field.uniformNode?.value !== undefined)
      return { scalar: field.uniformNode.value };
    return fieldValue(field);
  }
  const device = backend.device, stride = attribute.itemSize, count = field.count, bytes = count * stride * 4;
  if (!bytes) return { data: new Float32Array(0), shape: [0, width] };
  const staging = device.createBuffer({ size: bytes, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
  try {
    const encoder = device.createCommandEncoder();
    encoder.copyBufferToBuffer(buffer, 0, staging, 0, bytes);
    device.queue.submit([encoder.finish()]);
    await staging.mapAsync(GPUMapMode.READ);
    const raw = new Float32Array(staging.getMappedRange()), data = new Float32Array(count * width);
    for (let i = 0; i < count; i++) data.set(raw.subarray(i * stride, i * stride + width), i * width);
    return { data, shape: [count, width] };
  } finally { staging.destroy(); }
}

/** @param {CapturedField} value @param {number} i */
export function element(value, i, channels = 1) {
  if (value.scalar !== undefined) return value.scalar;
  const data = value.data;
  if (!data) return undefined;
  if (Array.isArray(data[i])) return data[i];
  const stride = value.shape?.at(-1) === channels && (value.shape?.length ?? 0) > 1 ? channels : 1;
  if (stride === 1) return data[i];
  return Array.from({ length: stride }, (_, c) => data[i * stride + c]);
}

/** @param {unknown} value @returns {string | null} */
export function color(value) {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    if ("isColor" in value && value.isColor && "getHexString" in value && typeof value.getHexString === "function")
      return `#${value.getHexString()}`;
    if ("toArray" in value && typeof value.toArray === "function") return color(value.toArray());
  }
  if (Array.isArray(value) || ArrayBuffer.isView(value)) {
    const components = /** @type {ArrayLike<number>} */ (value);
    if (components.length >= 3 && [0, 1, 2].every((i) => finite(components[i]))) {
      const c = new Color().setRGB(components[0], components[1], components[2]);
      return `#${c.getHexString()}`;
    }
  }
  return null;
}

/** The color a mark draws a missing value in (TODO 73.3), as a CSS color. */
/** @param {CaptureMark} mark */
const missingColor = (mark) => color(missingColorOf(mark)) ?? MISSING_COLOR;
/**
 * A mark's color for each row of an export (TODO 70.1), as its shader computes it (objects/base.js
 * getColorNode): a category's color; a number through the mark's scale (valueBounds,
 * valueTransform with its constant and midpoint, valueRange) and colormap (cmapIndex, quantize,
 * levels), sampled as the GPU samples its colormap texture; otherwise the mark's color. `channel`
 * is the field holding the values ("fill" or "color"). Returns (i) => a CSS color, or null for a
 * row the shader leaves out.
 * @param {CaptureMark} mark
 * @param {string} channel
 * @returns {Promise<(row: number) => string | null>}
 */
export async function exportColors(mark, channel, baseOnly = false) {
  if (!baseOnly && mark.fields.has("geoPaint")) {
    const paint = await fieldValue(mark.fields.get("geoPaint")), base = await exportColors(mark, channel, true);
    return (i) => { const rgba = element(paint, i, 4);
      return Array.isArray(rgba) && Number(rgba[3]) >= 2 ? color(rgba) : base(i); };
  }
  if (mark.categoryColorActive) {
    const rows = await liveRows(mark, "categoryColor", 3);
    return (i) => color(element(rows, i, 3));
  }
  const field = /** @type {EffectiveFieldBinding | undefined} */ (mark.fields.get(channel));
  // The literal's hollow flag is separate from its RGB-only uniform placeholder.
  // Capturing that displayed black vector would turn a transparent interior opaque.
  if (field?.type?.name === "fill" && field.isBufferNode === false && field.data === "transparent")
    return () => "transparent";
  // FillType's literal branch draws the option binding, not its last uploaded field.data.
  // Settings edits and option animation can change that color without rewriting the field.
  // A transparent fill remains hollow when the color option changes.
  if (field?.type?.name === "fill" && field.isBufferNode === false && field.data !== "transparent" && mark.options.has?.("fillColor")) {
    const value = mark.animatedOptionNodes?.get("fillColor")?.value ?? mark.options.get("fillColor"),
      current = color(value);
    if (current !== null) return () => current;
  }
  const values = await liveRows(mark, channel, field?.type?.name === "fill" ? 1 : 3);
  if (!(field?.type?.name === "fill" && field.isBufferNode)) {
    const fallback = color(mark.options.get("fillColor")) ?? "#4682b4";
    return (i) => color(element(values, i, 3)) ?? fallback;
  }
  const o = mark.options;
  /** @template {keyof CaptureOptions} K @param {K} key @param {CaptureOptions[K]} fallback */
  const read = (key, fallback) => o.get(key) ?? fallback;
  // The option holds the colormap as given (a name or a custom spec); the texture's row only on screen.
  const raw = read("cmapIndex", "Viridis");
  let spec = typeof raw === "number" ? COLORMAP_NAMES[raw] ?? "Viridis" : raw || "Viridis", interpolate;
  try { interpolate = colormapInterpolator(spec); } catch { spec = "Viridis"; interpolate = colormapInterpolator(spec); }
  const constant = read("valueTransformConstant", 1), midpoint = read("valueMidpoint", null);
  const scale = { domain: read("valueBounds", [0, 1]), range: read("valueRange", [0, 1]), transform: read("valueTransform", "linear"),
      constant: typeof constant === "number" && Number.isFinite(constant) && constant > 0 ? constant : 1, midpoint },
    sampling = { quantize: !!read("quantize", false), levels: Number(read("levels", 10)), interpolate }, cache = new Map();
  const missing = missingColor(mark);
  return (i) => {
    const value = Number(element(values, i));
    // A missing value (NaN, or the huge sentinel a missing number arrives as) is the missing color,
    // as base.js getColorNode draws it (TODO 73.3).
    if (!(Math.abs(value) < 1e30)) return missing;
    const t = renderScaleValue(value, scale);
    if (t === null) return null;
    const key = Number.isNaN(t) ? "NaN" : t;
    if (!cache.has(key)) cache.set(key, colormapTexel(spec, t, sampling));
    return cache.get(key);
  };
}

/** @param {CaptureMark} mark @param {unknown} value */
export function sizeValue(mark, value) {
  const raw = Array.isArray(value) ? value[0] : value;
  if (mark.options.get("sizeUnits") === "data") return Number(raw ?? 0);
  if (typeof mark.pixelSizeNode?.value === "number") return mark.pixelSizeNode.value;
  // The shader's map, midpoint included; NaN (not drawn) outside the transform's domain.
  return renderScaleValue(Number(raw), {
    domain: mark.options.get("scaleBounds") ?? [0, 1], range: mark.options.get("scaleRange") ?? [0, 0.5],
    transform: mark.options.get("scaleTransform") ?? "linear",
    constant: mark.options.get("scaleTransformConstant") ?? 1, midpoint: mark.options.get("scaleMidpoint"),
  }) ?? NaN;
}

/**
 * A mark's rows as its writers read them (one readback per field): positions (a segment-like
 * mark's starts and ends), sizes or widths, each row's color (exportColors), symbols, outline
 * colors, pixel offsets, the rows a padded view shows, and each row's stroke width (CSS pixels)
 * and opacity as the shader computes them. These host values are export inputs, not owners
 * of the mark's arrays. Only liveRows' temporary staging buffer needs disposal.
 * @param {CaptureMark} mark
 * @returns {Promise<CapturedMarkRows>}
 */
export async function captureMarkRows(mark) {
  const name = mark.exportKind,
    segmentLike = ["segments", "line", "geo-segments", "billboard-arrows", "band", "errorbars", "solid-arrows"].includes(name),
    positions = await liveRows(mark, segmentLike ? "start" : "position"),
    ends = segmentLike ? await liveRows(mark, "end") : null,
    sizes = await fieldValue(mark.fields.get(segmentLike ? "width" : "size")),
    colorAt = await exportColors(mark, segmentLike ? "color" : "fill"),
    symbolCodes = name === "points" && mark.symbolCodeActive ? await fieldValue(mark.fields.get("symbolCode")) : null,
    outlineColors = mark.categoryOutlineActive ? await fieldValue(mark.fields.get("categoryOutline")) : null,
    offsetsX = name === "points" || name === "labels" ? await fieldValue(mark.fields.get("dx")) : null,
    offsetsY = name === "points" || name === "labels" ? await fieldValue(mark.fields.get("dy")) : null;
  const count = mark.count;
  // A mark drawing a padded view's physical rows (TODO 17.3b) exports only its valid rows: the
  // accepted binding's, held while they are read (Stage 117.2).
  const held = acquireMarkBinding(mark), valid = held.value?.rows.valid;
  let shown = null;
  try { if (valid?.shape?.[0] === count) shown = Array.from(await valid.ref.data(), Number); }
  finally { held.release(); }
  const shownCount = shown ? shown.reduce((sum, value) => sum + Number(value > 0), 0) : count;
  const channelOpacity = mark.fields.has("_channelOpacity") ? await liveRows(mark, "_channelOpacity", 1) : null;
  const markOpacity = clamp01(channelOpacity ? element(channelOpacity, 0) : mark.options.get("opacity") ?? 1),
    displayScale = Number(mark.options.get("displayScale") ?? 1) * Number(mark.renderScaleNode?.value ?? 1);
  // Segments.applyWidth maps row widths in pixels, or world units for Arrows3D.
  // Literal widths bypass that mapping.
  const widthScale = {
      domain: mark.options.get("widthBounds") ?? [0, 1], range: mark.options.get("widthRange") ?? [0, 1],
      transform: mark.options.get("widthTransform") ?? "linear",
      constant: mark.options.get("widthTransformConstant") ?? 1, midpoint: mark.options.get("widthMidpoint"),
    },
    widthLiteral = mark.widthLiteral;
  /** @param {number} i */
  const strokeWidthAt = (i) => {
    const widthValue = Number(element(sizes, i) ?? (name === "billboard-arrows" ? 2 : 1));
    return (widthLiteral ? widthValue : renderScaleValue(widthValue, widthScale) ?? NaN) * displayScale;
  };
  // Per-row opacity (opacity columns, RGBA alpha, selection dimming) rides the
  // interactionOpacity field; the option holds only the mark-wide factor.
  const rowOpacities = mark.fields?.has("interactionOpacity") ? await liveRows(mark, "interactionOpacity", 1) : null;
  const geoOpacity = mark.fields.has("geoOutlineOpacity") ? await fieldValue(mark.fields.get("geoOutlineOpacity")) : null;
  /** @param {number} i */
  const opacityAt = (i) => {
    const row = rowOpacities ? Number(element(rowOpacities, i)) : 1;
    const border = geoOpacity ? Number(element(geoOpacity, i)) : 1;
    return Number((markOpacity * (Number.isFinite(row) ? clamp01(row) : 1) * (Number.isFinite(border) ? clamp01(border) : 0)).toFixed(4));
  };
  const borderWidths = mark.fields.has("outlineWidth") ? await fieldValue(mark.fields.get("outlineWidth")) : null;
  const borderOpacities = mark.fields.has("outlineOpacity") ? await fieldValue(mark.fields.get("outlineOpacity")) : null;
  /** @param {number} i */
  const outlineAt = (i) => {
    const alpha = Number(borderOpacities ? element(borderOpacities, i) : mark.options.get("outlineOpacity") ?? 1);
    const width = Number(borderWidths ? element(borderWidths, i) : mark.options.get("outlineWidth") ?? 0);
    return { color: outlineColors ? color(element(outlineColors, i, 3)) : color(mark.options.get("outlineColor")),
      width: Number.isFinite(width) ? Math.max(0, width) * displayScale : 0,
      opacity: Number.isFinite(alpha) ? clamp01(alpha) : 0 };
  };
  return { positions, ends, sizes, colorAt, symbolCodes, outlineColors, outlineAt, offsetsX, offsetsY, shown, shownCount, displayScale,
    strokeWidthAt, opacityAt };
}
