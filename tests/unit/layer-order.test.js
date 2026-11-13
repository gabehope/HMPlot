import test from "node:test";
import assert from "node:assert/strict";
import {
  documentOrder, isDrawingObject, LayerSlot, LayerRegistry, mergeRenderList, hookRenderLists,
  renderListsHooked, layerRegistry, registryOf, setLayeredScene, isLayeredScene,
} from "../../src/lib/plot/utils/layerOrder.js";

// Fake DOM nodes: `at` is the document position.
const node = (at) => ({ at, compareDocumentPosition(other) { return other.at > this.at ? 4 : other.at < this.at ? 2 : 0; } });
const drawing = (name) => ({ name, isObject3D: true, isPlotObject: true, material: {}, renderOrder: 0 });
const settle = () => new Promise((resolve) => queueMicrotask(resolve));
const orders = (objects) => objects.map((object) => object.renderOrder);

test("documentOrder sorts nodes by document position", () => {
  const nodes = [node(3), node(1), node(2)];
  assert.deepEqual(nodes.sort(documentOrder).map((n) => n.at), [1, 2, 3]);
  const same = node(5);
  assert.equal(documentOrder(same, same), 0);
});

test("only drawing objects take part", () => {
  assert.equal(isDrawingObject(drawing("a")), true);
  assert.equal(isDrawingObject({ isObject3D: true, material: {}, options: {} }), true, "Text3D meshes carry options");
  assert.equal(isDrawingObject({ isObject3D: true, isGroup: true }), false);
  assert.equal(isDrawingObject({ isObject3D: true, material: {} }), false, "no plot object, no options");
  assert.equal(isDrawingObject(null), false);
});

test("slots number their objects in document order, not attach or creation order", async () => {
  const scene = {};
  setLayeredScene(scene, true);
  const registry = new LayerRegistry(scene);
  // Created late (a delayed Routes Segments), but declared first.
  const [early, late] = [new LayerSlot(), new LayerSlot()];
  const lateObject = drawing("nodes"), earlyObject = drawing("edges");
  late.add(late.nextSub(), lateObject);
  registry.attach(late, node(20));
  await settle();
  assert.equal(lateObject.renderOrder, 0);
  early.add(early.nextSub(), earlyObject);
  registry.attach(early, node(10));
  await settle();
  assert.deepEqual(orders([earlyObject, lateObject]), [0, 1]);
  assert.deepEqual(registry.ordered(), [earlyObject, lateObject]);
});

test("sub-indices keep template order inside one slot, and a replacement keeps its place", async () => {
  const scene = {};
  setLayeredScene(scene, true);
  const registry = new LayerRegistry(scene), slot = new LayerSlot(), other = new LayerSlot();
  registry.attach(slot, node(1));
  registry.attach(other, node(2));
  const [faces, lines, points] = [slot.nextSub(), slot.nextSub(), slot.nextSub()];
  const objects = { points: drawing("points"), lines: drawing("lines"), faces: drawing("faces") };
  const after = drawing("after");
  // Registration order differs from template order.
  slot.add(points, objects.points);
  other.add(other.nextSub(), after);
  const releaseLines = slot.add(lines, objects.lines);
  slot.add(faces, objects.faces);
  await settle();
  assert.deepEqual(orders([objects.faces, objects.lines, objects.points, after]), [0, 1, 2, 3]);
  // The lines object is replaced (a rebuilt drawing object): same sub-index, same place.
  releaseLines();
  const replacement = drawing("lines2");
  slot.add(lines, replacement);
  await settle();
  assert.deepEqual(orders([objects.faces, replacement, objects.points, after]), [0, 1, 2, 3]);
  assert.equal(objects.lines.renderOrder, 0, "a released object returns to the default order");
});

test("a scene that is not layered (3D) keeps renderOrder 0; switching restores layers", async () => {
  const scene = {};
  const registry = new LayerRegistry(scene), a = new LayerSlot(), b = new LayerSlot();
  const first = drawing("first"), second = drawing("second");
  a.add(a.nextSub(), first);
  b.add(b.nextSub(), second);
  registry.attach(a, node(1));
  registry.attach(b, node(2));
  await settle();
  assert.deepEqual(orders([first, second]), [0, 0]);
  setLayeredScene(scene, true);
  registry.changed();
  await settle();
  assert.equal(isLayeredScene(scene), true);
  assert.deepEqual(orders([first, second]), [0, 1]);
  setLayeredScene(scene, false);
  registry.changed();
  await settle();
  assert.deepEqual(orders([first, second]), [0, 0]);
});

