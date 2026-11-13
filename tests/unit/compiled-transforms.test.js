// TODO 33.3: compiled transform kernels read their numbers from buffers: a new value on the same
// shapes gives new results (a number traced into the program would be reused, stale).
import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createDataScope, categorical } from "../../src/lib/plot/utils/categorical.js";
import { runTransform } from "../../src/lib/plot/utils/transforms.js";
import { numpy as np } from "@hmplot/jax";
import { optionsRoot } from "../../src/lib/options/options.js";
import { prepareNamed } from "../../src/lib/plot/utils/namedData.js";

const scopeOf = (table) => {
  const scope = createDataScope();
  scope.update(table);
  return scope;
};
const table = () => ({
  g: {
    codes: Int32Array.from({ length: 20 }, (_, i) => i % 2),
    categories: ["a", "b"],
  },
  v: Float32Array.from(
    { length: 20 },
    (_, i) => [1, 2, 3, 4, 5, 6, 7, 8, 9, 40][Math.floor(i / 2)],
  ),
});
const read = async (view, key) =>
  Array.from(await view.get(key).ref.data(), Number);

test("BoxOutliers and BoxStats follow a new whisker on the same shapes", async () => {
  const scope = scopeOf(table());
  const outliers = async (whisker) => {
    const view = await runTransform("BoxOutliers", scope, {
      by: "g",
      value: "v",
      whisker,
    });
    const length = view.length;
    view.dispose();
    return length;
  };
  // Each group: 1..9 and 40; q1 3.25, q3 7.75 (linear interpolation, as numpy). Whisker 0: the
  // rows outside [3.25, 7.75] (1, 2, 3, 8, 9, 40); 1.5: only 40 (fences -3.5 and 14.5).
  assert.equal(await outliers(0), 12);
  assert.equal(await outliers(1.5), 2);
  assert.equal(await outliers(100), 0);
  const whiskers = async (whisker) => {
    const view = await runTransform("BoxStats", scope, {
      by: "g",
      value: "v",
      whisker,
    });
    const out = [
      await read(view, "whiskerLow"),
      await read(view, "whiskerHigh"),
    ];
    view.dispose();
    return out;
  };
  assert.deepEqual(await whiskers(1.5), [
    [1, 1],
    [9, 9],
  ]);
  assert.deepEqual(await whiskers(0), [
    [4, 4],
    [7, 7],
  ]);
  assert.deepEqual(await whiskers(100), [
    [1, 1],
    [40, 40],
  ]);
  scope.dispose();
});

test("Window follows a new size and alignment on the same shapes", async () => {
  const scope = scopeOf(table());
  const v = Array.from(table().v);
  const values = async (config) => {
    const view = await runTransform("Window", scope, { field: "v", ...config });
    const out = await read(view, "smoothed");
    view.dispose();
    return out;
  };
  // Row i's window is [i - shift, i - shift + size), clipped to the rows.
  const expected = (size, shift, reduce) =>
    v.map((_, i) => {
      const rows = v.slice(
        Math.max(i - shift, 0),
        Math.max(i - shift + size, 0),
      );
      const sum = rows.reduce((a, b) => a + b, 0);
      return reduce === "count"
        ? rows.length
        : reduce === "sum"
          ? sum
          : sum / rows.length;
    });
  for (const [size, align, shift] of [
    [3, "trailing", 2],
    [5, "center", 2],
    [4, "leading", 0],
    [1, "trailing", 0],
  ])
    for (const reduce of ["sum", "mean", "count"])
      assert.deepEqual(
        (await values({ size, align, reduce })).map(
          (x) => Math.round(x * 1e4) / 1e4,
        ),
        expected(size, shift, reduce).map((x) => Math.round(x * 1e4) / 1e4),
        `${reduce} ${size} ${align}`,
      );
  scope.dispose();
});

test("Bin follows new edges on the same shapes", async () => {
  const scope = scopeOf(table());
  const counts = async (bins) => {
    const view = await runTransform("Bin", scope, { x: "v", bins });
    const out = [await read(view, "x0"), await read(view, "count")];
    view.dispose();
    return out;
  };
  // v: 1..9 and 40, twice each. Uniform edges (the arithmetic path), then uneven ones (the
  // binary search), each twice with other values on the same shapes.
  assert.deepEqual(await counts([0, 5, 50]), [
    [0, 5],
    [8, 12],
  ]);
  assert.deepEqual(await counts([0, 20, 40]), [
    [0, 20],
    [18, 2],
  ]);
  assert.deepEqual(await counts([0, 3, 50]), [
    [0, 3],
    [4, 16],
  ]);
  assert.deepEqual(await counts([2, 8, 9]), [
    [2, 8],
    [12, 4],
  ]);
  // Assigned bins index their edges: int32 bins on both paths.
  for (const bins of [
    [0, 5, 50],
    [0, 3, 50],
  ]) {
    const view = await runTransform("Bin", scope, {
      x: "v",
      bins,
      mode: "assign",
    });
    const expected = table().v.map((v) => (v < bins[1] ? 0 : 1));
    assert.deepEqual(await read(view, "binX"), Array.from(expected));
    assert.deepEqual(
      await read(view, "binX0"),
      Array.from(expected, (b) => bins[b]),
    );
    view.dispose();
  }
  scope.dispose();
});

