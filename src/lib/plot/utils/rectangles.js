import { numpy as np } from "@hmplot/jax";
import { planProgram } from "./programs.js";
import { asArray, shapeOf } from "./data.js";
import { deviceArray } from "./deviceParams.js";
export function rectangleArrays(kind, props) {
  const axis = props.axis ?? "z";
  if (!["x", "y", "z"].includes(axis))
    throw Error("Prism axis must be x, y, or z.");
  const keys =
    kind === "rect"
      ? ["x0", "x1", "y0", "y1", "z0", "z1"]
      : [
          "x",
          "y",
          "z",
          "x0",
          "x1",
          "y0",
          "y1",
          "z0",
          "z1",
          "width",
          "depth",
          "rotation",
        ];
  let n = null;
  for (const key of keys)
    if (props[key] !== undefined && typeof props[key] !== "number") {
      const s = shapeOf(props[key]);
      if (s.length !== 1 || (n !== null && s[0] !== n))
        throw Error(
          `${key} must be a scalar or a matching one-dimensional array.`,
        );
      n = s[0];
    }
  n ??= 1;
  if (
    kind === "rect" &&
    ["x0", "x1", "y0", "y1"].some((k) => props[k] === undefined)
  )
    throw Error("Rect requires x0, x1, y0, and y1.");
  if (kind === "rect" && (props.z0 === undefined) !== (props.z1 === undefined))
    throw Error("Rect: z0 and z1 go together (the rectangle's depth in a 3D plot); pass both, or neither.");
  if (
    kind === "prism" &&
    (props[axis + "0"] === undefined || props[axis + "1"] === undefined)
  )
    throw Error(`Prism requires ${axis}0 and ${axis}1.`);
  // The device work is one compiled program per plan (TODO 33.3): the kind, the axis and each
  // read key's source (a column, or a number's index in one buffer: a new width or rotation
  // compiles nothing).
  const read =
    kind === "rect"
      ? ["x0", "x1", "y0", "y1", "z0", "z1", "rotation"]
      : [
          axis + "0",
          axis + "1",
          ...[..."xyz"].filter((a) => a !== axis),
          "width",
          "depth",
          "rotation",
        ];
  if (kind === "prism")
    for (const a of "xyz")
      if (a !== axis && props[a] === undefined)
        throw Error(`Prism needs a ${a} center.`);
  const sources = {},
    arrays = {},
    numbers = [];
  for (const key of read) {
    const value = props[key];
    if (value === undefined) continue;
    if (typeof value === "number") sources[key] = numbers.push(value) - 1;
    else {
      sources[key] = "column";
      arrays[key] = asArray(value);
    }
  }
  const plan = {
    kind,
    axis,
    sources,
    ...(Object.keys(arrays).length ? {} : { n }),
  };
  return rectangleProgram(plan)({
    arrays,
    ...(numbers.length ? { params: deviceArray(numbers) } : {}),
  });
}

/**
 * rectangleArrays' device work for a plan: each box's lower and upper corner ([n, 3]; NaN for
 * an invalid box: a missing coordinate, rotation or a lower corner past the upper) and its
 * rotation. Consumes `arrays` and `params`.
 */
function rectangleKernel({ kind, axis, sources, n: rows }, { arrays, params }) {
  const n = rows ?? Object.values(arrays)[0].shape[0];
  const col = (key, fallback = 0) => {
    const source = sources[key];
    if (source === "column") return arrays[key];
    if (source !== undefined)
      return np.broadcastTo(params.ref.slice(source), [n]);
    return np.full([n], fallback);
  };
  const lo = [],
    hi = [];
  if (kind === "rect")
    for (const a of "xyz") {
      lo.push(col(a + "0"));
      hi.push(col(a + "1"));
    }
  else {
    const plane = [..."xyz"].filter((a) => a !== axis);
    for (const a of "xyz") {
      if (a === axis) {
        lo.push(col(a + "0"));
        hi.push(col(a + "1"));
      } else {
        const center = col(a),
          span = col(plane.indexOf(a) === 0 ? "width" : "depth", 1);
        lo.push(center.ref.sub(span.ref.mul(0.5)));
        hi.push(center.add(span.mul(0.5)));
      }
    }
  }
  const lower = np.stack(lo, 1),
    upper = np.stack(hi, 1);
  const turn = col("rotation");
  params?.dispose();
  const valid = np
    .logicalAnd(
      np.isfinite(turn.ref),
      np.all(
        np.logicalAnd(
          np.logicalAnd(np.isfinite(lower.ref), np.isfinite(upper.ref)),
          lower.ref.lessEqual(upper.ref),
        ),
        1,
      ),
    )
    .reshape([-1, 1]);
  return {
    position: np.where(valid.ref, lower, np.nan),
    extent: np.where(valid, upper, np.nan),
    turn,
  };
}
const PROGRAMS = new Map();
/** rectangleKernel compiled once per plan (utils/programs.js). */
const rectangleProgram = (plan) => planProgram(PROGRAMS, plan, rectangleKernel);

