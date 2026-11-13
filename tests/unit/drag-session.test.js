import test from "node:test";
import assert from "node:assert/strict";
import { createDataScope } from "../../src/lib/plot/utils/categorical.js";
import { selection } from "../../src/lib/plot/utils/interaction.js";
import { moved, log, multiply, greater, square, mean as meanOf, sum } from "../../src/lib/plot/utils/expressions.js";
import { resolveChannel } from "../../src/lib/plot/interaction/channelWriteback.js";
import { startDrag, rowOf, tableRow, sumShares } from "../../src/lib/plot/utils/dragSession.js";
import { runTransform } from "../../src/lib/plot/utils/transforms.js";
import { createViewServices } from "../../src/lib/plot/utils/viewServices.ts";

const table = (columns, key) => {
  const scope = createDataScope(key ? { key } : {});
  scope.update(columns);
  return scope;
};
const channels = (scope, values) => Object.fromEntries(Object.entries(values)
  .map(([axis, value]) => [axis, { value, lineage: resolveChannel(scope, value) }]));
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-4, `${actual} vs ${expected}`);

test("a drag moves the grabbed row's column by the pointer's change, from its start each time", async () => {
  const scope = table({ w: [1, 2, 3], v: [5, 6, 7] });
  const session = await startDrag({ scope, row: 1, channels: channels(scope, { x: moved("w"), y: moved("v") }), origin: { x: 2.5, y: 6 } });
  assert.deepEqual(session.move({ x: 4.5, y: 6 }), { w: [2] });
  session.write(session.move({ x: 5.5, y: 5 }));
  close(scope.identity.offsets.value("w", 1), 3);
  close(scope.identity.offsets.value("v", 1), -1);
  // Nothing moved: nothing to write.
  assert.equal(session.move({ x: 5.5, y: 5 }), null);
  assert.deepEqual(session.changes(), { w: 3, v: -1 });
  session.end();
  scope.dispose();
});

test("a drag inverts nonlinear channels and Calculate columns down to the table column", async () => {
  const scope = table({ w: [1, 2, 4] });
  // log(moved(w)): grabbed at its center, the row lands where the pointer is.
  const logged = await startDrag({ scope, row: 2, channels: channels(scope, { x: log(moved("w")) }), origin: { x: Math.log(4) } });
  logged.write(logged.move({ x: Math.log(8) }));
  close(scope.identity.offsets.value("w", 2), 4);
  logged.end(true);
  assert.equal(scope.identity.offsets.value("w", 2), 0, "Escape restores the offsets from the start");

  const filtered = await runTransform("Filter", scope, { where: greater("w", 1) });
  const sorted = await runTransform("Sort", filtered, { by: "w", order: "desc" });
  const calculated = await runTransform("Calculate", sorted, { columns: { z: multiply(moved("w"), 2) } });
  assert.equal(await tableRow(calculated, 0), 2);
  assert.equal(await rowOf(calculated, 1), 1);
  const chained = await startDrag({ scope: calculated, row: 0, channels: channels(calculated, { x: "z" }), origin: { x: 8 } });
  chained.write(chained.move({ x: 10 }));
  close(scope.identity.offsets.value("w", 2), 1);
  chained.end();
  for (const view of [filtered, sorted, calculated]) view.dispose();
  scope.dispose();
});

test("a selected row drags every selected row by the same change; another drags alone", async () => {
  const scope = table({ id: ["a", "b", "c"], w: [1, 2, 3] }, "id");
  const selected = selection();
  selected.owner = scope.identity;
  selected.replace(scope.identity, [0, 2]);
  scope.identity.offsets.set("w", [0], 10);
  const together = await startDrag({ scope, row: 2, channels: channels(scope, { x: moved("w") }), origin: { x: 3 }, selection: selected });
  assert.deepEqual(together.rows, [0, 2]);
  together.write(together.move({ x: 5 }));
  assert.deepEqual([...scope.identity.offsets.host("w")], [12, 0, 2]);
  together.end();
  const alone = await startDrag({ scope, row: 1, channels: channels(scope, { x: moved("w") }), origin: { x: 2 }, selection: selected });
  assert.deepEqual(alone.rows, [1]);
  alone.end();
  selected.dispose();
  scope.dispose();
});