test("changes batch into one sort; a clean flush is a no-op", async () => {
  const scene = {};
  setLayeredScene(scene, true);
  let invalidations = 0;
  const registry = new LayerRegistry(scene, { invalidate: () => invalidations++ });
  const slots = [3, 1, 2].map((at) => {
    const slot = new LayerSlot();
    slot.add(slot.nextSub(), drawing(String(at)));
    registry.attach(slot, node(at));
    return slot;
  });
  await settle();
  assert.equal(registry.sorts, 1);
  assert.equal(invalidations, 1);
  assert.equal(registry.flush(), false);
  assert.equal(registry.sorts, 1, "nothing pending: no sort");
  // A keyed move: the DOM order changes and the observer reports it.
  slots[0].node.at = 0;
  registry.changed();
  registry.changed();
  await settle();
  assert.equal(registry.sorts, 2);
  assert.deepEqual(registry.ordered().map((o) => o.name), ["3", "1", "2"]);
  // Flushing from inside a render applies the order without requesting another frame.
  slots[0].node.at = 9;
  registry.changed();
  assert.equal(registry.flush({ rendering: true }), true);
  assert.equal(invalidations, 2);
});

test("detaching a slot releases its objects and renumbers the rest", async () => {
  const scene = {};
  setLayeredScene(scene, true);
  const registry = new LayerRegistry(scene), a = new LayerSlot(), b = new LayerSlot();
  const first = drawing("first"), second = drawing("second");
  a.add(a.nextSub(), first);
  b.add(b.nextSub(), second);
  registry.attach(a, node(1));
  registry.attach(b, node(2));
  await settle();
  assert.deepEqual(orders([first, second]), [0, 1]);
  registry.detach(a);
  await settle();
  assert.deepEqual(orders([first, second]), [0, 0]);
  assert.equal(registry.slots.length, 0 + 1);
  assert.equal(a.registry, null);
});

test("mergeRenderList moves opaque items into the transparent list for layered scenes only", () => {
  const layered = {}, native = {};
  setLayeredScene(layered, true);
  const list = (scene) => ({ scene, opaque: ["rect", "points"], transparent: ["ribbon"] });
  const a = list(layered), b = list(native);
  assert.equal(mergeRenderList(a), true);
  assert.deepEqual(a, { scene: layered, opaque: [], transparent: ["ribbon", "rect", "points"] });
  assert.equal(mergeRenderList(b), false);
  assert.deepEqual(b.opaque, ["rect", "points"]);
});

test("hookRenderLists wraps RenderList#finish once and merges after it", () => {
  class RenderList {
    constructor(scene) { this.scene = scene; this.opaque = []; this.transparent = []; this.finished = 0; }
    finish() { this.finished++; }
  }
  const lists = new Map(), camera = {};
  const renderer = { _renderLists: { get: (scene) => lists.get(scene) ?? lists.set(scene, new RenderList(scene)).get(scene) } };
  const scene = {}, other = {};
  setLayeredScene(scene, true);
  assert.equal(renderListsHooked(renderer, scene, camera), false);
  assert.equal(hookRenderLists(renderer, scene, camera), true);
  assert.equal(hookRenderLists(renderer, scene, camera), true, "idempotent");
  assert.equal(renderListsHooked(renderer, scene, camera), true);
  const list = renderer._renderLists.get(scene), otherList = renderer._renderLists.get(other);
  list.opaque.push("rect");
  otherList.opaque.push("rect");
  list.finish();
  otherList.finish();
  assert.deepEqual([list.finished, list.opaque, list.transparent], [1, [], ["rect"]]);
  assert.deepEqual([otherList.finished, otherList.opaque], [1, ["rect"]]);
  // Before init the renderer has no lists: nothing to hook yet.
  assert.equal(hookRenderLists({ _renderLists: null }, scene, camera), false);
  // A three upgrade that renames finish() must fail loudly, not silently lose the merge.
  const broken = { _renderLists: { get: () => Object.create({}) } };
  assert.throws(() => hookRenderLists(broken, scene, camera), /three's RenderList has no finish\(\)/);
});

test("layerRegistry is one per scene and flushes before each render of it", async () => {
  class RenderList { constructor(scene) { this.scene = scene; this.opaque = []; this.transparent = []; } finish() {} }
  const scene = { onBeforeRender() { this.before = (this.before ?? 0) + 1; } };
  let frames = 0;
  const renderer = { domElement: null, _renderLists: { get: (s) => new RenderList(s) } };
  const registry = layerRegistry(scene, renderer, () => frames++);
  assert.equal(layerRegistry(scene, renderer, () => frames++), registry);
  assert.equal(registryOf(scene), registry);
  setLayeredScene(scene, true);
  const slot = new LayerSlot(), object = drawing("a"), later = new LayerSlot(), laterObject = drawing("b");
  slot.add(slot.nextSub(), object);
  later.add(later.nextSub(), laterObject);
  registry.attach(later, node(2));
  registry.attach(slot, node(1));
  // A render in the same task, before the microtask: already ordered, no extra frame.
  scene.onBeforeRender(renderer, scene, {});
  assert.deepEqual(orders([object, laterObject]), [0, 1]);
  assert.equal(scene.before, 1, "the scene's own onBeforeRender still runs");
  assert.equal(frames, 0);
  assert.equal(renderListsHooked(renderer, scene, {}), true);
  await settle();
  assert.equal(registry.sorts, 1);
});
