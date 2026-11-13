import { numpy as np } from "@hmplot/jax";
import { asArray, shapeOf } from "./data.js";
import { HALO_WIDTH, LEADER_WIDTH, measureLabelWidths } from "./labelAtlas.js";
import { withGenericFamily } from "./defaultFont.js";
import { labelSide } from "./labelSide.js";
import { paddedDomain, transformPair, jaxTransformValid } from "./scaleTransforms.js";
import { planProgram } from "./programs.js";
import { deviceArray, deviceScalar } from "./deviceParams.js";

const METRIC_PROGRAMS = new Map();
function labelMetrics(transforms, { position, widths, codes, size, dx, dy, rows }) {
  const n = position.shape[0];
  let width = widths, valid;
  if (codes) {
    valid = np.logicalAnd(codes.ref.greaterEqual(0), codes.ref.less(widths.shape[0]));
    width = np.take(width, np.clip(codes, 0, widths.shape[0] - 1).astype(np.int32), 0);
    valid = np.logicalAnd(valid, width.ref.greater(0));
  } else valid = width.ref.greater(0);
  if (rows) valid = np.logicalAnd(valid, rows.greater(0));
  for (const [i, transform] of transforms.entries()) {
    const values = position.ref.slice([], i), inside = jaxTransformValid(transform, values);
    valid = np.logicalAnd(valid, inside ? np.logicalAnd(np.isfinite(values.ref), inside) : np.isfinite(values.ref));
    values.dispose();
  }
  position.dispose();
  const height = size.shape.length > 1 ? size.slice([], 0) : size;
  valid = np.logicalAnd(valid, np.logicalAnd(np.isfinite(height.ref), height.ref.greater(0)));
  valid = np.logicalAnd(valid, np.logicalAnd(np.isfinite(dx.ref), np.isfinite(dy.ref)));
  const fields = [width.mul(height.ref), height.ref, dx, dy].map(field => np.broadcastTo(field, [n]));
  height.dispose();
  return { fields, valid };
}

/**
 * Pixel footprint reductions join the existing domain readback; coordinates stay on device.
 * @param {import("@hmplot/jax").Array | null | undefined} [rows] The rows shown, if not all.
 * @returns {{ fields: import("@hmplot/jax").Array[], valid: import("@hmplot/jax").Array | null }}
 */
export function labelMetricFields(props, options, rows = null) {
  const n = shapeOf(props.position)[0] ?? 0;
  if (!n) return { fields: [], valid: null };
  const strings = props.text?.categories ?? (Array.isArray(props.text) ? props.text : Array(n).fill(props.text ?? ""));
  if (!strings.length) return { fields: [], valid: np.zeros([n], { dtype: np.int32 }) };
  const widths = measureLabelWidths(strings.map(v => v == null ? "" : String(v)), withGenericFamily(props.font));
  const position = asArray(props.position),
    transforms = Array.from({ length: Math.min(3, position.shape[1]) }, (_, i) => options?.get("xyz"[i] + "Transform") ?? "linear"),
    numeric = (value) => typeof value === "number" ? deviceScalar(value) : asArray(value);
  // Numeric footprint construction is reused across live Text preparations. It joins
  // the same domain readback; no extra readback or change to label reservation semantics.
  return planProgram(METRIC_PROGRAMS, transforms, labelMetrics)({
    position, widths: deviceArray(widths.map(w => w / 64)),
    ...(props.text?.categories ? { codes: asArray(props.text.codes) } : {}),
    ...(rows?.shape[0] === n ? { rows: rows.ref } : {}),
    size: numeric(props.size ?? 12), dx: numeric(props.dx ?? 0), dy: numeric(props.dy ?? 0),
  });
}

/**
 * Conservative ink/box extents in CSS pixels, x right and y up, independent of data units.
 * @returns {Partial<Record<string, number[]>> | null} The insets by axis (x and y).
 */