export function prismFootprint(shape = "rectangle") {
  if (shape === "rectangle")
    return [
      [-0.5, -0.5],
      [0.5, -0.5],
      [0.5, 0.5],
      [-0.5, 0.5],
    ];
  const count =
    shape === "triangle"
      ? 3
      : shape === "hexagon"
        ? 6
        : shape === "circle"
          ? 48
          : 0;
  if (!count) throw Error("Unknown prism footprint.");
  const points = Array.from({ length: count }, (_, i) => [
    Math.cos((i * 2 * Math.PI) / count),
    Math.sin((i * 2 * Math.PI) / count),
  ]);
  const lo = [0, 1].map((a) => Math.min(...points.map((p) => p[a]))),
    hi = [0, 1].map((a) => Math.max(...points.map((p) => p[a])));
  return points.map((p) =>
    p.map((v, a) => (v - lo[a]) / (hi[a] - lo[a]) - 0.5),
  );
}

/** Input-coordinate bounds, including a rotated footprint, for facet domain collection. */
export function rectangleDomainArrays(kind, props) {
  const data = rectangleArrays(kind === "Rect" ? "rect" : "prism", props);
  // Every footprint spans [-0.5, 0.5] of its width and depth, so an unrotated prism's bounds are
  // its corners (TODO 33.2: the rotation below cost a box plot ~90 operations per preparation).
  if (kind === "Rect" || props.rotation === undefined || props.rotation === 0) {
    data.turn.dispose();
    return { lower: data.position, upper: data.extent };
  }
  const plane = [..."xyz"].filter((a) => a !== (props.axis ?? "z")),
    axis = [..."xyz"].indexOf(props.axis ?? "z");
  const u = [..."xyz"].indexOf(plane[0]),
    v = [..."xyz"].indexOf(plane[1]);
  const center = data.position.ref.add(data.extent.ref).mul(0.5),
    span = data.extent.ref.sub(data.position.ref),
    angle = data.turn.ref.mul(Math.PI / 180),
    cos = np.cos(angle.ref),
    sin = np.sin(angle);
  let lowU = np.full([data.position.shape[0]], Infinity),
    highU = np.full([data.position.shape[0]], -Infinity),
    lowV = lowU.ref,
    highV = highU.ref;
  for (const [a, b] of prismFootprint(props.shape)) {
    const x = span.ref.slice([], u).mul(a),
      y = span.ref.slice([], v).mul(b);
    const ru = x.ref.mul(cos.ref).sub(y.ref.mul(sin.ref)),
      rv = x.mul(sin.ref).add(y.mul(cos.ref));
    lowU = np.minimum(lowU, ru.ref);
    highU = np.maximum(highU, ru);
    lowV = np.minimum(lowV, rv.ref);
    highV = np.maximum(highV, rv);
  }
  const lower = [],
    upper = [];
  for (let i = 0; i < 3; i++) {
    if (i === axis) {
      lower.push(data.position.ref.slice([], i));
      upper.push(data.extent.ref.slice([], i));
    } else {
      lower.push(center.ref.slice([], i).add(i === u ? lowU : lowV));
      upper.push(center.ref.slice([], i).add(i === u ? highU : highV));
    }
  }
  center.dispose();
  span.dispose();
  cos.dispose();
  sin.dispose();
  Object.values(data).forEach((a) => a.dispose());
  return { lower: np.stack(lower, 1), upper: np.stack(upper, 1) };
}
