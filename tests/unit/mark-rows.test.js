import test from "node:test";
import assert from "node:assert/strict";
import { readsColumn, drawsOnce } from "../../src/lib/plot/utils/markRows.js";
import { col, add } from "../../src/lib/plot/utils/expressions.js";
import { animate } from "../../src/lib/plot/utils/animation.js";

// TODO 130.1: rows="auto" draws one item when no channel reads a column.
test("rows=\"auto\": which channel values read a column", () => {
  const scope = { has: (name) => ["a", "b"].includes(name) };
  for (const value of ["a", col("b"), add("a", 1), [1, 2, 3], new Float32Array(3), animate("a")])
    assert.equal(readsColumn(value, scope), true, JSON.stringify(value));
  // An interaction field is per-row; view state is not.
  assert.equal(readsColumn("@selected", scope), true);
  for (const value of [undefined, null, 3, true, "red", "@pointer_x", new Date(0), add("@view_y_min", 1)])
    assert.equal(readsColumn(value, scope), false, JSON.stringify(value));
  // A vector written as its components reads a column when one does; another channel's short
  // array is per-row values (two labels).
  assert.equal(drawsOnce({ start: [2, "@view_y_min"], end: [2, "@view_y_max"], color: "red" }, scope), true);
  assert.equal(drawsOnce({ start: ["a", "@view_y_min"], end: ["a", "@view_y_max"] }, scope), false);
  assert.equal(drawsOnce({ x: 1, y: 2, text: ["p", "q"] }, scope), false);
  // A start of numbers only is per-row values, as the mark reads it (namedData.js composedVector).
  assert.equal(drawsOnce({ start: [2, 5], end: [3, 6] }, scope), false);
  // Without a data scope no string is a column.
  assert.equal(drawsOnce({ x: "a", y: 1 }, undefined), true);
});
