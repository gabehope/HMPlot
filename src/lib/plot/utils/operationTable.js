import { TAU, MERCATOR_LIMIT } from "./coordinates.js";
import { LIMITS, limitError } from "./limits.js";
import {
  scaleTransformWgsl,
  transformCode,
  transformClamped,
  transformName,
  inTransformDomain,
  NO_STAGE_KIND,
  DEFAULT_TRANSFORM_CONSTANT,
} from "./scaleTransforms.js";
import {
  PROJECTION_CODES,
  PROJECTION_NAMES,
  jointProjectionWgsl,
  jointForward,
  albersUsa,
} from "./mapProjections.js";

/** The numeric operation table shared by compute passes (connection gathers,
 * adaptive path refinement). Records come from resolveCoordinateOperations();
 * this module only fixes their packed layout, its WGSL evaluator and the CPU
 * reference that reads the packed words exactly as the shader does. */
export const OPERATION_LIMIT = LIMITS.coordinateStages.value;
/** Words per operation: one vec4u of codes, four vec4f of parameters. */
export const OPERATION_KIND_WORDS = 4,
  OPERATION_DATA_WORDS = 16;
export const OPERATION_KIND = Object.freeze({
  scale: 1,
  polar: 2,
  "spherical-globe": 3,
  "spherical-map2d": 4,
  "spherical-map3d": 5,
  fit: 6,
  matrix: 7,
});
const PROJECTION_KIND = PROJECTION_CODES;
/** The first joint projection's code: codes from here up map (λ, φ) jointly (mapProjections.js). */
const JOINT_CODE = PROJECTION_CODES["equal-earth"];
const POLAR_AXIS = { Z: 0, X: 1, Y: 2 };
/** Flat-map flags (third code): keep the unwrapped longitude of a repeating
 * root, clamp Mercator latitude at its limit, or treat it as outside. */
// `unclipped` keeps an orthographic map's back points (a fill cut at the
// horizon by its facing mask instead, as objects/geoFaces.js does).
export const MAP_FLAGS = Object.freeze({
  unwrap: 1,
  clampMercator: 2,
  cutMercator: 4,
  unclipped: 8,
});
/** Seam indices of successive wrapped maps combine in this base; one index
 * change marks a periodic seam between two samples. */
const SEAM_BASE = 97;

/** Pack resolved records at word offsets { count, kinds, data } of the
 * supplied views. `flags` optionally returns MAP_FLAGS for each record. */
/** @param {readonly import("./coordinateOperations.js").ResolvedCoordinateOperation[]} operations
 * @param {Uint32Array} u @param {Float32Array} f
 * @param {{count: number, kinds: number, data: number}} offsets
 * @param {(operation: import("./coordinateOperations.js").ResolvedCoordinateOperation, index: number) => number} [flags]
 */
export function packOperationTable(operations, u, f, offsets, flags = () => 0) {
  if (operations.length > OPERATION_LIMIT)
    throw limitError("coordinateStages", { count: operations.length });
  u[offsets.count] = operations.length;
  operations.forEach((operation, i) => {
    const kind = OPERATION_KIND[operation.kind];
    if (!kind)
      throw Error(`Unsupported coordinate operation: ${operation.kind}.`);
    const codes = [kind, 0, 0, 0],
      vectors = [[], [], [], []];
    if (kind === 1) {
      // Per axis: (a, d, r0, span) and its transform code (NO_STAGE_KIND: no stage); the
      // fourth vector holds the three axes' symlog constants.
      ["x", "y", "z"].forEach((axis, j) => {
        const stage = operation.axes[axis];
        codes[j + 1] = stage ? transformCode(stage.kind) : NO_STAGE_KIND;
        vectors[j] = stage ? [stage.a, stage.d, stage.r0, stage.span] : [];
      });
      vectors[3] = ["x", "y", "z"].map(
        (axis) => operation.axes[axis]?.constant ?? DEFAULT_TRANSFORM_CONSTANT,
      );
    } else if (kind >= 2 && kind <= 5) {
      vectors[0] = [
        operation.factor,
        operation.origin,
        operation.base,
        operation.radial,
      ];
      if (kind === 2) codes[1] = POLAR_AXIS[operation.axis] ?? 0;
      else if (kind >= 4) {
        codes[1] = PROJECTION_KIND[operation.projection] ?? 0;
        codes[2] = flags(operation, i) ?? 0;
        vectors[1] = [operation.centerLongitude, operation.centerLatitude];
        // albers' conic constants (n, c, ρ0).
        vectors[2] = operation.conic ?? [];
      }
    } else if (kind === 6)
      vectors[0] = [operation.sx, operation.sy, operation.tx, operation.ty];
    else if (kind === 7)
      for (let column = 0; column < 4; column++)
        vectors[column] = operation.elements.slice(column * 4, column * 4 + 4);
    u.set(codes, offsets.kinds + i * OPERATION_KIND_WORDS);
    vectors.forEach((values, j) =>
      f.set(values, offsets.data + i * OPERATION_DATA_WORDS + j * 4),
    );
  });
}

