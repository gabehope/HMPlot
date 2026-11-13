/** Camera math shared by the 3D scene and the flyover controls; plain arrays, no three.js. */

const sub = (a, b) => a.map((v, i) => v - b[i]);
const add = (a, b) => a.map((v, i) => v + b[i]);
const scale = (a, s) => a.map((v) => v * s);
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const length = (a) => Math.hypot(...a);
const normalize = (a) => { const l = length(a) || 1; return a.map((v) => v / l); };
const dot = (a, b) => a.reduce((sum, v, i) => sum + v * b[i], 0);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/**
 * World-space offset that pans the camera (and its target) along the ground: the plane
 * perpendicular to `up` (x-z for the default y-up). Like grabbing the ground, dragging right
 * moves the camera left and dragging down moves it forward; height never changes. One pixel
 * moves about one pixel's worth of world at the focus distance. Flyover uses this rate-based
 * pan only where there is no ground point to anchor: spherical globe views, and a camera on
 * the ground plane itself. Map-style drags use `groundPoint` + `anchorPan`.
 */
export function panOffset({ position, target, up }, dx, dy, { fov = 50, height = 1, speed = 1 } = {}) {
  const upward = normalize(up);
  const view = normalize(sub(target, position));
  let right = cross(view, upward);
  // Looking straight along up: fall back to the ground axis least aligned with up.
  if (length(right) < 1e-6) {
    const axis = Math.abs(upward[0]) < 0.9 ? [1, 0, 0] : [0, 0, 1];
    right = axis.map((v, i) => v - upward[i] * dot(axis, upward));
  }
  right = normalize(right);
  // Forward along the ground; looking straight down, "forward" is the screen's up direction.
  let forward = view.map((v, i) => v - upward[i] * dot(view, upward));
  if (length(forward) < 1e-6) forward = cross(upward, right);
  forward = normalize(forward);
  const distance = Math.max(1e-6, length(sub(target, position)));
  const worldPerPixel = (distance * 2 * Math.tan((fov * Math.PI) / 360)) / Math.max(1, height);
  const scale = worldPerPixel * speed;
  return right.map((r, i) => (-dx * r + dy * forward[i]) * scale);
}

/** Pixels per wheel unit for WheelEvent.deltaMode 0 (pixels), 1 (lines), and 2 (pages). */
export const WHEEL_UNITS = [1, 16, 400];

/**
 * Signed distance to move along the view direction for one wheel event: scrolling down (or
 * pinching out) moves back, like 2D zoom out. Proportional to the focus distance and clamped
 * to half of it per event, so one fast flick cannot pass through the target. Flyover uses
 * this view-axis dolly only for spherical globe views; map-style zoom is `zoomToward`.
 */
export function wheelStep(deltaY, deltaMode = 0, focusDistance = 1, speed = 1) {
  const pixels = deltaY * (WHEEL_UNITS[deltaMode] ?? 1);
  const step = -pixels * 0.001 * focusDistance * speed;
  const limit = focusDistance * 0.5;
  return Math.max(-limit, Math.min(limit, step));
}

/**
 * Flyover's look pitch clamp: |forward . up| never exceeds this (about 10 degrees short of
 * straight up or down), so lookAt stays well defined and the up vector keeps its meaning.
 */
export const FLY_PITCH_LIMIT = 0.985;

/** Holding Shift triples flyover speed (keys and wheel; the drag is anchored, so it has no rate). */
export const SHIFT_MULTIPLIER = 3;

/** Bounds of `flySpeed`; values outside are clamped, non-numbers become 1. */
export const FLY_SPEED_RANGE = [0.1, 10];
export function clampFlySpeed(value) {
  return Number.isFinite(value) ? clamp(value, FLY_SPEED_RANGE[0], FLY_SPEED_RANGE[1]) : 1;
}

/**
 * Camera basis vectors for a look-at state, built as three's Matrix4.lookAt builds them:
 * `forward` toward the target, `right = forward x up`, and `screenUp = right x forward`.
 */
export function cameraBasis({ position, target, up }) {
  const forward = normalize(sub(target, position));
  const upward = normalize(up);
  let right = cross(forward, upward);
  if (length(right) < 1e-9) {
    const axis = Math.abs(upward[0]) < 0.9 ? [1, 0, 0] : [0, 0, 1];
    right = cross(forward, axis);
  }
  right = normalize(right);
  return { forward, right, screenUp: normalize(cross(right, forward)) };
}

/**
 * The world-space ray through a normalized device coordinate ([-1, 1] each way, y up) of a
 * perspective camera: fov (degrees), aspect and zoom all count, as with Vector3.unproject.
 */
