import test from "node:test";
import assert from "node:assert/strict";
import { galaxyColumns, galaxyIntensity } from "../../src/examples/ten-million-stars/galaxy.js";
import { createDataScope } from "../../src/lib/plot/utils/categorical.js";
import { runTransform } from "../../src/lib/plot/utils/transforms.js";
import { brushColumn } from "../../src/lib/plot/utils/interaction.js";
import { brushConstraint } from "../../src/lib/plot/utils/brushStrips.js";
import * as expressions from "../../src/lib/plot/utils/expressions.js";
const { less_equal } = expressions;
const columns = galaxyColumns(expressions);
async function galaxy(n) {
  const data = createDataScope();
  data.update(undefined, undefined, { rows: n });
  let population;
  try {
    population = await runTransform("Calculate", data, { columns });
    const scope = await runTransform("Calculate", population, { columns: { intensity: galaxyIntensity(expressions) } });
    return { scope, dispose() { scope.dispose(); population.dispose(); data.dispose(); } };
  } catch (error) { population?.dispose(); data.dispose(); throw error; }
}

test("synthetic galaxy has a thin 3D disk and a varied, predominantly faint stellar population", async () => {
  const generated = await galaxy(20000), repeat = await galaxy(20000);
  try {
    const values = Object.fromEntries(await Promise.all([...Object.keys(columns), "intensity"].map(async k => [k, Array.from(await generated.scope.get(k).ref.data())])));
    for (const a of Object.values(values)) assert.ok(a.length === 20000 && a.every(Number.isFinite));
    assert.deepEqual(values.temperature, Array.from(await repeat.scope.get("temperature").ref.data()));
    const { x, y, z, age, temperature: t, luminosity: l, intensity } = values;
    const count = predicate => t.filter((v, i) => predicate(v, l[i])).length;
    assert.ok(count((t, l) => t < 4500 && l < 0.2) > 12000, "faint red dwarfs dominate counts");
    assert.ok(count((t, l) => t > 8000 && l > 10) > 0, "hot bright main sequence");
    assert.ok(count((t, l) => t < 5000 && l > 10) > 0, "red giants");
    assert.ok(count((t, l) => t > 7000 && l > 0 && l < 0.01) > 0, "white dwarfs");
    assert.ok(age.every(a => a >= 0 && a <= 10));
    assert.ok(intensity.every(v => v >= 0 && v <= 0.851));
    const squareSum = a => a.reduce((s, v) => s + v * v, 0);
    assert.ok(squareSum(y) > 0 && squareSum(y) < (squareSum(x) + squareSum(z)) / 50);
    const radii = x.map((v, i) => Math.hypot(v, z[i]));
    const core = radii.flatMap((r, i) => r < 0.5 ? [i] : []);
    const innerDisk = radii.filter(r => r >= 1 && r < 2).length;
    assert.ok(core.length / 0.5 ** 2 > 3 * innerDisk / (2 ** 2 - 1), "a distinct central density peak");
    assert.ok(core.filter(i => age[i] >= 7).length > core.length * 0.6, "the central bulge is predominantly old");
  } finally { generated.dispose(); repeat.dispose(); }
});

test("a fixed H–R sample retains source identities through age filtering and brushes unsampled stars", async () => {
  const generated = await galaxy(20000), source = generated.scope, views = [];
  const read = async a => { try { return Array.from(await a.ref.data()); } finally { a.dispose(); } };
  let temperature;
  try {
    const sample = await runTransform("Sample", source, { size: 200, seed: 42 }); views.push(sample);
    const repeat = await runTransform("Sample", source, { size: 200, seed: 42 }); views.push(repeat);
    const ids = await read(sample.sourceIndices());
    assert.equal(sample.length, 200);
    assert.equal(sample.identity, source.identity);
    assert.deepEqual(ids, await read(repeat.sourceIndices()));
    const young = await runTransform("Filter", sample, { where: less_equal("age", 1) }); views.push(young);
    const restored = await runTransform("Filter", sample, { where: less_equal("age", 10) }); views.push(restored);
    assert.ok(young.length > 0 && young.length < sample.length);
    assert.ok((await read(young.sourceIndices())).every(id => ids.includes(id)));
    assert.deepEqual(await read(restored.sourceIndices()), ids);
    temperature = brushColumn(restored, "temperature", "x", "hr");
    source.identity.brush.setConstraints(source.identity, [brushConstraint(temperature, { axis: "x" }, 3000, 4500)]);
    const mask = await read(source.get("@brushed").ref), values = await read(source.get("temperature").ref);
    assert.deepEqual(mask, values.map(t => Number(t >= 3000 && t <= 4500)));
    assert.ok(mask.filter(Boolean).length > ids.length, "coordinate brush includes stars outside the sample");
  } finally {
    source.identity.brush.clear(); temperature?.release();
    views.reverse().forEach(view => view.dispose()); generated.dispose();
  }
});
