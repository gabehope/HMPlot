import test from "node:test";
import assert from "node:assert/strict";
import { Mesh, MeshBasicNodeMaterial } from "three/webgpu";
import { float } from "three/tsl";
import { axisMaskElements, axisMaskPolygons, cartesianMaskSupported, insideAxisMasks, installAxisMask, rectanglePolygon } from "../../src/lib/plot/utils/axisMask.js";
import { copyPickingMaterial } from "../../src/lib/picking/copyPickingMaterial.js";
import { serializeSVG, createExportDocument } from "../../src/lib/plot/utils/exportDocument.js";

const rectangle = (left, right, top, bottom) => rectanglePolygon({ left, right, top, bottom });
const frame = (polygon, parent = null, properties = {}) => ({
  defaults: parent, get: key => ({ coordinates: "cartesian", ...properties })[key],
  viewContext: { mode: properties.mode ?? "2d" },
  frameDefinition: { maskBoundary: () => polygon },
});

test("axis masks intersect independent ancestor boundaries, including reversed and rotated rectangles", () => {
  const root = frame(rectangle(0, 100, 0, 100)), child = frame(rectangle(120, 50, 80, 20), root);
  const polygons = axisMaskPolygons(child, null, 100, 100);
  assert.equal(polygons.length, 2);
  assert.equal(insideAxisMasks([75, 50], polygons), true);
  assert.equal(insideAxisMasks([110, 50], polygons), false);
  assert.equal(insideAxisMasks([25, 50], polygons), false);
  const diamond = [[50, 0], [100, 50], [50, 100], [0, 50]];
  assert.equal(insideAxisMasks([50, 50], [diamond]), true);
  assert.equal(insideAxisMasks([5, 5], [diamond]), false);
  assert.equal(insideAxisMasks([50, 50], [[]]), false);
});

test("theme masks skip curved and 3D frames; a placed Cartesian child starts a rectangular surface", () => {
  const sphere = frame(null, null, { coordinates: "spherical" });
  assert.equal(cartesianMaskSupported(sphere), false);
  assert.equal(cartesianMaskSupported(frame(null, null, { mode: "3d" })), false);
  const child = frame(null, sphere);
  assert.equal(cartesianMaskSupported(child), false);
  child.frameDefinition.placement = { anchor: [0, 0], size: [100, 100] };
  assert.equal(cartesianMaskSupported(child), true);
});

test("beauty and picking materials share fragment masks without rebuilding for changed boundaries", () => {
  let boundary = rectangle(10, 90, 10, 90), calls = 0;
  const options = frame(boundary);
  options.frameDefinition.maskBoundary = () => boundary;
  const mesh = new Mesh(undefined, new MeshBasicNodeMaterial());
  mesh.options = options;
  mesh.onBeforeRender = () => calls++;
  const intrinsic = float(0.5).greaterThan(0);
  mesh.material.maskNode = intrinsic;
  const dispose = installAxisMask(mesh), beauty = mesh.material, node = beauty.maskNode;
  assert.notEqual(node, intrinsic);
  const picking = copyPickingMaterial(new MeshBasicNodeMaterial(), beauty);
  mesh.material = picking;
  const version = picking.version;
  const renderer = { getRenderTarget: () => null, getPixelRatio: () => 2, domElement: { width: 200, height: 200 } };
  mesh.onBeforeRender(renderer, null, null);
  boundary = rectangle(20, 80, 20, 80);
  mesh.onBeforeRender(renderer, null, null);
  boundary = null;
  mesh.onBeforeRender(renderer, null, null);
  assert.equal(calls, 3);
  assert.equal(picking.version, version);
  picking.dispose();
  mesh.material = beauty;
  dispose();
  assert.equal(beauty.maskNode, intrinsic);
  assert.equal(picking.maskNode, intrinsic);
  beauty.dispose();
});

test("vector masks use nested SVG clipPaths so transparent exports intersect ancestor rectangles", () => {
  const document = createExportDocument(100, 100);
  document.elements = axisMaskElements([{ type: "circle", attrs: { cx: 50, cy: 50, r: 80, fill: "red" } }],
    [rectangle(0, 100, 0, 100), rectangle(20, 80, 20, 80)], "mask-test");
  const svg = serializeSVG(document);
  assert.match(svg, /<clipPath id="mask-test-0" clipPathUnits="userSpaceOnUse">/);
  assert.match(svg, /<g clip-path="url\(#mask-test-1\)"><g clip-path="url\(#mask-test-0\)"><circle/);
  assert.doesNotMatch(svg, /<rect/);
});
