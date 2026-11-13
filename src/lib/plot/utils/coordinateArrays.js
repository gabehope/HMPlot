// @ts-check
// The coordinate contract's device-array implementation. It borrows positions and owns only
// its mapping intermediates; consumers receive one owned array, as with the CPU/WGSL mapping.
import { Array as JaxArray, numpy as np } from "@hmplot/jax";
import {
  jaxTransformForward,
  DEFAULT_TRANSFORM_CONSTANT,
} from "./scaleTransforms.js";
import { jointProjection, jaxJointForward } from "./mapProjections.js";
import { resolveCoordinateOperations } from "./coordinateOperations.js";
import { TAU } from "./coordinates.js";
import { deviceParams } from "./deviceParams.js";

/**
 * Map `[N, 1|2|3]` data positions through the whole frame chain of `options` (every stage from
 * the mark's own scale out to the world or its placed frame), on jax: the numbers the render
 * material's framePoint computes, so a connection can draw endpoints of other frames
 * in world space. Missing columns read as 0 (a 2D mark's z). NaN rows stay NaN, and so does a
 * value outside its axis transform's domain (TODO 39.1).
 * Borrows `input`; returns a new `[N, 3]` array.
 */
/** @param {JaxArray} input @param {import("./coordinateOperations.js").CoordinateOptions} options
 * @param {{includePlacement?: boolean}} [settings] @returns {JaxArray} */
export function mapThroughFrame(
  input,
  options,
  { includePlacement = false } = {},
) {
  return mapOperations(
    input,
    resolveCoordinateOperations(options, { includePlacement }),
  );
}
/**
 * mapThroughFrame over resolved operation records (resolveCoordinateOperations). Each step
 * borrows the previous columns and its own intermediates with `.ref`, and releases them
 * all once its new columns exist, so repeated mapping leaves no arrays behind.
 * Borrows `input`; returns a new `[N, 3]` array.
 */
/** @param {JaxArray} input @param {readonly import("./coordinateOperations.js").ResolvedCoordinateOperation[]} operations
 * @returns {JaxArray} */
export function mapOperations(input, operations) {
  const count = input.shape[0];
  let columns = [0, 1, 2].map((index) =>
    index < input.shape[1] ? input.ref.slice([], index) : np.zeros([count]),
  );
  for (const operation of operations) {
    const held = [...columns],
      keep = (/** @type {JaxArray} */ array) => (held.push(array), array);
    try {
      columns = mapOperation(operation, columns, keep, count);
    } finally {
      for (const array of held) array.dispose();
    }
  }
  return np.stack(columns, 1);
}
// One operation over borrowed [x, y, z] columns. `keep` registers an intermediate
// that is read more than once (always through `.ref`) for release after the step.
/** @param {import("./coordinateOperations.js").ResolvedCoordinateOperation} operation
 * @param {JaxArray[]} columns @param {(array: JaxArray) => JaxArray} keep @param {number} count
 * @returns {JaxArray[]} */
