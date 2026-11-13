import test from "node:test";
import assert from "node:assert/strict";
import { createFrameScale, createFrameDimension, frameDimensionMode } from "../../src/lib/plot/utils/frameMapping.js";
import { groupedAxis, removedAxisProp } from "../../src/lib/plot/utils/axisFrame.js";
const near = (a, b) => assert.ok(Math.abs(a-b) < 1e-9, `${a} != ${b}`);

test("decoration-only children share the exact parent scale", () => {
  const parent = createFrameDimension({domain:[0,100], range:[-1,1]});
  assert.equal(createFrameDimension({label:"Other", show:false}, parent), parent);
  assert.equal(frameDimensionMode({side:"right"}), "inherited");
  const child = createFrameDimension({domain:[0,1]}, parent);
  near(child.forward(.5), parent.forward(50));
  near(child.inverse(parent.forward(25)), .25);
  assert.deepEqual(parent.domain, [0,100]);
});
test("parent-coordinate ranges compose through nonlinear ancestors", () => {
  const root = createFrameDimension({domain:[1,1000], range:[-1,1], transform:"log"});
  const child = createFrameDimension({domain:[0,100], range:[10,100], transform:"linear"}, root);
  near(child.forward(0), -1/3);
  near(child.forward(100), 1/3);
  near(child.forward(50), root.forward(55));
  near(child.inverse(root.forward(55)), 50);
  const grandchild = createFrameDimension({domain:[0,1], range:[20,80], transform:"linear"}, child);
  near(grandchild.forward(.5), child.forward(50));
  near(grandchild.inverse(grandchild.forward(.2)), .2);
});
test("a child with its own domain is linear unless it names a transform; one without inherits", () => {
  const root = createFrameDimension({domain:[1,1000], range:[-1,1], transform:"log"});
  // Own domain, no transform: a linear scale over the parent's extent, not log applied to 0..100.
  const own = createFrameDimension({domain:[0,100]}, root);
  assert.equal(own.transform, "linear");
  near(own.forward(0), -1);
  near(own.forward(50), 0);
  near(own.inverse(.5), 75);
  // Composed through a parent-coordinate range, the child is linear and the parent stays log.
  const ranged = createFrameDimension({domain:[0,100], range:[10,100]}, root);
  near(ranged.forward(50), root.forward(55));
  // An explicit transform still wins.
  const logChild = createFrameDimension({domain:[1,100], transform:"log"}, root);
  assert.equal(logChild.transform, "log");
  near(logChild.forward(10), 0);
  // No domain: a range-only child infers its domain and keeps the parent's transform.
  const inherited = createFrameDimension({range:[10,100]}, root, [1,10]);
  assert.equal(inherited.transform, "log");
  near(inherited.forward(Math.sqrt(10)), root.forward(55));
  assert.equal(createFrameDimension({label:"Decoration only"}, root), root);
});
test("automatic and reversed domains preserve extent and inverse mapping", () => {
  const parent = createFrameDimension({domain:[0,100], range:[-10,10]});
  const auto = createFrameDimension({domain:"auto"}, parent, [10,20]);
  near(auto.forward(15), 0);
  const reversed = createFrameDimension({domain:[100,0], range:[80,20]}, parent);
  near(reversed.forward(75), 3);
  near(reversed.inverse(3), 75);
  assert.throws(() => createFrameDimension({domain:"auto"}, parent), /not ready/);
  assert.throws(() => createFrameScale({domain:[0,1],range:[0,1],transform:"log"}), /incompatible/);
  assert.throws(() => createFrameScale({domain:[1,1],range:[0,1]}), /distinct/);
});
test("automatic domain syntax is explicit and the removed flat spellings say where they went", () => {
  assert.deepEqual(groupedAxis({x:{domain:"auto", label:"X"}}, {allowAuto:true}).values, {axisLabelX:"X"});
  assert.throws(() => groupedAxis({x:{domain:"auto"}}), /finite/);
  // A Plot's x, y and z are its only axis API (R2.0): the flat spellings name where they went.
  assert.equal(removedAxisProp("xbounds"), "set x={{ domain }}");
  assert.equal(removedAxisProp("yScale"), "set y={{ scale }}");
  assert.equal(removedAxisProp("axisLabelZ"), "set z={{ label }}");
  assert.equal(removedAxisProp("zoomAxis"), undefined);
});

