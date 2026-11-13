import { test } from "node:test";
import assert from "node:assert/strict";
import { validateRules } from "../../src/lib/plot/utils/axes.js";
import { groupedAxis } from "../../src/lib/plot/utils/axisFrame.js";

// TODO 136.16 slice 6: messages that name what to write instead.
test("a reference rule's dash takes what marks take, and its errors name the rule", () => {
  assert.deepEqual(validateRules([{ axis: "x", value: 1, dash: true }])[0].dash, [6, 4]);
  assert.deepEqual(validateRules([{ axis: "y", value: 1, dash: 3 }])[0].dash, [3, 3]);
  assert.equal("dash" in validateRules([{ axis: "y", value: 1, dash: false }])[0], false);
  assert.throws(() => validateRules([{ axis: "y", value: 1, dash: [-1] }]), /A y reference rule's dash is true, a dash length/);
});

test("an axis domain of category names points at a categorical scale", () => {
  assert.throws(() => groupedAxis({ x: { domain: ["low", "high"] } }), /x.domain lists categories .*categorical\(/);
});
