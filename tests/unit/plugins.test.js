// The plugin registry and parameter schemas (TODO 138.2), and a Plot's effects (138.3).
import test from "node:test";
import assert from "node:assert/strict";
import {
  definePlugin,
  createPluginRegistry,
  PLUGIN_API_VERSION,
} from "../../src/lib/plot/plugins/registry.js";
import {
  checkSchema,
  parameterProblem,
  withDefaults,
  expressionParameters,
} from "../../src/lib/plot/plugins/parameters.js";
import { col } from "../../src/lib/plot/utils/expressions.js";

const isColor = (value) => /^#[0-9a-f]{3,8}$/i.test(value);
// The least an effect declares: its stage and the function of that name.
const EFFECT = { stage: "display", display: (inputs) => inputs };
const vignette = (setup) =>
  definePlugin({ name: "vignette", apiVersion: PLUGIN_API_VERSION, setup });

test("plugin masks, grid aliases and category positions use shared publication", async () => {
  const { createDataScope } =
    await import("../../src/lib/plot/utils/categorical.js");
  const { runPluginTransform } =
    await import("../../src/lib/plot/plugins/transform.js");
  const { pluginGrid } =
    await import("../../src/lib/plot/plugins/transformGrid.js");
  const source = createDataScope();
  source.update({ g: ["a", "b"], x: [1, 2] });
  const run = (extra) =>
    runPluginTransform(
      "test.mask",
      {
        reads: "padded",
        output: "newRows",
        async run({ array, groups, checkBytes, maxBytes }) {
          assert.equal(maxBytes, 1e8);
          assert.throws(() => checkBytes(maxBytes + 1), /test.mask/);
          assert.deepEqual(
            Array.from(await groups.positions("g").ref.data()),
            [1, 0],
          );
          return {
            columns: { value: array([3, 4]) },
            valid: array([0, 1], { dtype: "int32" }),
            count: 1,
            topology: "grid-2",
            grid: pluginGrid({ dims: { x: [0, 1] } }),
            ...extra,
          };
        },
      },
      source,
      {
        by: "g",
        __categoryOrder: ["b", "a"],
        as: { x: "distance", value: "amount" },
      },
      { maxBytes: 1e8 },
    );
  try {
    const view = await run();
    try {
      assert.equal(view.length, 1);
      assert.equal(view.topology, "grid-2");
      const physical = view.padded();
      assert.equal(physical.grid.dims[0].name, "distance");
      assert.deepEqual(
        Array.from(await physical.get("distance").ref.data()),
        [0, 1],
      );
      assert.deepEqual(Array.from(await view.get("amount").ref.data()), [4]);
    } finally {
      view.dispose();
    }
    await assert.rejects(run({ count: 3 }), /count must be/);
    await assert.rejects(run({ topology: {} }), /topology must be/);
  } finally {
    source.dispose();
  }
});

test("plugin grids preserve returned coordinates and own lazy categorical columns", async () => {
  const { createDataScope } =
    await import("../../src/lib/plot/utils/categorical.js");
  const { runPluginTransform } =
    await import("../../src/lib/plot/plugins/transform.js");
  const { pluginGrid } =
    await import("../../src/lib/plot/plugins/transformGrid.js");
  const source = createDataScope();
  source.update({ x: [1, 2] });
  try {
    const view = await runPluginTransform(
      "test.grid",
      {
        reads: "padded",
        output: "newRows",
        run: ({ array }) => ({
          columns: { x: array([10, 20, 10, 20]), value: array([1, 2, 3, 4]) },
          grid: pluginGrid({ dims: { group: ["a", "b"], x: [0, 1] } }),
        }),
      },
      source,
      { as: { group: "category", category: "unused", x: "distance" } },
      {},
    );
    try {
      assert.deepEqual(view.grid.fields, ["value"]);
      assert.deepEqual(
        Array.from(await view.get("distance").ref.data()),
        [10, 20, 10, 20],
      );
      const category = view.get("category");
      assert.deepEqual(category.categories, ["a", "b"]);
      assert.deepEqual(
        Array.from(await category.codes.ref.data()),
        [0, 0, 1, 1],
      );
      assert.equal(view.has("unused"), false);
    } finally {
      view.dispose();
    }
  } finally {
    source.dispose();
  }
});

test("perGroup plugins preserve keys, contributors, source mappings and release rejected work", async () => {
  const { createDataScope } =
    await import("../../src/lib/plot/utils/categorical.js");
  const { runPluginTransform } =
    await import("../../src/lib/plot/plugins/transform.js");
  const { runTransform } =
    await import("../../src/lib/plot/utils/transforms.js");
  const { greater } = await import("../../src/lib/plot/utils/expressions.js");
  const source = createDataScope();
  source.update({ x: [1, 3, 5], g: ["a", "b", "a"] });
  const filtered = await runTransform("Filter", source, {
    where: greater("x", 1),
  });
  const run = (scope, compute) =>
    runPluginTransform(
      "test.groups",
      { reads: "padded", output: "newRows", perGroup: true, run: compute },
      scope,
      { by: "g" },
      { maxBytes: 1e8 },
    );
  try {
    const grouped = await run(
      filtered,
      ({ columns, valid, length, array, jax }) => ({
        columns: {
          total: length
            ? jax.numpy.sum(columns.x.ref.mul(valid.ref)).reshape([1])
            : array([]),
        },
      }),
    );
    try {
      assert.deepEqual(
        Array.from(await grouped.get("total").ref.data()),
        [5, 3],
      );
      assert.deepEqual(
        Array.from(await (await grouped.contributors(0)).data()),
        [2],
      );
      assert.deepEqual(
        Array.from(await (await grouped.contributors(1)).data()),
        [1],
      );
      assert.deepEqual(grouped.get("g").categories, ["a", "b"]);
    } finally {
      grouped.dispose();
    }
    for (const field of ["x", [1, 3, 5]]) {
      const result = await runPluginTransform(
        "test.group-fields",
        {
          reads: "padded",
          output: "newRows",
          perGroup: true,
          parameters: { field: { type: "field" } },
          run({ column, params, length, valid, jax }) {
            const values = column(params.field);
            assert.equal(values.shape[0], length);
            assert.equal(
              column(params.field),
              values,
              "group field reads reuse their buffer",
            );
            return {
              columns: {
                total: jax.numpy.sum(values.ref.mul(valid.ref)).reshape([1]),
              },
            };
          },
        },
        filtered,
        { by: "g", field },
        { maxBytes: 1e8 },
      );
      try {
        assert.deepEqual(
          Array.from(await result.get("total").ref.data()),
          [5, 3],
        );
      } finally {
        result.dispose();
      }
    }
    await assert.rejects(
      run(source, ({ array }) => ({
        columns: { total: array([1]) },
        valid: array([1], { dtype: "int32" }),
        count: 1,
      })),
      /perGroup returns columns/,
    );
    const mapped = await run(source, ({ array }) => ({
      columns: { total: array([9, 10]) },
      provenance: { rows: array([0, 0], { dtype: "int32" }) },
    }));
    try {
      assert.deepEqual(
        Array.from(await mapped.get("x").ref.data()),
        [1, 1, 3, 3],
      );
    } finally {
      mapped.dispose();
    }
    const empty = await runTransform("Filter", source, {
      where: greater("x", 100),
    });
    try {
      const result = await run(empty, ({ array, length }) => {
        assert.equal(length, 0);
        return { columns: { total: array([]) } };
      });
      assert.equal(result.length, 0);
      result.dispose();
    } finally {
      empty.dispose();
    }
    let calls = 0;
    await assert.rejects(
      run(source, ({ array }) => ({
        columns: { [++calls === 1 ? "a" : "b"]: array([1]) },
      })),
      /same nonempty set/,
    );
  } finally {
    filtered.dispose();
    source.dispose();
  }
});

test("array parameter items cannot be omitted while optional object properties can", () => {
  const schema = {
    thresholds: { type: "array", items: { type: "number" } },
    bounds: {
      type: "object",
      properties: { x: { type: "array", items: { type: "number" } } },
    },
  };
  assert.match(
    parameterProblem("Contour", schema, { thresholds: [null] }),
    /thresholds\[0\]/,
  );
  assert.match(
    parameterProblem("Contour", schema, { bounds: { x: [undefined] } }),
    /bounds.x\[0\]/,
  );
  assert.equal(
    parameterProblem("Contour", schema, { bounds: { x: null } }),
    "",
  );
});

test("host geometry plugins preserve source precision and validate triangle publications", async () => {
  const { createDataScope } =
    await import("../../src/lib/plot/utils/categorical.js");
  const { runPluginTransform } =
    await import("../../src/lib/plot/plugins/transform.js");
  const source = createDataScope();
  source.update({ x: new Float64Array([1.0000000001]) });
  const run = (geometry) =>
    runPluginTransform(
      "test.mesh",
      {
        reads: "rows",
        output: "newRows",
        async run({ hostColumn, array }) {
          assert.equal((await hostColumn("x"))[0], 1.0000000001);
          return {
            geometry,
            columns: {
              __corner0: array([0, 0], { shape: [1, 2] }),
              __corner1: array([1, 0], { shape: [1, 2] }),
              __corner2: array([0, 1], { shape: [1, 2] }),
              __edges: array([7], { dtype: "int32" }),
            },
          };
        },
      },
      source,
      {},
      { maxBytes: 1e8 },
    );
  try {
    const mesh = await run("triangles");
    assert.equal(mesh.triangles, true);
    mesh.dispose();
    await assert.rejects(run("mesh"), /geometry must be/);
    const { transformGeometry, transformArray } =
      await import("../../src/lib/plot/plugins/transformGeometry.js");
    assert.throws(
      () => transformGeometry("bad", "triangles", { __corner0: [0, 0] }, 1),
      /shape/,
    );
    assert.throws(
      () => transformArray("bad", [1], { shape: [2] }, 100),
      /matching shape/,
    );
    assert.throws(
      () => transformArray("bad", [1], {}, 1),
      (error) =>
        error.code === "limit.storage" &&
        error.diagnostic.component === "bad" &&
        error.diagnostic.details.count === 4 &&
        error.diagnostic.details.limit === 1,
    );
  } finally {
    source.dispose();
  }
});

test("vector schemas validate nested numeric shapes without changing length shorthand", () => {
  const schema = { extent: { type: "vector", shape: [2, 2] } };
  checkSchema("Voronoi", schema);
  assert.equal(
    parameterProblem("Voronoi", schema, {
      extent: [
        [0, 0],
        [1, 1],
      ],
    }),
    "",
  );
  assert.match(
    parameterProblem("Voronoi", schema, { extent: [0, 0, 1, 1] }),
    /shape/,
  );
  assert.match(
    parameterProblem("Voronoi", schema, {
      extent: [
        [0, NaN],
        [1, 1],
      ],
    }),
    /shape/,
  );
  for (const shape of [[], [0], [2.5], [100], [2, 2, 2, 2, 2]])
    assert.throws(
      () => checkSchema("Bad", { value: { type: "vector", shape } }),
      /shape/,
    );
  assert.throws(
    () =>
      checkSchema("Bad", { value: { type: "vector", shape: [2], length: 2 } }),
    /shape/,
  );
});

