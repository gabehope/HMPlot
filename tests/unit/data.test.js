import test from "node:test";
import assert from "node:assert/strict";
import { numpy as np, Array as JaxArray } from "@hmplot/jax";
import {
  lineArrays,
  disposeArrays,
  validateFields,
} from "../../src/lib/plot/utils/data.js";
import { OptionsNode } from "../../src/lib/options/options.js";
import {
  BufferManager,
  BufferedField,
  TextureField,
} from "../../src/lib/plot/utils/proputils.js";
import { ScalarType, FieldType } from "../../src/lib/plot/objects/types.js";
import { prepareNamed, prepareChannels, mergeFrameBindings } from "../../src/lib/plot/utils/namedData.js";
import { createDataScope } from "../../src/lib/plot/utils/categorical.js";
import { createDataView } from "../../src/lib/plot/utils/dataView.js";
import { typedColumn } from "../../src/lib/plot/utils/columns.js";
import { asArray } from "../../src/lib/plot/utils/data.js";
import { keyCodes } from "../../src/lib/plot/utils/partition.js";
import { parseCSV } from "../../src/lib/plot/utils/providers.js";
import { brushColumn } from "../../src/lib/plot/utils/interaction.js";
import { optionsRoot } from "../../src/lib/options/options.js";
import { ensureAxisOptions } from "../../src/lib/plot/utils/axisOptions.js";
import { add, evaluateExpression, expressionFields, col, is_in, square, where, literalValued, tween, coalesce, mean } from "../../src/lib/plot/utils/expressions.js";
import { createLabelPayload } from "../../src/lib/plot/utils/labelPayload.js";

test("Text payloads reuse unchanged content and retire arrays/atlases after their last upload lease", () => {
  let acquired = 0, released = 0, revision = 0;
  const payload = createLabelPayload(labels => {
    acquired++;
    return { widths: labels.map(label => label.length * 32), release() { released++; } };
  }, () => revision);
  const text = ["A", "BB", "A"];
  const first = payload.prepare(text, 3, "font A", 8192), upload = first.retain();
  assert.deepEqual(first.codes.ref.js(), [0, 1, 0]);
  assert.deepEqual(first.widths.ref.js(), [0.5, 1, 0.5]);
  assert.equal(payload.prepare([...text], 3, "font A", 8192), first);
  assert.equal(acquired, 1, "position/paint updates do not acquire another atlas or text fields");
  text[1] = "CCC";
  const edited = payload.prepare(text, 3, "font A", 8192);
  assert.deepEqual(edited.widths.ref.js(), [0.5, 1.5, 0.5]);
  assert.equal(released, 0, "the old pending upload retains its arrays and atlas");
  assert.deepEqual(upload.widths.ref.js(), [0.5, 1, 0.5]);
  upload.release(); upload.release();
  assert.equal(released, 1);
  assert.equal(first.codes.refCount, 0);
  revision++;
  assert.notEqual(payload.prepare(text, 3, "font A", 8192), edited, "font loading invalidates the payload");
  const codes = np.array([0, -1, 2], { dtype: np.int32 }), categories = ["X", "YY"];
  const dictionary = payload.prepare({ codes, categories }, 3, "font A", 8192);
  assert.deepEqual(dictionary.codes.ref.js(), [0, -1, -1]);
  assert.deepEqual(dictionary.widths.ref.js(), [0.5, 0.5, 0.5]);
  assert.equal(payload.prepare({ codes, categories: [...categories] }, 3, "font A", 8192), dictionary);
  categories[0] = "XXXX";
  const changed = payload.prepare({ codes, categories }, 3, "font A", 8192), held = changed.retain();
  assert.deepEqual(changed.widths.ref.js(), [2, 2, 2]);
  assert.throws(() => payload.prepare(codes, 3, "font A", 8192), /Text requires host strings/);
  assert.throws(() => payload.prepare({ codes, categories }, 2, "font A", 8192), /Text codes must match positions/);
  const foreign = values => ({ shape: [3], dtype: "int32", dispose() {}, dataSync() {},
    get ref() { return { dataSync: () => Int32Array.from(values) }; } });
  const warn = console.warn;
  try {
    console.warn = () => {};
    const source = foreign([0, 1, 0]);
    const adopted = payload.prepare({ codes: source, categories }, 3, "font A", 8192);
    assert.equal(payload.prepare({ codes: source, categories }, 3, "font A", 8192), adopted);
    const replaced = payload.prepare({ codes: foreign([1, 0, -1]), categories }, 3, "font A", 8192);
    assert.notEqual(replaced, adopted, "different foreign JAX arrays must not share an empty host snapshot");
    assert.deepEqual(replaced.codes.ref.js(), [1, 0, -1]);
  } finally { console.warn = warn; }
  payload.dispose();
  assert.equal(released, acquired - 1);
  assert.deepEqual(held.codes.ref.js(), [0, -1, -1]);
  held.release();
  assert.equal(released, acquired);
  assert.equal(changed.codes.refCount, 0);
  assert.equal(codes.refCount, 1, "dictionary source is borrowed");
  codes.dispose();
  const emptyCodes = np.zeros([0], { dtype: np.int32 });
  const empty = payload.prepare({ codes: emptyCodes, categories: [] }, 0, "font A", 8192);
  assert.deepEqual(empty.codes.ref.js(), []);
  assert.deepEqual(empty.widths.ref.js(), []);
  payload.dispose(); emptyCodes.dispose();
  assert.equal(released, acquired);
});

