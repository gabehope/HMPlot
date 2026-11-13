// GPU array leaks (TODO 17.11): jax-js frees an array when its last reference is disposed, so a
// missed dispose keeps the array forever. These tests count the backend's live slots around
// repeated work that should leave nothing behind.
import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { init, defaultDevice } from "@hmplot/jax";
import { createDataScope } from "../../src/lib/plot/utils/categorical.js";
import { runTransform } from "../../src/lib/plot/utils/transforms.js";
import { evaluateExpression, subtract, mean, multiply } from "../../src/lib/plot/utils/expressions.js";

await init("cpu");
defaultDevice("cpu");
// The backend chunk exports getBackend under a minified name ("s" in 0.1.24 and 0.1.25; see kernel-literals).
const dist = dirname(fileURLToPath(import.meta.resolve("@hmplot/jax")));
const chunk = readdirSync(dist).find((file) => /^backend-.*\.js$/.test(file));
const backend = (await import(pathToFileURL(join(dist, chunk)).href)).s("cpu");
const references = new Map();
for (const [name, delta] of [["incRef", 1], ["decRef", -1]]) {
  const original = backend[name].bind(backend);
  backend[name] = (slot) => { references.set(slot, (references.get(slot) ?? 0) + delta); return original(slot); };
}
const malloc = backend.malloc.bind(backend);
backend.malloc = (...args) => { const slot = malloc(...args); references.set(slot, 1); return slot; };
const live = () => [...references.values()].filter((count) => count > 0).length;
/** Live slots `run` leaves behind per call, after a warm-up call. */
async function leftBehind(run, times = 8) {
  await run();
  const before = live();
  for (let i = 0; i < times; i++) await run();
  return (live() - before) / times;
}

test("an expression over a host float32 column releases every array (astype to the same dtype)", async () => {
  const scope = createDataScope();
  scope.update({ v: Float32Array.from({ length: 64 }, (_, i) => i) });
  assert.equal(await leftBehind(async () => {
    const evaluated = evaluateExpression(subtract("v", mean("v")), scope);
    evaluated.dispose();
  }), 0);
  scope.dispose();
});

test("Filter > Calculate with a reduction over host columns leaves nothing behind", async () => {
  const scope = createDataScope();
  scope.update({ v: Float32Array.from({ length: 64 }, (_, i) => i % 7), k: Float32Array.from({ length: 64 }, (_, i) => i % 5) });
  let threshold = 0;
  assert.equal(await leftBehind(async () => {
    const filtered = await runTransform("Filter", scope, { where: { field: "k", op: "gt", value: (threshold++ % 4) + 0.5 } });
    const calculated = await runTransform("Calculate", filtered, { columns: { dv: subtract("v", mean("v")), v2: multiply("v", 2) } });
    await calculated.padded().get("dv").ref.data();
    calculated.dispose();
    filtered.dispose();
  }), 0);
  scope.dispose();
});

test("mapping positions through every coordinate operation kind leaves nothing behind and matches the CPU table", async () => {
  const { numpy: np } = await import("@hmplot/jax");
  const { mapOperations } = await import("../../src/lib/plot/utils/coordinateArrays.js");
  const { operationSampler } = await import("../../src/lib/plot/utils/operationTable.js");
  const degree = Math.PI / 180;
  const chains = {
    "log/sqrt scale, then fit": [
      { kind: "scale", axes: { x: { kind: "log", a: 0, d: Math.log(100), r0: -1, span: 2 },
        y: { kind: "sqrt", a: 0, d: 3, r0: 0, span: 6 } } },
      { kind: "fit", sx: 2, sy: 2, tx: 0.5, ty: -0.5 }],
    "placement matrix": [{ kind: "matrix", elements: [0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 1, 0, 3, 4, 5, 1] }],
    "polar": [{ kind: "polar", factor: 2 * Math.PI / 24, origin: 0, base: 0, radial: 1, axis: "Z" }],
    "orthographic": [{ kind: "spherical-map2d", factor: degree, origin: 0, base: 1, radial: 0,
      projection: "orthographic", centerLongitude: 20 * degree, centerLatitude: 10 * degree }],
    "mercator": [{ kind: "spherical-map2d", factor: degree, origin: 0, base: 1, radial: 0,
      projection: "mercator", centerLongitude: 0, centerLatitude: 0 }],
    "globe": [{ kind: "spherical-globe", factor: degree, origin: 0, base: 1, radial: 1 }],
  };
  const points = {
    "log/sqrt scale, then fit": [[10, 4, 0.5], [50, 1, 0], [2, 9, 1]],
    "placement matrix": [[1, 2, 3], [-1, 0.5, 0]],
    // The third row is missing; the fourth has a negative radius.
    "polar": [[3, 1, 0], [6, 2, 0], [NaN, 1, 0], [9, -1, 0]],
    // The second row is on the far side of the globe.
    "orthographic": [[10, 20, 0], [-150, -30, 0], [60, 40, 0]],
    "mercator": [[10, 20, 0], [-150, -30, 0], [60, 40, 0]],
    "globe": [[10, 20, 0], [-150, -30, 0.5]],
  };
  for (const [name, operations] of Object.entries(chains)) {
    const map = async () => {
      const input = np.array(points[name]);
      const mapped = mapOperations(input, operations);
      input.dispose();
      return Array.from(await mapped.data());
    };
    assert.equal(await leftBehind(map), 0, name);
    const values = await map(), sampler = operationSampler(operations);
    for (const [row, point] of points[name].entries()) {
      const expected = sampler(point), actual = values.slice(row * 3, row * 3 + 3);
      if (!expected.valid) { assert.ok(actual.every(Number.isNaN), `${name} row ${row}: ${actual}`); continue; }
      for (let axis = 0; axis < 3; axis++)
        assert.ok(Math.abs(actual[axis] - expected.point[axis]) < 1e-4,
          `${name} row ${row} axis ${axis}: ${actual[axis]} != ${expected.point[axis]}`);
    }
  }
});