test("plugin output metadata inherits input titles with an explicit label override", async () => {
  const { outputMetadata } =
    await import("../../src/lib/plot/plugins/outputs.js");
  const scope = {
    has: (name) => name === "temperature",
    columnName: () => "Temperature (°C)",
  };
  const outputs = () => [
    { name: "level", type: "numeric", source: "temperature" },
  ];
  assert.equal(
    outputMetadata("Contour", outputs, {}, { level: [] }, scope).level.label,
    "Temperature (°C)",
  );
  assert.equal(
    outputMetadata(
      "Contour",
      () => [{ ...outputs()[0], label: "Threshold" }],
      {},
      { level: [] },
      scope,
    ).level.label,
    "Threshold",
  );
  assert.throws(
    () => outputMetadata("Contour", outputs, {}, { level: [] }),
    /source must name an input column/,
  );
});

test("plugin provenance retains repeated source rows and masked group contributors", async () => {
  const { createDataScope } =
    await import("../../src/lib/plot/utils/categorical.js");
  const { runTransform } =
    await import("../../src/lib/plot/utils/transforms.js");
  const { runPluginTransform } =
    await import("../../src/lib/plot/plugins/transform.js");
  const { greater } = await import("../../src/lib/plot/utils/expressions.js");
  const source = createDataScope();
  source.update({ x: [1, 2, 3] });
  const filtered = await runTransform("Filter", source, {
    where: greater("x", 1),
  });
  const run = (result, reads = "rows") =>
    runPluginTransform(
      "test.provenance",
      {
        reads,
        output: "newRows",
        run: ({ jax }) => result(jax.numpy),
      },
      filtered,
      {},
      { runTransform, maxBytes: 1e8 },
    );
  try {
    const repeated = await run((np) => ({
      columns: { value: np.array([4, 5, 6]) },
      provenance: { rows: np.array([1, 0, 1]) },
    }));
    try {
      assert.deepEqual(
        Array.from(await repeated.get("x").ref.data()),
        [3, 2, 3],
      );
      assert.deepEqual(
        Array.from(await repeated.sourceIndices().data()),
        [2, 1, 2],
      );
    } finally {
      repeated.dispose();
    }
    const grouped = await run(
      (np) => ({
        columns: { value: np.array([10]) },
        provenance: {
          codes: np.array([0, 0, 0, 0]),
          ids: np.array([0]),
        },
      }),
      "padded",
    );
    try {
      assert.deepEqual(
        Array.from(await (await grouped.contributors(0)).data()),
        [1, 2],
      );
      assert.equal(grouped.has("x"), false);
    } finally {
      grouped.dispose();
    }
    await assert.rejects(
      run((np) => ({
        columns: { value: np.ones([1]) },
        provenance: {
          codes: np.array([0, 0]),
          ids: np.array([0]),
          fields: ["x"],
        },
      })),
      /grouping columns present in both input and output/,
    );
    const groupedFields = await run((np) => ({
      columns: { x: np.array([2]), value: np.array([10]) },
      provenance: {
        codes: np.array([0, 0]),
        ids: np.array([0]),
        fields: ["x"],
      },
    }));
    try {
      assert.equal((await groupedFields.aggregateInfo(0)).x, 2);
    } finally {
      groupedFields.dispose();
    }
    const described = await run((np) => ({
      columns: { level: np.array([3]) },
      provenance: { kind: "contour", fields: ["level"] },
    }));
    try {
      assert.deepEqual(await described.aggregateInfo(0), {
        index: 0,
        kind: "contour",
        level: 3,
      });
      await assert.rejects(described.contributors(0), /unavailable/);
    } finally {
      described.dispose();
    }
    await assert.rejects(
      run((np) => ({
        columns: { value: np.ones([1]) },
        provenance: { fields: ["x"] },
      })),
      /must name output columns/,
    );
    await assert.rejects(
      run((np) => ({
        columns: { value: np.ones([1]) },
        provenance: { kind: "", fields: ["value"] },
      })),
      /nonempty string/,
    );
    for (const rows of [[0.5], [2], [-1]])
      await assert.rejects(
        run((np) => ({
          columns: { value: np.ones([1]) },
          provenance: { rows: np.array(rows) },
        })),
        /integer indices/,
      );
    await assert.rejects(
      run((np) => ({
        columns: { value: np.ones([1]) },
        provenance: { codes: np.array([0]), ids: np.array([0]) },
      })),
      /one group ID/,
    );
    await assert.rejects(
      run((np) => ({
        columns: { value: np.ones([1]) },
        provenance: { codes: np.array([0, 0]), ids: np.array([0.5]) },
      })),
      /group IDs must be integers/,
    );
  } finally {
    filtered.dispose();
    source.dispose();
  }
});

test("plugin transforms publish padded kernels, subsets and independent rows through the runner", async () => {
  const { plugins } = await import("../../src/lib/plot/plugins/runtime.js");
  const { createDataScope } =
    await import("../../src/lib/plot/utils/categorical.js");
  const { runTransform, disposeTransformCache } =
    await import("../../src/lib/plot/utils/transforms.js");
  const kernel = (values, factor) => values.mul(factor);
  const cancellation = new AbortController();
  plugins.register(
    definePlugin({
      name: "test-row-transforms",
      apiVersion: 1,
      setup(hm) {
        hm.transform("test.scale", {
          reads: "padded",
          output: "sameRows",
          parameters: { factor: { type: "number", default: 2 } },
          outputs: (params) => [
            {
              name: "scaled",
              type: "numeric",
              unit: "m",
              label: `Scaled by ${params.factor}`,
            },
          ],
          run({ columns, valid, length, params, jit }) {
            assert.equal(length, 4);
            return {
              columns: {
                scaled: jit(kernel)(columns.x.ref, params.factor),
                shown: valid.ref,
              },
            };
          },
        });
        hm.transform("test.subset", {
          reads: "rows",
          output: "subset",
          run: ({ jax }) => ({
            rows: jax.numpy.array([2, 0], { dtype: jax.numpy.int32 }),
          }),
        });
        hm.transform("test.new", {
          reads: "rows",
          output: "newRows",
          run: ({ jax }) => ({ columns: { generated: jax.numpy.arange(2) } }),
        });
        hm.transform("test.bad-shape", {
          reads: "rows",
          output: "sameRows",
          run: ({ jax }) => ({ columns: { wrong: jax.numpy.ones([2]) } }),
        });
        hm.transform("test.cancel", {
          reads: "rows",
          output: "sameRows",
          async run({ jax, length }) {
            await Promise.resolve();
            cancellation.abort();
            return { columns: { value: jax.numpy.ones([length]) } };
          },
        });
      },
    }),
  );
  const source = createDataScope();
  source.update({ x: [1, 2, 3] });
  const cache = {};
  const values = async (view, name) => {
    const column = view.get(name);
    return column.data
      ? Array.from(await column.ref.data())
      : Array.from(column);
  };
  try {
    for (const factor of [2, 3]) {
      const view = await runTransform(
        "test.scale",
        source,
        { factor },
        { cache },
      );
      try {
        assert.equal(view.length, 3);
        assert.deepEqual(await values(view, "scaled"), [
          factor,
          factor * 2,
          factor * 3,
        ]);
        assert.deepEqual(await values(view, "shown"), [1, 1, 1]);
      } finally {
        view.dispose();
      }
    }
    const renamed = await runTransform("test.scale", source, {
      as: { scaled: "distance" },
    });
    try {
      assert.deepEqual(renamed.metadata("distance"), {
        type: "numeric",
        unit: "m",
        label: "Scaled by 2",
      });
      assert.equal(renamed.columnName("distance"), "Scaled by 2");
    } finally {
      renamed.dispose();
    }
    const subset = await runTransform("test.subset", source);
    try {
      assert.deepEqual(await values(subset, "x"), [3, 1]);
    } finally {
      subset.dispose();
    }
    const { greater } = await import("../../src/lib/plot/utils/expressions.js");
    const filtered = await runTransform("Filter", source, {
      where: greater("x", 1),
    });
    try {
      const scaled = await runTransform("test.scale", filtered);
      try {
        assert.deepEqual(await values(scaled, "scaled"), [4, 6]);
        assert.deepEqual(await values(scaled, "shown"), [1, 1]);
      } finally {
        scaled.dispose();
      }
    } finally {
      filtered.dispose();
    }
    const fresh = await runTransform("test.new", source);
    try {
      assert.deepEqual(await values(fresh, "generated"), [0, 1]);
      assert.equal(fresh.has("x"), false);
    } finally {
      fresh.dispose();
    }
    await assert.rejects(
      runTransform("test.bad-shape", source),
      /output column "wrong" must have 4 values/,
    );
    await assert.rejects(
      runTransform("test.scale", source, {}, { maxBytes: 8 }),
      /storage-buffer limit/,
    );
    await assert.rejects(
      runTransform("test.cancel", source, {}, { signal: cancellation.signal }),
      /Canceled/,
    );
  } finally {
    disposeTransformCache(cache);
    source.dispose();
  }
});

test("plugin defaults evaluate only the active grid or row branch and track its dependencies", async () => {
  const { plugins } = await import("../../src/lib/plot/plugins/runtime.js");
  const { createDataScope } =
    await import("../../src/lib/plot/utils/categorical.js");
  const { gridTable } = await import("../../src/lib/plot/utils/gridTable.js");
  const { mean, col } = await import("../../src/lib/plot/utils/expressions.js");
  const { resolveTransformParameters, transformDependencies, runTransform } =
    await import("../../src/lib/plot/utils/transforms.js");
  const average = mean("value");
  plugins.register(
    definePlugin({
      name: "test-conditional-defaults",
      apiVersion: 1,
      setup(hm) {
        hm.transform("test.conditional", {
          reads: "padded",
          output: "sameRows",
          parameters: {
            factor: { type: "expression", default: average, when: "rows" },
            cells: {
              type: "expression",
              default: col("missing"),
              when: "grid",
            },
          },
          run: ({ columns, params }) => ({
            columns: { result: columns.value.ref.mul(params.factor) },
          }),
        });
      },
    }),
  );
  const rows = createDataScope(),
    grid = createDataScope();
  rows.update({ value: [2, 4, 6] });
  grid.update(
    gridTable({ dims: { x: [0, 1, 2] }, columns: { value: [2, 4, 6] } }),
  );
  try {
    assert.deepEqual(
      transformDependencies("test.conditional", {}, rows).expressions,
      [average],
    );
    const config = await resolveTransformParameters(
      "test.conditional",
      {},
      rows,
    );
    assert.deepEqual(config, { factor: 4 });
    const result = await runTransform("test.conditional", rows, config);
    try {
      assert.deepEqual(
        Array.from(await result.get("result").ref.data()),
        [8, 16, 24],
      );
    } finally {
      result.dispose();
    }
    await assert.rejects(
      resolveTransformParameters(
        "test.conditional",
        { cells: col("missing") },
        rows,
      ),
      /requires a grid/,
    );
    await assert.rejects(
      resolveTransformParameters("test.conditional", { factor: 2 }, grid),
      /requires table rows/,
    );
    const gridConfig = await resolveTransformParameters(
      "test.conditional",
      { cells: 3 },
      grid,
    );
    assert.deepEqual(gridConfig, { cells: 3 });
  } finally {
    rows.dispose();
    grid.dispose();
  }
});

