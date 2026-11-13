import test from "node:test";
import assert from "node:assert/strict";
import {
  examples,
  exampleArrays,
  symbols,
} from "../../src/routes/examples/catalog.js";
test("gallery has unique examples with code and all flat symbol choices", () => {
  assert.equal(new Set(examples.map((e) => e.id)).size, examples.length);
  assert.ok(examples.every((e) => e.code.includes("<")));
  assert.equal(symbols.length, 8);
});
test("gallery data is deterministic, finite, and periodic at the globe seam", () => {
  const a = exampleArrays();
  assert.deepEqual(a, exampleArrays());
  for (const values of Object.values(a))
    assert.ok(values.flat(Infinity).every(Number.isFinite));
  assert.equal(a.starts.length, a.ends.length);
  for (const row of a.globe) assert.ok(Math.abs(row[0] - row.at(-1)) < 1e-12);
  assert.ok(a.rgb.flat(Infinity).every((v) => v >= 0 && v <= 1));
});
