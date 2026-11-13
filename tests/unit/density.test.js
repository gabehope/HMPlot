import densityPlugin from "../../src/lib/plugins/density/index.js";
import { registerPlugin as registerDensityPlugin } from "../../src/lib/plot/plugins/library.js";
registerDensityPlugin(densityPlugin);
// TODO 17.14b: Density computes every group's curve in one pass (a kernel block times a
// [rows x groups] weight block, over row chunks). Checked against a brute-force Gaussian KDE:
// groups, weights, missing values, hidden rows (a Filter), normalizations, and violin shapes.
import test from "node:test";
import assert from "node:assert/strict";
import { createDataScope } from "../../src/lib/plot/utils/categorical.js";
import { runTransform } from "../../src/lib/plot/utils/transforms.js";

const read = async (value) => Array.from(await (value?.codes ?? value).ref.data(), Number);
function kde(table, rows, { resolution, bounds, bandwidth, normalization }) {
  const [a, b] = bounds, gaussian = 1 / (Math.sqrt(2 * Math.PI) * bandwidth);
  const kept = rows.filter((r) => Number.isFinite(table.v[r]) && Number.isFinite(table.w[r]) && table.w[r] >= 0);
  const total = kept.reduce((sum, r) => sum + table.w[r], 0);
  const denominator = normalization === "count" ? 1 : Math.max(total, 1e-30);
  return {
    total,
    x: Array.from({ length: resolution }, (_, q) => a + (q / (resolution - 1)) * (b - a)),
    density: Array.from({ length: resolution }, (_, q) => {
      const x = a + (q / (resolution - 1)) * (b - a);
      return kept.reduce((sum, r) => sum + table.w[r] * Math.exp(-0.5 * ((x - table.v[r]) / bandwidth) ** 2), 0) * gaussian / denominator;
    }),
  };
}
const close = (actual, expected, label) => {
  assert.equal(actual.length, expected.length, label);
  actual.forEach((value, i) => {
    const e = expected[i];
    assert.ok(Number.isNaN(e) ? Number.isNaN(value) : Math.abs(value - e) <= 1e-4 * Math.max(1, Math.abs(e)), `${label}[${i}]: ${value} vs ${e}`);
  });
};

test("Density equals a brute-force KDE per group, with and without a Filter's mask", async () => {
  let seed = 5;
  const random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  const n = 300, table = { g: [], v: [], w: [], keep: [] };
  for (let r = 0; r < n; r++) {
    const g = Math.floor(random() * 4);
    table.g.push(g);
    table.v.push(random() < 0.03 ? NaN : g * 2 + random() * 3);
    table.w.push(random() < 0.5 ? 1 : random() * 3);
    table.keep.push(random() < 0.6 ? 1 : 0);
  }
  const scope = createDataScope();
  scope.update({ g: Float32Array.from(table.g), v: Float32Array.from(table.v), w: Float32Array.from(table.w), keep: Float32Array.from(table.keep) });
  const filtered = await runTransform("Filter", scope, { where: { field: "keep", op: "gt", value: 0.5 } });
  const base = { x: "v", by: "g", weight: "w", resolution: 24, bandwidth: 0.7, bounds: { x: [-1, 11] } };
  try {
    for (const [input, keep] of [[scope, () => true], [filtered, (r) => table.keep[r] === 1]]) {
      for (const normalization of ["density", "count"]) {
        const view = await runTransform("Density", input, { ...base, normalization });
        try {
          const [g, x, density] = await Promise.all(["g", "x", "density"].map((k) => read(view.get(k))));
          const expected = { g: [], x: [], density: [] };
          for (const group of [0, 1, 2, 3]) {
            const rows = [...Array(n).keys()].filter((r) => table.g[r] === group && keep(r));
            if (!rows.length && input === filtered) continue;
            const curve = kde(table, rows, { resolution: 24, bounds: [-1, 11], bandwidth: 0.7, normalization });
            expected.g.push(...curve.x.map(() => group)); expected.x.push(...curve.x); expected.density.push(...curve.density);
          }
          const label = `${input === scope ? "all rows" : "filtered"} ${normalization}`;
          // A padded output reads its shown rows through the compacting accessors.
          assert.deepEqual(g, expected.g, label);
          close(x, expected.x, `${label} x`);
          close(density, expected.density, `${label} density`);
        } finally {
          view.dispose();
        }
      }
    }
    // Violins: each group's curve around its key, separated by a missing row.
    for (const [scale, side] of [["width", "both"], ["area", "left"], ["count", "right"]]) {
      const view = await runTransform("Density", scope, { ...base, violin: { scale, side, width: 0.8 } });
      try {
        const [lower, upper] = await Promise.all(["__violinLower", "__violinUpper"].map((k) => read(view.get(k))));
        const expected = { lower: [], upper: [] };
        for (const group of [0, 1, 2, 3]) {
          const curve = kde(table, [...Array(n).keys()].filter((r) => table.g[r] === group), { resolution: 24, bounds: [-1, 11], bandwidth: 0.7 });
          const peak = Math.max(...curve.density);
          const magnitude = curve.density.map((d) => (scale === "width" ? d / Math.max(peak, 1e-30) : scale === "count" ? d * curve.total : d) * 0.4);
          expected.lower.push(...magnitude.map((m) => (side === "right" ? group : group - m)));
          expected.upper.push(...magnitude.map((m) => (side === "left" ? group : group + m)));
          if (group < 3) { expected.lower.push(NaN); expected.upper.push(NaN); }
        }
        close(lower, expected.lower, `violin ${scale} ${side} lower`);
        close(upper, expected.upper, `violin ${scale} ${side} upper`);
      } finally {
        view.dispose();
      }
    }
  } finally {
    filtered.dispose();
    scope.dispose();
  }
});

