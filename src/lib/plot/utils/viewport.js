import { MAX_SHARE } from "./plotLayout.js";
export function normalizeViewport(v = { x: 0.5, y: 0.5, zoom: 1 }) {
  const zoomX = Number(v.zoomX ?? v.zoom ?? 1),
    zoomY = Number(v.zoomY ?? v.zoom ?? 1);
  if (
    ![v.x, v.y, zoomX, zoomY].every(Number.isFinite) ||
    zoomX <= 0 ||
    zoomY <= 0
  )
    throw Error(
      "Viewport centers must be finite and zoom factors must be positive.",
    );
  if (v.center !== undefined && (!Array.isArray(v.center) || v.center.length !== 2 ||
      !v.center.every(Number.isFinite)))
    throw Error("Viewport center requires two finite angular values.");
  return { x: v.x, y: v.y, zoom: Math.sqrt(zoomX * zoomY), zoomX, zoomY,
    ...(v.center === undefined ? {} : { center: [...v.center] }) };
}
/**
 * The viewport `t` of the way from `from` to `to` (TODO 136.14's eased view): centers move
 * linearly, zoom factors geometrically (a zoom in looks steady), a globe's center by angle, its
 * longitude the short way round a `period` (degrees: 360).
 */
/** The shortest signed turn from angle `p` to `q` on a circle of `period`. */
const turn = (p, q, period) => (((q - p) % period) + 1.5 * period) % period - period / 2;
export function lerpViewport(from, to, t, period = 360) {
  const a = normalizeViewport(from),
    b = normalizeViewport(to),
    mix = (p, q) => p + (q - p) * t,
    zoomX = a.zoomX * (b.zoomX / a.zoomX) ** t,
    zoomY = a.zoomY * (b.zoomY / a.zoomY) ** t;
  return normalizeViewport({
    x: mix(a.x, b.x),
    y: mix(a.y, b.y),
    zoomX,
    zoomY,
    ...(b.center ? { center: a.center ? [a.center[0] + turn(a.center[0], b.center[0], period) * t, mix(a.center[1], b.center[1])] : b.center } : {}),
  });
}
export function zoomViewport(v, factor, axis = "xy", minimum = 1) {
  const n = normalizeViewport(v);
  if (!Number.isFinite(factor) || factor <= 0)
    throw Error("Zoom multiplier must be finite and positive.");
  if (axis === "xy")
    factor = Math.max(factor, minimum / Math.min(n.zoomX, n.zoomY));
  return normalizeViewport({
    ...n,
    zoomX: axis === "y" ? n.zoomX : Math.max(minimum, n.zoomX * factor),
    zoomY: axis === "x" ? n.zoomY : Math.max(minimum, n.zoomY * factor),
  });
}
export function viewportSpans(width, height, v) {
  const n = normalizeViewport(v),
    aspect = Math.max(1, width) / Math.max(1, height);
  return {
    x: (100 * Math.min(aspect, 1)) / n.zoomX,
    y: 100 / Math.max(aspect, 1) / n.zoomY,
  };
}
export function zoomDimension(x, y, w, h, axis, margins) {
  if (margins) {
    const left = Math.min(margins.left, w / 2),
      right = w - Math.min(margins.right, w / 2),
      top = Math.min(margins.top, h / 2),
      bottom = h - Math.min(margins.bottom, h / 2);
    if (x >= left && x <= right && y >= bottom) return "x";
    if (y >= top && y <= bottom && x <= left) return "y";
  }
  return axis;
}
export function anchoredZoom(view, factor, axis, point, width, height) {
  const old = normalizeViewport(view),
    next = zoomViewport(old, factor, axis),
    before = viewportSpans(width, height, old),
    after = viewportSpans(width, height, next);
  next.x += ((point.x / width - 0.5) * (before.x - after.x)) / 100;
  next.y += ((0.5 - point.y / height) * (before.y - after.y)) / 100;
  return next;
}

