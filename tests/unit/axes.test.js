import test from "node:test";
import assert from "node:assert/strict";
import { axisTicks, axisValue, axisWorld, automaticTickCount, niceDomain, endStep } from "../../src/lib/plot/utils/axes.js";
const config = (kind, bounds, range) => ({
  child: () => ({get: () => undefined}),
  get: (key) =>
    key === "xTransform" ? kind : key === "xbounds" ? bounds : range,
});
test("axis ticks invert Marks transforms and respect pan, zoom, and reversed ranges", () => {
  for (const [kind, bounds, range] of [
    ["linear", [0, 100], [-50, 50]],
    ["log", [1, 1000], [-50, 50]],
    ["sqrt", [0, 100], [-50, 50]],
    ["linear", [100, 0], [50, -50]],
  ]) {
    const ticks = axisTicks(config(kind, bounds, range), "x", [-25, 25], 480);
    assert.ok(ticks.length);
    const f =
      kind === "log" ? Math.log : kind === "sqrt" ? Math.sqrt : (x) => x;
    for (const tick of ticks) {
      const world =
        range[0] +
        ((f(tick.value) - f(bounds[0])) / (f(bounds[1]) - f(bounds[0]))) *
          (range[1] - range[0]);
      assert.ok(Math.abs(tick.fraction - (world + 25) / 50) < 1e-9);
    }
  }
  assert.deepEqual(
    axisTicks(config("linear", [0, 0], [-50, 50]), "x", [-50, 50], 480),
    [],
  );
});
test("automatic 2D linear axes take denser ticks and round their ends out to ticks (TODO 136.17)", () => {
  const axis = (kind) => ({ viewContext: { mode: "2d" }, child: () => ({ get: () => undefined }), get: (key) => (key.endsWith("Transform") ? kind : undefined) });
  assert.equal(automaticTickCount(axis("linear"), "x", 480), 6);
  assert.equal(automaticTickCount(axis("linear"), "y", 360), 8);
  assert.equal(automaticTickCount(axis("log"), "x", 480), 5);
  // A 3D Surface's axes (axes3d.svelte's proxy carries the view context) keep one per 90 px.
  assert.equal(automaticTickCount({ ...axis("linear"), viewContext: { mode: "3d" } }, "x", 480), 5);
  assert.equal(automaticTickCount({ ...axis("linear"), sparseTicks: true }, "x", 480), 5);
  // A padded [2.1, 47.3] ends on ticks past it; data from 0 (or up to 10) keeps its padded end
  // past the tick at 0 (or 10), not -10 (or 15).
  // The rounding takes no pixels: linked plots or cells of any size round one union alike.
  assert.deepEqual(niceDomain([0.29, 49.11], [2.1, 47.3]), [0, 50]);
  assert.deepEqual(niceDomain([-1.9, 48.9], [0, 47]), [-1.9, 50]);
  assert.deepEqual(niceDomain([-0.4, 10.4], [0, 10]), [-0.4, 10.4]);
  // A kept (baseline) end stays; an explicit step rounds to its multiples.
  assert.deepEqual(niceDomain([0, 48.9], [0, 47], undefined, { keep: [true, false] }), [0, 50]);
  assert.deepEqual(niceDomain([0.29, 49.11], [2.1, 47.3], undefined, { step: 20 }), [0, 60]);
  assert.deepEqual(niceDomain([0.04, 0.96], [0.08, 0.92]), [0, 1]);
  // Ticks on the rounded ends at any density: [0, 35] (step 5) shown with step 10 or 2.
  assert.equal(endStep([0, 35], 10, 39), 5);
  assert.equal(endStep([0, 35], 2, 39), 1);
  assert.equal(endStep([0, 50], 10, 50), 0);
  assert.equal(endStep([0, 35], 10, 200), 0);
});
test("incompatible or degenerate domains produce no ticks instead of throwing", () => {
  for (const [kind, bounds] of [["linear", [0, 0]], ["log", [0, 10]], ["log", [-5, 10]], ["sqrt", [-4, 9]], ["linear", [0, Infinity]]])
    assert.deepEqual(axisTicks(config(kind, bounds, [-50, 50]), "x", [-50, 50], 480), [], `${kind} ${bounds}`);
  assert.deepEqual(axisTicks(config("linear", [0, 10], [5, 5]), "x", [-50, 50], 480), []);
});
test("hover inversion and forward mapping return NaN for an incompatible domain", () => {
  assert.ok(Number.isNaN(axisValue(config("log", [0, 10], [-50, 50]), "x", 0)));
  assert.ok(Number.isNaN(axisWorld(config("linear", [3, 3], [-50, 50]), "x", 3)));
  assert.ok(Math.abs(axisValue(config("log", [1, 100], [-50, 50]), "x", 0) - 10) < 1e-9);
});

test('axis validation reads partial option views and coordinate defaults preserve explicit grids', async () => {
  const { readAxis, validateAxis } = await import('../../src/lib/plot/utils/axes.js');
  const { axisStrokePath, tickOffsets } = await import('../../src/lib/plot/utils/axisStyle.js');
  const theme = { isThemeScope:true, explicit:new Set(['axisXGrid']), get:()=> 'major' };
  const style = { defaults:theme, explicit:new Set(), get:key=>key==='axisXGrid'?'major':undefined };
  assert.doesNotThrow(() => validateAxis(readAxis({child:()=>({get:()=>undefined})},'x')));
  const options = { child:()=>style, get:key=>key==='coordinates'?'spherical':undefined };
  assert.equal(readAxis(options,'x').grid,'off');
  style.explicit.add('axisXGrid');
  assert.equal(readAxis(options,'x').grid,'major');
  assert.deepEqual(tickOffsets({ticks:true,tickSize:5,tickDirection:'both'}),[-5,5]);
  assert.equal(axisStrokePath(0,0,100,0,{line:false,lineWidth:1,arrow:'end',arrowSize:5}),'M100 0 L90 0');
  assert.equal(axisStrokePath(0,0,100,0,{line:true,lineWidth:0,arrow:'end',arrowSize:5}),'');
});

test("axis inspector ranges accept font weights and visible grid widths", async () => {
  const { ensureAxisOptions } = await import("../../src/lib/plot/utils/axisOptions.js");
  const settings = new Map();
  ensureAxisOptions({ ensure: (key, type) => settings.set(key, type.ui()) });
  for (const axis of "XYZ") {
    const weight = settings.get(`axis${axis}TitleFontWeight`), width = settings.get(`axis${axis}GridWidth`);
    assert.deepEqual([weight.min, weight.max, weight.step], [1, 1000, 1]);
    assert.deepEqual([width.min, width.max, width.step], [0, 6, .25]);
  }
});