test('runtime chains retain nonlinear parent mapping and collapse affine chains', async () => {
  const {frameDimensionStages,frameDimensionMapping}=await import('../../src/lib/plot/utils/frameMapping.js');
  const values={xbounds:[1,1000],xrange:[-1,1],xTransform:'log'};
  const parent={get:k=>values[k]};
  const childValues={xbounds:[0,100],xrange:[-1/3,1/3],xTransform:'linear',_frameXRange:[10,100]};
  const child={get:k=>childValues[k],frameDefinition:{parent,owns:()=>true,ranges:new Set(['x'])}};
  const mapping=frameDimensionMapping(child,'x');
  near(mapping.forward(50),-1+2*Math.log(55)/Math.log(1000));
  near(mapping.inverse(mapping.forward(25)),25);
  assert.equal(frameDimensionStages(child,'x').length,2);
  values.xTransform='linear';
  assert.equal(frameDimensionStages(child,'x').length,1);
});

test('anchored frame rotation uses CSS pixels and has an exact inverse', async () => {
  const {Matrix4,OrthographicCamera}=await import('three/webgpu');
  const {resolvePlacement,framePoint,framePointInverse}=await import('../../src/lib/plot/utils/framePlacement.js');
  const parent={get:k=>k.endsWith('bounds')?[0,100]:k.endsWith('range')?[-50,50]:'linear'};
  const definition={parent,owns:()=>true,ranges:new Set(),placement:{anchor:[35,65,50],size:[160,100],rotation:[0,0,90]},mode:()=> '2d',matrix:new Matrix4(),inverse:new Matrix4()};
  const child={get:k=>k.endsWith('bounds')?[0,10]:k.endsWith('range')?[-1,1]:'linear',frameDefinition:definition};
  const camera=new OrthographicCamera(-50,50,30,-30,.1,1000);camera.position.z=10;camera.updateMatrixWorld();
  for(const zoom of [1,2]) {
    camera.zoom=zoom;camera.updateProjectionMatrix();
    definition.matrix.copy(resolvePlacement(definition,camera,650,420));definition.inverse.copy(definition.matrix).invert();
    const a=framePoint(child,[0,0,5]),b=framePoint(child,[10,10,5]);
    near((a[0]-b[0])*camera.projectionMatrix.elements[0]*650/2,100);
    near((b[1]-a[1])*camera.projectionMatrix.elements[5]*420/2,160);
    framePointInverse(child,a).forEach((v,i)=>near(v,[0,0,5][i]));
  }
});

test("frame placement descriptors are versioned and legacy ones still validate", async () => {
  const { validatePlacement, FRAME_PLACEMENT_VERSION } = await import("../../src/lib/plot/utils/framePlacement.js");
  const dims = [{}, {}, {}];
  assert.equal(FRAME_PLACEMENT_VERSION, 1);
  validatePlacement({ anchor: [0, 0], size: [10, 10] }, dims);
  validatePlacement({ version: 1, anchor: [0, 0], size: [10, 10] }, dims);
  for (const [version, shown] of [[2, "2"], [0, "0"], ["1", '"1"'], [null, "null"]])
    assert.throws(() => validatePlacement({ version, anchor: [0, 0], size: [10, 10] }, dims),
      { message: `Frame: unsupported placement version ${shown}; expected 1.` });
});

