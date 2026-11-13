import { FLY_PITCH_LIMIT } from "./camera.js";

// All navigation is in the plot's existing world plane. Data transforms (including
// datetime origins and reversed domains) have already mapped into these ranges.
export function fitOverview(
  width,
  height,
  x = [-50, 50],
  y = [-50, 50],
  stretch = false,
) {
  const left = Math.min(...x),
    right = Math.max(...x),
    bottom = Math.min(...y),
    top = Math.max(...y);
  const scale = Math.min(width / (right - left), height / (top - bottom));
  return {
    left,
    right,
    bottom,
    top,
    scale,
    scaleX: stretch ? width / (right - left) : scale,
    scaleY: stretch ? height / (top - bottom) : scale,
    x: stretch ? 0 : (width - (right - left) * scale) / 2,
    y: stretch ? 0 : (height - (top - bottom) * scale) / 2,
    width,
    height,
  };
}
export function viewportRectangle(view, fit) {
  const left = Math.max(fit.left, view.x[0]),
    right = Math.min(fit.right, view.x[1]);
  const bottom = Math.max(fit.bottom, view.y[0]),
    top = Math.min(fit.top, view.y[1]);
  return {
    x: fit.x + (left - fit.left) * (fit.scaleX ?? fit.scale),
    y: fit.y + (fit.top - top) * (fit.scaleY ?? fit.scale),
    width: Math.max(0, right - left) * (fit.scaleX ?? fit.scale),
    height: Math.max(0, top - bottom) * (fit.scaleY ?? fit.scale),
  };
}
export function clampOverviewCenter(x, y, view, fit) {
  const clamp = (v, a, b, span) =>
    span >= b - a
      ? (a + b) / 2
      : Math.max(a + span / 2, Math.min(b - span / 2, v));
  return {
    x: fit.periodic ? x : clamp(x, fit.left, fit.right, view.x[1] - view.x[0]),
    y: clamp(y, fit.bottom, fit.top, view.y[1] - view.y[0]),
  };
}
export function overviewPoint(x, y, fit) {
  return {
    x: fit.left + (x - fit.x) / (fit.scaleX ?? fit.scale),
    y: fit.top - (y - fit.y) / (fit.scaleY ?? fit.scale),
  };
}

export function viewportRectangles(view, fit, periodic = false) {
  if (!periodic) return [viewportRectangle(view, fit)];
  const period = fit.right - fit.left,
    span = view.x[1] - view.x[0];
  if (span >= period)
    return [viewportRectangle({ ...view, x: [fit.left, fit.right] }, fit)];
  const left =
    fit.left + ((((view.x[0] - fit.left) % period) + period) % period);
  return [
    viewportRectangle(
      { ...view, x: [left, Math.min(fit.right, left + span)] },
      fit,
    ),
    ...(left + span > fit.right
      ? [
          viewportRectangle(
            { ...view, x: [fit.left, left + span - period] },
            fit,
          ),
        ]
      : []),
  ];
}

/**
 * The setCamera patch that restores a 3D minimap capture: navigation (position, target, up,
 * zoom) comes from the captured fields that align() and orbit() edit, and only the lens
 * (fov, near, far) from the captured camera state, so a stale `camera` never undoes a drag.
 */
export function cameraRestorePatch(state) {
  const patch = {};
  for (const key of ["position", "target", "up", "zoom"]) if (state[key] !== undefined) patch[key] = state[key];
  for (const key of ["fov", "near", "far"]) if (state.camera?.[key] !== undefined) patch[key] = state.camera[key];
  return patch;
}

/**
 * Where a minimap axis button puts a flyover camera. Flyover's up vector defines its ground
 * plane, so the button keeps up (the orbit path writes a y-up up vector instead) and moves the
 * camera to `distance` from the target along the axis (`axis` 0-2, `sign` +-1). A view along up
 * itself, the top-down button, stops at the look pitch clamp: the target stays at the centre
 * and the camera keeps its current heading.
 */
export function flyoverAlignPosition({ position, target, up }, axis, sign, limit = FLY_PITCH_LIMIT) {
  const norm = (v) => Math.hypot(...v);
  const upward = up.map((v) => v / (norm(up) || 1));
  const offset = position.map((v, i) => v - target[i]);
  const distance = norm(offset);
  let direction = [0, 0, 0];
  direction[axis] = sign;
  const along = direction.reduce((sum, v, i) => sum + v * upward[i], 0);
  if (Math.abs(along) > limit) {
    const level = (v) => { const d = v.reduce((sum, x, i) => sum + x * upward[i], 0); return v.map((x, i) => x - d * upward[i]); };
    let heading = level(offset);
    if (norm(heading) < 1e-9 * (distance || 1)) heading = level(Math.abs(upward[0]) < 0.9 ? [1, 0, 0] : [0, 0, 1]);
    const length = norm(heading);
    const side = Math.sqrt(1 - limit * limit);
    direction = heading.map((v, i) => (v / length) * side + upward[i] * Math.sign(along) * limit);
  }
  return target.map((v, i) => v + direction[i] * distance);
}
