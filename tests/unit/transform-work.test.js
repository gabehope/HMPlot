import densityPlugin from "../../src/lib/plugins/density/index.js";
import { registerPlugin as registerDensityPlugin } from "../../src/lib/plot/plugins/library.js";
registerDensityPlugin(densityPlugin);
// Transform work that must follow the rows, not a product with the number of groups (TODO 17.14):
// a) a Slice step: each batch of up to 128 entities built [entities x rows] masks, 165 MB for 300
//    entities x 40 samples on the cpu backend, ~1.2 GB a step in the moving-particles example;
// b) a grouped Density: every group evaluated its kernel over every row, ~5 GB a brush drag for a
//    violin over 100,000 rows.
import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { init, defaultDevice } from "@hmplot/jax";
import { createDataScope } from "../../src/lib/plot/utils/categorical.js";
import { runTransform } from "../../src/lib/plot/utils/transforms.js";

await init("cpu");
defaultDevice("cpu");
// The backend chunk exports getBackend under a minified name ("s"; see kernel-literals).
const dist = dirname(fileURLToPath(import.meta.resolve("@hmplot/jax")));
const chunk = readdirSync(dist).find((file) => /^backend-.*\.js$/.test(file));
const backend = (await import(pathToFileURL(join(dist, chunk)).href)).s("cpu");
let allocated = 0;
const malloc = backend.malloc.bind(backend);
backend.malloc = (...args) => { if (typeof args[0] === "number") allocated += args[0]; return malloc(...args); };

/** Bytes a warm Slice step allocates (a new time, the sort cached) for `entities` x `steps` rows. */
async function stepBytes(entities, steps) {
  const n = entities * steps, scope = createDataScope();
  scope.update({
    id: Float32Array.from({ length: n }, (_, r) => Math.floor(r / steps)),
    t: Float32Array.from({ length: n }, (_, r) => r % steps),
    x: Float32Array.from({ length: n }, (_, r) => Math.sin(r)),
  });
  const cache = {};
  try {
    const cold = await runTransform("Slice", scope, { field: "t", by: "id", at: 3.25, values: ["x"] }, { cache });
    await cold.get("x").ref.data();
    cold.dispose();
    allocated = 0;
    const warm = await runTransform("Slice", scope, { field: "t", by: "id", at: 7.5, values: ["x"] }, { cache });
    await warm.get("x").ref.data();
    warm.dispose();
    return allocated;
  } finally {
    cache.slice?.dispose();
    scope.dispose();
  }
}

test("a Slice step allocates in proportion to rows, not entities x rows", async () => {
  const small = await stepBytes(100, 40), large = await stepBytes(400, 40);
  // 4x the entities and 4x the rows: ~4x the memory now, 16x before.
  assert.ok(large / small < 6, `${small} -> ${large} bytes`);
  assert.ok(large / (400 * 40) < 1024, `${Math.round(large / (400 * 40))} bytes per row`);
});

/** Bytes a Density over `rows` rows in `groups` groups allocates. */
async function densityBytes(rows, groups) {
  const scope = createDataScope();
  scope.update({
    g: Float32Array.from({ length: rows }, (_, r) => r % groups),
    v: Float32Array.from({ length: rows }, (_, r) => Math.sin(r) * 3 + (r % groups)),
  });
  try {
    allocated = 0;
    const view = await runTransform("Density", scope, { x: "v", by: "g", resolution: 64, violin: { scale: "width" } });
    await view.get("density").ref.data();
    view.dispose();
    return allocated;
  } finally {
    scope.dispose();
  }
}

test("a grouped Density allocates about the same for 2 or 8 groups over the same rows", async () => {
  const two = await densityBytes(4000, 2), eight = await densityBytes(4000, 8);
  // Before, each group evaluated the kernel over every row: 4x the groups, ~4x the memory.
  assert.ok(eight / two < 1.8, `${two} -> ${eight} bytes`);
});