test("mark geometry follows new numbers on the same shapes (TODO 33.3)", async () => {
  const { numpy: np } = await import("@hmplot/jax");
  const { rectangleArrays } =
    await import("../../src/lib/plot/utils/rectangles.js");
  const { uncertaintyArrays } =
    await import("../../src/lib/plot/utils/uncertainty.js");
  // rectangleArrays and uncertaintyArrays borrow their columns: the test releases them.
  const columns = [];
  const column = (values) => {
    const array = np.array(Float32Array.from(values));
    columns.push(array);
    return array;
  };
  const data = async (a) => Array.from(await a.data(), Number);
  const float32 = (values) => Array.from(Float32Array.from(values));
  for (const width of [0.8, 0.4]) {
    const box = rectangleArrays("prism", {
      x: column([1, 2]),
      y: column([0, 0]),
      z0: 0,
      z1: column([2, 3]),
      width,
      depth: 1,
      rotation: 0,
    });
    assert.deepEqual(
      await data(box.position),
      float32([1 - width / 2, -0.5, 0, 2 - width / 2, -0.5, 0]),
    );
    box.extent.dispose();
    box.turn.dispose();
  }
  for (const lower of [0, 1]) {
    const band = uncertaintyArrays("band", column([0, 1, 2]), lower, 5);
    assert.deepEqual(await data(band.start), [0, lower, 1, lower]);
    for (const key of ["end", "previous", "next"]) band[key].dispose();
  }
  columns.forEach((array) => array.dispose());
});

// TODO 33.6: jax-js's array constructors take { dtype } and ignore a positional one (JAX's form):
// np.zeros([n], np.int32) is float32. Eager promotion hid it; a compiled Bin's float32 search
// did not. None in the library.
test("no array constructor passes its dtype positionally", () => {
  const files = (dir) =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
      entry.isDirectory()
        ? files(join(dir, entry.name))
        : /\.(js|svelte)$/.test(entry.name) ? [join(dir, entry.name)] : [],
    );
  const call = /np\.(zeros|ones|full|empty|array)\(((?:[^()]|\([^()]*\))*)\)/g;
  const positional = [];
  for (const file of files(fileURLToPath(new URL("../../src/lib", import.meta.url))))
    for (const [text, , args] of readFileSync(file, "utf8").matchAll(call))
      if (/,\s*np\.(u?int(8|16|32)|float(16|32|64)|bool)\s*$/.test(args)) positional.push(`${file}: ${text}`);
  assert.deepEqual(positional, []);
});

// TODO 33.4: a transform's int32 codes on a categorical axis are one program, with the
// dictionary's length from a buffer: another length on the same shapes gives new positions.
test("categorical axis positions and channel values follow the dictionary on the same shapes", async () => {
  const options = optionsRoot.splitUnique("Categorical axis program test");
  options.categoryAxes = { x: categorical() };
  const sizeScale = categorical();
  const codes = () => np.array([0, 1, 2, 1], { dtype: np.int32 });
  const run = async (categories) => {
    // The scope borrows the codes; the mark's state keeps each channel's last category values.
    const g = codes(), state = { hidden: {}, auto: {} };
    const scope = scopeOf({ g: { codes: g, categories }, y: Float32Array.from([1, 2, 3, 4]) });
    const out = prepareNamed({ x: "g", y: "y", size: "g", sizeScale }, scope, options, "Points", state);
    try {
      const x = (await read({ get: () => out.props.position }, "position")).filter((_, i) => i % 2 === 0);
      return { x, size: await read({ get: () => out.props.size }, "size") };
    } finally {
      out.dispose();
      scope.dispose();
      g.dispose();
      for (const entry of state.categoryValues?.values() ?? []) entry.values.dispose();
    }
  };
  // "c" is not in the first dictionary: code 2 is outside it (the unknown size, 5).
  assert.deepEqual(await run(["a", "b"]), { x: [0, 1, NaN, 1], size: [5, 16, 5, 16] });
  assert.deepEqual(await run(["a", "b", "c"]), { x: [0, 1, 2, 1], size: [5, 10.5, 16, 10.5] });
  // Out of the scales' order (a, b, c): codes go through the lookup.
  assert.deepEqual(await run(["c", "a", "b"]), { x: [2, 0, 1, 0], size: [16, 5, 10.5, 5] });
});