test("typed columns retain logical metadata and expressions resolve virtual fields", () => {
  const scope = createDataScope();
  scope.update({ x: [1, 2, 3], group: typedColumn([2, 1, 2], { type: "ordinal", domain: [1, 2] }) });
  assert.equal(scope.metadata("group").type, "ordinal");
  assert.deepEqual(scope.get("group").categories, [1, 2]);
  let result = evaluateExpression(add(square("x"), 1), scope);
  assert.deepEqual(result.value.ref.js(), [2, 5, 10]);
  result.dispose();
  scope.identity.hover.replace(scope.identity, [1], { phase: "preview" });
  result = evaluateExpression(where("@hovered", 18, 12), scope);
  assert.deepEqual(result.value.ref.js(), [12, 18, 12]);
  result.dispose();
  scope.dispose();
});
test("missing numbers are NaN, and 64-bit columns reach the GPU as float32 (TODO 48.1)", async () => {
  const warn = console.warn, warnings = [];
  console.warn = (message) => warnings.push(message);
  const scope = createDataScope();
  try {
    scope.update({ a: parseCSV("a,b\n1,x\n,y\n3,z").a, wide: new Float64Array([0.5, 1.5, 2.5]),
      big: new BigInt64Array([2n ** 40n, 1n, 1n]) });
    const read = (field) => {
      const array = asArray(scope.get(field));
      assert.equal(array.dtype, "float32", field);
      return array.js();
    };
    assert.deepEqual(read("a"), [1, NaN, 3], "an empty CSV cell is missing, not 0");
    assert.deepEqual(scope.hostColumn("a"), [1, NaN, 3]);
    assert.deepEqual(read("wide"), [0.5, 1.5, 2.5]);
    assert.deepEqual(read("big"), [2 ** 40, 1, 1]);
    assert.equal(scope.metadata("big").inexact, true);
    assert.deepEqual(warnings, ["Column big holds integers beyond 2^24; the GPU stores float32, so large values lose precision."]);
    // Keys stay exact on the host.
    const { order, codes } = await keyCodes(scope, "big");
    assert.deepEqual(order, [1n, 2n ** 40n]);
    assert.deepEqual([...codes], [1, 0, 0]);
    // A channel's plain array, without a Data scope.
    assert.deepEqual(asArray([1, null, 3n]).js(), [1, NaN, 3]);
  } finally {
    console.warn = warn;
    scope.dispose();
  }
});
// Python's integer and time columns (python/PROTOCOL.md): int64 and uint64 payloads with a
// validity mask, durations without an origin, and units the browser reads (TODO 69.0, 69.5, 69.6).
const payload = (Type, values, valid) => {
  const bytes = new Uint8Array(values.length * 8 + (valid ? values.length : 0));
  new Type(bytes.buffer, 0, values.length).set(values.map(BigInt));
  if (valid) bytes.set(valid, values.length * 8);
  return bytes.buffer;
};
test("Python durations keep their values: milliseconds without an origin, in any row order (TODO 69.0)", async () => {
  const { columnValue } = await import("../../src/lib/scene/resources.js");
  const { divide } = await import("../../src/lib/plot/utils/expressions.js");
  const { temporalFormat } = await import("../../src/lib/plot/utils/guides.js");
  const columns = [];
  const duration = (values, unit = "s") => {
    const column = columnValue({ dtype: "int64", shape: [values.length], logical_type: "duration", unit },
      payload(BigInt64Array, values));
    columns.push(column);
    return column;
  };
  const scope = createDataScope(), js = createDataScope();
  scope.update({ wait: duration([5, 10]), back: duration([10, 5]), x: [0, 1] });
  js.update({ wait: typedColumn([5, 10], { type: "duration", unit: "s" }) });
  const options = optionsRoot.splitUnique("Python duration test plot");
  ensureAxisOptions(options.ensureChild("plot"));
  try {
    assert.deepEqual([...asArray(scope.get("wait")).js()], [5000, 10000], "not [0, 5000]");
    assert.deepEqual([...js.get("wait")], [5000, 10000], "as a JavaScript duration column");
    assert.equal(scope.metadata("wait").origin, undefined);
    assert.deepEqual([...asArray(scope.get("back")).js()], [10000, 5000], "the first row is not a zero");
    assert.deepEqual([...asArray(duration([-3, 7, 0]).values).js()], [-3000, 7000, 0]);
    assert.deepEqual([...asArray(duration([2], "d").values).js()], [2 * 864e5]);
    const seconds = evaluateExpression(divide("wait", 1000), scope);
    assert.deepEqual(seconds.value.ref.js(), [5, 10]);
    seconds.dispose();
    assert.deepEqual([...scope.hostColumn("wait")], [5000, 10000]);
    // A numeric axis draws them where they are, and a legend reads them without adding anything.
    const drawn = prepareNamed({ x: "wait", y: "x" }, scope, options, "Points", { hidden: {}, auto: {} });
    assert.deepEqual(asArray(drawn.props.position).js().map((p) => p[0]), [5000, 10000]);
    assert.deepEqual([5000, 10000].map(temporalFormat({ type: "duration", origin: drawn.temporal?.x?.origin }, "", 5000)), ["5 s", "10 s"]);
    drawn.dispose();
  } finally {
    scope.dispose(); js.dispose(); options.dispose();
    columns.forEach(column => column.values.dispose());
  }
});
test("decoded Python numeric columns use reusable expression plans without losing supplied metadata", async () => {
  const { columnValue } = await import("../../src/lib/scene/resources.js");
  const { createExpressionEvaluator } = await import("../../src/lib/plot/utils/expressionPlans.js");
  const scope = createDataScope(), evaluator = createExpressionEvaluator();
  const expression = add("x", 1), columns = [];
  try {
    for (const values of [[1, 2, 3], [4, 5, 6]]) {
      const column = columnValue({ dtype: "float32", shape: [3], name: "Signal", unit: "m", nullable: true },
        Float32Array.from(values).buffer);
      columns.push(column);
      scope.update({ x: column });
      const result = evaluator.evaluate(expression, scope);
      try {
        assert.deepEqual(result.value.ref.js(), values.map(value => value + 1));
        assert.equal(scope.metadata("x").unit, "m");
        assert.equal(scope.metadata("x").nullable, true);
        assert.equal(scope.metadata("x").name, "Signal");
      } finally { result.dispose(); }
    }
    assert.equal(evaluator.stats.compiled, 2, "unset protocol metadata must not force eager arithmetic");
    assert.equal(evaluator.stats.fallback, 0);
    assert.equal(evaluator.stats.traces, 1);
    assert.equal(evaluator.stats.hits, 1, "new values reuse the same expression program");
  } finally {
    evaluator.dispose(); scope.dispose();
    columns.forEach(column => column.values.dispose());
  }
});
test("Python integers keep their sign, range and missing rows apart from their values, exact as keys (TODO 69.5)", async () => {
  const { columnValue } = await import("../../src/lib/scene/resources.js");
  const { identity, keyTokens } = await import("../../src/lib/plot/utils/interaction.js");
  const { keyValues, joinRows } = await import("../../src/lib/plot/utils/tableJoin.js");
  const MIN = -(2n ** 63n), MAX = 2n ** 63n - 1n;
  const warn = console.warn;
  console.warn = () => {};
  const signed = columnValue({ dtype: "int64", shape: [3] }, payload(BigInt64Array, [MIN, MAX, 1n]), "signed");
  const unsigned = columnValue({ dtype: "uint64", shape: [3] }, payload(BigUint64Array, [2n ** 63n, 2n ** 64n - 1n, 2n ** 63n + 1n]), "unsigned");
  const nullable = columnValue({ dtype: "int64", shape: [3], nullable: true, validity: "uint8" },
    payload(BigInt64Array, [MIN, 0n, 7n], [1, 0, 1]), "nullable");
  console.warn = warn;
  const scope = createDataScope(), right = createDataScope();
  scope.update({ signed, unsigned: { ...unsigned }, nullable });
  right.update({ id: [2n ** 63n + 1n, 2n ** 63n], label: ["b", "a"] });
  try {
    // The minimum is a value, not a missing row; uint64 does not wrap; a mask marks the missing row.
    assert.deepEqual(scope.hostColumn("signed"), new BigInt64Array([MIN, MAX, 1n]));
    assert.deepEqual(asArray(scope.get("signed")).js(), [Number(MIN), Number(MAX), 1]);
    assert.deepEqual([...scope.hostColumn("unsigned")], [2n ** 63n, 2n ** 64n - 1n, 2n ** 63n + 1n]);
    assert.deepEqual(scope.hostColumn("nullable"), [MIN, NaN, 7n]);
    assert.deepEqual(asArray(scope.get("nullable")).js(), [Number(MIN), NaN, 7]);
    assert.equal(nullable.metadata.nullable, true);
    // Keys: 2^63 and 2^63 + 1 are one float32 (and one float64) but two keys.
    const owner = identity({ keys: unsigned });
    assert.deepEqual(owner.tokens, ["bigint:9223372036854775808", "bigint:18446744073709551615", "bigint:9223372036854775809"]);
    assert.deepEqual(keyTokens(scope, "signed"), [`bigint:${MIN}`, `bigint:${MAX}`, "number:1"]);
    const [left, joined] = await Promise.all([keyValues(scope, "unsigned"), keyValues(right, "id")]);
    assert.deepEqual([...joinRows([left.values], [joined.values])], [1, -1, 0]);
    // Exact host keys; the GPU's float32 copy is the expected loss (metadata.inexact).
    assert.equal(scope.metadata("unsigned").inexact, true);
    assert.throws(() => identity({ keys: nullable }), /Data keys cannot be missing/);
  } finally {
    scope.dispose(); right.dispose();
    [signed, unsigned, nullable].forEach(column => column.values.dispose());
  }
});
test("Python times arrive in the browser's units: days are 86,400,000 ms apart; another unit is an error (TODO 69.6)", async () => {
  const { columnValue, decodeColumn, SceneResources } = await import("../../src/lib/scene/resources.js");
  const days = columnValue({ dtype: "int64", shape: [3], logical_type: "datetime", unit: "d", timezone: "UTC", validity: "uint8" },
    payload(BigInt64Array, [20454n, 0n, 20455n], [1, 0, 1]));
  assert.equal(days.metadata.origin, Date.UTC(2026, 0, 1));
  assert.deepEqual(asArray(days.values).js(), [0, NaN, 864e5]);
  const micro = columnValue({ dtype: "int64", shape: [2], logical_type: "datetime", unit: "us" },
    payload(BigInt64Array, [1767225600000000n, 1767225600001500n]));
  assert.deepEqual([micro.metadata.origin, ...asArray(micro.values).js()], [Date.UTC(2026, 0, 1), 0, 1.5]);
  assert.throws(() => decodeColumn({ dtype: "int64", unit: "D" }, payload(BigInt64Array, [1n]), { type: "datetime" }, "c1"),
    /Column c1: unsupported time unit "D"; a datetime or duration column's unit is one of ns, us, ms, s, m, h, d\./);
  // A grid table's time coordinates read the same units.
  const resources = new SceneResources();
  resources.columns.set("v", { __hmplotColumn: true, values: new Float32Array(2), metadata: { type: "numeric" } });
  const state = (unit) => ({ columns: { [`t-${unit}`]: { id: `t-${unit}`, shape: [2], dtype: "int64", byte_order: "little", logical_type: "datetime", unit } },
    tables: { g: { version: 1, key: null, columns: { v: { $column: "v" } }, grid: { dims: [{ name: "time", coords: { $column: `t-${unit}` } }] } } },
    scales: {}, normalizations: {}, themes: {}, selections: {}, identities: {} });
  resources.commit(await resources.prepare(state("d"), async () => new Uint8Array(payload(BigInt64Array, [20454n, 20455n]))));
  const time = resources.columns.get("t-d");
  assert.deepEqual([time.metadata.origin, ...time.values], [Date.UTC(2026, 0, 1), 0, 864e5]);
  await assert.rejects(resources.prepare(state("W"), async () => new Uint8Array(payload(BigInt64Array, [1n, 2n]))), /unsupported time unit "W"/);
  resources.dispose(); days.values.dispose(); micro.values.dispose();
});
test("JS datetime columns count from their first time; an axis shifts later tables into its origin (TODO 48.1)", () => {
  const T0 = Date.UTC(2026, 0, 1), day = 864e5;
  const a = createDataScope(), b = createDataScope();
  a.update({ t: [new Date(T0), null, new Date(T0 + 1500)], y: [0, 1, 2] });
  assert.equal(a.metadata("t").origin, T0);
  assert.deepEqual([...a.get("t")], [0, NaN, 1500], "float32 epoch milliseconds would step by 131 s");
  const seconds = T0 / 1000 + 86400;
  b.update({ t: [seconds, seconds + 1, seconds + 2], y: [0, 1, 2], wait: [1, 2, 3] },
    { t: { type: "datetime", unit: "s" }, wait: { type: "duration", unit: "s" } });
  assert.equal(b.metadata("t").origin, T0 + day);
  assert.deepEqual([...b.get("t")], [0, 1000, 2000]);
  assert.deepEqual([...b.get("wait")], [1000, 2000, 3000]);
  assert.equal(b.metadata("wait").origin, undefined, "durations keep their values");
  const options = optionsRoot.splitUnique("Datetime origin test plot");
  ensureAxisOptions(options.ensureChild("plot"));
  const prepare = (scope) => prepareNamed({ x: "t", y: "y" }, scope, options, "Points", { hidden: {}, auto: {} });
  const first = prepare(a), second = prepare(b);
  assert.equal(options.child("plot").get("axisXTimeOrigin"), T0);
  assert.deepEqual(asArray(second.props.position).js().map((p) => p[0]), [day, day + 1000, day + 2000]);
  // A brush reports epoch milliseconds, as the axis reads them.
  const column = brushColumn(b, "t", "x", "m");
  assert.equal(column.origin, T0 + day);
  assert.deepEqual(Array.from(column.evaluateConstraint({ bounds: [T0 + day + 500, T0 + day + 2500] }).js(), Number), [0, 1, 1]);
  column.release();
  first.dispose(); second.dispose(); a.dispose(); b.dispose(); options.dispose();
});

test("Area edges are numeric band positions even when the value axis has categories", () => {
  const scope = createDataScope(), options = optionsRoot.splitUnique("Area band edges");
  ensureAxisOptions(options.ensureChild("plot"));
  options.categoryAxes = {};
  options.ensure("xbounds", new FieldType({ defaultValue: undefined }));
  options.ensure("_categoryRevision", new ScalarType({ defaultValue: 0, ui: false }));
  const lower = np.array([-0.25, 0.75]), upper = np.array([0.25, 1.25]);
  scope.update({ category: ["A", "B"], t: [0, 1], lower, upper });
  const state = () => ({ hidden: {}, auto: {} });
  const anchor = prepareNamed({ x: "category", y: "t" }, scope, options, "Points", state());
  let band;
  try {
    band = prepareNamed({ x: "t", lower: "lower", upper: "upper", axis: "x" }, scope, options, "Area", state());
    assert.deepEqual(asArray(band.props.lower).js(), [-0.25, 0.75]);
    assert.deepEqual(asArray(band.props.upper).js(), [0.25, 1.25]);
  } finally {
    band?.dispose(); anchor.dispose(); scope.dispose(); options.dispose(); lower.dispose(); upper.dispose();
  }
});

test("Area edges share their value axis's datetime origin in either orientation", () => {
  const origin = Date.UTC(2026, 0, 1), day = 864e5, scope = createDataScope();
  scope.update({ t: [0, 1], low: [new Date(origin), new Date(origin + day)],
    high: [new Date(origin + day), new Date(origin + 2 * day)] });
  try {
    for (const axis of ["x", "y"]) {
      const options = optionsRoot.splitUnique("Area datetime edges");
      ensureAxisOptions(options.ensureChild("plot"));
      const result = prepareNamed({ x: "t", lower: "low", upper: "high", axis }, scope, options, "Area", { hidden: {}, auto: {} });
      try {
        assert.equal(options.child("plot").get(`axis${axis.toUpperCase()}TimeOrigin`), origin);
        assert.deepEqual(asArray(result.props.lower).js(), [0, day]);
        assert.deepEqual(asArray(result.props.upper).js(), [day, 2 * day]);
      } finally { result.dispose(); options.dispose(); }
    }
  } finally { scope.dispose(); }
});

test("preparation is pure: a time axis and a band axis come back for the frame to merge (TODO 136.12)", () => {
  const T0 = Date.UTC(2026, 0, 1), day = 864e5;
  const table = createDataScope();
  table.update({ start: [new Date(T0), new Date(T0 + day)], end: [new Date(T0 + day), new Date(T0 + 2 * day)], g: ["a", "b"] });
  const options = optionsRoot.splitUnique("Pure preparation test plot");
  ensureAxisOptions(options.ensureChild("plot"));
  options.categoryAxes = {};
  options.ensure("ybounds", new FieldType({ defaultValue: undefined }));
  options.ensure("_categoryRevision", new ScalarType({ defaultValue: 0, ui: false }));
  const plot = options.child("plot");
  const bars = prepareChannels({ x0: "start", x1: "end", y: "g" }, table, options, "Rect", { hidden: {}, auto: {} });
  assert.equal(plot.get("axisXType"), "numeric", "nothing written");
  assert.equal(options.categoryAxes.y, undefined);
  const { axes, categoryAxes } = bars.frameBindings;
  assert.deepEqual([axes.axisXType, axes.axisXTimeOrigin, axes.axisXTimezone], ["datetime", T0, "UTC"]);
  assert.deepEqual(categoryAxes.y.domain, ["a", "b"]);
  // The second time column shifts onto the origin the first bound, as it would on the plot.
  assert.deepEqual(asArray(bars.props.x1).js(), [day, 2 * day]);
  mergeFrameBindings(bars.frameBindings, options);
  assert.deepEqual([plot.get("axisXType"), plot.get("axisXTimeOrigin")], ["datetime", T0]);
  assert.deepEqual([options.categoryAxes.y, options.get("ybounds"), options.get("_categoryRevision")], [categoryAxes.y, [1.5, -0.5], 1]);
  bars.dispose(); table.dispose(); options.dispose();
});

test("a rule's ends: each component of start/end maps onto its axis; readouts are finer than the ticks (TODO 45)", async () => {
  const { viewState } = await import("../../src/lib/plot/utils/viewState.js");
  const { axisReadout } = await import("../../src/lib/plot/utils/axes.js");
  const T0 = Date.UTC(2026, 0, 1), day = 86400000, state = () => ({ hidden: {}, auto: {} });
  const view = viewState({ pointer: { x: "b", y: 4 }, visible: { x: [-0.5, 2.5], y: [0, 6] } });
  const segments = (props, scope, options) =>
    prepareNamed(props, scope, options, "Segments", state(), undefined, {}, { expressionOptions: () => ({ viewState: view }) });
  const vectors = (prepared, key) => asArray(prepared.props[key]).js();
  // A band axis: a category column per row, the pointer's category, and the visible domain as positions.
  const options = optionsRoot.splitUnique("Rule ends test plot");
  ensureAxisOptions(options.ensureChild("plot"));
  options.categoryAxes = {};
  options.ensure("xbounds", new FieldType({ defaultValue: undefined }));
  options.ensure("_categoryRevision", new ScalarType({ defaultValue: 0, ui: false }));
  const table = createDataScope(), one = createDataScope();
  table.update({ g: ["a", "b", "c"], v: [3, 5, 2] });
  one.update({ rule: [0] });
  const points = prepareNamed({ x: "g", y: "v" }, table, options, "Points", state());
  const stems = segments({ start: ["g", 0], end: ["g", "v"] }, table, options);
  assert.deepEqual([vectors(stems, "start"), vectors(stems, "end")], [[[0, 0], [1, 0], [2, 0]], [[0, 3], [1, 5], [2, 2]]]);
  const pointer = segments({ start: ["@pointer_x", "@view_y_min"], end: ["@pointer_x", "@view_y_max"] }, one, options);
  assert.deepEqual([vectors(pointer, "start"), vectors(pointer, "end")], [[[1, 0]], [[1, 6]]]);
  const across = segments({ start: ["@view_x_min", "@pointer_y"], end: ["@view_x_max", "@pointer_y"] }, one, options);
  assert.deepEqual(vectors(across, "end"), [[2.5, 4]], "the visible domain is a position, not a category");
  assert.throws(() => segments({ start: ["nope", 0], end: ["g", 1] }, table, options), /Segments.start\[0\] references missing field "nope"/);
  // A datetime axis: a time counts from the axis's origin, and a readout gives the time of day.
  const dated = optionsRoot.splitUnique("Rule time test plot");
  ensureAxisOptions(dated.ensureChild("plot"));
  const times = createDataScope();
  times.update({ t: [new Date(T0), new Date(T0 + 3 * day)], y: [1, 2] });
  const series = prepareNamed({ x: "t", y: "y" }, times, dated, "Points", state());
  const event = segments({ start: [new Date(T0 + day / 2), 0], end: [new Date(T0 + day / 2), 1] }, one, dated);
  assert.deepEqual(vectors(event, "start"), [[day / 2, 0]]);
  assert.equal(axisReadout(dated, "x", day + 50220000, 3.5 * day), "Jan 02 13:57");
  assert.equal(axisReadout(dated, "x", day, 400 * day), "Jan 02, 2026");
  assert.equal(axisReadout(options, "y", 3.58712, 6), "3.587");
  assert.equal(axisReadout(options, "y", 1234.5, 5000), "1235");
  assert.equal(axisReadout(options, "x", "b", 3), "b");
  assert.equal(axisReadout(options, "x", NaN, 3), "", "missing");
  for (const item of [points, stems, pointer, across, series, event, table, one, times, options, dated]) item.dispose();
});
// R2.0 "Types": casts type one use of a value; text is parsed once per category.
test("casts: as_numeric, as_category, as_ordinal, as_datetime and as_duration, and a cast on an axis", async () => {
  const { as_numeric, as_category, as_ordinal, as_datetime, as_duration, equal } = await import("../../src/lib/plot/utils/expressions.js");
  const { literal } = await import("../../src/lib/plot/utils/categorical.js");
  const { prepareColumn } = await import("../../src/lib/plot/utils/columns.js");
  const scope = createDataScope();
  scope.update({ zip: ["02134", "10001", "02134", ""], level: [3, 1, 2, 3], flag: [true, false, true, true],
    s: [1.7e9, 1.7e9 + 1, 1.7e9 + 60, 1.7e9 + 3600], when: ["2026-03-01", "2026-03-02T10:00:00Z", "bad", "2026-03-01"] });
  const read = async (expression) => {
    const result = evaluateExpression(expression, scope);
    const values = result.value?.codes ?? result.value;
    const out = { values: values instanceof JaxArray ? Array.from(await values.ref.data()) : Array.from(values), categories: result.value?.categories, metadata: result.metadata };
    result.dispose();
    return out;
  };
  assert.deepEqual((await read(as_numeric("zip"))).values, [2134, 10001, 2134, NaN]);
  assert.deepEqual((await read(as_numeric("flag"))).values, [1, 0, 1, 1]);
  // Without a domain the distinct values, numbers ascending; with one, its order, and the rest missing.
  assert.deepEqual(await read(as_category("level")), { values: [2, 0, 1, 2], categories: [1, 2, 3],
    metadata: { type: "categorical", domain: [1, 2, 3], ordered: false, source: "level" } });
  assert.deepEqual((await read(as_category("level", { domain: [3, 2] }))).values, [0, -1, 1, 0]);
  assert.deepEqual((await read(as_ordinal("zip", { domain: ["10001", "02134"] }))).values, [1, 0, 1, -1]);
  assert.deepEqual((await read(equal(as_category("level"), literal(3)))).values, [1, 0, 0, 1]);
  assert.throws(() => evaluateExpression(as_ordinal("zip"), scope), /as_ordinal\(\) of text needs a domain/);
  assert.throws(() => evaluateExpression(as_category(add("level", 1)), scope), /of a computed value needs a domain/);
  assert.throws(() => as_category("level", { domains: [1] }), /as_category\(\) takes domain; received domains/);
  // Epoch seconds from the host's float64, exactly; ISO text once per category.
  const seconds = await read(as_datetime("s", { unit: "s", timezone: "America/New_York" }));
  assert.deepEqual([seconds.values, seconds.metadata.origin, seconds.metadata.timezone], [[0, 1000, 60000, 3600000], 1.7e12, "America/New_York"]);
  const when = await read(as_datetime("when"));
  assert.deepEqual([when.values, when.metadata.origin], [[0, 122400000, NaN, 0], Date.UTC(2026, 2, 1)]);
  assert.deepEqual((await read(as_duration("level", { unit: "h" }))).values, [3, 1, 2, 3].map((h) => h * 3600000));
  // A datetime schema on dictionary-coded text parses each category once.
  const coded = prepareColumn({ codes: Int32Array.from([1, 0, -1]), categories: ["2026-03-01", "2026-03-02T12:00:00Z"] }, { type: "datetime" });
  assert.deepEqual([Array.from(coded.values), coded.metadata.origin], [[0, -129600000, NaN], Date.UTC(2026, 2, 2, 12)]);
  // A column already counting from its origin (Python's times) keeps it under a datetime schema,
  // which read its offsets as times since 1970 (the docs' timeseries example, R2.0b.3).
  const offsets = Object.assign(Float32Array.from([0, 60000]), { metadata: { type: "datetime", origin: Date.UTC(2024, 0, 1), gpuUnit: "ms" } });
  const kept = prepareColumn(offsets, { type: "datetime", unit: "ms", timezone: "UTC" });
  assert.deepEqual([Array.from(kept.values), kept.metadata.origin, kept.metadata.timezone], [[0, 60000], Date.UTC(2024, 0, 1), "UTC"]);
  // A cast in a position channel makes a band axis, as a categorical column would.
  const options = optionsRoot.splitUnique("Cast axis test plot");
  ensureAxisOptions(options.ensureChild("plot"));
  options.categoryAxes = {};
  options.ensure("xbounds", new FieldType({ defaultValue: undefined }));
  options.ensure("_categoryRevision", new ScalarType({ defaultValue: 0, ui: false }));
  const points = prepareNamed({ x: as_category("level"), y: "s" }, scope, options, "Points", { hidden: {}, auto: {} });
  assert.deepEqual(options.categoryAxes.x.domain, [1, 2, 3]);
  assert.deepEqual(asArray(points.props.position).js().map((p) => p[0]), [2, 0, 1, 2]);
  points.dispose(); options.dispose();
  // So does a column of categories without a type, a transform's group keys (a Violin's; TODO 64).
  const codes = np.array([1, 0, 1, 1], { dtype: np.int32 });
  const groups = createDataView(scope, { columns: { group: { codes, categories: ["p", "q"] } } });
  const bands = optionsRoot.splitUnique("Group axis test plot");
  ensureAxisOptions(bands.ensureChild("plot"));
  bands.categoryAxes = {};
  bands.ensure("xbounds", new FieldType({ defaultValue: undefined }));
  bands.ensure("_categoryRevision", new ScalarType({ defaultValue: 0, ui: false }));
  const grouped = prepareNamed({ x: "group", y: "s" }, groups, bands, "Points", { hidden: {}, auto: {} });
  assert.deepEqual(bands.categoryAxes.x.domain, ["p", "q"]);
  assert.deepEqual(asArray(grouped.props.position).js().map((p) => p[0]), [1, 0, 1, 1]);
  grouped.dispose(); bands.dispose(); groups.dispose(); scope.dispose(); codes.dispose();
});

test("facet views retain cached virtual masks across expression consumers", () => {
  const scope = createDataScope();
  scope.update({ x: [1, 2, 3, 4] });
  scope.identity.hover.replace(scope.identity, [1, 3], { phase: "preview" });
  const indices = np.array([0, 1], { dtype: np.int32 });
  const view = createDataView(scope, { indices });
  for (let attempt = 0; attempt < 3; attempt++) {
    const result = evaluateExpression(where("@hovered", 18, 12), view);
    assert.deepEqual(result.value.ref.js(), [12, 18]);
    result.dispose();
  }
  assert.deepEqual(view.get("@hovered").ref.js(), [0, 1]);
  view.dispose();
  indices.dispose();
  scope.dispose();
});
const options = {
  get: (key) => (key.endsWith("Transform") ? "linear" : [0, 1]),
};
test("outline numeric channels resolve data and reject missing, categorical and mismatched fields", async () => {
  const scope = createDataScope();
  scope.update({ x:[0,1], y:[0,1], alpha:[1,0], border:[2,4] });
  for (const kind of ["Points", "Rect", "Area", "Polygon", "GeoJSON", "Flow"]) {
    const result = prepareNamed({x:"x", y:"y", lower:0, upper:1, outlineOpacity:"alpha", outlineWidth:"border"}, scope, options, kind, {limit:Infinity});
    assert.deepEqual(Array.from(await asArray(result.props.outlineOpacity).data()),[1,0],kind);
    result.dispose();
  }
  assert.throws(() => prepareNamed({x:"x",y:"y",outlineOpacity:"missing"},scope,options,"Points",{}),/Points\.outlineOpacity.*missing/);
  assert.throws(() => prepareNamed({x:"x",y:"y",outlineOpacity:["opaque","clear"]},scope,options,"Points",{}),/numeric column/);
  assert.throws(() => prepareNamed({x:"x",y:"y",outlineOpacity:1.5},scope,options,"Points",{}),/between 0 and 1/);
  assert.throws(() => prepareNamed({x:"x",y:"y",outlineWidth:[1]},scope,options,"Points",{}),/outlineWidth/);
  scope.dispose();
});
test("Text3D refuses x, y and z, which it would ignore: it draws one label at position (TODO 64)", () => {
  assert.throws(() => prepareNamed({ text: "A", x: 1, y: 2 }, null, options, "Text3D", { limit: Infinity }),
    { message: "Text3D draws one label at position={[x, y, z]}: x, y and z are not its props. For text at each row of a table, use Text." });
});

test("a see-through color is refused, but Points take fill=\"transparent\" (TODO 64)", () => {
  assert.throws(() => prepareNamed({ x: [1], y: [1], color: "rgba(255, 0, 0, 0.5)" }, null, options, "Line", { limit: Infinity }),
    { message: 'Line.color "rgba(255, 0, 0, 0.5)" is see-through, but colors are drawn opaque: use opacity for a see-through mark.' });
  assert.throws(() => prepareNamed({ x: [1], y: [1], fill: "transparent" }, null, options, "Rect", { limit: Infinity }), /Rect\.fill "transparent" is see-through/);
  const hollow = prepareNamed({ x: [1], y: [1], fill: "transparent" }, null, options, "Points", { limit: Infinity });
  assert.equal(hollow.props.fill, "transparent");
  hollow.dispose();
});

test("named-field diagnostics identify active aggregate outputs and mapping provenance", () => {
  const scope = {
    aggregate: true,
    identity: { id: "summary-table" },
    keys: () => ["estimate", "lower", "upper"],
    has: (key) => ["estimate", "lower", "upper"].includes(key),
    resolve: (value) => value,
  };
  assert.throws(
    () => prepareNamed({ x: [0], y: "response" }, scope, options, "Line", { limit: Infinity }, undefined, {
      y: { kind: "mapping", label: "Mapping" },
    }),
    (error) => error.code === "mapping.aggregate_field_removed" &&
      error.diagnostic.field === "response" && /estimate/.test(error.message),
  );
});
// TODO 73.2: a Line's dash distances are measured on screen, on the GPU (utils/dashDistances.js):
// the host's segments carry zeros, and its inputs are borrowed.
test("polyline segments and neighbors borrow their inputs; dash distances are left to the GPU", () => {
  const position = np.array([
    [0, 0],
    [3, 4],
    [6, 8],
  ]);
  const values = lineArrays(position, options, true);
  assert.deepEqual(values.distance.ref.js(), [[0], [0]]);
  assert.deepEqual(values.start.ref.js(), [[0, 0], [3, 4]]);
  assert.deepEqual(values.next.ref.js(), [[6, 8], [6, 8]]);
  disposeArrays(values);
  assert.equal(position.refCount, 1);
  position.dispose();
});
test("empty lines have no segments and mismatched fields fail before upload", () => {
  assert.deepEqual(lineArrays([], options).start, []);
  assert.throws(
    () =>
      validateFields({
        position: [
          [1, 2],
          [3, 4],
        ],
        size: [[1]],
      }),
    /expected 2/,
  );
});
test("an unbuilt field rejects writes before retaining their input", () => {
  const field = new BufferedField(new ScalarType(), null, { name: "unbound" });
  const value = np.array([1, 2]);
  assert.throws(() => field.update(value), /Field unbound is unbuilt.*registerField/);
  assert.equal(value.refCount, 1);
  value.dispose();
});
test("queued input is retained immediately and released when manager is destroyed", async () => {
  const manager = new BufferManager({}, 10);
  const field = manager.registerField(new BufferedField(new ScalarType()));
  const value = np.array([1, 2]);
  const pending = field.update(value);
  assert.equal(value.refCount, 2);
  manager.dispose();
  await manager.chain;
  assert.equal((await pending).status, "disposed");
  assert.equal((await field.update(value)).status, "disposed");
  assert.equal(value.refCount, 1);
  value.dispose();
});
test("capacity slicing keeps rows and reference counts stable", async () => {
  const manager = new BufferManager({}, 2);
  const field = manager.registerField(new BufferedField(new ScalarType()));
  field.buffer.write = async () => {};
  const value = np.array([1, 2, 3]);
  await field.update(value);
  assert.deepEqual(field.data.ref.js(), [[1], [2]]);
  assert.equal(value.refCount, 1);
  value.dispose();
  manager.dispose();
  await manager.chain;
});

test("a host-filled field shrunk below its rows refills them by rows, not as one flat column", async () => {
  class PairType extends ScalarType { get channels() { return 2; } }
  const { ArrayInstancedBufferAttribute } = await import("../../src/lib/threeExtensions/array/arraytexture.js");
  const writes = [], original = ArrayInstancedBufferAttribute.prototype.writeHost;
  ArrayInstancedBufferAttribute.prototype.writeHost = function (array, rows) { writes.push([rows, this.maxElements]); };
  const manager = new BufferManager({}, 8);
  const field = manager.registerField(new BufferedField(new PairType()));
  field.bindBuffer = () => {};
  const errors = [], log = console.error;
  console.error = (...args) => errors.push(args.join(" "));
  try {
    await field.updateHost(Float32Array.from({ length: 12 }, (_, i) => i), 6);
    manager.setMaxElements(4);
    await manager.chain;
    assert.deepEqual(errors, []);
    assert.deepEqual(writes.at(-1), [4, 4]);
    assert.deepEqual(field.data.shape, [4, 2]);
    assert.deepEqual([...field.data], [0, 1, 2, 3, 4, 5, 6, 7]);
  } finally {
    ArrayInstancedBufferAttribute.prototype.writeHost = original;
    console.error = log;
    manager.dispose();
    await manager.chain;
  }
});

test("scalar fields reuse constant-sized bindings without becoming row counts or literal colors", async () => {
  const { channelScalar } = await import("../../src/lib/plot/utils/data.js");
  const { FillType } = await import("../../src/lib/plot/objects/types.js");
  const manager = new BufferManager({}, 1000), target = { renderer: {}, options: { get: () => false, has: () => false } };
  let rebuilds = 0;
  const field = manager.registerField(new BufferedField(new FillType(), target, { onDirty: () => rebuilds++ }));
  try {
    await field.update(channelScalar(0.25));
    const node = target.valueNode, built = rebuilds;
    assert.equal(node.value, 0.25);
    await field.update(channelScalar(0.75));
    assert.equal(target.valueNode, node);
    assert.equal(node.value, 0.75);
    assert.equal(rebuilds, built);
    assert.equal(field.count, 1);
    const scalar = np.array(0.5);
    let writes = 0;
    const pending = field.update(scalar);
    field.scalarBuffer.write = async (data) => { writes++; assert.deepEqual(data.shape, [1, 1]); };
    await pending;
    await field.update(scalar);
    assert.equal(writes, 1, 'an unchanged device scalar is not uploaded again');
    assert.equal(field.scalarBuffer.maxElements, 1);
    assert.equal(field.bufferNodeSource, field.scalarBuffer);
    assert.deepEqual(field.data.shape, []);
    assert.equal(field.count, 1);
    scalar.dispose();
    const scalarBuffer = field.scalarBuffer;
    manager.setMaxElements(2000);
    await manager.chain;
    assert.equal(field.scalarBuffer, scalarBuffer);
    assert.equal(field.retiredBuffers.size, 0);
    await field.update(channelScalar(0.25));
    manager.setMaxElements(4000);
    await manager.chain;
    assert.equal(field.retiredBuffers.size, 0, 'uniform fields release retired row storage too');
    await field.update("red");
    assert.equal(target.valueNode, null, 'literal color semantics restored');
  } finally { manager.dispose(); await manager.chain; }
});

test("mark preparation keeps scalar appearance and materializes scalar positions", async () => {
  const { divide, view, mean } = await import("../../src/lib/plot/utils/expressions.js");
  const { isChannelScalar } = await import("../../src/lib/plot/utils/data.js");
  const scope = createDataScope();
  scope.update({ x: [0, 1, 2] });
  const result = prepareNamed({ x: "x", y: divide(view.time, 1000),
    opacity: divide(view.time, 2000), fill: divide(view.time, 1000), size: mean("x") },
    scope, options, "Points", { hidden: {}, auto: {} }, undefined, {}, { time: 500 });
  try {
    assert.equal(result.props.opacity, 0.25);
    assert.equal(isChannelScalar(result.props.fill), true);
    assert.equal(result.props.fill.value, 0.5);
    assert.deepEqual(result.props.size.shape, []);
    assert.equal(result.channelResults.size.dependencies.membership, true);
    assert.deepEqual(result.props.position.ref.js(), [[0, 0.5], [1, 0.5], [2, 0.5]]);
  } finally { result.dispose(); scope.dispose(); }
});
test("local options reset to inherited values without changing siblings", () => {
  const root = new OptionsNode();
  root.define("opacity", 1, { ui: "slider" });
  const a = root.split("a"),
    b = root.split("b");
  a.set("opacity", 0.5);
  root.set("opacity", 0.8);
  assert.equal(a.get("opacity"), 0.5);
  assert.equal(b.get("opacity"), 0.8);
  a.clear("opacity");
  assert.equal(a.get("opacity"), 0.8);
  a.dispose();
  b.dispose();
  assert.equal(root.dependents.size, 0);
});
test("superseded queued inputs never upload and all retained references are released", async () => {
  const manager = new BufferManager({}, 10);
  const field = manager.registerField(new BufferedField(new ScalarType()));
  let writes = 0;
  field.buffer.write = async () => {
    writes++;
  };
  const a = np.array([1]),
    b = np.array([2]);
  const first = field.update(a);
  assert.equal((await field.update(b)).status, "applied");
  assert.equal((await first).status, "superseded");
  assert.equal(writes, 1);
  assert.equal(a.refCount, 1);
  assert.equal(b.refCount, 1);
  manager.dispose();
  await manager.chain;
  assert.equal(b.refCount, 1);
  a.dispose();
  b.dispose();
});
test("a Heatmap texture's cell mode resamples a queued write's data, not the older data shown (TODO 134.15)", async () => {
  const manager = new BufferManager({}, 10);
  const field = manager.registerField(new TextureField(new ScalarType()));
  const written = [];
  field.write = async (data) => (written.push(data), data);
  field.isBufferNode = true;
  await field.update([1]);
  const pending = field.update([2]);
  field.setPixelated(true);
  await pending;
  await manager.chain;
  assert.deepEqual([written, field.data, field.buffer.cellMode], [[[1], [2]], [2], true]);
  manager.dispose();
  await manager.chain;
});
test("queued keyed fields retain their own animation policy across later publications", async () => {
  const { markAnimation } = await import("../../src/lib/plot/utils/markAnimation.js");
  const manager = new BufferManager({}, 10), target = {};
  const field = manager.registerField(new BufferedField(new ScalarType(), target), "interactionOpacity");
  const state = markAnimation(target), staging = { index: Int32Array.of(-1, 0), rows: 2, oldRows: 1 };
  const sourceSpec = { components: [{ suppressed: true }] };
  const targetSpec = { explicit: true, components: [{ explicit: true, duration: 650 }] };
  const tags = [];
  field.buffer.write = async () => { tags.push(field.buffer.animationTag); };
  const source = np.array([0, 1]), next = np.array([1, 0]);
  try {
    state.staging = staging; state.specs = { interactionOpacity: sourceSpec };
    const first = field.update(source);
    state.staging = null; state.specs = { interactionOpacity: targetSpec };
    const second = field.update(next);
    // A live geometry publication has no authored row-alpha channel.
    state.specs = { position: { components: [{ suppressed: true }] } };
    await Promise.all([first, second]);
    assert.equal(tags.length, 2, "the keyed staging write cannot be superseded");
    assert.equal(tags[0].staging, staging);
    assert.equal(tags[0].spec, sourceSpec);
    assert.equal(tags[1].staging, null);
    assert.equal(tags[1].spec, targetSpec);
  } finally {
    manager.dispose(); await manager.chain;
    source.dispose(); next.dispose();
  }
});
test("a scheme reset writes unchanged targets before a superseding publication", async () => {
  const { applyAnimation } = await import("../../src/lib/plot/utils/channelAnimation.js");
  const manager = new BufferManager({}, 10), target = { manager, fields: manager.fields };
  const field = manager.registerField(new BufferedField(new ScalarType(), target), "interactionOpacity");
  const tags = [], data = np.array([0, 1]), sameTarget = np.array([0, 1]);
  field.buffer.write = async () => { tags.push(field.buffer.animationTag); };
  try {
    await field.update(data);
    tags.length = 0;
    const reset = { specs: {}, schemeReset: true };
    applyAnimation(target, reset, { interactionOpacity: data });
    applyAnimation(target, reset); // Displaying this same preparation must not reset again.
    await field.update(sameTarget);
    assert.deepEqual(tags.map(tag => tag.schemeReset), [true, false]);
    assert.ok(tags.every(tag => tag.staging === null));
  } finally {
    manager.dispose(); await manager.chain;
    data.dispose(); sameTarget.dispose();
  }
});
test("duplicate keyed staging writes preserve current rows instead of snapping to targets", async () => {
  const { ArrayInstancedBufferAttribute } = await import("../../src/lib/threeExtensions/array/arraytexture.js");
  const output = {}, staging = { index: Int32Array.of(-1, 0), rows: 2, oldRows: 1 };
  let gathers = 0, snaps = 0;
  const transition = { output, count: 1,
    async reindex() { gathers++; this.count = 2; },
    async prepare(_upload, { snap }) { assert.equal(snap, true); snaps++; },
  };
  const attribute = { renderer: { backend: { get: () => ({ buffer: output }) } },
    transition, animationTag: { owner: {}, staging }, length: { value: 1 },
    getDimensions: () => ({ length: 2, channels: 1 }),
    ensureStorageAttribute() {}, animationPlan: () => null,
  };
  const source = np.array([0, 1]);
  try {
    await ArrayInstancedBufferAttribute.prototype.write.call(attribute, source);
    await ArrayInstancedBufferAttribute.prototype.write.call(attribute, source);
    assert.equal(gathers, 1);
    assert.equal(snaps, 0, "the repeated source publication must retain the gathered displayed values");
    // An incompatible new descriptor snaps once; repeating it must still leave the field alone.
    attribute.animationTag.staging = { ...staging, oldRows: 3 };
    await ArrayInstancedBufferAttribute.prototype.write.call(attribute, source);
    await ArrayInstancedBufferAttribute.prototype.write.call(attribute, source);
    assert.equal(snaps, 1);
  } finally { source.dispose(); }
});
test("a failed field write returns its error and the same input can be retried", async () => {
  const manager = new BufferManager({}, 10);
  const field = manager.registerField(new BufferedField(new ScalarType()));
  const value = np.array([1]), error = Error("upload failed");
  const log = console.error;
  console.error = () => {};
  try {
    field.buffer.write = async () => { throw error; };
    assert.deepEqual(await field.update(value), { status: "failed", error });
    field.buffer.write = async () => {};
    assert.equal((await field.update(value)).status, "applied");
    assert.equal((await field.update(value)).status, "applied", "reused bindings preserve the outcome");
  } finally {
    console.error = log;
    manager.dispose();
    await manager.chain;
    value.dispose();
  }
});
test("2D positions pad to three components with the requested z-index", async () => {
  const { PositionType } = await import("../../src/lib/plot/objects/types.js");
  const value = np.array([
    [1, 2],
    [3, 4],
  ]);
  const result = new PositionType().validateShape(value.ref, { zindex: 7 });
  assert.deepEqual(result.js(), [
    [1, 2, 7],
    [3, 4, 7],
  ]);
  assert.equal(value.refCount, 1);
  value.dispose();
});
test("solid fill initializes a local color, while subsequent data updates preserve inspector overrides", async () => {
  const { FillType, ColorType } =
    await import("../../src/lib/plot/objects/types.js");
  const root = new OptionsNode();
  root.define("fillColor", new ColorType());
  const local = root.split("mark");
  const manager = new BufferManager({}, 10);
  const target = { options: local };
  const field = manager.registerField(
    new BufferedField(new FillType(), target),
  );
  await field.update("red");
  assert.equal(local.get("fillColor"), "#ff0000");
  local.set("fillColor", "#0000ff");
  await field.update("red");
  assert.equal(local.get("fillColor"), "#0000ff");
  manager.dispose();
  await manager.chain;
  local.dispose();
});
test("resetting a mark keeps its geometry-specific inspector controls", async () => {
  const { ensureScatter3DOptions, configureMarkOptions } =
    await import("../../src/lib/plot/objects/defaultOptions.js");
  const root = new OptionsNode();
  ensureScatter3DOptions(root);
  const local = root.split("3D");
  configureMarkOptions(local, "scatter3d");
  local.clear("shape");
  local.clear("detail");
  assert.deepEqual(local.getType("shape").options, ["sphere", "cube"]);
  assert.equal(local.getType("detail").max, 4);
  local.dispose();
});
// TODO 69.17: setup set detail 1 on the mark, over anything set above it; it is the mark's default
// now, which a value on the mark or on its plot overrides and a reset returns to.
test("a 3D point mark's sphere and detail are defaults that a set value overrides", async () => {
  const { ensureScatter3DOptions, configureMarkOptions, SPHERE_DETAIL } =
    await import("../../src/lib/plot/objects/defaultOptions.js");
  assert.equal(SPHERE_DETAIL, 3);
  const root = new OptionsNode();
  ensureScatter3DOptions(root);
  const plot = root.split("plot"), local = plot.split("3D");
  configureMarkOptions(local, "scatter3d");
  assert.deepEqual([local.get("shape"), local.get("detail")], ["sphere", 3]);
  plot.set("detail", 2);
  assert.equal(local.get("detail"), 2);
  local.set("detail", 1);
  local.set("shape", "cube");
  assert.deepEqual([local.get("shape"), local.get("detail")], ["cube", 1]);
  local.clear("detail");
  plot.clear("detail");
  assert.equal(local.get("detail"), 3);
  local.dispose();
  plot.dispose();
});

test("expression dependencies include shorthand fields without treating literal values as columns", () => {
  assert.deepEqual([...expressionFields(where("@hovered", 18, 12))], ["@hovered"]);
  assert.deepEqual([...expressionFields(where(is_in("species", ["setosa"]), square(col("x")), 0))], ["species", "x"]);
  assert.deepEqual([...expressionFields("steelblue")], []);
});

// TODO 62.4: an expression whose values all come from literals means its literals (a width in
// pixels); a condition may read anything, a value read from a column is data.
test("literal-valued expressions take every value from numeric literals", () => {
  for (const value of [where("@hovered", 2, 1), add(where("@selected", 4, 2), 1), tween(where("@brushed", 3, 1)),
    coalesce(where(is_in("species", ["a"]), 2, 1), 1), 3])
    assert.equal(literalValued(value), true, JSON.stringify(value));
  for (const value of [where("@hovered", "x", 1), square(col("x")), mean("x"), "x", [1, 2], where("@hovered", 2, "#ff0000"), Infinity])
    assert.equal(literalValued(value), false, JSON.stringify(value));
});

test("repeated reads of typed data do not republish identity or interaction state", () => {
  const scope = createDataScope();
  const data = { x: typedColumn([1, 2], { type: "numeric" }) };
  scope.update(data);
  const version = scope.version;
  const revision = scope.interactionRevision;
  scope.update(data);
  assert.equal(scope.version, version);
  assert.equal(scope.interactionRevision, revision);
  data.x = typedColumn([3, 4], { type: "numeric" });
  scope.update(data);
  assert.equal(scope.version, version + 1);
  scope.dispose();
});


test("virtual-mask ownership survives repeated indexed and passthrough updates", () => {
 const scope=createDataScope();scope.update({x:[1,2,3,4]});
 const passthrough=createDataView(scope);const indices=np.array([1,3],{dtype:np.int32});
 const indexed=createDataView(passthrough,{indices});
 for(let i=0;i<20;i++) {
  scope.identity.hover.replace(scope.identity,[i%4],{phase:"preview"});
  for(const view of [passthrough,indexed]) {
   const result=evaluateExpression(where("@hovered",18,12),view);result.value.ref.js();result.dispose();
  }
 }
 indexed.dispose();passthrough.dispose();indices.dispose();scope.dispose();
});

test("a prepared channel keeps an interaction column its view evicts, until it is disposed", () => {
  const scope = createDataScope(), options = optionsRoot.splitUnique("Acquired channel test plot");
  ensureAxisOptions(options.ensureChild("plot"));
  scope.update({ x: [1, 2, 3, 4] });
  const indices = np.array([1, 3], { dtype: np.int32 }), view = createDataView(scope, { indices });
  const mask = view.get("@selected");
  const drawn = prepareNamed({ x: "x", y: "x", size: "@selected" }, view, options, "Points", { hidden: {}, auto: {} });
  scope.identity.selection.replace(scope.identity, [1]);
  assert.notEqual(view.get("@selected"), mask, "the new revision evicted the view's mask");
  assert.ok(mask.refCount > 0);
  drawn.dispose();
  assert.equal(mask.refCount, 0);
  view.dispose(); indices.dispose(); scope.dispose(); options.dispose();
});


test("a row-count data scope has identity without allocating placeholder columns", () => {
  const scope = createDataScope();
  scope.update(undefined, undefined, { rows: 10_000_000 });
  assert.equal(scope.length, 10_000_000);
  assert.deepEqual([...scope.keys()].filter(name => !name.startsWith("@")), []);
  const version = scope.version, identity = scope.identity;
  scope.update(undefined, undefined, { rows: 10_000_000 });
  assert.equal(scope.version, version);
  for (const rows of [-1, 1.5, NaN, 2147483648])
    assert.throws(() => scope.update(undefined, undefined, { rows }), /Data.rows must be an integer/);
  assert.throws(() => scope.update({ x: [1] }, undefined, { rows: 1 }), /Data: pass a table or rows, not both/);
  assert.equal(scope.length, 10_000_000, "invalid replacements keep the previous scope");
  scope.update(undefined, undefined, { rows: 0 });
  assert.equal(scope.length, 0);
  assert.equal(scope.identity, identity);
  scope.update({ x: [1, 2] });
  assert.equal(scope.length, 2);
  scope.dispose();
});