/** WGSL for `operationPoint(input, first)`: evaluate operations `first..count`.
 * The accessors name the uniform members holding the packed table. Invalid
 * points (negative polar radius, a hidden orthographic side, a pole outside a
 * cut Mercator map, a coordinate outside its scale transform's domain) report valid = false
 * instead of a sentinel coordinate. */
export function operationTableWgsl({ count, kinds, data }) {
  return /* wgsl */ `
struct OperationPoint { point: vec3f, valid: bool, seam: f32 }
fn operationFinite(x: f32) -> bool { return abs(x) <= 3.402823e38; }
${scaleTransformWgsl("operationScale")}
${jointProjectionWgsl()}fn operationPoint(input: vec3f, first: u32) -> OperationPoint {
  var point = input;
  var seam = 0.;
  var seamScale = 1.;
  let none = OperationPoint(vec3f(0.), false, 0.);
  for (var i = first; i < ${count}; i++) {
    let kind = ${kinds}[i];
    let a = ${data}[i * 4u];
    let b = ${data}[i * 4u + 1u];
    let c = ${data}[i * 4u + 2u];
    let d = ${data}[i * 4u + 3u];
    if (kind.x == 1u) {
      var next = point;
      if (kind.y != ${NO_STAGE_KIND}u) {
        if (!operationScaleValid(point.x, kind.y)) { return none; }
        next.x = (operationScaleForward(point.x, kind.y, d.x) - a.x) / a.y * a.w + a.z;
      }
      if (kind.z != ${NO_STAGE_KIND}u) {
        if (!operationScaleValid(point.y, kind.z)) { return none; }
        next.y = (operationScaleForward(point.y, kind.z, d.y) - b.x) / b.y * b.w + b.z;
      }
      if (kind.w != ${NO_STAGE_KIND}u) {
        if (!operationScaleValid(point.z, kind.w)) { return none; }
        next.z = (operationScaleForward(point.z, kind.w, d.z) - c.x) / c.y * c.w + c.z;
      }
      point = next;
    } else if (kind.x == 2u) {
      let radius = a.z + a.w * point.y;
      let theta = (point.x - a.y) * a.x;
      if (radius < 0. || !operationFinite(radius) || !operationFinite(theta)) { return none; }
      let x = radius * cos(theta); let y = radius * sin(theta);
      if (kind.y == 1u) { point = vec3f(point.z, x, y); }
      else if (kind.y == 2u) { point = vec3f(y, point.z, x); }
      else { point = vec3f(x, y, point.z); }
    } else if (kind.x == 3u || kind.x == 4u || kind.x == 5u) {
      let lon = (point.x - a.y) * a.x;
      var lat = point.y * a.x;
      let radius = a.z + a.w * point.z;
      if (!operationFinite(lon) || !operationFinite(lat) || abs(lat) > 1.5707963267948966 + 1e-9 || radius <= 0.) {
        return none;
      }
      let direction = vec3f(cos(lat) * sin(lon), sin(lat), cos(lat) * cos(lon));
      if (kind.x == 3u) { point = radius * direction; }
      else if (kind.y == 3u) {
        let sl = sin(b.x); let cl = cos(b.x); let sp = sin(b.y); let cp = cos(b.y);
        let east = direction.x * cl - direction.z * sl;
        let north = -direction.x * sp * sl + direction.y * cp - direction.z * sp * cl;
        let facing = direction.x * cp * sl + direction.y * sp + direction.z * cp * cl;
        if (facing < -1e-9 && (kind.z & 8u) == 0u) { return none; }
        if (kind.x == 4u) { point = vec3f(radius * east, radius * north, 0.); }
        else { point = vec3f(radius * east, point.z * a.w, -radius * north); }
      } else if (kind.y >= ${JOINT_CODE}u) {
        // A joint projection: one extent around the center longitude, cut at its seam; an
        // albers-usa point's inset counts as a seam too, so no path crosses between insets.
        var l = lon - b.x;
        if ((kind.z & 1u) == 0u) {
          let tile = floor((l + 3.141592653589793) / 6.283185307179586);
          l = l - tile * 6.283185307179586;
          seam = seam + tile * seamScale;
          seamScale = seamScale * ${SEAM_BASE}.;
        }
        let m = mapJoint(l, lat, kind.y, c.xyz, lon);
        if (m.z < 0.5) { return none; }
        seam = seam + m.w * seamScale;
        seamScale = seamScale * ${SEAM_BASE}.;
        if (kind.x == 4u) { point = vec3f(m.x, m.y, 0.); }
        else { point = vec3f(m.x * a.z, point.z * a.w, -m.y * a.z); }
      } else {
        var x = lon;
        if ((kind.z & 1u) == 0u) {
          let tile = floor((lon + 3.141592653589793) / 6.283185307179586);
          x = lon - tile * 6.283185307179586;
          seam = seam + tile * seamScale;
          seamScale = seamScale * ${SEAM_BASE}.;
        }
        var py = lat;
        if (kind.y == 1u) {
          if ((kind.z & 4u) != 0u && abs(lat) > ${MERCATOR_LIMIT} + 1e-6) { return none; }
          if ((kind.z & 2u) != 0u) { lat = clamp(lat, -${MERCATOR_LIMIT}, ${MERCATOR_LIMIT}); }
          py = log(tan(lat * 0.5 + 0.7853981633974483));
        } else if (kind.y == 2u) { py = sin(lat); }
        if (kind.x == 4u) { point = vec3f(x, py, 0.); }
        else { point = vec3f(x * a.z, point.z * a.w, -py * a.z); }
      }
    } else if (kind.x == 6u) { point = vec3f(point.x * a.x + a.z, point.y * a.y + a.w, point.z); }
    else if (kind.x == 7u) {
      point = (mat4x4f(a, b, c, d) * vec4f(point, 1.)).xyz;
    }
  }
  if (!operationFinite(point.x) || !operationFinite(point.y) || !operationFinite(point.z)) { return none; }
  return OperationPoint(point, true, seam);
}
`;
}