test("a folded value drags the field its row's key names", async () => {
  const scope = table({ w: [1, 2], v: [5, 6] });
  const folded = await runTransform("Fold", scope, { fields: ["w", "v"] });
  // Row 3 is field v of table row 1.
  const session = await startDrag({ scope: folded, row: 3, channels: channels(folded, { y: "value" }), origin: { y: 6 } });
  session.write(session.move({ y: 7.5 }));
  close(scope.identity.offsets.value("v", 1), 1.5);
  assert.deepEqual(scope.identity.offsets.columns(), ["v"]);
  session.end();
  // A Calculate above the Fold reads the row's own field's copy of its table row: square's
  // branch is b's sign (3), not a's (-2).
  const signs = table({ a: [-2, 1.2], b: [3, 7.7] });
  const pair = await runTransform("Fold", signs, { fields: ["a", "b"] });
  const squared = await runTransform("Calculate", pair, { columns: { s: square("value") } });
  const across = await startDrag({ scope: squared, row: 2, channels: channels(squared, { x: "s" }), origin: { x: 9 } });
  assert.deepEqual(across.move({ x: 16 }), { b: [1] });
  across.end();
  for (const view of [folded, squared, pair]) view.dispose();
  scope.dispose();
  signs.dispose();
});

test("a drag keeps its last valid offset where the pointer has no data value or no inverse reaches it", async () => {
  const scope = table({ w: [1, 2] });
  // Two channels on one column: the first drags it.
  const session = await startDrag({ scope, row: 0, channels: channels(scope, { x: moved("w"), y: moved("w") }), origin: { x: 1, y: 1 } });
  assert.deepEqual(session.axes.map((axis) => axis.axis), ["x"]);
  session.end();
  const logged = await startDrag({ scope, row: 0, channels: channels(scope, { x: log(moved("w")) }), origin: { x: 0 } });
  logged.write(logged.move({ x: 1 }));
  const before = scope.identity.offsets.value("w", 0);
  assert.equal(logged.move({ x: undefined }), null);
  assert.equal(logged.move({ x: Infinity }), null);
  assert.equal(scope.identity.offsets.value("w", 0), before);
  logged.end();
  scope.dispose();
});

test("an aggregate's row drags its members: a mean by the change, a sum in proportion (decision 1)", async () => {
  const scope = table({ g: ["a", "a", "b"], w: [1, 3, 10] });
  const renamed = await runTransform("Calculate", scope, { columns: { w2: moved("w") } });
  const grouped = await runTransform("Group", renamed, { by: "g", columns: { m: meanOf("w2"), s: sum("w") } });
  const mean = await startDrag({ scope: grouped, row: 0, channels: channels(grouped, { y: "m" }), origin: { y: 2 } });
  assert.deepEqual(mean.rows, [0, 1]);
  assert.equal(mean.grabbed, null);
  mean.write(mean.move({ y: 4 }));
  assert.deepEqual([...scope.identity.offsets.host("w")], [2, 2, 0]);
  assert.deepEqual(mean.changes(), { w: 2 });
  mean.end(true);

  const summed = await startDrag({ scope: grouped, row: 0, channels: channels(grouped, { y: "s" }), origin: { y: 4 } });
  summed.write(summed.move({ y: 8 }));
  assert.deepEqual([...scope.identity.offsets.host("w")], [1, 3, 0], "[1, 3] +4 in proportion");
  // Dragging down stops where the total reaches zero: no member goes past it.
  summed.write(summed.move({ y: -20 }));
  assert.deepEqual([...scope.identity.offsets.host("w")], [-1, -3, 0]);
  summed.end();
  for (const view of [renamed, grouped]) view.dispose();
  scope.dispose();
});

test("a sum splits in proportion, or equally when the total is 0 or the signs are mixed", () => {
  assert.deepEqual(sumShares([1, 9]), { shares: [0.1, 0.9], limit: -10 });
  assert.deepEqual(sumShares([-1, -3]), { shares: [0.25, 0.75], limit: 4 });
  assert.deepEqual(sumShares([-2, 4]), { shares: [0.5, 0.5] });
  assert.deepEqual(sumShares([0, 0]), { shares: [0.5, 0.5] });
  // The sum skips values that are not finite: they take no share.
  assert.deepEqual(sumShares([1, 9, NaN]), { shares: [0.1, 0.9, 0], limit: -10 });
});

