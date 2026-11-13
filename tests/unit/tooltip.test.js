// TODO 44, 72: the tolerant pick (picking/tolerantPick.js), nearest's settings and tooltip fields
// and text (utils/tooltip.js).
import test from "node:test";
import assert from "node:assert/strict";
import { nearestHit, pickWindow, stripHits } from "../../src/lib/picking/tolerantPick.js";
import { tooltipSetting, tooltipMode, nearestSetting, defaultFields, formatValue, formatDuration, tooltipLines, gridCell, rowValues, axisValueText } from "../../src/lib/plot/utils/tooltip.js";
import { legendNumberFormat } from "../../src/lib/plot/utils/numberLabels.js";
import { createDataScope } from "../../src/lib/plot/utils/categorical.js";
import { selection } from "../../src/lib/plot/utils/interaction.js";
import { col, log, where } from "../../src/lib/plot/utils/expressions.js";

/** A window of pick pixels from rows of object ids (0 is nothing), instance = 10 * id + column. */
function window(rows) {
  const height = rows.length, width = rows[0].length, pixels = new Float32Array(width * height * 4);
  rows.forEach((row, y) => row.forEach((id, x) => pixels.set([id, id ? 10 * id + x : -1, 0, 0], (y * width + x) * 4)));
  return { pixels, width, height };
}
// 1: a point mark with nearest (or a tooltip), 2: a line without, 3: a heatmap (an area), 4: a point mark with nearest.
const kinds = { 1: "nearest", 2: "row", 3: "area", 4: "nearest" };
const kindOf = (id) => kinds[id] ?? null;

test("the tolerant pick: a row under the pointer, else the nearest row of a nearest mark in its radius, else the pointer's pixel", () => {
  const empty = window([[0, 0, 0, 0, 0], [0, 0, 0, 0, 0], [0, 0, 0, 0, 1]]);
  assert.deepEqual(nearestHit(empty.pixels, 5, 3, [1, 1], 4, kindOf), { x: 4, y: 2 }, "the only tooltip pixel in reach");
  assert.deepEqual(nearestHit(empty.pixels, 5, 3, [1, 1], 2, kindOf), { x: 1, y: 1 }, "out of reach: the pointer's pixel");
  // A row under the pointer wins, with or without a tooltip; an area loses to a nearby row.
  const busy = window([[3, 3, 3, 1, 3], [3, 2, 3, 3, 3], [4, 3, 3, 3, 3]]);
  assert.deepEqual(nearestHit(busy.pixels, 5, 3, [1, 1], 4, kindOf), { x: 1, y: 1 }, "the line under the pointer");
  assert.deepEqual(nearestHit(busy.pixels, 5, 3, [2, 1], 4, kindOf), { x: 3, y: 0 }, "the heatmap under the pointer loses to a point");
  // Ties: the first in scan order (row by row).
  const tie = window([[0, 1, 0], [4, 0, 1], [0, 4, 0]]);
  assert.deepEqual(nearestHit(tie.pixels, 3, 3, [1, 1], 1, kindOf), { x: 1, y: 0 });
  // Marks without nearest are never reached from a distance; the radius is in device pixels.
  const lines = window([[2, 2, 2], [0, 0, 0], [0, 0, 0]]);
  assert.deepEqual(nearestHit(lines.pixels, 3, 3, [1, 2], 3, kindOf), { x: 1, y: 2 });
  // Each mark reaches as far as its own radius: 1's (1 pixel) does not reach the pointer, 4's (3) does.
  const two = window([[0, 0, 0, 0, 1], [0, 0, 0, 0, 0], [0, 0, 0, 0, 0], [0, 0, 0, 0, 0], [4, 0, 0, 0, 0]]);
  const reach = (id) => (id === 1 ? 1 : 3);
  assert.deepEqual(nearestHit(two.pixels, 5, 5, [2, 2], 3, kindOf, reach), { x: 0, y: 4 }, "the farther point, in its own reach");
  assert.deepEqual(pickWindow(10, 3, 32, 40, 30), { left: 0, top: 0, width: 40, height: 30, center: [10, 3] }, "clipped to the buffer");
  assert.equal(pickWindow(100, 100, 32, 400, 300).width, 65, "radius 16 at DPR 2: 65 device pixels");
});