function mapOperation(operation, [x, y, z], keep, count) {
  if (operation.kind === "scale")
    return [x, y, z].map((column, index) => {
      const stage =
        operation.axes[
          /** @type {import("./internalTypes.js").AxisName} */ ("xyz"[index])
        ];
      if (!stage) return column.ref;
      const [a, d, r0, span, c] = deviceParams([
        stage.a,
        stage.d,
        stage.r0,
        stage.span,
        stage.constant ?? DEFAULT_TRANSFORM_CONSTANT,
      ]);
      const mapped = jaxTransformForward(stage.kind ?? "linear", column, c);
      c.dispose();
      return mapped.sub(a).div(d).mul(span).add(r0);
    });
  if (operation.kind === "fit") {
    const [sx, sy, tx, ty] = deviceParams([
      operation.sx,
      operation.sy,
      operation.tx,
      operation.ty,
    ]);
    return [x.ref.mul(sx).add(tx), y.ref.mul(sy).add(ty), z.ref];
  }
  if (operation.kind === "matrix") {
    const m = deviceParams(operation.elements).map(keep);
    return [0, 1, 2].map((axis) =>
      x.ref
        .mul(m[axis].ref)
        .add(y.ref.mul(m[axis + 4].ref))
        .add(z.ref.mul(m[axis + 8].ref))
        .add(m[axis + 12].ref),
    );
  }
  if (operation.kind === "polar") {
    const [factor, origin, base, radial] = deviceParams([
      operation.factor,
      operation.origin,
      operation.base,
      operation.radial,
    ]);
    const angle = keep(x.ref.sub(origin).mul(factor)),
      radius = keep(y.ref.mul(radial).add(base)),
      px = radius.ref.mul(np.cos(angle.ref)),
      py = radius.ref.mul(np.sin(angle.ref)),
      valid = keep(
        np.logicalAnd(np.isfinite(angle.ref), radius.ref.greaterEqual(0)),
      );
    const out =
      operation.axis === "X"
        ? [z.ref, px, py]
        : operation.axis === "Y"
          ? [py, z.ref, px]
          : [px, py, z.ref];
    return out.map((column) => np.where(valid.ref, column, np.nan));
  }
  if (operation.kind.startsWith("spherical-")) {
    const [factor, origin, base, radial] = deviceParams([
      operation.factor,
      operation.origin,
      operation.base,
      operation.radial,
    ]).map(keep);
    const lon = keep(x.ref.sub(origin.ref).mul(factor.ref)),
      lat = keep(y.ref.mul(factor.ref)),
      radius = keep(z.ref.mul(radial.ref).add(base.ref)),
      cosLat = keep(np.cos(lat.ref)),
      dirX = keep(cosLat.ref.mul(np.sin(lon.ref))),
      dirY = keep(np.sin(lat.ref)),
      dirZ = keep(cosLat.ref.mul(np.cos(lon.ref)));
    let valid = keep(
      np.logicalAnd(
        np.isfinite(lon.ref),
        np.logicalAnd(
          np.abs(lat.ref).lessEqual(Math.PI / 2 + 1e-9),
          radius.ref.greater(0),
        ),
      ),
    );
    let out;
    if (operation.kind === "spherical-globe")
      out = [
        radius.ref.mul(dirX.ref),
        radius.ref.mul(dirY.ref),
        radius.ref.mul(dirZ.ref),
      ];
    else if (operation.projection === "orthographic") {
      const [centerLon, centerLat] = deviceParams([
        operation.centerLongitude,
        operation.centerLatitude,
      ]);
      const sl = keep(np.sin(centerLon.ref)),
        cl = keep(np.cos(centerLon)),
        sp = keep(np.sin(centerLat.ref)),
        cp = keep(np.cos(centerLat)),
        east = dirX.ref.mul(cl.ref).sub(dirZ.ref.mul(sl.ref)),
        north = dirX.ref
          .mul(sp.ref)
          .mul(sl.ref)
          .mul(-1)
          .add(dirY.ref.mul(cp.ref))
          .sub(dirZ.ref.mul(sp.ref).mul(cl.ref)),
        facing = dirX.ref
          .mul(cp.ref)
          .mul(sl.ref)
          .add(dirY.ref.mul(sp.ref))
          .add(dirZ.ref.mul(cp.ref).mul(cl.ref)),
        px = radius.ref.mul(east),
        py = radius.ref.mul(north);
      valid = keep(np.logicalAnd(valid.ref, facing.greaterEqual(-1e-9)));
      out =
        operation.kind === "spherical-map3d"
          ? [px, z.ref.mul(radial.ref), py.mul(-1)]
          : [px, py, np.zeros([count])];
    } else if (jointProjection(operation.projection)) {
      // A joint projection: λ relative to the center, wrapped to its one extent (mapProjections.js).
      const [centerLon] = deviceParams([operation.centerLongitude]);
      // Floored, as the shaders wrap (jax's mod keeps the dividend's sign).
      const shifted = keep(lon.ref.sub(centerLon).add(Math.PI));
      const relative = keep(
        shifted.ref.sub(np.floor(shifted.ref.div(TAU)).mul(TAU)).sub(Math.PI),
      );
      const conic = operation.conic && {
        n: operation.conic[0],
        c: operation.conic[1],
        rho0: operation.conic[2],
      };
      const [px, py, inside] = jaxJointForward(
        operation.projection,
        relative,
        lat,
        conic,
        lon,
      );
      if (inside) valid = keep(np.logicalAnd(valid.ref, inside));
      out =
        operation.kind === "spherical-map3d"
          ? [px.mul(base.ref), z.ref.mul(radial.ref), py.mul(base.ref).mul(-1)]
          : [px, py, np.zeros([count])];
    } else {
      const shifted = keep(lon.ref.add(Math.PI));
      const wrapped = shifted.ref
        .sub(np.floor(shifted.ref.div(TAU)).mul(TAU))
        .sub(Math.PI);
      const projectedY =
        operation.projection === "mercator"
          ? np.log(np.tan(lat.ref.div(2).add(Math.PI / 4)))
          : operation.projection === "equal-area"
            ? np.sin(lat.ref)
            : lat.ref;
      out =
        operation.kind === "spherical-map3d"
          ? [
              wrapped.mul(base.ref),
              z.ref.mul(radial.ref),
              projectedY.mul(base.ref).mul(-1),
            ]
          : [wrapped, projectedY, np.zeros([count])];
    }
    return out.map((column) => np.where(valid.ref, column, np.nan));
  }
  return [x.ref, y.ref, z.ref];
}