// TODO 130.1: placement="fit" centers a frame in its Cartesian parent's domain, across 90% of the
// shorter side: pixels from the camera in 2D, world units in 3D.
test('placement="fit" centers in the parent domain across 90% of its shorter side', async () => {
  const { validatePlacement, fitPlacement } = await import("../../src/lib/plot/utils/framePlacement.js");
  const parent = (values) => ({ get: (key) => ({ coordinates: "cartesian", xbounds: [0, 10], ybounds: [1, 100],
    xTransform: "linear", yTransform: "log", xrange: [-1, 1], yrange: [-0.5, 0.5], ...values })[key] });
  validatePlacement("fit", [{}, {}, {}], parent());
  assert.throws(() => validatePlacement("fit", [{}, {}, {}], parent({ coordinates: "polar" })), /needs a Cartesian parent/);
  assert.throws(() => validatePlacement("fit", [{ range: [0, 1] }, {}, {}], parent()), /cannot be combined/);
  // A camera showing x in [-1, 1] and y in [-1, 1] over 400 by 200 pixels: the parent is
  // 400 by 100 pixels, so the frame is 90 pixels square at (5, 10).
  const camera = { projectionMatrix: { elements: [1, 0, 0, 0, 0, 1] } };
  const flat = fitPlacement(parent(), "2d", 400, 200, camera);
  assert.deepEqual(flat.size, [90, 90]);
  assert.deepEqual(flat.anchor.map((v) => Math.round(v * 1e9) / 1e9), [5, 10]);
  assert.equal(fitPlacement(parent(), "2d", 0, 0, camera), null);
  // In 3D: world units, centered on z too; a sqrt axis's middle is its visual middle.
  const deep = fitPlacement(parent({ xrange: [-20, 20], yrange: [-10, 10], zbounds: [0, 100], zTransform: "sqrt", zrange: [-1, 1] }), "3d");
  assert.deepEqual(deep.size, [18, 18]);
  assert.ok(Math.abs(deep.anchor[2] - 25) < 1e-9, String(deep.anchor[2]));
  assert.deepEqual(fitPlacement(parent(), "3d").size, [0.9, 0.9]);
  // Inside a frame anchored at 100 by 60 pixels, the parent's [-1, 1] spans those pixels.
  const inset = { ...parent({ xrange: [-1, 1], yrange: [-1, 1] }), frameDefinition: { placement: { anchor: [0, 0], size: [100, 60] } } };
  assert.deepEqual(fitPlacement(inset, "2d", 400, 200, camera).size, [54, 54]);
});

// A placement written by one side must validate on the other, so the versions must match.
test("the JavaScript and Python placement versions agree", async () => {
  const { readFileSync } = await import("node:fs");
  const { FRAME_PLACEMENT_VERSION } = await import("../../src/lib/plot/utils/framePlacement.js");
  const source = readFileSync(new URL("../../python/hmplot/core.py", import.meta.url), "utf8");
  assert.equal(Number(source.match(/^FRAME_PLACEMENT_VERSION = (\d+)$/m)[1]), FRAME_PLACEMENT_VERSION);
});

test("tryFrameDimensionMapping swallows only degenerate bounds and re-throws other errors", async () => {
  const { tryFrameDimensionMapping } = await import("../../src/lib/plot/utils/frameMapping.js");
  const options = (transform, bounds, range = [-50, 50]) =>
    ({ get: (key) => ({ xTransform: transform, xbounds: bounds, xrange: range })[key] });
  for (const [transform, bounds, range] of [["log", [0, 10]], ["log", [-5, 10]], ["sqrt", [-4, 9]], ["linear", [3, 3]], ["linear", [0, Infinity]], ["linear", [0, 10], [5, 5]]])
    assert.equal(tryFrameDimensionMapping(options(transform, bounds, range), "x"), null, `${transform} ${bounds} ${range ?? ""}`);
  assert.throws(() => tryFrameDimensionMapping(options("cubic", [0, 10]), "x"), /Unsupported frame transform: cubic/);
  near(tryFrameDimensionMapping(options("log", [1, 100]), "x").forward(10), 0);
});

// Stage 18.2: invert is a reversed output range, so domain[0] lands at the far end and the
// mapping still round-trips; groupedAxis carries the flag as <axis>Invert.
test("an inverted axis reverses the range and round-trips", async () => {
  const { createFrameScale } = await import("../../src/lib/plot/utils/frameMapping.js");
  const { groupedAxis } = await import("../../src/lib/plot/utils/axisFrame.js");
  const scale = createFrameScale({ domain: [0, 100], range: [50, -50], transform: "linear" });
  assert.equal(scale.forward(0), 50);
  assert.equal(scale.forward(100), -50);
  assert.equal(scale.inverse(scale.forward(25)), 25);
  const log = createFrameScale({ domain: [1, 100], range: [1, -1], transform: "log" });
  assert.ok(Math.abs(log.forward(10)) < 1e-9);
  const grouped = groupedAxis({ y: { invert: true, domain: [0, 10] } });
  assert.equal(grouped.values.yInvert, true);
  assert.deepEqual(grouped.values.ybounds, [0, 10]);
  assert.throws(() => groupedAxis({ x: { invert: "yes" } }), /invert must be true or false/);
});
