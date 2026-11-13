import test from "node:test";
import assert from "node:assert/strict";
import {
  surfaceMesh,
  vertexNormals,
  transformPoint,
} from "../../src/lib/plot/utils/surfaceMesh.js";
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-7, `${a} != ${b}`);
test("grid topology and analytic plane normals", () => {
  const { vertices, triangles } = surfaceMesh({
    height: [
      [0, 1],
      [2, 3],
    ],
    x: [0, 1],
    y: [0, 1],
  });
  assert.equal(triangles.length, 6);
  const expected = [-1, -2, 1].map((v) => v / Math.sqrt(6));
  for (const normal of vertexNormals(vertices, triangles))
    normal.forEach((v, i) => near(v, expected[i]));
});
test("normal computation accounts for nonuniform transformed coordinates", () => {
  const options = {
    get: (key) =>
      key.endsWith("Transform")
        ? "linear"
        : key.endsWith("bounds")
          ? [0, 1]
          : key === "xrange"
            ? [0, 2]
            : key === "yrange"
              ? [0, 4]
              : [0, 1],
  };
  const { vertices, triangles } = surfaceMesh({
    height: [
      [0, 1],
      [2, 3],
    ],
    x: [0, 1],
    y: [0, 1],
  });
  const normal = vertexNormals(
    vertices.map((p) => transformPoint(p, options)),
    triangles,
  )[0];
  const expected = [-0.5, -0.5, 1].map((v) => v / Math.sqrt(1.5));
  normal.forEach((v, i) => near(v, expected[i]));
});
test("invalid meshes fail and degenerate faces have finite normals", () => {
  assert.throws(
    () => surfaceMesh({ position: [[0, 0, 0]], indices: [0, 1, 2] }),
    /valid triangle/,
  );
  assert.throws(() => surfaceMesh({ height: [[1, 2], [3]] }), /rectangular/);
  assert.deepEqual(vertexNormals([[0, 0, 0]], [0, 0, 0]), [[0, 0, 1]]);
});