test("plugin grid inputs preserve hidden cells and new grids publish lazy coordinates", async () => {
  const { plugins } = await import("../../src/lib/plot/plugins/runtime.js");
  const { pluginGrid } =
    await import("../../src/lib/plot/plugins/transformGrid.js");
  const { gridTable } = await import("../../src/lib/plot/utils/gridTable.js");
  const { createDataScope } =
    await import("../../src/lib/plot/utils/categorical.js");
  const { runTransform } =
    await import("../../src/lib/plot/utils/transforms.js");
  const { greater } = await import("../../src/lib/plot/utils/expressions.js");
  plugins.register(
    definePlugin({
      name: "test-grid-transforms",
      apiVersion: 1,
      setup(hm) {
        for (const reads of ["grid", "rows"])
          hm.transform(`test.grid-${reads}`, {
            reads,
            output: ({ grid }) => (grid ? "sameRows" : "newRows"),
            run({ grid, columns }) {
              if (!grid)
                return { columns: { doubled: columns.value.ref.mul(2) } };
              assert.equal(grid.drawable(2), true);
              assert.deepEqual(
                grid.drawn(2).map((dim) => dim.name),
                ["y", "x"],
              );
              return {
                columns: {
                  doubled: grid.field("value").ref.mul(2).reshape([6]),
                },
              };
            },
          });
        hm.transform("test.make-grid", {
          reads: "rows",
          output: "newRows",
          run: ({ jax }) => ({
            grid: pluginGrid({ dims: { y: [10, 20], x: [1, 2] } }),
            columns: { value: jax.numpy.arange(4) },
          }),
        });
        hm.transform("test.coordinate", {
          reads: "grid",
          output: "sameRows",
          run: ({ columns }) => ({ columns: { x: columns.x.ref.add(1) } }),
        });
      },
    }),
  );
  const source = createDataScope();
  source.update(
    gridTable({
      dims: { y: [0, 1], x: [0, 1, 2] },
      columns: { value: [1, 2, 3, 4, 5, 6] },
    }),
  );
  const filtered = await runTransform("Filter", source, {
    where: greater("value", 2),
  });
  try {
    for (const reads of ["grid", "rows"]) {
      const view = await runTransform(`test.grid-${reads}`, filtered);
      try {
        assert.equal(view.padded().grid.size, 6);
        const values = view.padded().get("doubled");
        assert.deepEqual(Array.from(await values.ref.data()), [
          NaN,
          NaN,
          6,
          8,
          10,
          12,
        ]);
      } finally {
        view.dispose();
      }
    }
    const generated = await runTransform("test.make-grid", source);
    try {
      assert.equal(generated.grid.size, 4);
      assert.deepEqual(
        Array.from(await generated.get("x").ref.data()),
        [1, 2, 1, 2],
      );
      assert.deepEqual(
        Array.from(await generated.get("y").ref.data()),
        [10, 10, 20, 20],
      );
    } finally {
      generated.dispose();
    }
    const replaced = await runTransform("test.coordinate", source);
    try {
      assert.equal(replaced.grid, undefined);
      assert.match(replaced.gridDropped, /overwrote coordinate "x"/);
    } finally {
      replaced.dispose();
    }
    const table = createDataScope();
    table.update({ value: [3, 7] });
    try {
      const rows = await runTransform("test.grid-rows", table);
      try {
        assert.equal(rows.grid, undefined);
        assert.deepEqual(
          Array.from(await rows.get("doubled").ref.data()),
          [6, 14],
        );
      } finally {
        rows.dispose();
      }
      await assert.rejects(
        runTransform("test.grid-grid", table),
        /pass a grid table/,
      );
    } finally {
      table.dispose();
    }
  } finally {
    filtered.dispose();
    source.dispose();
  }
});

test("the bundled community graph regenerates deterministic bounded graphs through the public contract", async () => {
  const { default: plugin } =
    await import("../../src/lib/plugins/communityGraph.js");
  const { plugins } = await import("../../src/lib/plot/plugins/runtime.js");
  const { createDataScope } =
    await import("../../src/lib/plot/utils/categorical.js");
  const { runTransform } =
    await import("../../src/lib/plot/utils/transforms.js");
  plugins.register(plugin);
  const scope = createDataScope();
  scope.update({ row: [0] });
  try {
    let previous;
    for (const seed of [42, 42, 43]) {
      const view = await runTransform("community-graph", scope, {
        nodes: 100000,
        seed,
      });
      try {
        assert.equal(view.graph.nodes.length, 100000);
        assert.equal(view.graph.edges.length, 300000);
        const targets = Array.from(view.graph.edges.get("target").slice(0, 12));
        if (previous)
          seed === 42
            ? assert.deepEqual(targets, previous)
            : assert.notDeepEqual(targets, previous);
        previous = targets;
      } finally {
        view.dispose();
      }
    }
    await assert.rejects(
      runTransform("community-graph", scope, { nodes: 100001 }),
      /nodes is an integer/,
    );
    const cancel = new AbortController();
    const work = runTransform(
      "community-graph",
      scope,
      { nodes: 100000 },
      { signal: cancel.signal },
    );
    cancel.abort();
    await assert.rejects(work, { name: "AbortError" });
  } finally {
    scope.dispose();
  }
});

test("plugin graph results own both relations and protect existing graph identities", async () => {
  const { plugins } = await import("../../src/lib/plot/plugins/runtime.js");
  const { createDataScope } =
    await import("../../src/lib/plot/utils/categorical.js");
  const { graphScope } = await import("../../src/lib/plot/utils/graphData.js");
  const { runTransform } =
    await import("../../src/lib/plot/utils/transforms.js");
  plugins.register(
    definePlugin({
      name: "test-graph-transforms",
      apiVersion: 1,
      setup(hm) {
        hm.transform("test.graph", {
          reads: "rows",
          output: "graph",
          run({ jax }) {
            const np = jax.numpy;
            return {
              nodes: { columns: { id: np.arange(3) } },
              edges: {
                columns: { source: np.array([0, 1]), target: np.array([1, 2]) },
              },
            };
          },
        });
        hm.transform("test.identity", {
          reads: "rows",
          output: "sameRows",
          run: ({ columns, relation }) => {
            assert.equal(relation, "nodes");
            return { columns: { changed: columns.id.ref.add(1) } };
          },
        });
        hm.transform("test.alias", {
          reads: "rows",
          output: "sameRows",
          run({ jax, length }) {
            const value = jax.numpy.ones([length]);
            return { columns: { a: value, b: value.ref } };
          },
        });
      },
    }),
  );
  const source = createDataScope();
  source.update({ x: [1] });
  try {
    const output = await runTransform("test.graph", source);
    try {
      assert.equal(output.graph.nodes.length, 3);
      assert.equal(output.graph.edges.length, 2);
      assert.equal(output.length, 2);
      const nodes = graphScope(output.graph, "nodes");
      try {
        await assert.rejects(
          runTransform("test.identity", nodes, { as: { changed: "id" } }),
          /cannot overwrite graph identity column "id"/,
        );
      } finally {
        nodes.dispose();
      }
    } finally {
      output.dispose();
    }
    const alias = await runTransform("test.alias", source);
    alias.dispose();
  } finally {
    source.dispose();
  }
});

test("transform jit reuses shapes with dynamic parameters and releases its cache", async () => {
  const { numpy: np } = await import("@hmplot/jax");
  const { transformJit } =
    await import("../../src/lib/plot/plugins/transformJit.js");
  const { disposeTransformCache } =
    await import("../../src/lib/plot/utils/transforms/common.js");
  const cache = {};
  let traced = 0;
  const scale = (values, { factor }) => {
    traced++;
    return values.mul(factor);
  };
  try {
    for (const [length, factor, traces] of [
      [4, 2, 1],
      [4, 3, 1],
      [8, 3, 2],
    ]) {
      const compile = transformJit(cache, () =>
        assert.fail("a cache owns its kernels"),
      );
      const result = compile(scale)(np.arange(length), { factor });
      try {
        assert.deepEqual(
          Array.from(await result.ref.data()),
          Array.from({ length }, (_, i) => i * factor),
        );
        assert.equal(traced, traces);
      } finally {
        result.dispose();
      }
    }
    let staticTraces = 0;
    const staticScale = (values, factor) => {
      staticTraces++;
      return values.mul(factor);
    };
    const compiled = transformJit(cache, () => {})(staticScale, {
      staticArgnums: [1],
    });
    for (const factor of [2, 3]) {
      const result = compiled(np.arange(4), factor);
      try {
        assert.equal((await result.ref.data())[3], 3 * factor);
      } finally {
        result.dispose();
      }
    }
    assert.equal(staticTraces, 2);
  } finally {
    disposeTransformCache(cache);
  }
  const cleanups = [];
  const compiled = transformJit(undefined, (release) => cleanups.push(release))(
    scale,
  );
  const result = compiled(np.arange(2), { factor: 5 });
  result.dispose();
  cleanups.forEach((release) => release());
});

test("transform jit releases dynamic scalar arguments when tracing fails", async () => {
  const { numpy: np } = await import("@hmplot/jax");
  const { transformJit } =
    await import("../../src/lib/plot/plugins/transformJit.js");
  const { disposeTransformCache } =
    await import("../../src/lib/plot/utils/transforms/common.js");
  const cache = {};
  const input = np.arange(3);
  try {
    const compiled = transformJit(cache, () => {})((value) => {
      throw Error("bad kernel");
    });
    assert.throws(
      () => compiled({ factor: 2, input: input.ref }),
      /bad kernel/,
    );
    assert.deepEqual(Array.from(await input.ref.data()), [0, 1, 2]);
  } finally {
    disposeTransformCache(cache);
    input.dispose();
  }
});

test("a registry records what a plugin's setup declares, with the running library's own modules", () => {
  const three = { name: "three" },
    registry = createPluginRegistry({ three });
  const arrived = [];
  registry.subscribe((plugin) => arrived.push(plugin.name));
  let seen;
  const plugin = vignette((hm) => {
    seen = hm.three;
    hm.effect("vignette", {
      ...EFFECT,
      parameters: { amount: { type: "number", default: 0.5, min: 0, max: 1 } },
    });
  });
  registry.register(plugin);
  registry.register(plugin); // the same plugin again: nothing happens
  assert.equal(seen, three);
  assert.deepEqual(arrived, ["vignette"]);
  assert.equal(registry.get("effect", "vignette").stage, "display");
  assert.equal(registry.owner("effect", "vignette"), "vignette");
  assert.equal(registry.get("effect", "grain"), undefined);
  const missing = registry.missing("effect", "grain");
  assert.equal(missing.code, "plugin.missing");
  assert.match(
    missing.message,
    /^No plugin registers the effect "grain", so the plot draws without it\. Registered: vignette\./,
  );
});