export function plotRectangle(width, height, margins = {}) {
  const left = Math.min(margins.left || 0, width * MAX_SHARE),
    right = width - Math.min(margins.right || 0, width * MAX_SHARE);
  const top = Math.min(margins.top || 0, height * MAX_SHARE),
    bottom = height - Math.min(margins.bottom || 0, height * MAX_SHARE);
  return {
    left,
    right,
    top,
    bottom,
    width: Math.max(1, right - left),
    height: Math.max(1, bottom - top),
  };
}
/**
 * A root frame's label room (TODO 136.15, axis.svelte's `_labelInsets`: pixels past each end of
 * an axis, in domain order) as pixels on each side of the plot area. Null without any.
 */
export function labelInsetSides(options) {
  const room = options.has?.("_labelInsets") ? options.get("_labelInsets") : null;
  if (!room) return null;
  const reversed = (axis) => { const r = options.get(axis + "range"); return Array.isArray(r) && r[1] < r[0]; };
  const [left, right] = reversed("x") ? [...(room.x ?? [0, 0])].reverse() : room.x ?? [0, 0];
  const [bottom, top] = reversed("y") ? [...(room.y ?? [0, 0])].reverse() : room.y ?? [0, 0];
  return { left, right, top, bottom };
}

/**
 * The camera's spans for a world `domain` in the plot's rectangle. `equalAspect` keeps a unit
 * the same length on x and y: a world unit, or with `units` (the data spans the world domain
 * covers, { x, y }) a data unit (aspect="equal" on a Cartesian plot, TODO 67.3: the world box
 * stretches the data's bounds onto 100 x 100 units, so equal world units are not equal data units).
 */
export function fittedLayout(
  width,
  height,
  domain,
  margins = {},
  viewport = { x: 0.5, y: 0.5, zoom: 1 },
  equalAspect = false,
  units = null,
  insets = null,
) {
  const rect = plotRectangle(width, height, margins),
    v = normalizeViewport(viewport);
  // Label room (TODO 136.15): the data fill the area inset by these pixels; the rest of the area
  // shows past the domain's ends.
  const inset = { left: 0, right: 0, top: 0, bottom: 0, ...insets },
    inner = { width: Math.max(1, rect.width - inset.left - inset.right), height: Math.max(1, rect.height - inset.top - inset.bottom) };
  const dx = Math.abs(domain.x[1] - domain.x[0]),
    dy = Math.abs(domain.y[1] - domain.y[0]);
  // World units per data unit on each axis (1 without data spans).
  const data = units && [units.x, units.y].every((u) => Number.isFinite(u) && u > 0)
    ? { x: Math.max(dx, 1e-12) / units.x, y: Math.max(dy, 1e-12) / units.y } : { x: 1, y: 1 };
  const scale = Math.min(
    inner.width / Math.max(dx / data.x, 1e-12),
    inner.height / Math.max(dy / data.y, 1e-12),
  );
  const scaleX = equalAspect ? scale / data.x : inner.width / dx,
    scaleY = equalAspect ? scale / data.y : inner.height / dy;
  const sx = width / scaleX / v.zoomX,
    sy = height / scaleY / v.zoomY;
  return {
    rect,
    x: sx,
    y: sy,
    visibleX: rect.width / scaleX / v.zoomX,
    visibleY: rect.height / scaleY / v.zoomY,
    // The inset area: its span in world units (panning keeps it within the domain, so the label
    // room stays in view at an end) and its center in canvas pixels (zooming keeps the point
    // under the pointer from it).
    insetX: inner.width / scaleX / v.zoomX,
    insetY: inner.height / scaleY / v.zoomY,
    center: { x: rect.left + inset.left + inner.width / 2, y: rect.top + inset.top + inner.height / 2 },
    offsetX: (((rect.left + inset.left + rect.right - inset.right) / 2 - width / 2) * sx) / width,
    offsetY: ((height / 2 - (rect.top + inset.top + rect.bottom - inset.bottom) / 2) * sy) / height,
  };
}

/** Merge synchronized axes without feeding a gesture back into its source. */
export function linkedViewport(local, incoming, link) {
  const previous = normalizeViewport(local),
    next = normalizeViewport(incoming);
  if (link === "none") return previous;
  return normalizeViewport({
    ...previous,
    ...(link === "xy" || link === "x"
      ? { x: next.x, zoomX: next.zoomX }
      : {}),
    ...(link === "xy" || link === "y"
      ? { y: next.y, zoomY: next.zoomY }
      : {}),
    ...(link === "xy" && next.center !== undefined ? { center: next.center } : {}),
  });
}