test("unified x: each object's instances in a strip with the pixel nearest the pointer's column", () => {
  const strip = window([[0, 1, 0], [4, 0, 0], [0, 0, 4], [2, 1, 0]]);
  const hits = stripHits(strip.pixels, 3, 4, 1, (id) => kinds[id] === "nearest");
  assert.deepEqual([...hits.keys()].sort(), [1, 4], "marks without a tooltip take no part");
  assert.deepEqual(hits.get(1).get(11), { dx: 0, x: 1, y: 0 }, "instance 11 at column 1, twice: the first");
  assert.deepEqual([...hits.get(4).entries()], [[40, { dx: 1, x: 0, y: 1 }], [42, { dx: 1, x: 2, y: 2 }]]);
  assert.equal(stripHits(strip.pixels, 3, 4, 1, () => false).size, 0, "a series missing from the strip is left out");
});

test("tooltip settings: off by default, the Plot's as a default, fields, radius and mode checked", () => {
  assert.equal(tooltipSetting(undefined), null);
  assert.equal(tooltipSetting(false, true), null, "a mark's false wins over its Plot's");
  assert.deepEqual(tooltipSetting(undefined, true), { fields: null, radius: 16, content: null });
  assert.deepEqual(tooltipSetting(["species", { field: "mass", label: "Mass", format: ".1f" }]).fields,
    [{ field: "species" }, { field: "mass", label: "Mass", format: ".1f" }]);
  assert.equal(tooltipSetting({ radius: 24 }).radius, 24);
  assert.equal(tooltipMode({ mode: "x" }), "x");
  assert.equal(tooltipMode(true), "row");
  assert.throws(() => tooltipSetting({ radius: -1 }, undefined, "Points.tooltip"), { message: "Points.tooltip.radius must be a number of pixels, 0 or more." });
  assert.throws(() => tooltipSetting({ fields: [{ name: "x" }] }), { message: "tooltip fields are column names or { field, label, format }." });
  assert.throws(() => tooltipSetting({ mode: "y" }), { message: 'tooltip.mode must be "row" (the default) or "x".' });
  assert.throws(() => tooltipSetting("species"), { message: "tooltip must be true, a list of fields, or { fields, radius, content }." });
});

test("nearest settings: off by default, the Plot's as a default, a selection, a radius, checked", () => {
  const focus = selection();
  assert.equal(nearestSetting(undefined), null);
  assert.equal(nearestSetting(false, true), null, "a mark's false wins over its Plot's");
  assert.deepEqual(nearestSetting(undefined, true), { selection: true, radius: undefined }, "the radius: the tooltip's, else 16");
  assert.equal(nearestSetting(focus).selection, focus);
  assert.deepEqual(nearestSetting({ radius: 8 }), { selection: true, radius: 8 });
  assert.throws(() => nearestSetting({ radius: -1 }, undefined, "Points.nearest"), { message: "Points.nearest.radius must be a number of pixels, 0 or more." });
  assert.throws(() => nearestSetting({ units: "data" }, undefined, "Line.nearest"), { message: "Line.nearest takes selection and radius, not units." });
  assert.throws(() => nearestSetting({ selection: "a" }, undefined, "Points.nearest"), { message: "Points.nearest.selection must be a selection(), or true for its data's." });
  assert.throws(() => nearestSetting(16, undefined, "Points.nearest"), { message: "Points.nearest must be true, a selection(), or { selection, radius }." });
});

test("default fields are the columns the channels read, once, and an expression position's plotted value", async () => {
  const scope = createDataScope();
  scope.update({ bill: [1, 2], mass: [3, 4], species: ["a", "b"] });
  assert.deepEqual(defaultFields({ x: "bill", y: "mass", fill: "species", size: "mass", opacity: "@hovered" }, scope),
    [{ field: "bill" }, { field: "mass" }, { field: "species" }]);
  assert.deepEqual(defaultFields({ x: log(col("mass")), y: "bill" }, scope), [{ field: "mass" }, { plotted: "x", label: "x" }, { field: "bill" }]);
  // Ends composed per axis (a rule's, an error bar's) list their columns; "__" columns are a
  // mark's own table of arrays.
  assert.deepEqual(defaultFields({ start: ["bill", where(col("mass"), "mass", 0)], end: ["__x", 1], color: "species" }, scope),
    [{ field: "bill" }, { field: "mass" }, { field: "species" }]);
  assert.deepEqual(await rowValues(scope, ["species", "mass", "nope"], 1), { species: "b", mass: 4, nope: null });
  scope.dispose();
});