export function cursorRay(state, ndc, { aspect = 1 } = {}) {
  const { forward, right, screenUp } = cameraBasis(state);
  const half = Math.tan(((state.fov ?? 50) * Math.PI) / 360) / (state.zoom || 1);
  const direction = normalize(
    forward.map((f, i) => f + right[i] * ndc[0] * half * aspect + screenUp[i] * ndc[1] * half),
  );
  return { origin: [...state.position], direction };
}

/** Signed height of a point above the ground plane G (through the origin, normal `up`). */
export function groundHeight(point, up) {
  return dot(point, normalize(up));
}

/**
 * Distance along a ray to the ground plane G: Infinity when the ray is parallel to G or
 * points away from it (the sky).
 */
export function groundDistance({ origin, direction }, up) {
  const normal = normalize(up);
  const slope = dot(direction, normal);
  if (Math.abs(slope) < 1e-12) return Infinity;
  const t = -dot(origin, normal) / slope;
  return t > 0 ? t : Infinity;
}

/**
 * Horizon cap H: how far along a cursor ray a grab may reach, so rays near and above the
 * horizon anchor at a finite distance. Tuned: 20 heights (at least 20 units) and never past
 * 0.9 of the far plane.
 */
export function horizonCap(height, far = 2000) {
  return Math.min(0.9 * far, 20 * Math.max(Math.abs(height), 1));
}

/** The point at min(t, H) along a ray, on the ray (not projected): the wheel zooms toward it. */
export function rayPoint(ray, up, far = 2000) {
  const t = Math.min(groundDistance(ray, up), horizonCap(groundHeight(ray.origin, up), far));
  return add(ray.origin, scale(ray.direction, t));
}

/**
 * The ground point a cursor ray grabs: `rayPoint` projected onto G. The cap makes it
 * continuous across the horizon, so a drag that crosses the horizon does not jump.
 */
export function groundPoint(ray, up, far = 2000) {
  const normal = normalize(up);
  const point = rayPoint(ray, up, far);
  return sub(point, scale(normal, dot(point, normal)));
}

/**
 * Translation that brings the anchored ground point A back under the cursor: A - B, where B
 * is the ground point under the cursor from the current camera. Lies in G, so height and
 * orientation are unchanged, and the ray through the cursor then meets G at A again.
 */
export function anchorPan(anchor, ray, up, far = 2000) {
  return sub(anchor, groundPoint(ray, up, far));
}

/**
 * Log zoom factor k for one wheel event: k = clamp(pixels * 0.001 * speed * shift, -0.7, 0.7),
 * scrolling up (deltaY < 0) approaches the point under the cursor and scrolling down backs
 * away. Shift+wheel arrives as horizontal scroll in Chrome: pass deltaX as `delta` then.
 */
export function zoomStep(delta, deltaMode = 0, speed = 1, shift = false) {
  const pixels = delta * (WHEEL_UNITS[deltaMode] ?? 1);
  return clamp(pixels * 0.001 * speed * (shift ? SHIFT_MULTIPLIER : 1), -0.7, 0.7);
}

/**
 * Log zoom factor k for a two-finger pinch whose spread (the distance between the fingers, in
 * pixels) went from `previous` to `spread`: k = log(previous / spread), so spreading the
 * fingers approaches the point under their midpoint and whatever is there grows with the
 * spread, as in map apps. Clamped like the wheel step; 0 under a pixel of spread. flySpeed and
 * Shift do not apply: the fingers set the rate, as the drag's anchor does.
 */
export function pinchStep(previous, spread) {
  if (!(previous >= 1 && spread >= 1)) return 0;
  return clamp(Math.log(previous / spread), -0.7, 0.7);
}

/**
 * Move the camera along the line through the anchor Z: P' = Z + (P - Z) * exp(k). Approaching
 * stops at `minDistance` from Z and backing away at `maxDistance`; a camera already inside a
 * bound is never pushed out by the bound.
 */
export function zoomToward(position, anchor, k, { minDistance = 0, maxDistance = Infinity } = {}) {
  const offset = sub(position, anchor);
  const distance = length(offset);
  if (distance < 1e-12) return [...position];
  let next = distance * Math.exp(k);
  if (k < 0) next = Math.max(Math.min(minDistance, distance), next);
  else next = Math.min(Math.max(maxDistance, distance), next);
  return add(anchor, scale(offset, next / distance));
}

/** The closest the map-style zoom approaches its anchor. */
export function zoomMinDistance(near, sceneSize) {
  return Math.max(4 * near, 1e-3 * sceneSize);
}