test("definePlugin checks the plugin's shape; a registry refuses conflicts and failed setups whole", () => {
  assert.throws(
    () => definePlugin({ name: "Vignette", apiVersion: 1, setup() {} }),
    /name is lowercase letters and digits/,
  );
  assert.throws(
    () => definePlugin({ name: "vignette", setup() {} }),
    /apiVersion is the plugin API version/,
  );
  assert.throws(
    () => definePlugin({ name: "vignette", apiVersion: 1 }),
    /setup is a function/,
  );
  const registry = createPluginRegistry();
  registry.register(vignette((hm) => hm.effect("vignette", EFFECT)));
  assert.throws(
    () => registry.register(vignette(() => {})),
    (error) =>
      error.code === "plugin.conflict" &&
      /^Plugin "vignette" is already registered: register one copy of it\.$/.test(
        error.message,
      ),
  );
  assert.throws(
    () =>
      registry.register(
        definePlugin({
          name: "grain",
          apiVersion: 1,
          setup: (hm) => hm.effect("vignette", EFFECT),
        }),
      ),
    (error) =>
      error.code === "plugin.conflict" &&
      error.message ===
        'Plugin "grain": effect "vignette" is already registered by plugin "vignette".',
  );
  // A setup that throws, after declaring something, registers none of it.
  assert.throws(
    () =>
      registry.register(
        definePlugin({
          name: "broken",
          apiVersion: 1,
          setup: (hm) => {
            hm.transform("Smooth", {
              reads: "rows",
              output: "sameRows",
              run: () => ({ columns: {} }),
            });
            throw Error("no WebGPU");
          },
        }),
      ),
    (error) =>
      error.code === "plugin.failed" &&
      error.message === 'Plugin "broken" failed: no WebGPU',
  );
  assert.equal(registry.get("transform", "Smooth"), undefined);
  assert.deepEqual(registry.names(), ["vignette"]);
  assert.throws(
    () =>
      registry.register(
        definePlugin({ name: "future", apiVersion: 2, setup() {} }),
      ),
    /^Error: Plugin "future" failed: it was written for plugin API version 2, and this HMPlot has version 1\.$/,
  );
  assert.throws(
    () =>
      registry.register(
        definePlugin({
          name: "bad",
          apiVersion: 1,
          setup: (hm) =>
            hm.shade("hatch", { parameters: { spacing: { type: "length" } } }),
        }),
      ),
    /Plugin "bad" failed: hatch: parameter "spacing" has type "length"; it is one of number, color/,
  );
});

test("transform declarations reject invalid execution contracts without partially registering a plugin", () => {
  const valid = {
    reads: "padded",
    output: "sameRows",
    run: () => ({ columns: {} }),
  };
  for (const [change, message] of [
    [{ reads: "compacted" }, /reads must be/],
    [{ output: "aggregate" }, /output must be/],
    [{ run: null }, /run\(inputs\) function/],
    [{ outputs: [] }, /outputs must be a function/],
  ]) {
    const registry = createPluginRegistry();
    assert.throws(
      () =>
        registry.register(
          vignette((hm) => {
            hm.effect("vignette", EFFECT);
            hm.transform("Smooth", { ...valid, ...change });
          }),
        ),
      message,
    );
    assert.deepEqual(registry.names(), []);
    assert.equal(registry.get("effect", "vignette"), undefined);
  }
  const registry = createPluginRegistry();
  registry.register(
    vignette((hm) => {
      for (const reads of ["rows", "padded", "grid"])
        for (const output of ["sameRows", "subset", "newRows", "graph"])
          hm.transform(`${reads}.${output}`, { ...valid, reads, output });
      hm.transform("Adaptive", {
        ...valid,
        output: ({ grid }) => (grid ? "sameRows" : "newRows"),
      });
    }),
  );
  assert.equal(registry.kinds("transform").length, 13);
});

test("Transform's shared selector rejects layout/transform, built-in and control parameter collisions atomically", () => {
  const registry = createPluginRegistry();
  const transform = {
    reads: "rows",
    output: "sameRows",
    run: () => ({ columns: {} }),
  };
  registry.reserve("transform", ["Calculate"]);
  for (const setup of [
    (hm) => hm.layout("Calculate", { run: () => ({}) }),
    (hm) => {
      hm.transform("demo.shared", transform);
      hm.layout("demo.shared", { run: () => ({}) });
    },
    (hm) =>
      hm.transform("demo.control", {
        ...transform,
        parameters: { by: { type: "field" } },
      }),
    (hm) =>
      hm.layout("demo.internal", {
        run: () => ({}),
        parameters: { __viewState: { type: "number" } },
      }),
  ]) {
    assert.throws(
      () =>
        registry.register(
          definePlugin({ name: "invalid", apiVersion: 1, setup }),
        ),
      /built-in|twice|reserved/,
    );
    assert.deepEqual(registry.names(), []);
  }
  registry.register(
    definePlugin({
      name: "row",
      apiVersion: 1,
      setup: (hm) => hm.transform("demo.shared", transform),
    }),
  );
  assert.throws(
    () =>
      registry.register(
        definePlugin({
          name: "graph",
          apiVersion: 1,
          setup: (hm) => hm.layout("demo.shared", { run: () => ({}) }),
        }),
      ),
    (error) => error.code === "plugin.conflict",
  );
  assert.equal(registry.get("layout", "demo.shared"), undefined);
});

test("a parameter schema checks values, naming the owner, the parameter and the known ones", () => {
  const schema = checkSchema("Hatch", {
    spacing: { type: "number", default: 6, min: 1, integer: true },
    color: { type: "color" },
    dashed: { type: "boolean", default: false },
    style: { type: "select", options: ["lines", "dots"], default: "lines" },
    by: { type: "field" },
    bins: { type: "expression", integer: true },
    angle: { type: "number", max: 90 },
  });
  assert.equal(
    parameterProblem(
      "Hatch",
      schema,
      {
        spacing: 4,
        color: "#fff",
        style: "dots",
        by: "species",
        bins: col("x"),
      },
      isColor,
    ),
    "",
  );
  assert.equal(
    parameterProblem("Hatch", schema, { spacing: 0.5 }, isColor),
    "Hatch: spacing is an integer of at least 1; got 0.5.",
  );
  assert.equal(
    parameterProblem("Hatch", schema, { angle: 120 }, isColor),
    "Hatch: angle is a number of at most 90; got 120.",
  );
  assert.equal(
    parameterProblem("Hatch", schema, { color: "plaid" }, isColor),
    'Hatch: color is a CSS color; got "plaid".',
  );
  assert.equal(
    parameterProblem("Hatch", schema, { dashed: "yes" }, isColor),
    'Hatch: dashed is true or false; got "yes".',
  );
  assert.equal(
    parameterProblem("Hatch", schema, { style: "waves" }, isColor),
    'Hatch: style is one of "lines", "dots"; got "waves".',
  );
  // A field parameter takes a name or aligned numeric rows, not an expression.
  assert.equal(
    parameterProblem(
      "Hatch",
      schema,
      { by: col("species") },
      isColor,
    ).startsWith("Hatch: by is a column's name or one numeric value"),
    true,
  );
  assert.equal(
    parameterProblem("Hatch", schema, { bins: "auto" }, isColor),
    'Hatch: bins is a number or an expression; got "auto".',
  );
  assert.equal(
    parameterProblem("Hatch", schema, { spaceing: 4 }, isColor),
    'Hatch: "spaceing" is not one of its parameters (spacing, color, dashed, style, by, bins, angle).',
  );
  assert.deepEqual(withDefaults(schema, { spacing: 3 }), {
    spacing: 3,
    dashed: false,
    style: "lines",
  });
  assert.deepEqual(expressionParameters(schema), { bins: "integer" });
  assert.throws(
    () => checkSchema("Hatch", { style: { type: "select" } }),
    /parameter "style" is a select without options/,
  );
  assert.throws(
    () =>
      checkSchema("Hatch", { spacing: { type: "number", min: 1, default: 0 } }),
    /^Error: Hatch: spacing is a number of at least 1; got 0 \(its default\)\.$/,
  );
  assert.throws(
    () => checkSchema("Hatch", { spacing: { type: "number", minimum: 1 } }),
    /has "minimum", not one of type, default/,
  );
});

test("the built-in bloom and transforms declare their parameters (TODO 138.2)", async () => {
  const { BLOOM_PARAMETERS, BLOOM_DEFAULTS } =
    await import("../../src/lib/plot/utils/presentation.js");
  assert.deepEqual(BLOOM_DEFAULTS, { strength: 1, radius: 0.5 });
  assert.equal(
    parameterProblem("bloom", BLOOM_PARAMETERS, { glow: 2 }),
    'bloom: "glow" is not one of its parameters (strength, radius).',
  );
  const { expressionParams } =
    await import("../../src/lib/plot/utils/transforms.js");
  assert.deepEqual(expressionParams("Hexbin"), {
    bins: "integer",
    radius: "number",
  });
  assert.deepEqual(expressionParams("Interpolate"), { resolution: "integer" });
  assert.deepEqual(expressionParams("Sort"), {});
});

test("a registry keeps a plugin whole: a plain object registers once, a caught conflict still fails it, and hm closes after setup", () => {
  const registry = createPluginRegistry();
  const plain = {
    name: "plain",
    apiVersion: 1,
    setup: (hm) => hm.effect("e", EFFECT),
  };
  registry.register(plain);
  registry.register(plain); // the same object again: nothing happens
  assert.throws(
    () =>
      registry.register(
        Object.freeze({ name: "Bad Name!", apiVersion: 1, setup() {} }),
      ),
    /name is lowercase letters and digits/,
  );
  assert.throws(
    () =>
      registry.register({
        name: "catcher",
        apiVersion: 1,
        setup(hm) {
          try {
            hm.effect("e", EFFECT);
          } catch {
            /* swallowed: the plugin still fails */
          }
          hm.effect("f", EFFECT);
        },
      }),
    (error) => error.code === "plugin.conflict",
  );
  assert.equal(registry.get("effect", "f"), undefined);
  let kept;
  registry.register({
    name: "late",
    apiVersion: 1,
    setup: (hm) => (kept = hm),
  });
  assert.throws(() => kept.effect("g", {}), /after setup returned/);
  registry.subscribe(() => {
    throw Error("a listener's own bug");
  });
  const heard = [];
  registry.subscribe((plugin) => heard.push(plugin.name));
  const logged = [],
    error = console.error;
  console.error = (...args) => logged.push(args);
  try {
    registry.register({ name: "heard", apiVersion: 1, setup() {} });
  } finally {
    console.error = error;
  }
  assert.deepEqual(heard, ["heard"]);
  assert.ok(registry.names().includes("heard"));
  assert.equal(logged[0][1].message, "a listener's own bug");
});

