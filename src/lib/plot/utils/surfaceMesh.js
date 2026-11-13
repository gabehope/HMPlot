import { transformClamped, transformForward } from "./scaleTransforms.js";
import { existingHostSource } from "./hostSources.js";
import { Array as JaxArray } from "@hmplot/jax";
export async function readArrays(values) {
  // Take references synchronously, before the first await.
  const held = Object.fromEntries(
    Object.entries(values).map(([key, value]) => [
      key,
      value instanceof JaxArray ? (existingHostSource(value) ?? value.ref) : value,
    ]),
  );
  try {
    return Object.fromEntries(
      await Promise.all(
        Object.entries(held).map(async ([key, value]) => [
          key,
          value instanceof JaxArray ? await value.ref.jsAsync() : value,
        ]),
      ),
    );
  } finally {
    for (const value of Object.values(held))
      if (value instanceof JaxArray) value.dispose();
  }
}
/** A number through one scale onto `range`; NaN outside the transform's domain (TODO 39.1). */
export function transformNumber(
  value,
  kind = "linear",
  bounds = [-1, 1],
  range = [-50, 50],
  constant = 1,
) {
  const name = kind ?? "linear", f = (x) => transformClamped(name, x, constant);
  const d = f(bounds[1]) - f(bounds[0]);
  return (
    ((transformForward(name, value, constant) - f(bounds[0])) / (Math.abs(d) < 1e-8 ? 1e-8 : d)) *
      (range[1] - range[0]) +
    range[0]
  );
}
export function transformPoint(point, options) {
  return [0, 1, 2].map((i) => {
    const axis = "xyz"[i];
    return transformNumber(
      point[i] ?? 0,
      options.get(`${axis}Transform`),
      options.get(`${axis}bounds`),
      options.get(`${axis}range`),
      options.get(`${axis}TransformConstant`) ?? 1,
    );
  });
}
export function positions(value, label = "position") {
  if (value == null || value.length === 0) return [];
  const rows = typeof value[0] === "number" ? [value] : value;
  if (
    !rows.every(
      (row) =>
        [2, 3].includes(row.length) && Array.from(row).every(Number.isFinite),
    )
  )
    throw new Error(`${label} must contain finite 2D or 3D coordinates`);
  return rows.map((row) => [row[0], row[1], row[2] ?? 0]);
}
export function surfaceMesh({ height, x, y, position, indices, fill }) {
  let vertices, triangles, values;
  if (height != null) {
    const h = height.length,
      w = height[0]?.length ?? 0;
    if (!h || !w) return { vertices: [], triangles: [], values: [] };
    if (
      !height.every(
        (row) => row.length === w && Array.from(row).every(Number.isFinite),
      )
    )
      throw new Error("Surface height must be a rectangular finite grid");
    if ((x && x.length !== w) || (y && y.length !== h))
      throw new Error("Surface axes must match grid dimensions");
    vertices = [];
    triangles = [];
    values = [];
    for (let j = 0; j < h; j++)
      for (let i = 0; i < w; i++) {
        vertices.push([
          x?.[i] ?? (w === 1 ? 0 : (2 * i) / (w - 1) - 1),
          y?.[j] ?? (h === 1 ? 0 : (2 * j) / (h - 1) - 1),
          height[j][i],
        ]);
        values.push(
          typeof fill === "object" && fill ? fill[j]?.[i] : height[j][i],
        );
      }
    for (let j = 0; j < h - 1; j++)
      for (let i = 0; i < w - 1; i++) {
        const a = j * w + i;
        triangles.push(a, a + 1, a + w, a + 1, a + w + 1, a + w);
      }
  } else {
    vertices = positions(position);
    triangles = Array.from(indices ?? []).flat();
    if (
      triangles.length % 3 ||
      triangles.some(
        (i) => !Number.isInteger(i) || i < 0 || i >= vertices.length,
      )
    )
      throw new Error("Surface indices must contain valid triangle indices");
    values =
      Array.isArray(fill) || ArrayBuffer.isView(fill)
        ? Array.from(fill).flat()
        : vertices.map((v) => v[2]);
    if (values.length !== vertices.length)
      throw new Error("Surface fill must match vertex count");
  }
  if (
    vertices.some((v) => !v.every(Number.isFinite)) ||
    values.some((v) => !Number.isFinite(v))
  )
    throw new Error("Surface coordinates and values must be finite");
  return { vertices, triangles, values };
}
export function vertexNormals(vertices, triangles) {
  const result = vertices.map(() => [0, 0, 0]);
  for (let i = 0; i < triangles.length; i += 3) {
    const [a, b, c] = triangles.slice(i, i + 3),
      u = vertices[b].map((v, k) => v - vertices[a][k]),
      v = vertices[c].map((v, k) => v - vertices[a][k]);
    const n = [
      u[1] * v[2] - u[2] * v[1],
      u[2] * v[0] - u[0] * v[2],
      u[0] * v[1] - u[1] * v[0],
    ];
    for (const index of [a, b, c])
      n.forEach((value, k) => (result[index][k] += value));
  }
  return result.map((n) => {
    const length = Math.hypot(...n);
    return length ? n.map((v) => v / length) : [0, 0, 1];
  });
}
