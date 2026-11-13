// TODO 39.4: PieGeometry (the Pie's sectors) against d3.pie. d3 measures radians clockwise from
// 12 o'clock; PieGeometry takes degrees in that convention and writes the polar frame's angles
// (counter-clockwise from east, `turn` units a revolution), so a d3 angle t is 90 - t degrees.
import test from "node:test";
import assert from "node:assert/strict";
import * as d3 from "d3";
import { createDataScope } from "../../src/lib/plot/utils/categorical.js";
import { runTransform } from "../../src/lib/plot/utils/transforms.js";
import { multiply } from "../../src/lib/plot/utils/expressions.js";

const RAD = Math.PI / 180;
const COLUMNS = ["__pieStart", "__pieEnd", "__pieInner", "__pieOuter", "__pieAngle", "__pieRadius", "__pieShare", "__pieTextRadius"];

/** Runs `steps` ([kind, config] in order) over a table; returns every output column as numbers. */
async function pie(table, config, before = [], schema = undefined) {
  const made = [createDataScope()];
  made[0].update(table, schema);
  try {
    for (const [kind, step] of [...before, ["PieGeometry", config]])
      made.push(await runTransform(kind, made.at(-1), step));
    const out = made.at(-1), result = { length: out.length };
    for (const key of COLUMNS) result[key] = Array.from(await out.get(key).ref.data(), Number);
    if (out.has("__pieLabel")) {
      const label = out.get("__pieLabel");
      const codes = Array.from(ArrayBuffer.isView(label.codes) ? label.codes : await label.codes.ref.data(), Number);
      result.label = codes.map((code) => label.categories[code]);
    }
    return result;
  } finally {
    made.reverse().forEach((item) => item.dispose());
  }
}
/** d3.pie's arcs as frame intervals: [90 - end, 90 - start] degrees, less half the pad each side. */
const d3Sectors = (values, { sort = null, startAngle = 0, endAngle = 360, padAngle = 0 } = {}) => {
  const layout = d3.pie().startAngle(startAngle * RAD).endAngle(endAngle * RAD).padAngle(padAngle * RAD);
  if (sort === null) layout.sort(null);
  else layout.sortValues(sort === "asc" ? d3.ascending : d3.descending);
  return layout(values).map((arc) => {
    const a = arc.startAngle / RAD, b = arc.endAngle / RAD, half = arc.padAngle / RAD / 2 * Math.sign(b - a || 1);
    const [lo, hi] = [a + half, b - half].sort((p, q) => p - q);
    return { start: 90 - hi, end: 90 - lo, mid: 90 - (a + b) / 2 };
  });
};
const close = (actual, expected, label, tolerance = 1e-3) => {
  assert.equal(actual.length, expected.length, `${label}: length`);
  actual.forEach((value, i) => {
    if (Number.isNaN(expected[i])) assert.ok(Number.isNaN(value), `${label}[${i}]: ${value}, expected NaN`);
    else assert.ok(Math.abs(value - expected[i]) <= tolerance, `${label}[${i}]: ${value}, expected ${expected[i]}`);
  });
};
const sameAsD3 = (result, sectors, label) => {
  close(result.__pieStart, sectors.map((s) => s.start), `${label} start`);
  close(result.__pieEnd, sectors.map((s) => s.end), `${label} end`);
  close(result.__pieAngle, sectors.map((s) => s.mid), `${label} mid`);
};

const values = [3, 1, 2, 4, 1, 5];
const table = { v: Float32Array.from(values), c: ["a", "b", "c", "d", "e", "f"] };

test("PieGeometry's angles are d3.pie's, in each sort order, with and without a pad", async () => {
  for (const sort of ["none", "asc", "desc"])
    for (const padAngle of [0, 3]) {
      const options = { sort: sort === "none" ? null : sort, padAngle };
      sameAsD3(await pie(table, { value: "v", sort, padAngle }), d3Sectors(values, options), `${sort} pad ${padAngle}`);
    }
});

test("startAngle and endAngle bound the pie, counter-clockwise when end < start", async () => {
  for (const [startAngle, endAngle] of [[-90, 90], [30, 300], [180, -90], [0, 720]]) {
    const result = await pie(table, { value: "v", startAngle, endAngle, padAngle: 2 });
    sameAsD3(result, d3Sectors(values, { startAngle, endAngle, padAngle: 2 }), `${startAngle}..${endAngle}`);
    for (let i = 0; i < values.length; i++) assert.ok(result.__pieStart[i] <= result.__pieEnd[i], "ordered");
  }
});

