/**
 * Map projections that map longitude and latitude to x and y jointly (TODO 39.5-39.6):
 * "equal-earth" (Šavrič et al. 2018), "natural-earth" (Natural Earth I), "albers" (conic
 * equal-area) and "albers-usa" (d3.geoAlbersUsa: the lower 48 in albers, Alaska and Hawaii as
 * scaled insets). The cylindrical maps (equirectangular, mercator, equal-area) project only y,
 * with x the longitude, and repeat across the antimeridian; these have curved outlines and do
 * not repeat: a map is one extent around its center longitude, and paths are cut at its seam
 * (the center + 180°). Each entry holds its CPU forward and inverse (Newton's method where the
 * forward is a polynomial, as d3-geo's), TSL, WGSL and jax forwards, and its outline's bounds.
 * Angles are radians; λ is relative to the projection's center longitude (in [-π, π] on the
 * map); x and y are in units of the sphere's radius, y up (d3's raw projections, unscaled).
 */
import { Fn, If, float, vec2, vec4, sin, cos, asin, sqrt, max } from "three/tsl";
import { numpy as np } from "@hmplot/jax";

const DEG = Math.PI / 180;
/** Codes of every projection (the operation table's projection code). */
export const PROJECTION_CODES = Object.freeze({
  equirectangular: 0, mercator: 1, "equal-area": 2, orthographic: 3,
  "equal-earth": 4, "natural-earth": 5, albers: 6, "albers-usa": 7,
});
export const PROJECTION_NAMES = Object.freeze(Object.keys(PROJECTION_CODES));
/** The projections that map (λ, φ) jointly, have curved outlines and do not repeat. */
export const JOINT_PROJECTIONS = Object.freeze(["equal-earth", "natural-earth", "albers", "albers-usa"]);
export const jointProjection = (name) => JOINT_PROJECTIONS.includes(name);
/** albers' standard parallels when none are given (d3.geoAlbers's, for the United States). */
export const DEFAULT_PARALLELS = Object.freeze([29.5, 45.5]);

// --- Equal Earth (d3-geo projection/equalEarth.js) ---
const A1 = 1.340264, A2 = -0.081106, A3 = 0.000893, A4 = 0.003796, M = Math.sqrt(3) / 2;
function equalEarth(lambda, phi) {
  const l = Math.asin(M * Math.sin(phi)), l2 = l * l, l6 = l2 * l2 * l2;
  return [lambda * Math.cos(l) / (M * (A1 + 3 * A2 * l2 + l6 * (7 * A3 + 9 * A4 * l2))),
    l * (A1 + A2 * l2 + l6 * (A3 + A4 * l2))];
}
function equalEarthInverse(x, y) {
  let l = y, l2 = l * l, l6 = l2 * l2 * l2;
  for (let i = 0; i < 12; i++) {
    const fy = l * (A1 + A2 * l2 + l6 * (A3 + A4 * l2)) - y,
      fpy = A1 + 3 * A2 * l2 + l6 * (7 * A3 + 9 * A4 * l2), delta = fy / fpy;
    l -= delta; l2 = l * l; l6 = l2 * l2 * l2;
    if (Math.abs(delta) < 1e-12) break;
  }
  const s = Math.sin(l) / M;
  if (!(Math.abs(s) <= 1 + 1e-12)) return null;
  return [M * x * (A1 + 3 * A2 * l2 + l6 * (7 * A3 + 9 * A4 * l2)) / Math.cos(l), Math.asin(Math.max(-1, Math.min(1, s)))];
}