test("a schema's own keys are checked: numbers for bounds, min at most max, options only on a select", () => {
  assert.throws(
    () => checkSchema("Grain", { a: { type: "number", min: "0" } }),
    /has min "0", not a number/,
  );
  assert.throws(
    () => checkSchema("Grain", { a: { type: "number", min: 0, max: -1 } }),
    /has min 0 above its max -1/,
  );
  assert.throws(
    () => checkSchema("Grain", { a: { type: "number", integer: "yes" } }),
    /has integer "yes", not true or false/,
  );
  assert.throws(
    () => checkSchema("Grain", { a: { type: "number", when: "cells" } }),
    /not "grid" or "rows"/,
  );
  assert.throws(
    () => checkSchema("Grain", { a: { type: "string", options: ["x"] } }),
    /only a select takes/,
  );
});

test("a Plot's effects: built-ins checked, plugins' kinds found with their defaults, a missing kind named (TODO 138.3)", async () => {
  const { readEffects } = await import("../../src/lib/plot/utils/effects.js");
  const registry = createPluginRegistry();
  const read = (effects) => readEffects(effects, registry, isColor);
  assert.deepEqual(read(undefined), {
    problems: [],
    missing: null,
    bloom: null,
    fog: null,
    plugins: [],
  });
  const built = read([
    { kind: "bloom", strength: 2 },
    { kind: "fog", near: 1, far: 9 },
  ]);
  assert.deepEqual(
    [built.bloom, built.fog, built.problems],
    [{ strength: 2, radius: 0.5 }, { near: 1, far: 9 }, []],
  );
  assert.deepEqual(read({ kind: "fog" }).problems, [
    'Plot.effects is a list of { kind, ...parameters }, as effects={[{ kind: "fog", near: 50, far: 200 }]}; got {"kind":"fog"}.',
  ]);
  assert.deepEqual(read([{ kind: "bloom" }, { kind: "bloom" }]).problems, [
    "Plot.effects lists bloom twice; keep one.",
  ]);
  assert.deepEqual(read([{ kind: "bloom", strength: -1 }]).problems, [
    "Plot.effects: bloom strength is a number of at least 0; got -1.",
  ]);
  assert.deepEqual(
    read([{ kind: "fog", near: 1, far: 2, start: 0 }]).problems,
    [
      'Plot.effects: fog "start" is not one of its parameters (near, far, color).',
    ],
  );
  // A kind no plugin registers: a warning naming it and the built-ins, and nothing else drawn.
  const missing = read([{ kind: "vignette", amount: 0.5 }]);
  assert.equal(missing.missing.code, "plugin.missing");
  assert.match(
    missing.missing.message,
    /^No plugin registers the effect "vignette", so the plot draws without it\. Built in: bloom, fog\. No effect is registered\./,
  );
  assert.deepEqual(missing.plugins, []);
  registry.register(
    vignette((hm) =>
      hm.effect("vignette", {
        stage: "display",
        parameters: {
          amount: { type: "number", default: 0.5, min: 0, max: 1 },
          color: { type: "color", default: "#000" },
        },
        display: (inputs) => inputs,
      }),
    ),
  );
  const found = read([{ kind: "vignette", amount: 0.25 }]);
  assert.equal(found.missing, null);
  assert.deepEqual(
    found.plugins.map(({ kind, values }) => [kind, values]),
    [["vignette", { amount: 0.25, color: "#000" }]],
  );
  assert.equal(found.plugins[0].definition, registry.get("effect", "vignette"));
  assert.deepEqual(read([{ kind: "vignette", amount: 2 }]).problems, [
    "Plot.effects: vignette amount is a number from 0 to 1; got 2.",
  ]);
});

test("a plugin's effect is a presentation hook: number and color parameters are uniforms, the rest its key, and a throw leaves it out (TODO 138.3)", async () => {
  const { Presentation } =
    await import("../../src/lib/plot/utils/presentation.js");
  const { PerspectiveCamera, OrthographicCamera } =
    await import("three/webgpu");
  const { vec3, float } = await import("three/tsl");
  const presentation = new Presentation();
  let built = 0;
  const definition = Object.freeze({
    stage: "linear",
    order: 2,
    cameras: "perspective",
    export: "none",
    parameters: {
      amount: { type: "number", default: 0.5 },
      tint: { type: "color", default: "#ff0000" },
      mode: { type: "select", options: ["a", "b"], default: "a" },
    },
    linear: ({ rgb, alpha, params }) => {
      built++;
      return { rgb: rgb.mul(params.amount), alpha, mode: params.mode };
    },
  });
  presentation.setPluginEffects([
    {
      kind: "tint",
      definition,
      values: { amount: 0.5, tint: "#ff0000", mode: "a" },
    },
  ]);
  const [effect] = presentation.plugins.values(),
    uniforms = effect.hook;
  assert.equal(
    presentation.activeFor(new OrthographicCamera()).key,
    "",
    "a perspective-only effect leaves 2D alone",
  );
  const active = () => presentation.activeFor(new PerspectiveCamera());
  assert.equal(active().key, 'tint:linear:{"mode":"a"}');
  // A new number or color is a uniform's value: the same hook, the same key.
  presentation.setPluginEffects([
    {
      kind: "tint",
      definition,
      values: { amount: 0.8, tint: "#00ff00", mode: "a" },
    },
  ]);
  assert.equal(presentation.plugins.get("tint").hook, uniforms);
  assert.equal(active().key, 'tint:linear:{"mode":"a"}');
  // A select is a plain value: its change is a new key (the output node rebuilds).
  presentation.setPluginEffects([
    {
      kind: "tint",
      definition,
      values: { amount: 0.8, tint: "#00ff00", mode: "b" },
    },
  ]);
  assert.equal(active().key, 'tint:linear:{"mode":"b"}');
  const scenePass = { getViewZNode: () => float(1) };
  const output = (hooks) =>
    presentation.output({
      color: { rgb: vec3(1), a: float(1) },
      scenePass,
      active: hooks,
      toneMapping: 0,
      colorSpace: "srgb",
      premultiplied: true,
    });
  output(active().active);
  assert.equal(built, 1);
  assert.deepEqual(
    presentation.rasterEffects(new PerspectiveCamera(), {
      traverseVisible() {},
    }),
    [],
    'export: "none"',
  );
  // Its nodes throw: the plot draws without it, and the failure is reported once.
  const failing = Object.freeze({
    stage: "display",
    display: () => {
      throw Error("no such node");
    },
  });
  presentation.setPluginEffects([
    { kind: "broken", definition: failing, values: {} },
  ]);
  output(active().active);
  output(active().active);
  const failure = presentation.failures.get("broken");
  assert.equal(failure.code, "plugin.failed");
  assert.equal(
    failure.message,
    "Plot.effects: broken failed, and the plot draws without it: no such node",
  );
  assert.equal(presentation.failures.size, 1);
  presentation.setPluginEffects([]);
  assert.equal(presentation.failures.size, 0);
  // A registry refuses an effect it could not draw.
  assert.throws(
    () =>
      createPluginRegistry().register(
        vignette((hm) => hm.effect("odd", { stage: "volume" })),
      ),
    /^Error: Plugin "vignette" failed: effect "odd" has stage "volume"; an effect's stage is "linear", "display" or "object"\.$/,
  );
  assert.throws(
    () =>
      createPluginRegistry().register(
        vignette((hm) => hm.effect("odd", { stage: "linear" })),
      ),
    /effect "odd" is a linear effect without a linear\(inputs\) function/,
  );
  // A built-in's name is not a plugin's kind (the Plot would read the built-in instead).
  assert.throws(
    () =>
      createPluginRegistry().register(
        vignette((hm) => hm.effect("fog", EFFECT)),
      ),
    /effect "fog" is the name of a built-in effect/,
  );
  // A result that is not nodes fails here, not in the shader's compile; built again it recovers.
  let plainResult = true;
  const odd = Object.freeze({
    stage: "display",
    parameters: { level: { type: "number" }, shade: { type: "color" } },
    display: ({ rgb, alpha }) =>
      plainResult ? { rgb: [1, 0, 0], alpha: 1 } : { rgb, alpha },
  });
  presentation.setPluginEffects([{ kind: "odd", definition: odd, values: {} }]);
  // Parameters without a default, left out, are null in params (TODO 138.5).
  output(active().active);
  assert.match(
    presentation.failures.get("odd").message,
    /its display returned \{ rgb, alpha \}, not \{ rgb, alpha \} nodes/,
  );
  assert.deepEqual(
    presentation.rasterEffects(new PerspectiveCamera(), {
      traverseVisible() {},
    }),
    [],
    "a failed effect is not named by an export",
  );
  plainResult = false;
  output(active().active);
  assert.equal(presentation.failures.size, 0);
});