// TODO 33.3: inputs that fit one chunk run as one compiled program; the chunked path must give
// the same curves (groups, weights, hidden rows, violins, 2D).
test("the compiled one-chunk Density equals the chunked path", async () => {
  const { densityPaths } = await import("../../src/lib/plugins/density/index.js");
  const n = 200, scope = createDataScope();
  scope.update({
    g: Float32Array.from({ length: n }, (_, i) => i % 3),
    v: Float32Array.from({ length: n }, (_, i) => (i % 17 === 5 ? NaN : Math.sin(i) * 3 + (i % 3))),
    u: Float32Array.from({ length: n }, (_, i) => Math.cos(i * 1.3) * 2),
    w: Float32Array.from({ length: n }, (_, i) => 1 + (i % 4)),
    keep: Float32Array.from({ length: n }, (_, i) => (i % 5 ? 1 : 0)),
  });
  const filtered = await runTransform("Filter", scope, { where: { field: "keep", op: "gt", value: 0.5 } });
  const configs = [
    { x: "v", by: "g", weight: "w", resolution: 32 },
    { x: "v", by: "g", resolution: 16, normalization: "count" },
    { x: "v", by: "g", resolution: 24, violin: { scale: "width" } },
    { x: "v", by: "g", resolution: 24, violin: { scale: "count", side: "left" } },
    { x: "v", y: "u", resolution: [12, 10] },
    { x: "v", resolution: 20, bandwidth: 0.5 },
  ];
  const columns = async (input, config) => {
    const view = await runTransform("Density", input, config);
    try {
      return Object.fromEntries(await Promise.all([...view.keys()].filter((k) => !k.startsWith("@"))
        .map(async (k) => [k, await read(view.get(k))])));
    } finally {
      view.dispose();
    }
  };
  try {
    for (const input of [scope, filtered])
      for (const config of configs) {
        densityPaths.compiled = true;
        const compiled = await columns(input, config);
        densityPaths.compiled = false;
        const chunked = await columns(input, config);
        assert.deepEqual(Object.keys(compiled).sort(), Object.keys(chunked).sort());
        for (const key of Object.keys(chunked)) close(compiled[key], chunked[key], `${JSON.stringify(config)} ${key}`);
      }
  } finally {
    densityPaths.compiled = true;
    filtered.dispose();
    scope.dispose();
  }
});

// TODO 51 decision 11: a 2-D Density samples its cells' centres, (i + 0.5) / res, so its cells
// tile the bounds, and its output is a grid table (a group dimension first for one `by` key).
test("2-D Density samples cell centres, equal to a brute-force KDE, as a grid table", async () => {
  const n = 40, scope = createDataScope();
  const table = { g: [], u: [], v: [] };
  for (let i = 0; i < n; i++) { table.g.push(i % 2 ? "b" : "a"); table.u.push(Math.sin(i) * 2); table.v.push(Math.cos(i * 0.7)); }
  scope.update(table);
  const bounds = { x: [-3, 3], y: [-2, 2] }, bandwidth = [0.8, 0.5], resolution = [6, 4];
  const expected = (rows) => {
    const out = { x: [], y: [], density: [] }, norm = 1 / (2 * Math.PI * bandwidth[0] * bandwidth[1]);
    for (let j = 0; j < resolution[1]; j++) for (let i = 0; i < resolution[0]; i++) {
      const x = -3 + ((i + 0.5) / resolution[0]) * 6, y = -2 + ((j + 0.5) / resolution[1]) * 4;
      const sum = rows.reduce((total, r) => total + Math.exp(-0.5 * (((x - table.u[r]) / bandwidth[0]) ** 2 + ((y - table.v[r]) / bandwidth[1]) ** 2)), 0);
      out.x.push(x); out.y.push(y); out.density.push((sum * norm) / rows.length);
    }
    return out;
  };
  try {
    const view = await runTransform("Density", scope, { x: "u", y: "v", bounds, bandwidth, resolution });
    const all = expected([...Array(n).keys()]);
    for (const key of ["x", "y", "density"]) close(await read(view.get(key)), all[key], key);
    assert.deepEqual(view.grid.dims.map((d) => [d.name, d.size]), [["y", 4], ["x", 6]]);
    assert.deepEqual(Array.from(view.grid.dims[1].edges), [-3, -2, -1, 0, 1, 2, 3]);
    view.dispose();
    const grouped = await runTransform("Density", scope, { x: "u", y: "v", by: "g", bounds, bandwidth, resolution });
    assert.deepEqual(grouped.grid.dims.map((d) => [d.name, d.size]), [["g", 2], ["y", 4], ["x", 6]]);
    assert.deepEqual(grouped.grid.dims[0].coords, ["a", "b"]);
    const [a, b] = ["a", "b"].map((g) => expected([...Array(n).keys()].filter((r) => table.g[r] === g)).density);
    close(await read(grouped.get("density")), [...a, ...b], "grouped density");
    grouped.dispose();
  } finally {
    scope.dispose();
  }
});