export function labelInsets(metrics, props, options) {
  if (!metrics?.[0] || !metrics[1]) return null;
  const [width, size, x, y] = [metrics[0][1], metrics[1][1], metrics[2] ?? [0, 0], metrics[3] ?? [0, 0]],
    align = options?.get("align") ?? props.align ?? "center",
    // Under align "auto" a label's side follows its offset, so the leftmost offset reaches
    // furthest left and the rightmost furthest right.
    shiftAt = (offset) => ({ left: 0, center: -0.5, right: -1 })[labelSide(align, offset)],
    shiftLeft = shiftAt(x[0]), shiftRight = shiftAt(x[1]),
    box = props.box === true ? {} : props.box || null,
    // A halo (Callout's, without a box) reaches HALO_WIDTH px past the glyphs.
    halo = props._halo && !box ? HALO_WIDTH : 0,
    // Glyphs fit a plain atlas cell, 88/64 font sizes tall; allow its antialiased overhang too.
    pad = Math.max(size / 16 + halo, box ? Math.max(0, box.padding ?? 4) : 0),
    half = Math.max(size * 88 / 128 + halo, box ? size * 0.6 + Math.max(0, box.padding ?? 4) : 0),
    scale = Math.max(0, Number(options?.get("displayScale") ?? props.displayScale ?? 1)),
    leader = props.leader ? Math.max(0, (props.leader === true ? LEADER_WIDTH : props.leader.width ?? LEADER_WIDTH)) / 2 * scale : 0;
  return { x: [Math.max(leader, -(x[0] + width * shiftLeft - pad) * scale) + 1,
    Math.max(leader, (x[1] + width * (shiftRight + 1) + pad) * scale) + 1],
  y: [Math.max(leader, (y[1] + half) * scale) + 1, Math.max(leader, (-y[0] + half) * scale) + 1] };
}

/** Fit pixels and ordinary fractional padding together in transformed space. */
export function screenPaddedDomain(domain, { transform = "linear", constant = 1, padding = 0, pixels = 0, inverted = false } = {}) {
  // An anchored end (a bar's or area's 0 baseline, TODO 134.27) gets no ordinary padding.
  const anchored = domain.anchored ?? [false, false];
  const padded = paddedDomain(domain, transform, padding, constant), screen = domain.screen;
  const base = [anchored[0] ? domain[0] : padded[0], anchored[1] ? domain[1] : padded[1]];
  if (!screen || !(pixels > 0)) return base;
  const { forward, inverse } = transformPair(transform, constant), a = forward(base[0]), b = forward(base[1]);
  if (![a, b].every(Number.isFinite)) return base;
  // Oversized labels cannot fit; cap the reservation so tiny plots keep finite domains.
  const [left, right] = (inverted ? [...screen].reverse() : screen).map(value => Math.max(0, value / pixels));
  const rawA = forward(domain[0]), rawB = forward(domain[1]), span = b - a,
    ordinary = domain[0] === domain[1] ? 0 : padding / (1 + 2 * padding),
    total = Math.max(anchored[0] ? 0 : ordinary, left) + Math.max(anchored[1] ? 0 : ordinary, right), cap = total > 0.9 ? 0.9 / total : 1,
    low = Math.max(anchored[0] ? 0 : ordinary, left) * cap, high = Math.max(anchored[1] ? 0 : ordinary, right) * cap,
    length = (domain[0] === domain[1] ? span : rawB - rawA) / (1 - low - high),
    lo = (domain[0] === domain[1] ? a : rawA) - length * low,
    hi = (domain[0] === domain[1] ? b : rawB) + length * high,
    start = inverse(lo), end = inverse(hi);
  return [Number.isFinite(start) ? start : transform === "sqrt" ? 0 : base[0], Number.isFinite(end) ? end : base[1]];
}

/** Project screen-aligned text onto a frame side's inward normal (including reversed/rotated Frames). */
export function projectedInsets(screen, cross, normal, axis) {
  const x = axis === "x" ? screen : cross, y = axis === "y" ? screen : cross;
  if (!x || !y) return screen;
  return [0, 1].map(end => Math.abs(normal[0]) * x[normal[0] < 0 ? 1-end : end] +
    Math.abs(normal[1]) * y[normal[1] < 0 ? 1-end : end]);
}