/**
 * Re-seat the flyover target on the centre ray at min(t, H), floored at `minDistance`, so
 * `target` reports the ground point at the centre of the screen and orbit hands over cleanly.
 */
export function reseatTarget({ position, target, up }, far = 2000, minDistance = 1e-3) {
  const direction = normalize(sub(target, position));
  const ray = { origin: position, direction };
  const t = Math.max(
    minDistance,
    Math.min(groundDistance(ray, up), horizonCap(groundHeight(position, up), far)),
  );
  return add(position, scale(direction, t));
}

/** Flyover key velocity (units per second): scales with the height above the ground. */
export function flyVelocity(height, sceneSize = 0, speed = 1, shift = false) {
  return Math.max(2, 0.7 * Math.abs(height), 0.01 * sceneSize) * speed * (shift ? SHIFT_MULTIPLIER : 1);
}

const CAMERA_KEYS = ["position", "target", "up", "fov", "near", "far", "zoom"];
const vector = (value) => Array.isArray(value) && value.length === 3 && value.every(Number.isFinite);

/**
 * Why one camera value is invalid, or "" when it is fine. `context` supplies the near/far
 * counterpart so a partial patch can be checked against the current camera.
 */
export function cameraValueIssue(key, value, context = {}) {
  if (value === undefined) return "";
  switch (key) {
    case "position":
    case "target":
      return vector(value) ? "" : `${key} must be [x, y, z] finite numbers.`;
    case "up":
      if (!vector(value)) return "up must be [x, y, z] finite numbers.";
      return length(value) > 1e-9 ? "" : "up must not be the zero vector.";
    case "fov":
      return Number.isFinite(value) && value > 0 && value < 180 ? "" : "fov must be between 0 and 180 degrees.";
    case "zoom":
      return Number.isFinite(value) && value > 0 ? "" : "zoom must be a positive number.";
    case "near": {
      if (!(Number.isFinite(value) && value > 0)) return "near must be a positive number.";
      const far = context.far;
      return far === undefined || value < far ? "" : `near must be less than far (got ${value} and ${far}).`;
    }
    case "far": {
      if (!Number.isFinite(value)) return "far must be a finite number.";
      const near = context.near;
      return near === undefined || value > near ? "" : `far must be greater than near (got ${near} and ${value}).`;
    }
    default:
      return `does not accept ${key}.`;
  }
}

/**
 * The first problem in a (partial) camera state, or "" when every value is valid; `current`
 * fills in near/far for the cross-check. Messages are prefixed with `where` (the caller name).
 */
export function cameraStateIssue(state, current = {}, where = "setCamera") {
  if (!state || typeof state !== "object") return `${where} needs an object such as {position: [x, y, z]}.`;
  for (const key of Object.keys(state)) {
    if (!CAMERA_KEYS.includes(key)) return `${where} does not accept ${key}.`;
  }
  const near = state.near ?? current.near, far = state.far ?? current.far;
  for (const key of CAMERA_KEYS) {
    const issue = cameraValueIssue(key, state[key], { near, far });
    if (issue) return `${where} ${issue}`;
  }
  return "";
}

/** Public view presets share the same internal 3D coordinate/rendering mode.
 * @returns {"2d" | "3d"} */
export const viewMode = (type) => type === "3d" || type === "3d-y-up" ? "3d" : "2d";
/** @returns {[number, number, number]} */
export const viewUp = (type) => type === "3d-y-up" ? [0, 1, 0] : [0, 0, 1];

/** Scene-derived camera defaults for a scene of the given radius. */
export function cameraDefaults(radius = 1) {
  return {
    position: [90 * radius, 70 * radius, 140 * radius],
    target: [0, 0, 0],
    up: [0, 0, 1],
    fov: 50,
    near: Math.max(1e-6, 0.1 * radius),
    far: Math.max(2000, 2000 * radius),
  };
}

/**
 * The first invalid camera prop (position, target, up, fov, near, far) as a message naming
 * the prop ("cameraNear: near must be ..."), or "" when all are valid; `current` supplies the
 * near/far counterpart for a partial set.
 */
export function cameraPropsIssue(props = {}, current = {}) {
  const near = props.near ?? current.near, far = props.far ?? current.far;
  for (const key of ["position", "target", "up", "fov", "near", "far", "zoom"]) {
    const issue = cameraValueIssue(key, props[key], { near, far });
    if (issue) return `camera${key[0].toUpperCase()}${key.slice(1)}: ${issue}`;
  }
  return "";
}