test("a bin's center moves its members, and a reduction of a computed column cannot be dragged", async () => {
  const scope = table({ w: [1, 1.5, 8] });
  const binned = await runTransform("Bin", scope, { x: "w", bins: [0, 5, 10] });
  const session = await startDrag({ scope: binned, row: 0, channels: channels(binned, { x: "x" }), origin: { x: 2.5 } });
  assert.deepEqual(session.rows, [0, 1]);
  session.write(session.move({ x: 3.5 }));
  assert.deepEqual([...scope.identity.offsets.host("w")], [1, 1, 0]);
  session.end();
  const doubled = await runTransform("Calculate", scope, { columns: { d: multiply(moved("w"), 2) } });
  const grouped = await runTransform("Group", doubled, { by: "w", columns: { m: meanOf("d") } });
  assert.equal(resolveChannel(grouped, "m").reason, "Group reduces d, which is computed; reduce the column a drag should move");
  // A weighted Bin's sum weighs its members, which a drag does not: it cannot be dragged.
  const weights = table({ w: [1, 1.5, 8], k: [2, 2, 1] });
  const weighted = await runTransform("Bin", weights, { x: "w", bins: [0, 5, 10], weight: "k", columns: { s: sum("w") } });
  assert.match(String(resolveChannel(weighted, "s").reason), /computed by Bin/);
  assert.equal(resolveChannel(weighted, "x").reason, undefined, "its center still drags");
  weighted.dispose(); weights.dispose();
  for (const view of [binned, doubled, grouped]) view.dispose();
  scope.dispose();
});

test("a 3D drag moves on the plane its axes span, or on the view's", async () => {
  const { dragPlane } = await import("../../src/lib/plot/utils/dragRouter.js");
  const { Vector3, PerspectiveCamera } = await import("three/webgpu");
  const camera = new PerspectiveCamera();
  camera.position.set(0, 0, 10);
  camera.lookAt(0, 0, 0);
  const point = new Vector3(1, 2, 3);
  const round = (v) => [v.x, v.y, v.z].map((c) => Math.round(c * 1e6) / 1e6 + 0);
  // x and z drag: the plane they span (normal y) through the point.
  const xz = dragPlane(point, camera, [new Vector3(1, 0, 0), new Vector3(0, 0, 1)]);
  assert.deepEqual(round(xz.normal).map(Math.abs), [0, 1, 0]);
  assert.ok(Math.abs(xz.distanceToPoint(point)) < 1e-9);
  // One axis: the plane through it that faces the camera most (here the view plane).
  assert.deepEqual(round(dragPlane(point, camera, [new Vector3(1, 0, 0)]).normal), [0, 0, -1]);
  assert.deepEqual(round(dragPlane(point, camera).normal), [0, 0, -1]);
});

