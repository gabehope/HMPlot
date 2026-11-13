import test from "node:test";
import assert from "node:assert/strict";
import { groupedAxis } from "../../src/lib/plot/utils/axisFrame.js";
import { createDataScope } from "../../src/lib/plot/utils/categorical.js";
import { runTransform } from "../../src/lib/plot/utils/transforms.js";
test("grouped axes distinguish scales from surface height", () => {
  const scale = { isCategorical: true };
  const c = groupedAxis({
    x: { domain: [0, 24], label: "Hour", side: "top" },
    y: { visible: false },
    z: { scale },
  });
  assert.deepEqual(c.values.xbounds, [0, 24]);
  assert.equal(c.values.axisLabelX, "Hour");
  assert.equal(c.values.frameXSide, "top");
  assert.equal(c.values.frameYShow, false);
  assert.equal(c.scales.z, scale);
  assert.equal(c.values.zScale, undefined);
  assert.throws(() => groupedAxis({ y: { side: "top" } }), /side/);
  assert.throws(() => groupedAxis({ x: { unknown: true } }), /Unknown/);
});
test("histogram normalizations use included observations and each unequal bin width", async () => {
  const s = createDataScope();
  s.update({ v: [0, 0.5, 1, 2, 3, NaN, -1, 5] });
  for (const [normalization, expected] of [
    ["count", [2, 3]],
    ["proportion", [0.4, 0.6]],
    ["density", [0.4, 0.3]],
  ]) {
    const v = await runTransform("Bin", s, {
      x: "v",
      bins: [0, 1, 3],
      normalization,
    });
    const h = Array.from(await v.get("y1").ref.data());
    h.forEach((n, i) => assert.ok(Math.abs(n - expected[i]) < 1e-6));
    assert.deepEqual(Array.from(await v.get("y").ref.data()), h);
    assert.deepEqual(Array.from(await v.get("y0").ref.data()), [0, 0]);
    assert.deepEqual(Array.from(await v.get("count").ref.data()), [2, 3]);
    v.dispose();
  }
  s.dispose();
});
test("horizontal histograms retain empty bins without dividing by zero", async () => {
  const s = createDataScope();
  s.update({ v: [NaN, -1] });
  const v = await runTransform("Bin", s, {
    y: "v",
    bins: [0, 1, 2],
    normalization: "density",
  });
  assert.deepEqual(Array.from(await v.get("x1").ref.data()), [0, 0]);
  assert.deepEqual(Array.from(await v.get("y0").ref.data()), [0, 1]);
  v.dispose();
  // Heights need one binned axis, x or y, aggregated.
  for (const [config, message] of [
    [{ x: "v", y: "v", normalization: "count" }, /bin x alone/],
    [{ z: "v", normalization: "count" }, /bin x alone/],
    [{ x: "v", normalization: "count", mode: "assign" }, /aggregate/],
    [{ x: "v", normalization: "percent" }, /"count", "proportion" or "density"/],
    [{ x: "v", normalization: "count", columns: { y1: "count()" } }, /y1/],
  ])
    await assert.rejects(runTransform("Bin", s, config), message);
  s.dispose();
});