test("the sky and the atmosphere are first-party plugins: image and vector parameters, a check, null for a parameter left out, the object stage (TODO 138.5)", async () => {
  const { readEffects } = await import("../../src/lib/plot/utils/effects.js");
  const { Presentation } =
    await import("../../src/lib/plot/utils/presentation.js");
  const { FIRST_PARTY_PLUGINS } =
    await import("../../src/lib/plugins/index.js");
  const three = await import("three/webgpu"),
    tsl = await import("three/tsl");
  const registry = createPluginRegistry({
    three,
    tsl,
    jax: await import("@hmplot/jax"),
  });
  for (const plugin of FIRST_PARTY_PLUGINS) registry.register(plugin);
  // Their kinds are taken: another plugin declaring one conflicts.
  assert.throws(
    () => registry.register(vignette((hm) => hm.effect("sky", EFFECT))),
    /effect "sky" is already registered by plugin "hmplot.sky"/,
  );
  const problems = (effects) =>
    readEffects(effects, registry, isColor).problems;
  assert.deepEqual(
    problems([{ kind: "sky", zenith: "#123", rotation: [0, 90, 0] }]),
    [],
  );
  assert.deepEqual(
    problems([{ kind: "sky", image: "stars.jpg", horizon: "#fff" }]),
    [
      "Plot.effects: sky takes image or the gradient's colors (horizon), not both.",
    ],
  );
  assert.deepEqual(problems([{ kind: "sky", ground: "dirt" }]), [
    'Plot.effects: sky ground is a CSS color; got "dirt".',
  ]);
  assert.deepEqual(problems([{ kind: "sky", image: 3 }]), [
    "Plot.effects: sky image is an image: a URL, an ImageBitmap, an HTMLImageElement, an HTMLCanvasElement or a Blob; got 3.",
  ]);
  assert.deepEqual(problems([{ kind: "sky", rotation: [0, 90] }]), [
    "Plot.effects: sky rotation is a list of 3 numbers; got [0,90].",
  ]);
  assert.deepEqual(problems([{ kind: "sky", visible: "no" }]), [
    'Plot.effects: sky visible is true or false; got "no".',
  ]);
  assert.deepEqual(problems([{ kind: "atmosphere" }]), [
    "Plot.effects: atmosphere adds an object to a Frame's scene; a Plot does not list it.",
  ]);
  // The atmosphere's own check: a thickness above 0, and a globe.
  const atmosphere = registry.get("effect", "atmosphere");
  const globe = { frame: { globe: true } };
  assert.equal(atmosphere.check({ thickness: 0.2 }, globe), "");
  assert.equal(
    atmosphere.check({ thickness: 0 }, globe),
    "thickness is a number above 0 (a fraction of the globe's radius); got 0.",
  );
  assert.equal(
    atmosphere.check({}, { frame: { globe: false } }),
    "needs a spherical Frame (a globe) in a 3D plot.",
  );
  const shell = atmosphere.object();
  shell.set({ color: "#ff0000", thickness: 0.5 });
  const camera = new three.PerspectiveCamera();
  camera.position.set(0, 0, 10);
  camera.updateMatrixWorld();
  // A globe of radius 2 at (1, 0, 0): north (0, 90) at (1, 2, 0), south at (1, -2, 0), (0, 0) at (3, 0, 0).
  const points = { "0,90": [1, 2, 0], "0,-90": [1, -2, 0], "0,0": [3, 0, 0] };
  shell.update({
    camera,
    width: 100,
    height: 100,
    frame: { period: 360, point: (position) => points[position.join()] },
  });
  assert.deepEqual(
    shell.object.matrix.elements.filter((_, i) =>
      [0, 5, 10, 12, 13, 14].includes(i),
    ),
    [3, 3, 3, 1, 0, 0],
  );
  shell.dispose();
  // null is a value left out; an image is an effect's parameter only.
  assert.deepEqual(
    problems([{ kind: "sky", image: null, zenith: "#123", ground: null }]),
    [],
  );
  assert.throws(
    () =>
      createPluginRegistry().register(
        vignette((hm) =>
          hm.shade("photo", {
            parameters: { picture: { type: "image" } },
            shade: () => null,
          }),
        ),
      ),
    /shade "photo": parameter "picture" is an image, which only an effect takes/,
  );
  // Schemas: a vector's length, an image's wrap.
  assert.throws(
    () => checkSchema("Grain", { a: { type: "vector" } }),
    /is a vector with length undefined, not 2, 3 or 4/,
  );
  assert.throws(
    () => checkSchema("Grain", { a: { type: "number", wrap: "repeat" } }),
    /only an image takes/,
  );
  // In a presentation: a vector is a uniform, a missing color null, and an image loads (the
  // settle waits), the effect drawn once it has.
  const presentation = new Presentation();
  const loads = [],
    tracked = [];
  presentation.loadImage = (source) =>
    new Promise((resolve) => loads.push({ source, resolve }));
  presentation.track = (work) => tracked.push(work);
  const sky = registry.get("effect", "sky");
  let params;
  const definition = Object.freeze({
    ...sky,
    display: (inputs) => ((params = inputs.params), sky.display(inputs)),
  });
  const set = (values) =>
    presentation.setPluginEffects([
      { kind: "sky", definition, values: withDefaults(sky.parameters, values) },
    ]);
  const perspective = new three.PerspectiveCamera();
  set({ image: "stars.png" });
  assert.equal(
    presentation.activeFor(perspective).key,
    "",
    "drawn once its image loads",
  );
  assert.deepEqual(
    [loads.length, tracked.length, loads[0].source],
    [1, 1, "stars.png"],
  );
  loads[0].resolve({ width: 2, height: 1, close() {} });
  await tracked[0];
  assert.equal(
    presentation.activeFor(perspective).key,
    'sky:display:{"ground":null,"visible":true}',
  );
  const { active } = presentation.activeFor(perspective);
  presentation.output({
    color: { rgb: tsl.vec3(1), a: tsl.float(1) },
    scenePass: {},
    active,
    toneMapping: 0,
    colorSpace: "srgb",
    premultiplied: true,
  });
  assert.equal(params.ground, null);
  assert.equal(params.image.isTextureNode, true);
  assert.equal(params.image.value.wrapS, three.RepeatWrapping);
  assert.deepEqual(params.rotation.value.toArray(), [0, 0, 0]);
  // The same image again loads nothing; a rotation is the uniform's value, the same key.
  set({ image: "stars.png", rotation: [10, 20, 30] });
  assert.equal(loads.length, 1);
  assert.deepEqual(params.rotation.value.toArray(), [10, 20, 30]);
  assert.equal(
    presentation.activeFor(perspective).key,
    'sky:display:{"ground":null,"visible":true}',
  );
  // An image that fails is the Plot's problem, naming the effect and its parameter.
  presentation.loadImage = (source, signal, what) =>
    Promise.reject(Error(`${what} could not load ${source}.`));
  set({ image: "gone.png" });
  await tracked.at(-1);
  assert.deepEqual(presentation.problems(), [
    "Plot.effects: sky image could not load gone.png.",
  ]);
  presentation.dispose();
});

test("a mark's shade: read against its plugin's schema, uniforms for numbers and colors, normals only where a mark has them (TODO 138.3)", async () => {
  const { readShade, createShade } =
    await import("../../src/lib/plot/utils/shade.js");
  const { MeshBasicNodeMaterial, MeshStandardNodeMaterial } =
    await import("three/webgpu");
  const { LineNodeMaterial } =
    await import("../../src/lib/threeExtensions/materials/lines.js");
  const { vec4, float } = await import("three/tsl");
  const registry = createPluginRegistry();
  let builds = 0;
  registry.register(
    vignette((hm) => {
      hm.shade("hatch", {
        parameters: {
          spacing: { type: "number", default: 6, min: 1 },
          ink: { type: "color", default: "#000000" },
          style: {
            type: "select",
            options: ["diagonal", "cross"],
            default: "diagonal",
          },
        },
        shade: ({ color, params }) => {
          builds++;
          return vec4(color.rgb.mul(params.spacing), color.a);
        },
      });
      hm.shade("rim", {
        shade: ({ color, normalView }) =>
          vec4(color.rgb.mul(normalView.z), color.a),
      });
      hm.shade("plain", { shade: () => [1, 0, 0, 1] });
    }),
  );
  // Reading: the form, the schema, a missing kind.
  assert.equal(readShade(null, registry, "Points").entry, null);
  assert.match(
    String(readShade({ spacing: 2 }, registry, "Points").problem),
    /^Points\.shade is \{ kind, \.\.\.parameters \}/,
  );
  assert.match(
    String(
      readShade({ kind: "hatch", spacing: 0 }, registry, "Points").problem,
    ),
    /^Points\.shade: hatch spacing/,
  );
  const missing = readShade({ kind: "dots" }, registry, "Points").problem;
  assert.equal(missing.code, "plugin.missing");
  assert.match(
    missing.message,
    /^Points\.shade: No plugin registers the shade "dots"/,
  );
  const read = (spec) => readShade(spec, registry, "Points").entry;
  assert.deepEqual(read({ kind: "hatch" }).values, {
    spacing: 6,
    ink: "#000000",
    style: "diagonal",
  });

  // Applying: the mark's own outputNode stays beneath, a uniform's change rebuilds nothing.
  const shade = createShade(() => "Prism");
  const material = new MeshBasicNodeMaterial();
  const own = vec4(1, 0, 0, 1);
  material.outputNode = own;
  assert.equal(shade.set(read({ kind: "hatch" })), true);
  assert.equal(shade.apply(material), "");
  const shaded = material.outputNode;
  assert.notEqual(shaded, own);
  const version = material.version;
  assert.equal(
    shade.set(read({ kind: "hatch", spacing: 9, ink: "#ff0000" })),
    false,
  );
  assert.equal(shade.apply(material), "");
  assert.equal(
    material.outputNode,
    shaded,
    "a number and a color are uniforms",
  );
  assert.equal(material.version, version);
  assert.equal(builds, 1);
  // A plain value is part of the key: shaded again, over the mark's own output.
  assert.equal(shade.set(read({ kind: "hatch", style: "cross" })), true);
  shade.apply(material);
  assert.notEqual(material.outputNode, shaded);
  assert.equal(builds, 2);
  shade.set(null);
  shade.apply(material);
  assert.equal(material.outputNode, own, "no shade: the mark's output again");

  // normalView on a mark without normals is its error, naming the marks that have it.
  const points = createShade(() => "Points");
  points.set(read({ kind: "rim" }));
  const problem = points.apply(new MeshBasicNodeMaterial());
  assert.equal(problem.code, "plugin.input");
  assert.match(
    problem.message,
    /^Points\.shade: rim reads normalView, and Points has no surface normals\. The marks that have it: Points3D, Prism/,
  );
  const lit = new MeshStandardNodeMaterial();
  assert.equal(points.apply(lit), "");
  assert.ok(lit.outputNode);
  // A result that is not a node is the mark's error, and the material stays unshaded.
  const plain = createShade(() => "Points");
  plain.set(read({ kind: "plain" }));
  const flat = new MeshBasicNodeMaterial();
  assert.match(
    String(plain.apply(flat).message),
    /plain returned \[1,0,0,1\], not a vec4 node/,
  );
  assert.equal(flat.outputNode, null);
  // The line material shades its own output (shadeOutput), and a copy (picking) leaves it out.
  const line = new LineNodeMaterial();
  shade.set(read({ kind: "hatch" }));
  assert.equal(shade.apply(line), "");
  assert.equal(typeof line.shadeOutput, "function");
  assert.ok(line.shadeOutput(vec4(float(1), 0, 0, 1)).isNode);
  assert.equal(new LineNodeMaterial().copy(line).shadeOutput, null);
  // A registry refuses a shade without its function.
  assert.throws(
    () =>
      createPluginRegistry().register(vignette((hm) => hm.shade("odd", {}))),
    /shade "odd" has no shade\(inputs\) function/,
  );
});

