// @ts-check
import { jointProjection } from "./mapProjections.js";
import { float, reference, vec3, vec4 } from "three/tsl";
import {
  applyScale,
  scaleValid,
} from "../../threeExtensions/materials/materials.js";
import { coordinatePoint, orthographicFacing } from "./coordinateNodes.js";
import { buildCoordinateOperations } from "./coordinateOperations.js";
import { aspect3dSource } from "./aspect3d.js";
import { isFinitePoint } from "./mappedValidity.js";

/** @typedef {import("three/webgpu").Node<"vec3">} ShaderNode
 * @typedef {[import("three/webgpu").Node<"float">, import("three/webgpu").Node<"float">, import("three/webgpu").Node<"float">]} ShaderComponents
 * @typedef {import("./internalTypes.js").AxisName} AxisName
 * @typedef {import("./coordinateOperations.js").CoordinateOptions & {transformed: object}} ShaderOptions
 * @typedef {import("./coordinateOperations.js").ProjectionOperation & {options: ShaderOptions}} ShaderProjectionOperation
 * @typedef {{options: ShaderOptions, frameMatrixNode: import("three/webgpu").Node<"mat4">} &
 * Record<`${AxisName}Transform`, string> & Record<`${AxisName}boundsNode` | `${AxisName}rangeNode`, import("three/webgpu").Node<"vec2">>} FrameNodeMark
 * @typedef {{first?: number, tolerant?: boolean, local?: {unwrap?: boolean, unclipped?: boolean} | null,
 * horizon?: {facing?: import("three/webgpu").Node<"float"> | null} | null, unwrapRoot?: boolean,
 * seam?: {shift?: number, x?: import("three/webgpu").Node<"float"> | null} | null}} FrameNodeSettings
 */
/** Texture surfaces already supply world positions; apply only the shared
 * display metric, while their attached marks sample these same positions. */
/** @param {ShaderOptions} options @param {ShaderNode} point */
export function aspect3dPositionNode(options, point) {
  const source = aspect3dSource(options);
  if (!source) return point;
  return vec3(
    .../** @type {ShaderComponents} */ (
      /** @type {AxisName[]} */ (["x", "y", "z"]).map((axis) =>
        applyScale({
          valueNode: point[axis],
          valueTransform: "linear",
          boundsNode: reference(axis + "bounds", "vec2", source.transformed),
          outputRangeNode: reference(
            axis + "range",
            "vec2",
            source.transformed,
          ),
        }),
      )
    ),
  );
}

/** Inverse transpose of the diagonal display metric for already-normalized
 * mesh normals (translation and range inversion do not alter this metric). */
/** @param {ShaderOptions} options @param {ShaderNode} normal */
export function aspect3dNormalNode(options, normal) {
  const source = aspect3dSource(options);
  if (!source) return normal;
  return vec3(
    .../** @type {ShaderComponents} */ (
      /** @type {AxisName[]} */ (["x", "y", "z"]).map((axis) => {
        const input = reference(axis + "bounds", "vec2", source.transformed),
          output = reference(axis + "range", "vec2", source.transformed);
        return normal[axis].mul(
          input.y.sub(input.x).div(output.y.sub(output.x)),
        );
      })
    ),
  ).normalize();
}

/** Compile the same ordered operations used by export. Sources stay as references, so live
 * domains, ranges and projection settings do not require rebuilding the mark's position buffers.
 * `first` skips operations already applied (a chord on a local globe is canonical); `tolerant`
 * maps a refined cut point that rounds just past its boundary (coordinatePoint). On the validity
 * contract (mappedValidity.js, TODO 136.11): the mapped position and whether it is one. A stage
 * that cannot map the point (a log axis at or below zero, a horizon, a projection's edge) makes
 * it invalid, and the stages after it map the projected point; a point that is not finite is
 * invalid too.
 * @param {FrameNodeMark} mark @param {ShaderNode} point @param {FrameNodeSettings} [settings]
 * @returns {import("./mappedValidity.js").MappedPoint} */