test("values as a tooltip writes them: numbers, datetimes with their time of day, durations, categories, missing", () => {
  const T0 = Date.UTC(2026, 0, 2), meta = { type: "datetime", origin: T0, timezone: "UTC" };
  assert.equal(formatValue(1234.5678), "1235");
  assert.equal(formatValue(4150, undefined, ",.0f"), "4,150");
  assert.equal(formatValue(0, meta), "Jan 02, 2026");
  assert.equal(formatValue(5 * 3600000, meta), "Jan 02, 2026 05:00");
  assert.equal(formatValue(5 * 3600000 + 7000, meta), "Jan 02, 2026 05:00:07");
  assert.equal(formatValue(6 * 3600000, { ...meta, timezone: "America/New_York" }), "Jan 02, 2026 01:00");
  assert.equal(formatValue(0, meta, "%Y-%m-%d"), "2026-01-02");
  assert.equal(formatDuration(93784000), "1 d 2 h");
  assert.equal(formatDuration(4200), "4.2 s");
  assert.equal(formatValue(90000, { type: "duration" }), "1 min 30 s");
  assert.equal(formatValue("Adelie"), "Adelie");
  assert.equal(formatValue(true), "true");
  for (const value of [null, undefined, NaN]) assert.equal(formatValue(value), "—");
  // An interval's two ends under one name are one line.
  assert.deepEqual(tooltipLines([{ field: "x0" }, { field: "x1" }, { field: "count" }], { x0: 2.6, x1: 3.4, count: 3 },
    { name: (field) => (field === "count" ? "count" : "v") }), [{ label: "v", text: "2.6 – 3.4" }, { label: "count", text: "3" }]);
  assert.deepEqual(gridCell([2, 3], { x: 0.99, y: 0.6 }), [1, 2]);
});

test("tooltip numbers read as ticks do, and the theme's numbers.format below a field's own (TODO 132.4)", () => {
  // Four significant digits, whole numbers kept, thousands grouped from 10,000: no 1.235e+4.
  assert.deepEqual([3.14159, 2020, 12345, 12345.678, 1e6, 0.000123456].map((v) => formatValue(v)),
    ["3.142", "2020", "12,345", "12,346", "1,000,000", "0.0001235"]);
  const T0 = Date.UTC(2026, 0, 2), meta = { type: "datetime", origin: T0, timezone: "UTC" };
  assert.equal(formatValue(1234.5, undefined, undefined, "$,.2f"), "$1,234.50");
  assert.equal(formatValue(0, meta, undefined, "$,.2f"), "Jan 02, 2026", "dates keep theirs");
  assert.deepEqual(tooltipLines([{ field: "price" }, { field: "share", format: ".0%" }], { price: 1500, share: 0.25 },
    { numberFormat: "$,.0f" }), [{ label: "price", text: "$1,500" }, { label: "share", text: "25%" }]);
  // Grouped as shown, after rounding.
  assert.deepEqual([9999.7, 10000.2].map((v) => formatValue(v)), ["10,000", "10,000"]);
  // An axis position (a grid mark's x and y, a unified tooltip's title): the axis's format first.
  assert.equal(axisValueText(1500, { type: "numeric", format: ".1f" }, "$,.0f"), "1500.0");
  assert.equal(axisValueText(1500, { type: "numeric", format: "" }, "$,.0f"), "$1,500");
  assert.equal(axisValueText(0, { type: "datetime", format: "", timeOrigin: T0, timezone: "UTC" }, "$,.0f"), "Jan 02, 2026");
  // A legend: its mark's legendTickFormat where set (its default value too), else the theme's.
  const scope = (set) => ({ get: (k) => (k === "numberFormat" ? "$,.0f" : ".3~g"), isExplicit: () => set });
  assert.deepEqual([legendNumberFormat(scope(true)), legendNumberFormat(scope(false))], [".3~g", "$,.0f"]);
});

test("@tooltip and @nearest are 1 on the rows a tooltip shows and the tolerant pick found, their @any_ on every row while one is", async () => {
  const scope = createDataScope();
  scope.update({ v: [1, 2, 3] });
  const read = async (field) => Array.from(await scope.get(field).ref.data(), Number);
  assert.deepEqual([await read("@tooltip"), await read("@any_tooltip")], [[0, 0, 0], [0, 0, 0]]);
  const identity = scope.identity;
  identity.tooltip.replace(identity, [1], { phase: "preview" });
  assert.deepEqual([await read("@tooltip"), await read("@any_tooltip")], [[0, 1, 0], [1, 1, 1]]);
  identity.tooltip.cancelPreview(identity);
  assert.deepEqual(await read("@tooltip"), [0, 0, 0]);
  identity.nearest.replace(identity, [2], { phase: "preview" });
  assert.deepEqual([await read("@nearest"), await read("@any_nearest")], [[0, 0, 1], [1, 1, 1]]);
  identity.nearest.cancelPreview(identity);
  assert.deepEqual([await read("@nearest"), await read("@any_nearest")], [[0, 0, 0], [0, 0, 0]]);
  scope.dispose();
});