test("a plugin package: its manifest, and a scene's plugins loaded once per page, checked against their hash (TODO 138.4)", async () => {
  const { pluginManifest } =
    await import("../../src/lib/plot/plugins/manifest.js");
  const { pluginHash } = await import("../../src/lib/plot/plugins/hash.js");
  const {
    loadScenePlugins,
    loadedPluginSources,
    pluginRefsProblem,
    resetLoadedPlugins,
  } = await import("../../src/lib/scene/plugins.js");
  const { createHash } = await import("node:crypto");
  // A plugin file imports nothing: its default export is the plugin.
  const source = `export default { name: "stripes", version: "1.2.0", apiVersion: 1, setup(hm) {
    hm.shade("stripes", { parameters: { spacing: { type: "number", default: 8, min: 2 } }, shade: ({ color }) => color });
  } };\n`;
  const plugin = (
    await import(`data:text/javascript,${encodeURIComponent(source)}`)
  ).default;
  const manifest = pluginManifest(plugin, source, { main: "stripes.js" });
  assert.deepEqual(manifest, {
    name: "stripes",
    version: "1.2.0",
    apiVersion: 1,
    main: "stripes.js",
    hash: `sha256-${createHash("sha256").update(source).digest("base64")}`,
    hooks: {
      effect: {},
      shade: {
        stripes: {
          parameters: { spacing: { type: "number", default: 8, min: 2 } },
        },
      },
      transform: {},
      layout: {},
    },
  });
  assert.equal(pluginHash(new TextEncoder().encode(source)), manifest.hash);
  // Pages carry the file as text: UTF-8 without a byte order mark.
  assert.throws(
    () =>
      pluginManifest(plugin, new Uint8Array([0xef, 0xbb, 0xbf, 0x41]), {
        main: "stripes.js",
      }),
    /byte order mark/,
  );
  assert.throws(
    () =>
      pluginManifest(plugin, new Uint8Array([0xff]), { main: "stripes.js" }),
    /not UTF-8 text/,
  );
  assert.throws(
    () =>
      pluginManifest({ ...plugin, version: undefined }, source, {
        main: "stripes.js",
      }),
    /a manifest needs its version/,
  );

  // A state's plugins are names: a list of { name, version, hash }, each name once.
  assert.equal(pluginRefsProblem(undefined), "");
  assert.match(
    pluginRefsProblem([{ name: "stripes" }]),
    /each of plugins is \{ name, version, hash \}/,
  );
  const ref = { name: "stripes", version: "1.2.0", hash: manifest.hash };
  assert.match(pluginRefsProblem([ref, ref]), /names "stripes" twice/);

  resetLoadedPlugins();
  const registry = createPluginRegistry();
  const asked = [];
  const files = { stripes: source };
  const from = (ref) => {
    asked.push(ref.name);
    return files[ref.name] ?? null;
  };
  // A file that does not match the hash is not run; one that is not here is missing.
  let results = await loadScenePlugins(
    [
      { ...ref, hash: pluginHash("changed") },
      { name: "absent", version: "1", hash: "sha256-x" },
    ],
    from,
    { registry },
  );
  assert.equal(results.get("stripes").code, "plugin.failed");
  assert.equal(results.get("stripes").severity, "warning");
  assert.match(
    results.get("stripes").message,
    /does not match the hash the scene names .* so it was not run/,
  );
  assert.equal(registry.get("shade", "stripes"), undefined);
  assert.equal(results.get("absent").code, "plugin.missing");
  assert.match(
    results.get("absent").message,
    /Plugin "absent" \(1\) is not installed here, so the scene draws without it\. .*hm\.use_plugin\("absent"\)/,
  );
  // The right file registers, once: two scenes naming it load it once.
  asked.length = 0;
  const [first, second] = await Promise.all([
    loadScenePlugins([ref], from, { registry }),
    loadScenePlugins([ref], from, { registry }),
  ]);
  assert.equal(first.get("stripes"), null);
  assert.equal(second.get("stripes"), null);
  assert.deepEqual(asked, ["stripes"]);
  assert.ok(registry.get("shade", "stripes"));
  assert.deepEqual(loadedPluginSources([ref]), {
    stripes: { hash: ref.hash, source },
  });
  // Another copy of it is a conflict: the loaded one draws.
  results = await loadScenePlugins(
    [{ ...ref, version: "2.0.0", hash: pluginHash("other") }],
    from,
    { registry },
  );
  assert.equal(results.get("stripes").code, "plugin.conflict");
  assert.deepEqual(
    loadedPluginSources([{ ...ref, hash: pluginHash("other") }]),
    {},
  );
  // A file whose default export is another plugin, or that throws, fails.
  files.named = source;
  const named = await loadScenePlugins(
    [{ name: "named", version: "1", hash: manifest.hash }],
    from,
    { registry },
  );
  assert.match(
    named.get("named").message,
    /default export is plugin "stripes"/,
  );
  files.broken = "throw new Error('boom');";
  const broken = await loadScenePlugins(
    [{ name: "broken", version: "1", hash: pluginHash(files.broken) }],
    from,
    { registry },
  );
  assert.match(
    broken.get("broken").message,
    /Plugin "broken" failed: its file throws \(boom\)/,
  );
  resetLoadedPlugins();
});

test("layout schema defaults resolve input expressions and declare interaction dependencies", async () => {
  const { runPluginLayout, layoutParameters, layoutDependencies } =
    await import("../../src/lib/plot/plugins/layout.js");
  const { createDataScope } =
    await import("../../src/lib/plot/utils/categorical.js");
  const { createGraphData, graphScope } =
    await import("../../src/lib/plot/utils/graphData.js");
  const { mean, add, view } =
    await import("../../src/lib/plot/utils/expressions.js");
  const { resolveInputs, input } =
    await import("../../src/lib/plot/utils/inputs.js");
  const { analyzeDependencies } =
    await import("../../src/lib/plot/utils/transforms/dependencies.js");
  const nodes = createDataScope(),
    edges = createDataScope();
  nodes.update({ id: [0, 1, 2] });
  edges.update({ source: [0, 1], target: [1, 2], weight: [2, 5] });
  const graph = createGraphData({ nodes, edges }),
    scope = graphScope(graph);
  const seen = [];
  const definition = {
    parameters: {
      gap: {
        type: "expression",
        integer: true,
        default: add(mean("weight"), input("offset")),
      },
      gridOnly: { type: "expression", when: "grid", default: col("missing") },
    },
    run({ params }) {
      seen.push(params);
      return {};
    },
  };
  try {
    const values = resolveInputs(
      layoutParameters("demo.layout", definition),
      { read: () => 2 },
      "demo.layout",
    );
    const frame = await runPluginLayout(
      "demo.layout",
      definition,
      scope,
      values,
    );
    frame.dispose();
    assert.deepEqual(seen, [{ gap: 6 }]);
    await assert.rejects(
      runPluginLayout("demo.layout", definition, scope, { gap: col("weight") }),
      /demo.layout.gap must be a single value/,
    );
    await assert.rejects(
      runPluginLayout("demo.layout", definition, scope, { gridOnly: 2 }),
      /requires a grid/,
    );
    assert.deepEqual(
      analyzeDependencies(
        layoutDependencies(definition, { gap: mean("@brushed") }),
      ).interaction,
      ["@brushed"],
    );
    assert.equal(
      analyzeDependencies(layoutDependencies(definition, { gap: view.time }))
        .clock,
      true,
    );
  } finally {
    scope.dispose();
    graph.dispose();
    nodes.dispose();
    edges.dispose();
  }
});

test("plugin layouts share hierarchy validation and own both graph publications", async () => {
  const { runPluginLayout } =
    await import("../../src/lib/plot/plugins/layout.js");
  const { createDataScope } =
    await import("../../src/lib/plot/utils/categorical.js");
  const { createGraphData, graphScope } =
    await import("../../src/lib/plot/utils/graphData.js");
  const { numpy: np } = await import("@hmplot/jax");
  const nodes = createDataScope(),
    edges = createDataScope();
  nodes.update({ id: ["root", "leaf"], weight: [2, 3] });
  edges.update({ source: ["root"], target: ["leaf"], label: ["link"] });
  const graph = createGraphData({ nodes, edges }),
    scope = graphScope(graph);
  const registry = createPluginRegistry();
  registry.register(
    definePlugin({
      name: "layout-test",
      apiVersion: 1,
      setup(hm) {
        hm.layout("demo.tree", {
          hierarchy: true,
          nodeOutputs: () => [{ name: "position", type: "numeric", unit: "m" }],
          parameters: { gap: { type: "number", default: 2 } },
          run({ graph, params }) {
            assert.deepEqual(graph.ids, ["root", "leaf"]);
            assert.deepEqual(graph.hierarchy.parent, [-1, 0]);
            assert.deepEqual(Array.from(graph.nodeColumns.weight), [2, 3]);
            return {
              nodeColumns: {
                position: np.array([
                  [0, 0],
                  [params.gap, 1],
                ]),
              },
              edgeColumns: {
                start: np.array([[0, 0]]),
                end: np.array([[params.gap, 1]]),
              },
            };
          },
        });
      },
    }),
  );
  try {
    const definition = registry.get("layout", "demo.tree");
    const frame = await runPluginLayout("demo.tree", definition, scope);
    try {
      assert.deepEqual(await frame.nodes.get("position").ref.js(), [
        [0, 0],
        [2, 1],
      ]);
      assert.deepEqual(await frame.edges.get("end").ref.js(), [[2, 1]]);
      assert.equal(frame.nodes.graph.nodeKey, "id");
      assert.deepEqual(frame.nodes.metadata("position"), {
        type: "numeric",
        unit: "m",
      });
      assert.equal(frame.nodes.length, 2);
      assert.equal(frame.edges.length, 1);
    } finally {
      frame.dispose();
    }
    const run = (fn, options) =>
      runPluginLayout("demo.tree", { run: fn }, scope, {}, options);
    await assert.rejects(
      run(() => ({ nodeColumns: { x: np.zeros([1]) } })),
      /one value per node/,
    );
    await assert.rejects(
      run(() => ({ nodeColumns: { id: np.zeros([2]) } })),
      /cannot overwrite graph identity/,
    );
    await assert.rejects(
      run(() => ({ edgeColumns: { source: np.zeros([1]) } })),
      /cannot overwrite graph identity/,
    );
    await assert.rejects(
      run(() => ({ nodeColumns: { x: np.zeros([2]) } }), { maxBytes: 4 }),
      /storage-buffer limit/,
    );
    await assert.rejects(
      runPluginLayout(
        "demo.tree",
        {
          nodeOutputs: () => [{ name: "absent", type: "numeric" }],
          run: () => ({ nodeColumns: { x: np.zeros([2]) } }),
        },
        scope,
      ),
      /declared output "absent" was not returned/,
    );
    const cancel = new AbortController();
    await assert.rejects(
      run(
        async () => {
          const result = { nodeColumns: { x: np.zeros([2]) } };
          cancel.abort();
          return result;
        },
        { signal: cancel.signal },
      ),
      { name: "AbortError" },
    );
    const cyclicEdges = createDataScope();
    cyclicEdges.update({ source: ["root", "leaf"], target: ["leaf", "root"] });
    const cyclicGraph = createGraphData({ nodes, edges: cyclicEdges }),
      cyclic = graphScope(cyclicGraph);
    try {
      await assert.rejects(
        runPluginLayout("demo.tree", definition, cyclic),
        /demo.tree requires an acyclic hierarchy/,
      );
    } finally {
      cyclic.dispose();
      cyclicGraph.dispose();
      cyclicEdges.dispose();
    }
    assert.throws(
      () =>
        registry.register(
          definePlugin({
            name: "invalid-layout",
            apiVersion: 1,
            setup(hm) {
              hm.layout("valid-but-rolled-back", { run: () => ({}) });
              hm.layout("invalid", { run: () => ({}), hierarchy: "yes" });
            },
          }),
        ),
      /hierarchy must be true or false/,
    );
    assert.equal(registry.get("layout", "valid-but-rolled-back"), undefined);
  } finally {
    scope.dispose();
    graph.dispose();
    nodes.dispose();
    edges.dispose();
  }
});

