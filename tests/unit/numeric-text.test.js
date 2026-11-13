import { test } from "node:test";
import assert from "node:assert/strict";
import { numericTexts, textFormat } from "../../src/lib/plot/utils/numericText.js";

// TODO 143.6: Text's numbers written as tooltips write them, in a format, or as dates.
test("numbers are written readably, in a d3 format, or as dates; missing values are blank", () => {
  assert.deepEqual(numericTexts([1200, 12345, 0.041666, Number.NaN, null]), ["1200", "12,345", "0.04167", "", null]);
  assert.deepEqual(numericTexts(Float32Array.of(12.3, 2.5)), ["12.3", "2.5"]);
  assert.deepEqual(numericTexts([0.125, 0.5], { format: ".1%" }), ["12.5%", "50.0%"]);
  assert.deepEqual(numericTexts([1234.5], { numberFormat: "$,.2f" }), ["$1,234.50"]);
  assert.deepEqual(numericTexts([0, 86400000], { format: "%b %d", meta: { type: "datetime", origin: Date.UTC(2024, 0, 15) } }), ["Jan 15", "Jan 16"]);
  assert.deepEqual(numericTexts({ codes: [0, 1], categories: [2, 3.5] }), { codes: [0, 1], categories: ["2", "3.5"] });
  assert.equal(numericTexts(7), "7");
  assert.deepEqual(numericTexts(["a", "b"]), ["a", "b"]);
});

test("format is a d3 format, a %-pattern or axis", () => {
  assert.equal(textFormat(",.0f"), ",.0f");
  assert.equal(textFormat("%b %d"), "%b %d");
  assert.equal(textFormat("axis"), "axis");
  assert.throws(() => textFormat(""), /d3-format string/);
  assert.throws(() => textFormat("bogus"), /d3-format string/);
});

test("dividing integers is true division, and an integer's floor is itself (TODO 136.18)", async () => {
  const { evaluateExpression, divide, floor, row } = await import("../../src/lib/plot/utils/expressions.js");
  const { numpy: np } = await import("@hmplot/jax");
  const scope = { length: 4, has: () => false, get: () => undefined, keys: () => [] };
  const halves = evaluateExpression(divide(row(), 2), scope, {}), whole = evaluateExpression(floor(row()), scope, {});
  try {
    assert.deepEqual(Array.from(await halves.value.ref.data()), [0, 0.5, 1, 1.5]);
    assert.deepEqual(Array.from(await whole.value.ref.data()), [0, 1, 2, 3]);
  } finally { halves.dispose(); whole.dispose(); }
  void np;
});