test("radii, centroids and shares: a donut's ring, the middle of each sector", async () => {
  const result = await pie(table, { value: "v", innerRadius: 0.4, outerRadius: 0.9 });
  close(result.__pieInner, values.map(() => 0.4), "inner");
  close(result.__pieOuter, values.map(() => 0.9), "outer");
  close(result.__pieRadius, values.map(() => 0.65), "radius");
  close(result.__pieShare, values.map((v) => v / 16), "share", 1e-6);
});

test("`by` gives each group a ring of its own, the first innermost, aligned to the one inside", async () => {
  const grouped = { v: Float32Array.from([3, 1, 2, 4, 1, 5]), g: ["x", "y", "x", "y", "x", "y"] };
  const result = await pie(grouped, { value: "v", by: "g", sort: "desc", padAngle: 1, innerRadius: 0.2 });
  for (const [ring, key] of ["x", "y"].entries()) {
    const rows = grouped.g.flatMap((g, i) => (g === key ? [i] : []));
    // Each sector's pad comes out of its own share: d3's unpadded sector, half a pad in each side.
    const sectors = d3Sectors(rows.map((i) => grouped.v[i]), { sort: "desc" })
      .map((s) => ({ start: s.start + 0.5, end: s.end - 0.5, mid: s.mid }));
    const pick = (column) => rows.map((i) => result[column][i]);
    sameAsD3({ __pieStart: pick("__pieStart"), __pieEnd: pick("__pieEnd"), __pieAngle: pick("__pieAngle") }, sectors, key);
    // The rings meet at 0.6, a pad's width (0.6 x 1 degree) apart.
    const gap = 0.6 * RAD / 2;
    close(pick("__pieInner"), rows.map(() => (ring ? 0.6 + gap : 0.2)), `${key} inner`, 1e-5);
    close(pick("__pieOuter"), rows.map(() => (ring ? 1 : 0.6 - gap)), `${key} outer`, 1e-5);
  }
  // A sunburst: the outer sectors (in row order) that sum to an inner one start and end with it,
  // though the outer ring has more sectors (and so more pads).
  const nested = { v: Float32Array.from([6, 4, 1, 2, 3, 4]), g: ["in", "in", "out", "out", "out", "out"] };
  const rings = await pie(nested, { value: "v", by: "g", padAngle: 2 });
  close([rings.__pieEnd[0], rings.__pieStart[0], rings.__pieEnd[1], rings.__pieStart[1]],
    [rings.__pieEnd[2], rings.__pieStart[4], rings.__pieEnd[5], rings.__pieStart[5]], "aligned");
});

test("a category order sorts the sectors; unlisted categories follow in row order", async () => {
  const result = await pie(table, { value: "v", category: "c", sort: ["d", "b"] });
  const order = [3, 1, 0, 2, 4, 5];
  const sectors = d3Sectors(order.map((i) => values[i]));
  const expected = [];
  order.forEach((row, i) => (expected[row] = sectors[i]));
  sameAsD3(result, expected, "category order");
});

test("a zero draws nothing and takes no pad; NaN and hidden rows take no share", async () => {
  const withZero = { v: Float32Array.from([3, 0, 2, NaN, 4]) };
  const result = await pie(withZero, { value: "v", padAngle: 4 });
  // The drawn rows are d3's pie of the positive values; the zero is a point where it stands.
  const sectors = d3Sectors([3, 2, 4], { padAngle: 4 });
  close([0, 2, 4].map((i) => result.__pieStart[i]), sectors.map((s) => s.start), "start");
  close([0, 2, 4].map((i) => result.__pieEnd[i]), sectors.map((s) => s.end), "end");
  assert.equal(result.__pieStart[1], result.__pieEnd[1], "a zero has no width");
  close([result.__pieEnd[1]], [sectors[0].start - 2], "the zero stands after the first sector's pad");
  assert.ok(Number.isNaN(result.__pieAngle[1]), "a zero has no centroid");
  for (const column of ["__pieStart", "__pieEnd", "__pieAngle", "__pieInner", "__pieShare"])
    assert.ok(Number.isNaN(result[column][3]), `NaN row: ${column}`);
  // With no pad, d3's own zero arcs agree (but a zero has no centroid to label).
  const unpadded = await pie({ v: Float32Array.from([3, 0, 2, 4]) }, { value: "v" });
  sameAsD3(unpadded, d3Sectors([3, 0, 2, 4]).map((s, i) => (i === 1 ? { ...s, mid: NaN } : s)), "zeros without a pad");
  // A Filter's hidden rows (v > 1 keeps 3, 2, 4): the others share the pie as if alone.
  const filtered = await pie({ v: Float32Array.from([3, 1, 2, 4]) }, { value: "v" },
    [["Filter", { where: { field: "v", op: "gt", value: 1 } }]]);
  sameAsD3(filtered, d3Sectors([3, 2, 4]), "filtered");
  // A group whose values are all zero: points at the start, no division by zero.
  const zeros = await pie({ v: Float32Array.from([0, 0]) }, { value: "v" });
  close(zeros.__pieStart, [90, 90], "all zero");
});