// --- Natural Earth I (d3-geo projection/naturalEarth1.js) ---
function naturalEarth(lambda, phi) {
  const p2 = phi * phi, p4 = p2 * p2;
  return [lambda * (0.8707 - 0.131979 * p2 + p4 * (-0.013791 + p4 * (0.003971 * p2 - 0.001529 * p4))),
    phi * (1.007226 + p2 * (0.015085 + p4 * (-0.044475 + 0.028874 * p2 - 0.005916 * p4)))];
}
function naturalEarthInverse(x, y) {
  let phi = y, delta, p2, p4, i = 25;
  do {
    p2 = phi * phi; p4 = p2 * p2;
    phi -= delta = (phi * (1.007226 + p2 * (0.015085 + p4 * (-0.044475 + 0.028874 * p2 - 0.005916 * p4))) - y) /
      (1.007226 + p2 * (0.015085 * 3 + p4 * (-0.044475 * 7 + 0.028874 * 9 * p2 - 0.005916 * 11 * p4)));
  } while (Math.abs(delta) > 1e-6 && --i > 0);
  p2 = phi * phi;
  return [x / (0.8707 + p2 * (-0.131979 + p2 * (-0.013791 + p2 * p2 * p2 * (0.003971 - 0.001529 * p2)))), phi];
}

// --- Conic equal-area (d3-geo projection/conicEqualArea.js) ---
/**
 * A conic's constants for standard parallels φ1, φ2 and the latitude φ0 at the origin: n, c,
 * and ρ0 (the radius at φ0). x = r sin(nλ), y = ρ0 − r cos(nλ), r = √(c − 2n sin φ) / n.
 */
export function conicParameters(phi1, phi2, phi0 = 0) {
  const s1 = Math.sin(phi1), n = (s1 + Math.sin(phi2)) / 2;
  if (!Number.isFinite(n) || Math.abs(n) < 1e-6)
    throw Error("albers parallels must not be symmetric about the equator; use projection \"equal-area\".");
  const c = 1 + s1 * (2 * n - s1);
  return { n, c, rho0: Math.sqrt(Math.max(0, c - 2 * n * Math.sin(phi0))) / n };
}
function conic({ n, c, rho0 }, lambda, phi) {
  const r = Math.sqrt(Math.max(0, c - 2 * n * Math.sin(phi))) / n;
  return [r * Math.sin(n * lambda), rho0 - r * Math.cos(n * lambda)];
}
function conicInverse({ n, c, rho0 }, x, y) {
  const r0y = rho0 - y;
  let l = Math.atan2(x, Math.abs(r0y)) * Math.sign(r0y);
  if (r0y * n < 0) l -= Math.PI * Math.sign(x) * Math.sign(r0y);
  const s = (c - (x * x + r0y * r0y) * n * n) / (2 * n);
  if (!(Math.abs(s) <= 1 + 1e-9)) return null;
  const lambda = l / n;
  return Math.abs(lambda) <= Math.PI + 1e-9 ? [lambda, Math.asin(Math.max(-1, Math.min(1, s)))] : null;
}