// TODO 134.20: above densityPaths.binnedAbove kernel entries, rows are counted onto a fine grid
// and smoothed by the separable kernel; it agrees with the exact estimate to a percent of its
// peak (groups, weights, counts, hidden rows, violins, 2D).
test("the binned Density agrees with the exact one", async () => {
  const { densityPaths } = await import("../../src/lib/plugins/density/index.js");
  const n = 3000, scope = createDataScope();
  scope.update({
    g: Float32Array.from({ length: n }, (_, i) => i % 3),
    v: Float32Array.from({ length: n }, (_, i) => (i % 97 === 5 ? NaN : Math.sin(i * 0.37) * 3 + (i % 3) + Math.cos(i * 1.7))),
    u: Float32Array.from({ length: n }, (_, i) => Math.cos(i * 1.3) * 2 + Math.sin(i * 0.11)),
    w: Float32Array.from({ length: n }, (_, i) => 1 + (i % 4)),
    keep: Float32Array.from({ length: n }, (_, i) => (i % 5 ? 1 : 0)),
  });
  const filtered = await runTransform("Filter", scope, { where: { field: "keep", op: "gt", value: 0.5 } });
  const configs = [
    { x: "v", by: "g", weight: "w", resolution: 64 },
    { x: "v", by: "g", resolution: 48, normalization: "count" },
    { x: "v", by: "g", resolution: 48, violin: { scale: "width" } },
    { x: "v", y: "u", resolution: [40, 32] },
    { x: "v", y: "u", by: "g", weight: "w", resolution: [24, 24] },
    { x: "v", y: "u", resolution: [32, 32], bounds: { x: [-2, 2], y: [-1, 1] } },
  ];
  const density = async (input, config) => {
    const view = await runTransform("Density", input, config);
    try { return { density: await read(view.get("density")), keys: [...view.keys()].sort() }; } finally { view.dispose(); }
  };
  try {
    for (const input of [scope, filtered])
      for (const config of configs) {
        densityPaths.binnedAbove = 2 ** 28;
        const exact = await density(input, config);
        densityPaths.binnedAbove = 0;
        const binned = await density(input, config);
        assert.deepEqual(binned.keys, exact.keys);
        assert.equal(binned.density.length, exact.density.length);
        const peak = Math.max(...exact.density.filter(Number.isFinite));
        const worst = Math.max(...exact.density.map((d, i) => (Number.isFinite(d) ? Math.abs(d - binned.density[i]) : 0)));
        assert.ok(worst <= 0.01 * peak, `${JSON.stringify(config)}: off by ${worst} of a ${peak} peak`);
      }
  } finally {
    densityPaths.binnedAbove = 2 ** 28;
    filtered.dispose();
    scope.dispose();
  }
});

test("Density releases rejected runs and can publish the next valid estimate", async () => {
  const scope = createDataScope();
  scope.update({ x: [0, 1, 2], weight: [1, -1, 1] });
  try {
    await assert.rejects(runTransform("Density", scope, { x: "x", weight: "weight" }), /Density weights must be nonnegative/);
    await assert.rejects(runTransform("Density", scope, { x: "x", bandwidth: 1, bounds: { x: [2, 0] } }), /Invalid Density x bounds/);
    await assert.rejects(runTransform("Density", scope, { x: "x", resolution: 2 ** 28 }), /Density.*lower resolution/i);
    const view = await runTransform("Density", scope, { x: "x", resolution: 8 });
    try {
      assert.equal(view.length, 8);
      assert.ok((await read(view.get("density"))).every(Number.isFinite));
    } finally {
      view.dispose();
    }
  } finally {
    scope.dispose();
  }
});