test("the frame's angle unit: `turn` units a revolution", async () => {
  const hours = await pie(table, { value: "v", turn: 24 });
  const degrees = await pie(table, { value: "v" });
  close(hours.__pieStart, degrees.__pieStart.map((a) => a * 24 / 360), "hours", 1e-4);
  const radians = await pie(table, { value: "v", turn: 2 * Math.PI });
  close(radians.__pieEnd, degrees.__pieEnd.map((a) => a * RAD), "radians", 1e-5);
});

test("expression values; labels: percent, value, a column or expression, with labelFormat", async () => {
  // The value may be an expression too.
  sameAsD3(await pie(table, { value: multiply("v", 2) }), d3Sectors(values), "expression value");
  assert.deepEqual((await pie(table, { value: "v", label: "percent" })).label,
    ["19%", "6%", "13%", "25%", "6%", "31%"]);
  assert.deepEqual((await pie(table, { value: "v", label: "percent", labelFormat: ".1%" })).label,
    ["18.8%", "6.3%", "12.5%", "25.0%", "6.3%", "31.3%"]);
  assert.deepEqual((await pie({ v: Float32Array.from([1234567, 0.5, NaN]) }, { value: "v", label: "value" })).label,
    ["1,234,567", "0.5", ""]);
  assert.deepEqual((await pie(table, { value: "v", label: multiply("v", 10), labelFormat: "d" })).label,
    ["30", "10", "20", "40", "10", "50"]);
});

test("a label that would overlap a larger sector's is hidden (labelText, labelSize)", async () => {
  const slices = { v: Float32Array.from([50, 1, 1, 1, 47]), c: ["big", "aa", "bb", "cc", "other"] };
  // The font is a tenth of the radius: the three 1% sectors' labels, 3.6 degrees apart at radius
  // 0.5, would overlap; the first is kept.
  const hidden = await pie(slices, { value: "v", labelText: "c", labelSize: 0.1 });
  close(hidden.__pieTextRadius, [0.5, 0.5, NaN, NaN, 0.5], "hidden");
  // Without a size every label shows, at its centroid.
  const shown = await pie(slices, { value: "v", labelText: "c" });
  close(shown.__pieTextRadius, shown.__pieRadius, "shown");
});

test("a negative value is a data error naming its row; bad options are errors naming the fix", async () => {
  await assert.rejects(pie({ v: Float32Array.from([3, -2, 1]) }, { value: "v" }),
    { message: 'Pie value "v" must be nonnegative: row 1 is -2.' });
  // A hidden negative row is not drawn, so it is no error.
  await pie({ v: Float32Array.from([3, -2, 1]) }, { value: "v" }, [["Filter", { where: { field: "v", op: "gt", value: 0 } }]]);
  const errors = [
    [{ value: "v", padAngle: -1 }, "Pie padAngle must be nonnegative."],
    [{ value: "v", startAngle: NaN }, "Pie startAngle must be a finite number."],
    [{ value: "v", innerRadius: 0.8, outerRadius: 0.5 }, "Pie radii must satisfy 0 <= innerRadius <= outerRadius."],
    [{ value: "v", sort: "size" }, 'Pie sort must be "none", "asc", "desc" or a list of categories; got "size".'],
    [{ value: "v", sort: ["a"] }, "Pie sort by a category order needs a category column."],
    [{ value: "v", turn: 0 }, "Pie needs a polar frame with a finite, positive angular period."],
    [{}, "Pie requires a value column."],
    [{ value: "v", view: "3d" }, 'Pie draws in 2D plots only; give its Plot type="2d".'],
    [{ value: "v", turn: "extent" }, 'Pie cannot draw in a polar frame whose angleUnit is "extent" (its turn follows the x domain); use degrees, radians or custom.'],
  ];
  for (const [config, message] of errors) await assert.rejects(pie(table, config), { message }, message);
  await assert.rejects(pie({ v: Float32Array.from([1, 2]), c: Float32Array.from([1, 2]) }, { value: "v", category: "c", sort: [1] }),
    { message: "Pie sort by a category order needs a categorical category column." });
});

test("an empty table has empty sectors", async () => {
  const result = await pie({ v: new Float32Array(0) }, { value: "v", label: "percent" }, [], { v: { type: "numeric" } });
  assert.equal(result.length, 0);
  for (const key of COLUMNS) assert.deepEqual(result[key], []);
  assert.deepEqual(result.label, []);
});