test("the transform and layout authoring examples execute their documented outputs", async () => {
  const { readFileSync } = await import("node:fs");
  const source = readFileSync(
    new URL("../../src/routes/content/reference/plugins.svx", import.meta.url),
    "utf8",
  );
  const registry = createPluginRegistry();
  for (const match of source.matchAll(/```javascript\n([\s\S]*?)```/g)) {
    const plugin = (
      await import(`data:text/javascript,${encodeURIComponent(match[1])}`)
    ).default;
    registry.register(plugin);
  }
  const { createDataScope } =
    await import("../../src/lib/plot/utils/categorical.js");
  const { runPluginTransform } =
    await import("../../src/lib/plot/plugins/transform.js");
  const { runPluginLayout } =
    await import("../../src/lib/plot/plugins/layout.js");
  const { createGraphData, graphScope } =
    await import("../../src/lib/plot/utils/graphData.js");
  const nodes = createDataScope(),
    edges = createDataScope();
  nodes.update({ id: [0, 1, 2], x: [1, 2, 3] });
  edges.update({ source: [0, 1], target: [1, 2] });
  const graph = createGraphData({ nodes, edges }),
    scope = graphScope(graph);
  try {
    const scaled = await runPluginTransform(
      "acme.scale",
      registry.get("transform", "acme.scale"),
      nodes,
      { factor: 3 },
      { maxBytes: 1e6 },
    );
    try {
      assert.deepEqual(await scaled.get("scaled").ref.js(), [3, 6, 9]);
    } finally {
      scaled.dispose();
    }
    const laid = await runPluginLayout(
      "acme.tree",
      registry.get("layout", "acme.tree"),
      scope,
    );
    try {
      assert.deepEqual(laid.nodes.get("position"), [
        [0, 0],
        [2, 1],
        [4, 2],
      ]);
      assert.deepEqual(laid.edges.get("end"), [
        [2, 1],
        [4, 2],
      ]);
    } finally {
      laid.dispose();
    }
  } finally {
    scope.dispose();
    graph.dispose();
    nodes.dispose();
    edges.dispose();
  }
});

test("plugin inspection owns auxiliary buffers and retains in-flight lazy summaries", async () => {
  const { pluginInspection } =
    await import("../../src/lib/plot/plugins/inspection.js");
  const { numpy: np } = await import("@hmplot/jax");
  const owned = [],
    own = (value) => (owned.push(value), value);
  let reads = 0,
    resume;
  const waiting = new Promise((resolve) => (resume = resolve));
  const aligned = own(np.array([4]));
  const nested = [{ values: [own(np.array([7]))] }];
  const inspect = pluginInspection(
    "demo.fit",
    {
      async inspect({ resources, params }) {
        reads++;
        await waiting;
        return {
          coefficient: (await resources.stats.ref.data())[0],
          method: params.method,
          aligned: (await params.aligned.ref.data())[0],
          nested: (await params.nested[0].values[0].ref.data())[0],
        };
      },
    },
    { method: "linear", aligned, nested },
    { stats: np.array([3]) },
    { own },
  );
  assert.equal(reads, 0);
  const pending = inspect();
  owned.splice(0).forEach((value) => value.dispose());
  resume();
  assert.deepEqual(await pending, {
    coefficient: 3,
    method: "linear",
    aligned: 4,
    nested: 7,
  });
  assert.equal(reads, 1);
  try {
    assert.throws(
      () =>
        pluginInspection(
          "demo.fit",
          {},
          {},
          { stats: np.ones([4]), bad: 42 },
          { own },
        ),
      /resource "bad" must be an array/,
    );
  } finally {
    owned.splice(0).forEach((value) => value.dispose());
  }
  try {
    assert.throws(
      () =>
        pluginInspection(
          "demo.fit",
          {},
          {},
          { stats: np.ones([4]) },
          { own, maxBytes: 8 },
        ),
      /storage-buffer limit/,
    );
  } finally {
    owned.splice(0).forEach((value) => value.dispose());
  }
  const throwing = pluginInspection(
    "demo.fit",
    {
      inspect() {
        throw Error("inspect failed");
      },
    },
    {},
    { stats: np.ones([1]) },
    { own },
  );
  try {
    await assert.rejects(throwing(), /inspect failed/);
  } finally {
    owned.splice(0).forEach((value) => value.dispose());
  }
});

test("recursive parameter schemas validate unions, arrays and objects and resolve nested expressions", async () => {
  const { mean, view } =
    await import("../../src/lib/plot/utils/expressions.js");
  const { parameterDependencies } =
    await import("../../src/lib/plot/plugins/parameters.js");
  const { resolveParameterExpressions } =
    await import("../../src/lib/plot/utils/transforms/parameters.js");
  const { createDataScope } =
    await import("../../src/lib/plot/utils/categorical.js");
  const schema = checkSchema("demo", {
    band: {
      type: "union",
      variants: [
        { type: "number", min: 0, max: 1 },
        { type: "select", options: [false] },
      ],
      default: 0.95,
    },
    options: {
      type: "object",
      properties: {
        bounds: {
          type: "array",
          items: {
            type: "union",
            variants: [{ type: "union", variants: [{ type: "expression" }] }],
          },
          minLength: 2,
          maxLength: 2,
        },
      },
      required: ["bounds"],
    },
  });
  assert.equal(
    parameterProblem("demo", schema, {
      band: false,
      options: { bounds: [1, 2] },
    }),
    "",
  );
  assert.match(
    parameterProblem("demo", schema, { band: true }),
    /must match one/,
  );
  assert.match(
    parameterProblem("demo", schema, { options: { bad: 1 } }),
    /not a declared property/,
  );
  assert.match(
    parameterProblem("demo", schema, { options: {} }),
    /bounds is required/,
  );
  assert.match(
    parameterProblem("demo", schema, { options: { bounds: [1] } }),
    /is an array/,
  );
  assert.throws(
    () => checkSchema("demo", { x: { type: "array" } }),
    /requires an items schema/,
  );
  assert.throws(
    () => checkSchema("demo", { x: { type: "union", variants: [] } }),
    /nonempty variants/,
  );
  const values = { options: { bounds: [mean("x"), view.time] } };
  assert.equal(parameterDependencies(schema, values).expressions.length, 2);
  const scope = createDataScope();
  scope.update({ x: [2, 4] });
  try {
    const resolved = await resolveParameterExpressions(
      "demo",
      values,
      expressionParameters(schema),
      scope,
      { viewState: { time: 5 } },
    );
    assert.deepEqual(resolved, { options: { bounds: [3, 5] } });
  } finally {
    scope.dispose();
  }
});

test("plugin field parameters align external values with selected rows and expose lazy inspection", async () => {
  const { plugins } = await import("../../src/lib/plot/plugins/runtime.js");
  const { createDataScope } =
    await import("../../src/lib/plot/utils/categorical.js");
  const { runTransform } =
    await import("../../src/lib/plot/utils/transforms.js");
  plugins.register(
    definePlugin({
      name: "test-aligned-fields",
      apiVersion: 1,
      setup(hm) {
        hm.transform("test.aligned", {
          reads: "rows",
          output: "sameRows",
          parameters: { x: { type: "field" } },
          async run({ column, hostColumn, params, jax }) {
            assert.deepEqual(await hostColumn(params.x), [10, 30]);
            return {
              columns: { value: column(params.x).ref },
              resources: { stats: jax.numpy.array([2]) },
            };
          },
          async inspect({ resources }) {
            return (await resources.stats.ref.data())[0];
          },
        });
      },
    }),
  );
  const scope = createDataScope();
  scope.update({ keep: [true, false, true] });
  let filtered, result;
  try {
    filtered = await runTransform("Filter", scope, { where: "keep" });
    result = await runTransform("test.aligned", filtered, { x: [10, 20, 30] });
    assert.deepEqual(
      Array.from(await result.get("value").ref.data()),
      [10, 30],
    );
    assert.equal(await result.inspect(), 2);
  } finally {
    result?.dispose();
    filtered?.dispose();
    scope.dispose();
  }
});

test("structured plugin fields align through filtering and ordering without mutating authored parameters", async () => {
  const { createDataScope } =
    await import("../../src/lib/plot/utils/categorical.js");
  const { runTransform } =
    await import("../../src/lib/plot/utils/transforms.js");
  const { runPluginTransform } =
    await import("../../src/lib/plot/plugins/transform.js");
  const scope = createDataScope();
  scope.update({ id: [0, 1, 2], keep: [true, false, true] });
  const config = Object.freeze({
    settings: Object.freeze({
      channels: Object.freeze([Object.freeze([10, 20, 30]), false]),
    }),
  });
  const definition = {
    reads: "rows",
    output: "sameRows",
    parameters: {
      settings: {
        type: "object",
        properties: {
          channels: {
            type: "array",
            items: {
              type: "union",
              variants: [
                { type: "select", options: [false] },
                { type: "union", variants: [{ type: "field" }] },
              ],
            },
          },
        },
      },
    },
    run: ({ params, column }) => ({
      columns: { value: column(params.settings.channels[0]).ref },
    }),
  };
  const filtered = await runTransform("Filter", scope, { where: "keep" });
  const sorted = await runTransform("Sort", filtered, {
    by: "id",
    order: "desc",
  });
  try {
    for (const [input, expected] of [
      [scope, [10, 20, 30]],
      [filtered, [10, 30]],
      [sorted, [30, 10]],
    ]) {
      const result = await runPluginTransform(
        "test.structured-fields",
        definition,
        input,
        config,
        { maxBytes: 1e8 },
      );
      try {
        assert.deepEqual(
          Array.from(await result.get("value").ref.data()),
          expected,
        );
      } finally {
        result.dispose();
      }
    }
    assert.deepEqual(config.settings.channels, [[10, 20, 30], false]);
    await assert.rejects(
      runPluginTransform(
        "test.structured-fields",
        definition,
        filtered,
        { settings: { channels: [[1], false] } },
        { maxBytes: 1e8 },
      ),
      /test.structured-fields.settings.channels.0 has 1 values/,
    );
  } finally {
    sorted.dispose();
    filtered.dispose();
    scope.dispose();
  }
});

test("the shared math contract supplies Student t tables and device evaluation", async () => {
  const { pluginLibraries } =
    await import("../../src/lib/plot/plugins/runtime.js");
  await import("../../src/lib/plot/plugins/library.js");
  const { numpy: np } = pluginLibraries.jax;
  const math = pluginLibraries.math;
  assert.deepEqual(Object.keys(math).sort(), [
    "studentTOnDevice",
    "studentTTable",
  ]);
  const table = math.studentTTable(0.975, 2);
  assert.ok(Math.abs(table.table[0] - 12.706204736) < 1e-7);
  assert.ok(Math.abs(table.table[1] - 4.30265273) < 1e-7);
  const value = math.studentTOnDevice(table, np.array(1));
  try {
    assert.ok(Math.abs((await value.ref.data())[0] - 12.706204736) < 1e-5);
  } finally {
    value.dispose();
  }
});
