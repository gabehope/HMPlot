// TODO 17.14d: Hexbin with an extent bins over a fixed grid (a row per cell, the occupied ones
// valid). Its occupied cells equal the grouped Hexbin's with the same radius, in the same order.
import test from "node:test";
import assert from "node:assert/strict";
import { createDataScope } from "../../src/lib/plot/utils/categorical.js";
import { runTransform } from "../../src/lib/plot/utils/transforms.js";
import { mean, sum } from "../../src/lib/plot/utils/expressions.js";

// Probe with `.data`, not `.ref`: reading `.ref` takes a reference.
const read = async (value) => { const a = value?.codes ?? value; return Array.from(typeof a?.data === "function" ? await a.ref.data() : a, Number); };
const close = (a, b, label) => {
  assert.equal(a.length, b.length, `${label} length`);
  a.forEach((v, i) => assert.ok(Number.isNaN(b[i]) ? Number.isNaN(v) : Math.abs(v - b[i]) <= 1e-4 * Math.max(1, Math.abs(b[i])), `${label}[${i}] ${v} vs ${b[i]}`));
};
function table(n = 400, seed = 3) {
  const random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  const t = { x: [], y: [], v: [], keep: [] };
  for (let i = 0; i < n; i++) {
    t.x.push(random() * 9 - 4.5); t.y.push(random() * 7 - 3.5);
    t.v.push(random() < 0.05 ? NaN : random() * 10); t.keep.push(random() < 0.6 ? 1 : 0);
  }
  const scope = createDataScope();
  scope.update(Object.fromEntries(Object.entries(t).map(([k, a]) => [k, Float32Array.from(a)])));
  return scope;
}

test("a fixed-grid Hexbin's occupied cells equal the grouped Hexbin's", async () => {
  const scope = table(), filtered = await runTransform("Filter", scope, { where: { field: "keep", op: "gt", value: 0.5 } });
  const extent = { x: [-5, 5], y: [-4, 4] }, columns = { total: sum("v"), average: mean("v") };
  try {
    for (const orientation of ["pointy", "flat"]) {
      const radius = (extent.x[1] - extent.x[0]) / ((orientation === "flat" ? 1.5 : Math.sqrt(3)) * 12);
      for (const input of [scope, filtered]) {
        const [grid, grouped] = await Promise.all([
          runTransform("Hexbin", input, { x: "x", y: "y", bins: 12, bounds: extent, orientation, columns }),
          runTransform("Hexbin", input, { x: "x", y: "y", radius, orientation, columns }),
        ]);
        try {
          const label = `${orientation} ${input === scope ? "all rows" : "filtered"}`;
          assert.equal(grid.length, grouped.length, label);
          assert.ok(grid.padded().capacity > grid.length, `${label}: every cell physically`);
          for (const key of ["x", "y", "count", "total", "average", "width", "depth", "rotation"])
            close(await read(grid.get(key)), await read(grouped.get(key)), `${label} ${key}`);
        } finally {
          grid.dispose(); grouped.dispose();
        }
      }
    }
  } finally {
    filtered.dispose(); scope.dispose();
  }
});

test("rows outside a Hexbin's extent fall in no cell", async () => {
  const scope = table();
  try {
    const inner = await runTransform("Hexbin", scope, { x: "x", y: "y", bins: 8, bounds: { x: [0, 5], y: [0, 4] } });
    try {
      const count = (await read(inner.get("count"))).reduce((a, b) => a + b, 0);
      const x = await read(scope.get("x")), y = await read(scope.get("y"));
      assert.equal(count, x.filter((v, i) => v >= 0 && v <= 5 && y[i] >= 0 && y[i] <= 4).length);
    } finally {
      inner.dispose();
    }
    await assert.rejects(runTransform("Hexbin", scope, { x: "x", y: "y", bounds: { x: [1, 0], y: [0, 1] } }), /bounds\.x/);
  } finally {
    scope.dispose();
  }
});