// --- albers-usa (d3-geo projection/albersUsa.js), unscaled: d3's scale k is 1 here ---
// Each inset: a conic rotated to its central meridian λ0, centered at d3's `center` (in the
// rotated frame), scaled and translated, and its clip rectangle (y up, so d3's y is negated).
const inset = (parallels, lambda0, center, scale, translate, extent) => {
  const params = conicParameters(parallels[0] * DEG, parallels[1] * DEG, 0);
  // d3's conics put the origin at the equator (ρ0 = r(0)); `center` then shifts it.
  const [cx, cy] = conic(params, center[0] * DEG, center[1] * DEG);
  return Object.freeze({ ...params, lambda0: lambda0 * DEG, cx, cy, scale, tx: translate[0], ty: translate[1], extent });
};
export const ALBERS_USA = Object.freeze([
  inset([29.5, 45.5], -96, [-0.6, 38.7], 1, [0, 0], [-0.455, -0.238, 0.455, 0.238]),
  inset([55, 65], -154, [-2, 58.5], 0.35, [-0.307, -0.201], [-0.425, -0.234, -0.214, -0.120]),
  inset([8, 18], -157, [-3, 19.9], 1, [-0.205, -0.212], [-0.214, -0.234, -0.115, -0.166]),
]);
const wrap = (x) => ((((x + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) - Math.PI;
const insideRect = (e, x, y) => x >= e[0] && x <= e[2] && y >= e[1] && y <= e[3];
/** albers-usa at absolute longitude λ: `{point, inset}` (0 lower 48, 1 Alaska, 2 Hawaii) or null. */
export function albersUsa(lambda, phi) {
  for (let i = 0; i < ALBERS_USA.length; i++) {
    const s = ALBERS_USA[i], [rx, ry] = conic(s, wrap(lambda - s.lambda0), phi);
    const x = s.scale * (rx - s.cx) + s.tx, y = s.scale * (ry - s.cy) + s.ty;
    if (insideRect(s.extent, x, y)) return { point: [x, y], inset: i };
  }
  return null;
}
function albersUsaInverse(x, y) {
  // The insets' rectangles lie inside the lower 48's: test them first, as d3 does.
  const [lower, alaska, hawaii] = ALBERS_USA;
  const s = insideRect(alaska.extent, x, y) ? alaska : insideRect(hawaii.extent, x, y) ? hawaii : lower;
  const raw = conicInverse(s, (x - s.tx) / s.scale + s.cx, (y - s.ty) / s.scale + s.cy);
  return raw && [wrap(raw[0] + s.lambda0), raw[1]];
}

/**
 * A projection's parameters from its options: albers' conic constants from `parallels` and the
 * center latitude (in radians); none for the others. `factor` turns angular units to radians.
 */
export function projectionParameters(name, { parallels = DEFAULT_PARALLELS, centerLatitude = 0, factor = DEG } = {}) {
  if (name !== "albers") return null;
  if (!Array.isArray(parallels) || parallels.length !== 2 || !parallels.every(Number.isFinite))
    throw Error("albers parallels must be two finite latitudes.");
  return conicParameters(parallels[0] * factor, parallels[1] * factor, centerLatitude);
}

/**
 * The CPU forward of a joint projection: λ relative to the center longitude (any turn: it is
 * wrapped to [-π, π], unless `unwrapped`), φ in radians. Returns [x, y], or null where the point
 * is not on the map (a latitude past a pole, albers-usa outside its three insets).
 */
/** @param {string} name
 * @param {number} lambda
 * @param {number} phi
 * @param {{n: number, c: number, rho0: number} | null} [params]
 */
export function jointForward(name, lambda, phi, params = null, { unwrapped = false, center = 0 } = {}) {
  if (![lambda, phi].every(Number.isFinite) || Math.abs(phi) > Math.PI / 2 + 1e-9) return null;
  const l = unwrapped ? lambda : wrap(lambda);
  if (name === "equal-earth") return equalEarth(l, phi);
  if (name === "natural-earth") return naturalEarth(l, phi);
  if (name === "albers") return conic(params ?? projectionParameters("albers"), l, phi);
  // albers-usa ignores the center: its insets are fixed.
  if (name === "albers-usa") return albersUsa(lambda + center, phi)?.point ?? null;
  throw Error(`Not a joint projection: ${name}.`);
}
/** The inverse of jointForward: [λ relative to the center, φ], or null off the map. */
/** @param {string} name
 * @param {number} x
 * @param {number} y
 * @param {{n: number, c: number, rho0: number} | null} [params]
 */
export function jointInverse(name, x, y, params = null, { center = 0 } = {}) {
  if (![x, y].every(Number.isFinite)) return null;
  let result;
  if (name === "equal-earth") result = equalEarthInverse(x, y);
  else if (name === "natural-earth") result = naturalEarthInverse(x, y);
  else if (name === "albers") result = conicInverse(params ?? projectionParameters("albers"), x, y);
  else if (name === "albers-usa") {
    const raw = albersUsaInverse(x, y);
    result = raw && [wrap(raw[0] - center), raw[1]];
  } else throw Error(`Not a joint projection: ${name}.`);
  if (!result || ![...result].every(Number.isFinite) || Math.abs(result[0]) > Math.PI + 1e-6 ||
      Math.abs(result[1]) > Math.PI / 2 + 1e-6) return null;
  // Round trip: a point outside the outline has no preimage (the inverse extrapolates).
  const back = jointForward(name, result[0], result[1], params, { unwrapped: true, center });
  return back && Math.hypot(back[0] - x, back[1] - y) < 1e-6 ? result : null;
}

const boundsCache = new Map();
/**
 * The bounds of a joint projection's outline, {x: [min, max], y: [min, max]}: sampled over the
 * whole sphere once per parameter set (albers' depend on its parallels and center).
 */
export function jointBounds(name, params = null) {
  if (name === "albers-usa") return { x: [-0.455, 0.455], y: [-0.238, 0.238] };
  const key = JSON.stringify([name, params]);
  if (boundsCache.has(key)) return boundsCache.get(key);
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (let i = 0; i <= 144; i++)
    for (let j = 0; j <= 72; j++) {
      const p = jointForward(name, -Math.PI + (2 * Math.PI * i) / 144, -Math.PI / 2 + (Math.PI * j) / 72, params, { unwrapped: true });
      if (!p) continue;
      x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]);
    }
  const bounds = { x: [x0, x1], y: [y0, y1] };
  if (boundsCache.size > 64) boundsCache.clear();
  boundsCache.set(key, bounds);
  return bounds;
}

// --- TSL ---
/** An albers conic's constants from standard parallels and the origin latitude (float nodes). */
export function conicNodes(phi1, phi2, phi0) {
  const s1 = sin(phi1), n = s1.add(sin(phi2)).mul(0.5);
  const c = s1.mul(n.mul(2).sub(s1)).add(1);
  return { n, c, rho0: sqrt(max(c.sub(n.mul(2).mul(sin(phi0))), 0)).div(n) };
}
function conicNode({ n, c, rho0 }, lambda, phi) {
  const r = sqrt(max(c.sub(n.mul(2).mul(sin(phi))), 0)).div(n), a = n.mul(lambda);
  return vec2(r.mul(sin(a)), rho0.sub(r.mul(cos(a))));
}
/**
 * The TSL forward of a joint projection (baked by name): `lambda` relative to the center (the
 * caller wraps it), `phi`, and for albers `conic` from conicNodes. Returns a vec4: x, y, 1 where
 * the point is on the map (else 0), and albers-usa's inset (0 elsewhere). `absolute`: albers-usa's
 * absolute longitude (the insets are fixed).
 */
export function jointNode(name, lambda, phi, { conic = null, absolute = null } = {}) {
  if (name === "equal-earth") {
    const l = asin(sin(phi).mul(M)), l2 = l.mul(l), l6 = l2.mul(l2).mul(l2);
    const x = lambda.mul(cos(l)).div(l2.mul(3 * A2).add(A1).add(l6.mul(l2.mul(9 * A4).add(7 * A3))).mul(M));
    const y = l.mul(l2.mul(A2).add(A1).add(l6.mul(l2.mul(A4).add(A3))));
    return vec4(x, y, 1, 0);
  }
  if (name === "natural-earth") {
    const p2 = phi.mul(phi), p4 = p2.mul(p2);
    const x = lambda.mul(p2.mul(-0.131979).add(0.8707).add(p4.mul(p4.mul(p2.mul(0.003971).sub(p4.mul(0.001529))).sub(0.013791))));
    const y = phi.mul(p2.mul(p4.mul(p2.mul(0.028874).sub(0.044475).sub(p4.mul(0.005916))).add(0.015085)).add(1.007226));
    return vec4(x, y, 1, 0);
  }
  if (name === "albers") return vec4(conicNode(conic, lambda, phi), 1, 0);
  if (name === "albers-usa") {
    const lon = absolute ?? lambda;
    return Fn(() => {
      const out = vec4(0, 0, 0, 0).toVar();
      // The first inset whose rectangle holds the point, as d3's albersUsa stream.
      for (let i = ALBERS_USA.length - 1; i >= 0; i--) {
        const s = ALBERS_USA[i];
        const l = lon.sub(s.lambda0).add(Math.PI).mod(2 * Math.PI).sub(Math.PI);
        const raw = conicNode({ n: float(s.n), c: float(s.c), rho0: float(Math.sqrt(s.c) / s.n) }, l, phi);
        const x = raw.x.sub(s.cx).mul(s.scale).add(s.tx), y = raw.y.sub(s.cy).mul(s.scale).add(s.ty);
        const e = s.extent;
        If(x.greaterThanEqual(e[0]).and(x.lessThanEqual(e[2])).and(y.greaterThanEqual(e[1])).and(y.lessThanEqual(e[3])), () => {
          out.assign(vec4(x, y, 1, i));
        });
      }
      return out;
    })();
  }
  throw Error(`Not a joint projection: ${name}.`);
}

// --- WGSL ---
const f = (v) => {
  const text = String(v);
  return /[.eE]/.test(text) ? text : `${text}.`;
};
/**
 * WGSL `mapJoint(l, p, code, conic, lon) -> vec4f` (x, y, 1 on the map / 0 off it, albers-usa's
 * inset), selected by the projection code at run time. `conic` holds albers' (n, c, ρ0); `lon`
 * is the absolute longitude albers-usa's fixed insets read.
 */
export function jointProjectionWgsl() {
  const insets = ALBERS_USA.map((s, i) => `
  {
    let l = mapWrap(lon - ${f(s.lambda0)});
    let raw = mapConic(vec3f(${f(s.n)}, ${f(s.c)}, ${f(Math.sqrt(s.c) / s.n)}), l, p);
    let x = (raw.x - ${f(s.cx)}) * ${f(s.scale)} + ${f(s.tx)};
    let y = (raw.y - ${f(s.cy)}) * ${f(s.scale)} + ${f(s.ty)};
    if (x >= ${f(s.extent[0])} && x <= ${f(s.extent[2])} && y >= ${f(s.extent[1])} && y <= ${f(s.extent[3])}) { return vec4f(x, y, 1., ${i}.); }
  }`).join("");
  return /* wgsl */ `
fn mapWrap(x: f32) -> f32 { return x - floor((x + 3.141592653589793) / 6.283185307179586) * 6.283185307179586; }
fn mapConic(k: vec3f, l: f32, p: f32) -> vec2f {
  let r = sqrt(max(k.y - 2. * k.x * sin(p), 0.)) / k.x;
  return vec2f(r * sin(k.x * l), k.z - r * cos(k.x * l));
}
fn mapJoint(l: f32, p: f32, code: u32, conic: vec3f, lon: f32) -> vec4f {
  if (code == ${PROJECTION_CODES["equal-earth"]}u) {
    let t = asin(${f(M)} * sin(p)); let t2 = t * t; let t6 = t2 * t2 * t2;
    return vec4f(l * cos(t) / ((${f(A1)} + 3. * ${f(A2)} * t2 + t6 * (7. * ${f(A3)} + 9. * ${f(A4)} * t2)) * ${f(M)}),
      t * (${f(A1)} + ${f(A2)} * t2 + t6 * (${f(A3)} + ${f(A4)} * t2)), 1., 0.);
  }
  if (code == ${PROJECTION_CODES["natural-earth"]}u) {
    let p2 = p * p; let p4 = p2 * p2;
    return vec4f(l * (0.8707 - 0.131979 * p2 + p4 * (-0.013791 + p4 * (0.003971 * p2 - 0.001529 * p4))),
      p * (1.007226 + p2 * (0.015085 + p4 * (-0.044475 + 0.028874 * p2 - 0.005916 * p4))), 1., 0.);
  }
  if (code == ${PROJECTION_CODES.albers}u) { return vec4f(mapConic(conic, l, p), 1., 0.); }
  if (code == ${PROJECTION_CODES["albers-usa"]}u) {${insets}
    return vec4f(0., 0., 0., 0.);
  }
  return vec4f(l, p, 1., 0.);
}
`;
}

// --- jax ---
/**
 * The jax forward of a joint projection over borrowed arrays: λ relative to the center (already
 * wrapped), φ, and for albers-usa the absolute longitude. Returns [x, y, valid] (new arrays;
 * valid is null when every point is on the map). `params`: albers' conic constants (numbers).
 * @param {string} name @param {import("@hmplot/jax").Array} lambda
 * @param {import("@hmplot/jax").Array} phi
 * @param {{n: number, c: number, rho0: number} | null} [params]
 * @param {import("@hmplot/jax").Array | null} [absolute]
 * @returns {[import("@hmplot/jax").Array, import("@hmplot/jax").Array, import("@hmplot/jax").Array | null]}
 */
export function jaxJointForward(name, lambda, phi, params = null, absolute = null) {
  if (name === "equal-earth") {
    const l = np.arcsin(np.sin(phi.ref).mul(M)), l2 = l.ref.mul(l.ref), l6 = l2.ref.mul(l2.ref).mul(l2.ref);
    const x = lambda.ref.mul(np.cos(l.ref)).div(l2.ref.mul(3 * A2).add(A1).add(l6.ref.mul(l2.ref.mul(9 * A4).add(7 * A3))).mul(M));
    const y = l.mul(l2.ref.mul(A2).add(A1).add(l6.mul(l2.mul(A4).add(A3))));
    return [x, y, null];
  }
  if (name === "natural-earth") {
    const p2 = phi.ref.mul(phi.ref), p4 = p2.ref.mul(p2.ref);
    const x = lambda.ref.mul(p2.ref.mul(-0.131979).add(0.8707).add(p4.ref.mul(p4.ref.mul(p2.ref.mul(0.003971).sub(p4.ref.mul(0.001529))).sub(0.013791))));
    const y = phi.ref.mul(p2.ref.mul(p4.ref.mul(p2.ref.mul(0.028874).sub(0.044475).sub(p4.ref.mul(0.005916))).add(0.015085)).add(1.007226));
    p2.dispose(); p4.dispose();
    return [x, y, null];
  }
  const conicArrays = ({ n, c, rho0 }, l) => {
    const r = np.sqrt(np.maximum(np.sin(phi.ref).mul(-2 * n).add(c), 0)).div(n), a = l.mul(n);
    return [r.ref.mul(np.sin(a.ref)), r.mul(np.cos(a)).mul(-1).add(rho0)];
  };
  if (name === "albers") {
    const [x, y] = conicArrays(params ?? projectionParameters("albers"), lambda.ref);
    return [x, y, null];
  }
  if (name === "albers-usa") {
    let x = np.zerosLike(phi.ref), y = np.zerosLike(phi.ref), valid = np.zerosLike(phi.ref).greater(1);
    for (let i = ALBERS_USA.length - 1; i >= 0; i--) {
      const s = ALBERS_USA[i];
      const shifted = absolute.ref.sub(s.lambda0).add(Math.PI);
      const l = shifted.ref.sub(np.floor(shifted.div(2 * Math.PI)).mul(2 * Math.PI)).sub(Math.PI);
      const [rx, ry] = conicArrays({ n: s.n, c: s.c, rho0: Math.sqrt(s.c) / s.n }, l);
      const ix = rx.sub(s.cx).mul(s.scale).add(s.tx), iy = ry.sub(s.cy).mul(s.scale).add(s.ty), e = s.extent;
      const inside = np.logicalAnd(np.logicalAnd(ix.ref.greaterEqual(e[0]), ix.ref.lessEqual(e[2])),
        np.logicalAnd(iy.ref.greaterEqual(e[1]), iy.ref.lessEqual(e[3])));
      x = np.where(inside.ref, ix, x); y = np.where(inside.ref, iy, y); valid = np.logicalOr(inside, valid);
    }
    return [x, y, valid];
  }
  throw Error(`Not a joint projection: ${name}.`);
}