const NONE = Object.freeze({ point: null, valid: false, seam: 0 });

/** CPU reference of operationPoint, reading packed words at `offsets`. */
export function operationTablePoint(input, u, f, offsets, first = 0) {
  let point = [0, 1, 2].map((axis) => Number(input[axis] ?? 0)),
    seam = 0,
    seamScale = 1;
  for (let i = first; i < u[offsets.count]; i++) {
    const k = offsets.kinds + i * OPERATION_KIND_WORDS,
      p = offsets.data + i * OPERATION_DATA_WORDS;
    const kind = u[k],
      code = u[k + 1],
      mapFlags = u[k + 2];
    const a = f.subarray(p, p + 4),
      b = f.subarray(p + 4, p + 8);
    if (kind === 1) {
      const next = point.map((v, axis) => {
        const code = u[k + axis + 1];
        if (code === NO_STAGE_KIND) return v;
        const name = transformName(code),
          stage = f.subarray(p + axis * 4, p + axis * 4 + 4);
        if (!inTransformDomain(name, v) && Number.isFinite(v)) return null;
        return (
          ((transformClamped(name, v, f[p + 12 + axis]) - stage[0]) /
            stage[1]) *
            stage[3] +
          stage[2]
        );
      });
      if (next.includes(null)) return NONE;
      point = next;
    } else if (kind === 2) {
      const radius = a[2] + a[3] * point[1],
        theta = (point[0] - a[1]) * a[0];
      if (!Number.isFinite(radius) || !Number.isFinite(theta) || radius < 0)
        return NONE;
      const x = radius * Math.cos(theta),
        y = radius * Math.sin(theta);
      point =
        code === 1
          ? [point[2], x, y]
          : code === 2
            ? [y, point[2], x]
            : [x, y, point[2]];
    } else if (kind >= 3 && kind <= 5) {
      const lon = (point[0] - a[1]) * a[0],
        radius = a[2] + a[3] * point[2];
      let lat = point[1] * a[0];
      if (
        ![lon, lat, radius].every(Number.isFinite) ||
        Math.abs(lat) > Math.PI / 2 + 1e-9 ||
        radius <= 0
      )
        return NONE;
      const direction = [
        Math.cos(lat) * Math.sin(lon),
        Math.sin(lat),
        Math.cos(lat) * Math.cos(lon),
      ];
      if (kind === 3) point = direction.map((v) => radius * v);
      else if (code === 3) {
        const sl = Math.sin(b[0]),
          cl = Math.cos(b[0]),
          sp = Math.sin(b[1]),
          cp = Math.cos(b[1]);
        const east = direction[0] * cl - direction[2] * sl;
        const north =
          -direction[0] * sp * sl + direction[1] * cp - direction[2] * sp * cl;
        const facing =
          direction[0] * cp * sl + direction[1] * sp + direction[2] * cp * cl;
        if (facing < -1e-9 && !(mapFlags & MAP_FLAGS.unclipped)) return NONE;
        point =
          kind === 4
            ? [radius * east, radius * north, 0]
            : [radius * east, point[2] * a[3], -radius * north];
      } else if (code >= JOINT_CODE) {
        let l = lon - b[0];
        if (!(mapFlags & MAP_FLAGS.unwrap)) {
          const tile = Math.floor((l + Math.PI) / TAU);
          l -= tile * TAU;
          seam += tile * seamScale;
          seamScale *= SEAM_BASE;
        }
        const name = PROJECTION_NAMES[code],
          c = f.subarray(p + 8, p + 12);
        const params =
          name === "albers" ? { n: c[0], c: c[1], rho0: c[2] } : null;
        const usa = name === "albers-usa" ? albersUsa(lon, lat) : null;
        const xy =
          name === "albers-usa"
            ? usa?.point
            : jointForward(name, l, lat, params, { unwrapped: true });
        if (!xy) return NONE;
        seam += (usa?.inset ?? 0) * seamScale;
        seamScale *= SEAM_BASE;
        point =
          kind === 4
            ? [xy[0], xy[1], 0]
            : [xy[0] * a[2], point[2] * a[3], -xy[1] * a[2]];
      } else {
        let x = lon;
        if (!(mapFlags & MAP_FLAGS.unwrap)) {
          const tile = Math.floor((lon + Math.PI) / TAU);
          x = lon - tile * TAU;
          seam += tile * seamScale;
          seamScale *= SEAM_BASE;
        }
        if (
          code === 1 &&
          mapFlags & MAP_FLAGS.cutMercator &&
          Math.abs(lat) > MERCATOR_LIMIT + 1e-6
        )
          return NONE;
        if (code === 1 && mapFlags & MAP_FLAGS.clampMercator)
          lat = Math.max(-MERCATOR_LIMIT, Math.min(MERCATOR_LIMIT, lat));
        const py =
          code === 1
            ? Math.log(Math.tan(lat / 2 + Math.PI / 4))
            : code === 2
              ? Math.sin(lat)
              : lat;
        point =
          kind === 4 ? [x, py, 0] : [x * a[2], point[2] * a[3], -py * a[2]];
      }
    } else if (kind === 6)
      point = [point[0] * a[0] + a[2], point[1] * a[1] + a[3], point[2]];
    else if (kind === 7) {
      const [x, y, z] = point;
      point = [0, 1, 2].map(
        (axis) =>
          f[p + axis] * x +
          f[p + 4 + axis] * y +
          f[p + 8 + axis] * z +
          f[p + 12 + axis],
      );
    }
  }
  return point.every(Number.isFinite) ? { point, valid: true, seam } : NONE;
}

/** Pack records into a private table and return its CPU evaluator. Export
 * uses this so vector paths see the same f32 parameters, flags and seams as
 * the GPU refinement pass. */
export function operationSampler(operations, flags = () => 0) {
  const offsets = {
    count: 0,
    kinds: 4,
    data: 4 + OPERATION_LIMIT * OPERATION_KIND_WORDS,
  };
  const raw = new ArrayBuffer(
    (offsets.data + OPERATION_LIMIT * OPERATION_DATA_WORDS) * 4,
  );
  const u = new Uint32Array(raw),
    f = new Float32Array(raw);
  packOperationTable(operations, u, f, offsets, flags);
  return (point, first = 0) => operationTablePoint(point, u, f, offsets, first);
}