/**
 * The camera state to apply: explicit props win, then the camera remembered for these
 * coordinates, then defaults scaled by the scene radius. When the memory entry was saved
 * under the same explicit props (`memory.explicit`, the props as JSON), the remembered
 * navigation wins over the props, so a remount does not reset the user's view. Returns plain
 * arrays and numbers; throws naming the offending prop (cameraFov, cameraNear, ...).
 */
export function resolveCameraState(props = {}, memory = undefined, radius = 1) {
  const issue = cameraPropsIssue(props);
  if (issue) throw Error(issue);
  const defaults = cameraDefaults(radius);
  const remembered = memory?.explicit !== undefined && memory.explicit === explicitCameraKey(props);
  const state = { ...defaults };
  for (const key of ["position", "target", "up"]) {
    const explicit = vector(props[key]) ? [...props[key]] : undefined;
    const kept = vector(memory?.[key]) ? [...memory[key]] : undefined;
    state[key] = (remembered ? kept ?? explicit : explicit ?? kept) ?? defaults[key];
  }
  for (const key of ["fov", "near", "far"]) {
    const explicit = Number.isFinite(props[key]) ? props[key] : undefined;
    const kept = Number.isFinite(memory?.[key]) ? memory[key] : undefined;
    state[key] = (remembered ? kept ?? explicit : explicit ?? kept) ?? defaults[key];
  }
  if (!(state.near < state.far))
    throw Error(`cameraNear and cameraFar need 0 < near < far (got ${state.near} and ${state.far}).`);
  return state;
}

/** The explicit camera props as a comparable key (undefined entries dropped). */
export function explicitCameraKey(props = {}) {
  return JSON.stringify(props, (key, value) => (value === undefined ? undefined : value));
}

/** Validate a partial camera state given to setCamera against the current camera. */
export function validateCameraPatch(patch, current = {}) {
  const issue = cameraStateIssue(patch, current, "setCamera");
  if (issue) throw Error(issue);
  return patch;
}

/** Spherical interpolation between two unit vectors (falls back to a normalized lerp when opposite). */
function slerp(a, b, t) {
  const from = normalize(a), to = normalize(b);
  const cosine = clamp(dot(from, to), -1, 1);
  if (cosine > 1 - 1e-9) return normalize(from.map((v, i) => v + (to[i] - v) * t));
  if (cosine < -1 + 1e-9) {
    // Opposite: rotate through a perpendicular axis rather than passing through zero.
    const axis = normalize(Math.abs(from[0]) < 0.9 ? cross(from, [1, 0, 0]) : cross(from, [0, 0, 1]));
    const angle = Math.PI * t;
    return from.map((v, i) => v * Math.cos(angle) + axis[i] * Math.sin(angle));
  }
  const angle = Math.acos(cosine), sine = Math.sin(angle);
  const wa = Math.sin((1 - t) * angle) / sine, wb = Math.sin(t * angle) / sine;
  return from.map((v, i) => v * wa + to[i] * wb);
}

/**
 * Interpolation between two camera states for the animated setCamera: scalars and vectors
 * blend linearly, `up` rotates (a flip from +y to -y no longer collapses at t = 0.5), and when
 * both position and target move, the position swings about the target instead of cutting
 * through it.
 */
export function lerpCamera(from, to, t) {
  const out = {};
  for (const [key, value] of Object.entries(to)) {
    const start = from[key];
    out[key] = Array.isArray(value) ? value.map((v, i) => start[i] + (v - start[i]) * t)
      : typeof value === "number" && typeof start === "number" ? start + (value - start) * t : value;
  }
  if (Array.isArray(to.up) && Array.isArray(from.up) && length(from.up) > 0 && length(to.up) > 0)
    out.up = slerp(from.up, to.up, t);
  if (Array.isArray(to.position) && Array.isArray(to.target) && Array.isArray(from.position) && Array.isArray(from.target)) {
    const fromOffset = sub(from.position, from.target), toOffset = sub(to.position, to.target);
    const fromLength = length(fromOffset), toLength = length(toOffset);
    if (fromLength > 1e-9 && toLength > 1e-9) {
      const direction = slerp(fromOffset, toOffset, t);
      out.position = add(out.target, scale(direction, fromLength + (toLength - fromLength) * t));
    }
  }
  return out;
}

/** Stable identity for projected guides, picking and curve refinement. OrbitControls can round-trip a non-Y up vector
 * with machine-precision matrix drift even while stationary. Ignore that noise so an axis
 * publication does not request another frame forever; actual navigation remains visible. */
export function cameraMatrixKey(camera) {
  return [...camera.matrixWorld.elements, ...camera.projectionMatrix.elements]
    .map(value => Math.abs(value) < 1e-12 ? 0 : Number(value.toPrecision(12)))
    .join(",");
}