// The drag router on a stand-in canvas (CODEX_REVIEW #5): presses whose pick (and session) the
// test resolves when it chooses, plot controls, pointer capture and the router's frames.
async function routerHarness() {
  const { dragRouter } = await import("../../src/lib/plot/utils/dragRouter.js");
  const { PerspectiveCamera, Vector3 } = await import("three/webgpu");
  const saved = ["window", "PointerEvent", "requestAnimationFrame", "cancelAnimationFrame"].map((key) => [key, globalThis[key]]);
  globalThis.window = new EventTarget();
  globalThis.PointerEvent = class extends Event {
    constructor(type, init = {}) {
      super(type, init);
      for (const key of ["pointerId", "button", "isPrimary", "clientX", "clientY", "shiftKey"]) this[key] = init[key];
    }
  };
  globalThis.requestAnimationFrame = (f) => setTimeout(f, 0);
  globalThis.cancelAnimationFrame = clearTimeout;
  const canvas = Object.assign(new EventTarget(), {
    style: {}, captured: null,
    setPointerCapture(id) { this.captured = id; },
    releasePointerCapture() { this.captured = null; },
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }),
  });
  const renderer = { domElement: canvas }, controls = { enabled: true }, navigation = createViewServices().navigation, picks = [];
  navigation.controls.install(controls);
  const picking = { pickAt: () => new Promise((resolve, reject) => picks.push({ resolve, reject })), axisValue: ([x, y]) => ({ x, y }) };
  const camera = new PerspectiveCamera();
  camera.position.set(0, 0, 10);
  camera.updateMatrixWorld();
  const router = dragRouter(renderer, picking, () => camera, navigation), mark = {}, sessions = [];
  const entry = {
    draggable: () => true,
    options: () => ({}),
    start: () => new Promise((resolve) => {
      const session = { ended: null, writes: 0, layer: { beginDrag() {}, endDrag() {} }, move: (at) => at && { x: [at.x] },
        write() { session.writes++; }, end(cancelled) { session.ended = cancelled; } };
      sessions.push({ session, resolve: () => resolve(session) });
    }),
  };
  const pointer = (type, x = 50) => canvas.dispatchEvent(new PointerEvent(type, { pointerId: 1, button: 0, isPrimary: true, clientX: x, clientY: 50 }));
  const up = () => window.dispatchEvent(new PointerEvent("pointerup", { pointerId: 1, button: 0, isPrimary: true, clientX: 60, clientY: 50 }));
  const escape = () => window.dispatchEvent(Object.assign(new Event("keydown"), { key: "Escape" }));
  const settle = () => new Promise((resolve) => setTimeout(resolve, 5));
  const hit = { object: mark, instanceId: 0, point: new Vector3(0, 0, 0) };
  const restore = () => saved.forEach(([key, value]) => (globalThis[key] = value));
  return { router, renderer, controls, canvas, picks, sessions, mark, entry, pointer, up, escape, settle, hit, restore };
}

test("a press cancelled while its pick is pending is given back, and the next press drags", async () => {
  const h = await routerHarness();
  try {
    h.router.add(h.mark, h.entry);
    // pointercancel, then Escape, before the pick resolves: the late hit is dropped.
    for (const cancel of [() => h.pointer("pointercancel"), h.escape]) {
      h.pointer("pointerdown");
      cancel();
      h.picks.at(-1).resolve(h.hit);
      await h.settle();
      assert.equal(h.controls.enabled, true);
      assert.equal(h.canvas.captured, null);
      assert.equal(h.sessions.length, 0);
    }
    // The next press picks again and drags.
    h.pointer("pointerdown");
    assert.equal(h.picks.length, 3);
    h.picks.at(-1).resolve(h.hit);
    await h.settle();
    assert.equal(h.controls.enabled, false);
    assert.equal(h.canvas.captured, 1);
    h.sessions[0].resolve();
    h.pointer("pointermove", 60);
    await h.settle();
    assert.ok(h.router.dragging);
    h.up();
    await h.settle();
    assert.equal(h.sessions[0].session.ended, false);
    assert.equal(h.controls.enabled, true);
  } finally {
    h.restore();
  }
});

test("a drag cancelled while its session starts, a failed pick and a mark removed while picking all give the press back", async () => {
  const h = await routerHarness();
  try {
    const stop = h.router.add(h.mark, h.entry);
    // Escape while the session starts: controls and capture come back; the session never begins.
    h.pointer("pointerdown");
    h.picks.at(-1).resolve(h.hit);
    await h.settle();
    h.escape();
    h.sessions[0].resolve();
    await h.settle();
    assert.equal(h.controls.enabled, true);
    assert.equal(h.canvas.captured, null);
    assert.equal(h.router.dragging, false);
    // A failed pick is a miss; the next press picks.
    h.pointer("pointerdown");
    h.picks.at(-1).reject(Error("lost"));
    await h.settle();
    h.up();
    h.pointer("pointerdown");
    assert.equal(h.picks.length, 3);
    // The mark is removed while it is picked: its hit is a miss, and a mark added later drags.
    stop();
    h.picks.at(-1).resolve(h.hit);
    await h.settle();
    h.up();
    assert.equal(h.controls.enabled, true);
    h.router.add(h.mark, h.entry);
    h.pointer("pointerdown");
    assert.equal(h.picks.length, 4);
    h.picks.at(-1).resolve(h.hit);
    await h.settle();
    assert.equal(h.canvas.captured, 1);
    h.up();
    await h.settle();
    assert.equal(h.controls.enabled, true);
  } finally {
    h.restore();
  }
});