export function framePoint(
  mark,
  point,
  {
    first = 0,
    tolerant = false,
    local = null,
    horizon = null,
    unwrapRoot = false,
    seam = null,
  } = {},
) {
  const operations = buildCoordinateOperations(mark.options).slice(first);
  // A coordinate outside its axis transform's domain is missing (TODO 39.1): it maps to NaN,
  // which is not finite, so the point is invalid.
  /** @type {import("three/webgpu").Node<"bool">[]} */
  const checks = [];
  const mapped = operations.reduce((current, operation, index) => {
    if (operation.kind === "scale") {
      return vec3(
        .../** @type {ShaderComponents} */ (
          /** @type {AxisName[]} */ (["x", "y", "z"]).map((axis) => {
            const stage = operation.axes?.[axis];
            if (!stage) return current[axis];
            const source = /** @type {ShaderOptions} */ (
              stage.source ?? mark.options
            );
            const transform =
              source === mark.options
                ? mark[
                    /** @type {`${AxisName}Transform`} */ (axis + "Transform")
                  ]
                : (source.get(axis + "Transform") ?? "linear");
            const valid = scaleValid({
              valueNode: current[axis],
              valueTransform: transform,
            });
            if (valid) checks.push(valid);
            return applyScale({
              valueNode: current[axis],
              valueTransform: transform,
              // Baked transforms: only a symlog stage reads its constant (a live uniform).
              constantNode:
                transform === "symlog"
                  ? reference(
                      axis + "TransformConstant",
                      "float",
                      source.transformed,
                    )
                  : null,
              boundsNode:
                source === mark.options && !stage.source
                  ? mark[
                      /** @type {`${AxisName}boundsNode`} */ (
                        axis + "boundsNode"
                      )
                    ]
                  : reference(axis + "bounds", "vec2", source.transformed),
              outputRangeNode:
                source === mark.options && !stage.source
                  ? mark[
                      /** @type {`${AxisName}rangeNode`} */ (axis + "rangeNode")
                    ]
                  : reference(stage.rangeKey, "vec2", source.transformed),
            });
          })
        ),
      );
    }
    // `local` options (unwrap, unclipped) apply to the mark's own operation only.
    // A `horizon` collector takes the first orthographic operation unclipped
    // and receives the facing of its input, for the caller to cut at zero.
    if (operation.kind === "polar" || operation.kind.startsWith("spherical-")) {
      const facing =
        horizon &&
        !horizon.facing &&
        orthographicFacing(
          mark,
          current,
          /** @type {ShaderProjectionOperation} */ (operation).options,
        );
      if (facing) horizon.facing = facing;
      // `unwrapRoot`: a repeating root flat map (the last operation) keeps
      // longitude unwrapped, so a grid across its antimeridian stays whole.
      const root =
        unwrapRoot &&
        index === operations.length - 1 &&
        operation.kind === "spherical-map2d";
      // A `seam` collector takes the first nested flat map unwrapped, shifted
      // by `seam.shift` (a copy one longitude period over), and receives its
      // map-space x, for the caller to clip to the map's one extent [-pi, pi].
      const flat =
        seam &&
        !seam.x &&
        !root &&
        operation.kind === "spherical-map2d" &&
        index > 0 &&
        /** @type {ShaderProjectionOperation} */ (operation).options?.get?.(
          "projection",
        ) !== "orthographic" &&
        !jointProjection(
          /** @type {ShaderProjectionOperation} */ (operation).options?.get?.(
            "projection",
          ),
        );
      const { position: mapped, valid } = coordinatePoint(mark, current, {
        coordinateOptions: /** @type {ShaderProjectionOperation} */ (operation)
          .options,
        tolerant,
        ...(first === 0 && index === 0 ? local : null),
        ...(facing ? { unclipped: true } : null),
        ...(root || flat ? { unwrap: true } : null),
      });
      checks.push(valid);
      if (!flat) return mapped;
      const shifted = mapped.add(vec3(seam.shift ?? 0, 0, 0));
      // A point this stage cannot map is outside the extent, for the caller's clip: far outside,
      // so a triangle with such a corner is cut whole.
      seam.x = valid.select(shifted.x, float(1e20));
      return shifted;
    }
    if (operation.kind === "fit") {
      const source = /** @type {ShaderOptions} */ (operation.source),
        xRange = reference("_frameXRange", "vec2", source.transformed),
        yRange = reference("_frameYRange", "vec2", source.transformed),
        radius =
          operation.radiusKind === "polar"
            ? (() => {
                const bounds = reference("ybounds", "vec2", source.transformed),
                  base = reference("baseRadius", "float", source.transformed),
                  radial = reference(
                    "radialScale",
                    "float",
                    source.transformed,
                  );
                return base
                  .add(bounds.x.mul(radial))
                  .max(base.add(bounds.y.mul(radial)))
                  .max(1e-6);
              })()
            : reference("baseRadius", "float", source.transformed),
        dx = xRange.y.sub(xRange.x),
        dy = yRange.y.sub(yRange.x),
        size = dx.abs().min(dy.abs()).div(radius.mul(2));
      return vec3(
        xRange.x
          .add(xRange.y)
          .div(2)
          .add(current.x.mul(size).mul(dx.greaterThan(0).select(1, -1))),
        yRange.x
          .add(yRange.y)
          .div(2)
          .add(current.y.mul(size).mul(dy.greaterThan(0).select(1, -1))),
        current.z,
      );
    }
    if (operation.kind === "matrix")
      return mark.frameMatrixNode.mul(vec4(current, 1)).xyz;
    throw Error(
      `Unknown coordinate operation: ${/** @type {{kind: string}} */ (operation).kind}.`,
    );
  }, point);
  const finite = isFinitePoint(mapped);
  return {
    position: mapped,
    valid: checks.reduce((all, valid) => all.and(valid), finite),
  };
}
