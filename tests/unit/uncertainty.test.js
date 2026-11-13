// TODO 17.14c: ErrorBars and Area draw a padded view (a Filter's rows) with the hidden rows
// missing: uncertaintyArrays reads a row that is not shown like a row with a missing bound.
import test from "node:test";
import assert from "node:assert/strict";
import { numpy as np } from "@hmplot/jax";
import { uncertaintyArrays, bandMarkValues } from "../../src/lib/plot/utils/uncertainty.js";

const rows = async (a) => { const values = Array.from(await a.ref.data(), Number); a.dispose(); return values; };
test("uncertainty arrays read the rows that are not shown as missing", async () => {
  const x = [0, 1, 2, 3], lower = [0, 1, 2, 3], upper = [1, 2, 3, 4];
  const shown = np.array([1, 0, 1, 1], { dtype: np.int32 });
  // Error bars: one bar per row; the hidden row's bar has missing ends.
  const position = np.array([[0, 0], [1, 0], [2, 0], [3, 0]]);
  const bars = uncertaintyArrays("errors", position, lower, upper, "y", shown);
  const start = await rows(bars.start); bars.end.dispose(); position.dispose();
  assert.deepEqual(start.filter((_, i) => i % 2 === 1).map(Number.isNaN), [false, true, false, false]);
  // A ribbon: every segment that touches the hidden row is missing, the others remain.
  const band = uncertaintyArrays("area", x, lower, upper, "y", shown);
  const from = await rows(band.start), to = await rows(band.end);
  band.previous.dispose(); band.next.dispose();
  const missing = [0, 1, 2].map((i) => Number.isNaN(from[i * 2 + 1]) || Number.isNaN(to[i * 2 + 1]));
  assert.deepEqual(missing, [true, true, false]);
  // Without a mask nothing is missing.
  const all = uncertaintyArrays("area", x, lower, upper, "y");
  assert.ok((await rows(all.start)).every(Number.isFinite));
  all.end.dispose(); all.previous.dispose(); all.next.dispose();
  shown.dispose();
});

// TODO 64: `axis` is not a prop of Area or ErrorBars: a stray one is dropped. ErrorBars
// and Area turn by orientation; a horizontal Area takes its positions as y.
test("band marks take their axis from orientation, never from a stray axis", () => {
  assert.deepEqual(bandMarkValues("Area", { x: "t", upper: "v", axis: "x" }), { x: "t", upper: "v" });
  assert.deepEqual(bandMarkValues("Area", { y: "t", upper: "v", orientation: "horizontal" }), { x: "t", upper: "v", axis: "x" });
  assert.throws(() => bandMarkValues("Area", { x: "t", y: "v" }), /pass upper for values/);
  assert.throws(() => bandMarkValues("Area", { baseline: 1 }), /pass lower instead/);
  assert.deepEqual(bandMarkValues("Area", { x: "t", lower: "a", upper: "b", axis: "x" }), { x: "t", lower: "a", upper: "b" });
  assert.deepEqual(bandMarkValues("Area", { y: "t", orientation: "horizontal" }), { x: "t", axis: "x" });
  assert.throws(() => bandMarkValues("Area", { x: "t", orientation: "horizontal" }), /pass its positions as y/);
  assert.throws(() => bandMarkValues("Area", { x: "t", y: "v" }), /y only with orientation="horizontal"/);
  assert.throws(() => bandMarkValues("Area", { x: "t", orientation: "sideways" }), /Area.orientation must be/);
  assert.deepEqual(bandMarkValues("ErrorBars", { x: "t", axis: "x" }), { x: "t" });
  assert.deepEqual(bandMarkValues("ErrorBars", { x: "t", orientation: "horizontal" }), { x: "t", axis: "x" });
});

// TODO 67.1: a bound outside the value axis's transform is missing, as for every mark (it ran to
// the clamped log of 0, far off the plot); an Area's baseline outside it is an error.
test("band bounds outside the value axis's transform are missing; an Area's baseline there is an error", async () => {
  const { prepareNamed } = await import("../../src/lib/plot/utils/namedData.js");
  const band = uncertaintyArrays("area", [1, 2, 3], [0, 1, 1], [2, 4, 3], "y", undefined, "log");
  const from = await rows(band.start);
  band.end.dispose(); band.previous.dispose(); band.next.dispose();
  assert.deepEqual([0, 1].map((i) => Number.isNaN(from[i * 2 + 1])), [true, false]);
  const options = { get: (key) => (key === "yTransform" ? "log" : key.endsWith("Transform") ? "linear" : [0, 1]) };
  assert.throws(() => prepareNamed({ x: [1, 2], upper: [2, 4] }, null, options, "Area", { limit: Infinity }),
    { message: "Area.lower 0 is outside the log y axis's domain: pass a lower edge on it, such as lower={1}." });
  prepareNamed({ x: [1, 2], upper: [2, 4], lower: 1 }, null, options, "Area", { limit: Infinity }).dispose();
  const horizontal = { get: key => key === "xTransform" ? "log" : "linear" };
  assert.throws(() => prepareNamed({ x: [1, 2], upper: [2, 4], axis: "x" }, null, horizontal, "Area", { limit: Infinity }), /log x axis/);
});

// A Mapping's positions reach an Area along its orientation: a horizontal one reads y as its
// positions and leaves x; a vertical one leaves y. A Mapping cannot set a band's axis.
test("a Mapping's x and y reach an Area along its orientation", async () => {
  const { resolveMappings } = await import("../../src/lib/plot/utils/mapping.js");
  const mapping = { x: "t", y: "depth", axis: "x" };
  assert.deepEqual(resolveMappings("Area", [mapping], bandMarkValues("Area", { orientation: "horizontal", lower: "a", upper: "b" })).values,
    { x: "depth", lower: "a", upper: "b", axis: "x" });
  assert.deepEqual(resolveMappings("Area", [mapping], bandMarkValues("Area", { lower: "a", upper: "b" })).values,
    { x: "t", lower: "a", upper: "b" });
});
