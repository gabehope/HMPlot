import test from "node:test";
import assert from "node:assert/strict";
import { numpy as np } from "@hmplot/jax";
import { createDataScope } from "../../src/lib/plot/utils/categorical.js";
import { brushColumn, nearbyConstraint, nearbyUnion, responseResources, selection, viewRows } from "../../src/lib/plot/utils/interaction.js";
import { createDataView } from "../../src/lib/plot/utils/dataView.js";
import { axisWorld, axisWorldArray } from "../../src/lib/plot/utils/axes.js";

const values = (array) => { try { return Array.from(array.ref.js()).map(Number); } finally { array.dispose(); } };
const axisOptions = (kind, bounds, range) => ({
  child: () => ({ get: () => undefined }),
  get: (key) => key === "xTransform" ? kind : key === "xbounds" ? bounds : key === "xrange" ? range : undefined,
});

function columns(x, y) {
  const scope = createDataScope();
  scope.update({ x, y });
  return { scope, x: brushColumn(scope, "x", "x", "m"), y: brushColumn(scope, "y", "y", "m") };
}

test("data-unit nearby: circle for xy, band for one axis, NaN never matches", () => {
  const { scope, x, y } = columns([0, 1, 3, 0, NaN], [0, 0, 0, 2, 0]);
  const circle = nearbyConstraint({ x, y, axis: "xy", units: "data", center: { x: 0, y: 0 }, radius: { x: 1.5, y: 1.5 } });
  assert.deepEqual(values(circle.evaluate()), [1, 1, 0, 0, 0]);
  const band = nearbyConstraint({ x, y, axis: "x", units: "data", center: { x: 0 }, radius: { x: 1.5 } });
  assert.deepEqual(values(band.evaluate()), [1, 1, 0, 1, 0]);
  assert.equal(circle.type, "radius");
  assert.deepEqual(circle.center, { x: 0, y: 0 });
  scope.dispose();
});

test("pixel nearby tests world coordinates, so an ellipse in data is a circle on screen", () => {
  const { scope, x, y } = columns([0, 2, 0, 3], [0, 0, 2, 0]);
  // World doubles x relative to y, as a non-square plot would.
  const world = { x: (column) => column.array().mul(2), y: (column) => column.array() };
  const constraint = nearbyConstraint({ x, y, axis: "xy", units: "px", center: { x: 0, y: 0 }, radius: { x: 4, y: 2 }, world });
  assert.deepEqual(values(constraint.evaluate()), [1, 1, 1, 0]);
  scope.dispose();
});

test("GPU world mapping matches the CPU axis mapping, including log and degenerate domains", () => {
  const input = [1, 10, 100, 1000, 0, -5];
  for (const [kind, bounds] of [["linear", [0, 1000]], ["log", [1, 1000]], ["sqrt", [0, 1000]]]) {
    const options = axisOptions(kind, bounds, [-50, 50]);
    const gpu = values(axisWorldArray(options, "x", np.array(input)));
    input.forEach((value, index) => {
      const cpu = axisWorld(options, "x", value);
      if (Number.isFinite(cpu)) assert.ok(Math.abs(gpu[index] - cpu) < 1e-3, `${kind} ${value}: ${gpu[index]} vs ${cpu}`);
      else assert.ok(!Number.isFinite(gpu[index]), `${kind} ${value} should be nonfinite`);
    });
  }
  assert.ok(values(axisWorldArray(axisOptions("linear", [3, 3], [-50, 50]), "x", np.array([3]))).every((v) => !Number.isFinite(v)));
});

test("nearby is a data-owned resource that responds by name and by default", () => {
  const scope = createDataScope();
  scope.update({ x: [1, 2] });
  const owner = scope.identity;
  assert.ok(owner.nearby?.isSelection);
  assert.deepEqual(responseResources({ owner, nearby: owner.nearby }), [owner.nearby]);
  assert.deepEqual(responseResources({ owner, respond: "nearby" }), [owner.nearby]);
  assert.ok(responseResources({ owner, respond: true }).includes(owner.nearby));
  assert.deepEqual(values(scope.get("@nearby").ref), [0, 0]);
  assert.deepEqual(values(scope.get("@any_nearby").ref), [0, 0]);
  const { x } = { x: brushColumn(scope, "x", "x", "m") };
  owner.nearby.setConstraints(owner, [nearbyConstraint({ x, axis: "x", units: "data", center: { x: 2 }, radius: { x: 0.5 } })], { phase: "preview" });
  assert.deepEqual(values(scope.get("@nearby").ref), [0, 1]);
  assert.deepEqual(values(scope.get("@any_nearby").ref), [1, 1]);
  const snapshot = owner.nearby.getConstraints()[0];
  assert.equal(snapshot.type, "radius");
  assert.equal(snapshot.bounds, undefined);
  assert.deepEqual(snapshot.center, { x: 2 });
  assert.deepEqual(snapshot.radius, { x: 0.5 });
  owner.nearby.cancelConstraintPreview(owner);
  assert.deepEqual(values(scope.get("@nearby").ref), [0, 0]);
  scope.dispose();
});

test("pixel nearby re-evaluates updated data instead of a stale world cache", () => {
  const scope = createDataScope();
  scope.update({ x: [0, 10, 20] });
  const owner = scope.identity, x = brushColumn(scope, "x", "x", "m");
  const world = { x: (column) => column.world("topology:x", (array) => array.astype(np.float32)) };
  owner.nearby.setConstraints(owner, [nearbyConstraint({ x, axis: "x", units: "px", center: { x: 0 }, radius: { x: 1 }, world })],
    { phase: "preview", replace: true });
  assert.deepEqual(values(scope.get("@nearby").ref), [1, 0, 0]);
  scope.update({ x: [50, 10, 20, 0] });
  assert.deepEqual(values(scope.get("@nearby").ref), [0, 0, 0, 1]);
  // After release the column still evaluates, but it no longer holds a cached array. (Counted
  // relative to the Data scope's shared device copy of the column, which astype to its own
  // dtype returns: TODO 26.6.)
  const cached = x.world("topology:x", (array) => array.astype(np.float32));
  const held = cached.refCount;
  x.release();
  assert.equal(cached.refCount, held - 1);
  cached.dispose();
  const fresh = x.world("topology:x", (array) => array.astype(np.float32));
  assert.equal(fresh.refCount, held - 1, "only this reference and the shared copy's");
  assert.deepEqual(values(fresh), [50, 10, 20, 0]);
  owner.nearby.cancelConstraintPreview(owner);
  scope.dispose();
});

test("feedback reads a resource in the phase of its role on the mark, explicit or data-owned", async () => {
  const { interactionRole, interactionPhase, selectionMask } = await import("../../src/lib/plot/utils/interaction.js");
  const scope = createDataScope();
  scope.update({ x: [0, 10, 20] });
  const owner = scope.identity, x = brushColumn(scope, "x", "x", "m"), explicit = selection();
  const near = nearbyConstraint({ x, axis: "x", units: "data", center: { x: 10 }, radius: { x: 1 } });
  explicit.setConstraints(owner, [near], { phase: "preview" });
  // nearby={explicit} or nearby={{selection: explicit}}: its preview is what the mark shows.
  const binding = { owner, nearby: explicit };
  assert.equal(interactionRole(binding, explicit), "nearby");
  assert.deepEqual(values(selectionMask(scope, explicit, interactionPhase(explicit, interactionRole(binding, explicit)))), [0, 1, 0]);
  const hovered = selection(), brushed = selection();
  hovered.replace(owner, [2], { phase: "preview" });
  assert.equal(interactionRole({ owner, hover: hovered }, hovered), "hover");
  assert.equal(interactionPhase(hovered, interactionRole({ owner, hover: hovered }, hovered)), "preview");
  assert.equal(interactionRole({ owner, brush: brushed }, brushed), "brush");
  // Data-owned resources keep their roles; a resource with no role is a committed selection.
  assert.equal(interactionRole({ owner }, owner.nearby), "nearby");
  assert.equal(interactionRole({ owner }, owner.hover), "hover");
  assert.equal(interactionRole({ owner, selection: owner.selection }, owner.selection), "selection");
  assert.equal(interactionRole({ owner }, selection()), "selection");
  explicit.dispose(); hovered.dispose(); brushed.dispose(); scope.dispose();
});

test("nearby feedback dims the other rows only while some row is nearby", () => {
  const scope = createDataScope();
  scope.update({ x: [0, 10, 20] });
  const owner = scope.identity, x = brushColumn(scope, "x", "x", "m");
  const at = (center) => nearbyConstraint({ x, axis: "x", units: "data", center: { x: center }, radius: { x: 1 } });
  owner.nearby.setConstraints(owner, [at(50)], { phase: "preview", replace: true });
  assert.equal(owner.nearby.previewActive, true);
  assert.deepEqual(values(owner.nearby.feedbackOpacity(owner, 3, "preview", 0.25, true)), [1, 1, 1]);
  owner.nearby.setConstraints(owner, [at(10)], { phase: "preview", replace: true });
  assert.deepEqual(values(owner.nearby.feedbackOpacity(owner, 3, "preview", 0.25, true)), [0.25, 1, 0.25]);
  // Other resources keep dimming every row that is not a member.
  owner.selection.replace(owner, [], {});
  assert.deepEqual(values(owner.selection.feedbackOpacity(owner, 3, "committed", 0.25)), [0.25, 0.25, 0.25]);
  owner.nearby.cancelConstraintPreview(owner);
  scope.dispose();
});

test("data-unit radii apply in the axis's transformed space", () => {
  // 4B.8: on a log axis, center 10 with radius log(10) - log(1) reaches 1 and 100 alike.
  const { scope, x } = columns([0.5, 1.001, 10, 99.9, 100.5, 0, -1, NaN, 1, 100], Array(10).fill(0));
  const log = nearbyConstraint({ x, axis: "x", units: "data", center: { x: 10 }, radius: { x: Math.log(10) - Math.log(1) }, transform: { x: "log" } });
  const mask = values(log.evaluate());
  assert.deepEqual(mask.slice(0, 8), [0, 1, 1, 1, 0, 0, 0, 0]);
  assert.equal(mask[8], mask[9], "1 and 100 are the same transformed distance from 10");
  assert.deepEqual(log.transform, { x: "log" });
  assert.deepEqual(log.center, { x: 10 });
  // sqrt: center 9 (sqrt 3) with radius 0.5 covers sqrt in [2.5, 3.5], so data in [6.25, 12.25].
  const sqrt = nearbyConstraint({ x, axis: "x", units: "data", center: { x: 9 }, radius: { x: 0.5 }, transform: { x: "sqrt" } });
  assert.deepEqual(values(sqrt.evaluate()).slice(0, 8), [0, 0, 1, 0, 0, 0, 0, 0]);
  // Linear (the default) is plain data distance; pixel radii carry no transform.
  const linear = nearbyConstraint({ x, axis: "x", units: "data", center: { x: 10 }, radius: { x: 0.5 } });
  assert.deepEqual(values(linear.evaluate()).slice(0, 8), [0, 0, 1, 0, 0, 0, 0, 0]);
  assert.deepEqual(linear.transform, { x: "linear" });
  assert.equal(nearbyConstraint({ x, axis: "x", units: "px", center: { x: 0 }, radius: { x: 1 }, world: {} }).transform, undefined);
  scope.dispose();
});

test("ellipse membership matches a float64 oracle on 1000 random points", () => {
  let seed = 7;
  const random = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
  const n = 1000, xs = Array.from({ length: n }, () => 0.1 + 99.9 * random()), ys = Array.from({ length: n }, () => 100 * random() - 50);
  const { scope, x, y } = columns(xs, ys);
  const forward = { linear: (v) => v, log: Math.log, sqrt: Math.sqrt };
  const cases = [
    { transform: { x: "linear", y: "linear" }, center: { x: 40, y: 5 }, radius: { x: 20, y: 15 } },
    { transform: { x: "log", y: "linear" }, center: { x: 5, y: -10 }, radius: { x: 2, y: 30 } },
    { transform: { x: "sqrt", y: "linear" }, center: { x: 49, y: 0 }, radius: { x: 2.5, y: 30 } },
  ];
  for (const { transform, center, radius } of cases) {
    const gpu = values(nearbyConstraint({ x, y, axis: "xy", units: "data", center, radius, transform }).evaluate());
    let inside = 0, compared = 0;
    for (let i = 0; i < n; i++) {
      const dx = (forward[transform.x](xs[i]) - forward[transform.x](center.x)) / radius.x;
      const dy = (forward[transform.y](ys[i]) - forward[transform.y](center.y)) / radius.y;
      const q = dx * dx + dy * dy;
      if (Math.abs(q - 1) < 1e-4) continue; // float32 may round either way on the boundary
      compared++;
      inside += q <= 1;
      assert.equal(gpu[i], q <= 1 ? 1 : 0, `${transform.x} row ${i}: (${xs[i]}, ${ys[i]}) q=${q}`);
    }
    assert.ok(compared > 990 && inside > 50 && inside < compared - 50, `${transform.x}: ${inside}/${compared} inside`);
  }
  scope.dispose();
});

test("pixel radii are view-local: never committed, so never published", () => {
  const scope = createDataScope();
  scope.update({ x: [0, 10, 20] });
  const owner = scope.identity, x = brushColumn(scope, "x", "x", "m"), shared = selection();
  const world = { x: (column) => column.world("topology:x", (array) => array.astype(np.float32)) };
  const pixels = nearbyConstraint({ x, axis: "x", units: "px", center: { x: 0 }, radius: { x: 1 }, world });
  assert.throws(() => shared.setConstraints(owner, [pixels]),
    { message: 'A nearby constraint with units "px" belongs to one view and cannot be committed; commit units "data" instead.' });
  // A resource shared by a brush band and a pixel nearby preview commits only the band.
  const band = { identity: "band", name: "x", type: "numeric", bounds: [15, 25], release() {},
    evaluate: () => x.evaluateConstraint({ bounds: [15, 25] }) };
  shared.setConstraints(owner, [band], { phase: "preview" });
  shared.setConstraints(owner, [pixels], { phase: "preview" });
  assert.deepEqual(values(shared.mask(owner, 3, "preview")), [0, 0, 0]);
  shared.commitConstraintPreview(owner);
  assert.equal(shared.previewActive, false);
  assert.deepEqual(shared.getConstraints(owner, "committed").map((value) => value.identity), ["band"]);
  assert.deepEqual(values(shared.mask(owner, 3)), [0, 0, 1]);
  // Data-unit radii describe rows in any view and commit normally.
  const data = nearbyConstraint({ x, axis: "x", units: "data", center: { x: 10 }, radius: { x: 1 } });
  shared.setConstraints(owner, [data], { replace: true });
  assert.deepEqual(shared.getConstraints(owner, "committed").map((value) => value.units), ["data"]);
  assert.deepEqual(values(shared.mask(owner, 3)), [0, 1, 0]);
  shared.dispose(); x.release(); scope.dispose();
});

test("viewRows marks the owner rows a view shows, without a scatter", () => {
  const view = (rows) => ({ sourceIndices: () => np.array(rows, { dtype: np.int32 }) });
  assert.deepEqual(values(viewRows(view([3, 1, 4]), 6)), [0, 1, 0, 1, 1, 0]);
  assert.deepEqual(values(viewRows(view([0, 0, 2]), 3)), [1, 0, 1]); // repeated rows
  assert.deepEqual(values(viewRows(view([]), 3)), [0, 0, 0]);
  assert.deepEqual(values(viewRows(view([1]), 1)), [0]);
  assert.deepEqual(values(viewRows({}, 2)), [1, 1]); // a scope without indices shows every row
});

test("a mark in a facet cell matches only its cell's rows; marks sharing an owner take the union", () => {
  const scope = createDataScope();
  scope.update({ x: [0, 0, 0, 0] });
  // A view borrows its indices: the test owns them.
  const indices = [[0, 1], [2, 3]].map((rows) => np.array(rows, { dtype: np.int32 }));
  const [a, b] = indices.map((rows) => createDataView(scope, { indices: rows }));
  const xa = brushColumn(a, "x", "x", "a"), xb = brushColumn(b, "x", "x", "b");
  const near = (x, center) => nearbyConstraint({ x, axis: "x", units: "data", center: { x: center }, radius: { x: 1 } });
  assert.deepEqual(values(near(xa, 0).evaluate()), [1, 1, 0, 0]);
  assert.deepEqual(values(near(xb, 0).evaluate()), [0, 0, 1, 1]);
  assert.deepEqual(values(nearbyUnion([near(xa, 0), near(xb, 0)]).evaluate()), [1, 1, 1, 1]);
  assert.deepEqual(values(nearbyUnion([near(xa, 0), near(xb, 5)]).evaluate()), [1, 1, 0, 0]);
  const single = near(xa, 0);
  assert.equal(nearbyUnion([single]), single);
  // Once the data changes, a cell's old rows are stale: the constraint drops until marks prepare again.
  const owner = scope.identity;
  owner.nearby.setConstraints(owner, [nearbyUnion([near(xa, 0), near(xb, 0)])], { phase: "preview" });
  assert.deepEqual(values(scope.get("@nearby").ref), [1, 1, 1, 1]);
  scope.update({ x: [0, 0, 0, 0] });
  assert.throws(() => xa.rows(), { code: "BRUSH_COLUMN_REMOVED" });
  assert.deepEqual(values(scope.get("@nearby").ref), [0, 0, 0, 0]);
  assert.equal(owner.nearby.getConstraints(owner).length, 0);
  owner.nearby.cancelConstraintPreview(owner);
  xa.release(); xb.release(); a.dispose(); b.dispose(); scope.dispose();
  indices.forEach((rows) => rows.dispose());
});

test("a Filter's where list ANDs selections and skips an inactive one (eval 2026-10-13 crossfilter)", async () => {
  // where=[brushA, brushB], as Filter documents: a selection in a list read a field "undefined"
  // ("Expected 4 numeric values for undefined.") and the scene failed to load.
  const { runTransform, transformDependencies } = await import("../../src/lib/plot/utils/transforms.js");
  const scope = createDataScope();
  scope.update({ x: [0, 1, 2, 3] });
  const owner = scope.identity, a = selection(), b = selection(), idle = selection();
  a.replace(owner, [1, 2, 3]);
  b.replace(owner, [0, 2, 3]);
  const rows = async (where) => {
    const view = await runTransform("Filter", scope, { where });
    const kept = view.length;
    view.dispose?.();
    return kept;
  };
  assert.equal(await rows([a, b]), 2, "rows 2 and 3 are in both");
  assert.equal(await rows([a, idle]), 3, "an inactive selection keeps every row, as alone");
  assert.deepEqual(transformDependencies("Filter", { where: [a, b] }).resources, [a, b], "brushing reruns it");
  await assert.rejects(() => runTransform("Filter", scope, { where: [a, 42] }),
    /each condition is a column or interaction field .*; received 42/);
  [a, b, idle].forEach((resource) => resource.dispose());
  scope.dispose();
});


test("indexed feedback follows transformed scope rows before expanding drawing instances", async () => {
  const { startFeedbackOpacity } = await import("../../src/lib/plot/utils/feedbackOpacity.js");
  const scope = createDataScope();
  scope.update({ x: [0, 10, 20] });
  const indices = np.array([2, 0], { dtype: np.int32 });
  const drawn = np.array([0, 0, 1, 1], { dtype: np.int32 });
  const view = createDataView(scope, { indices });
  const owner = scope.identity;
  owner.selection.replace(owner, [2]);
  try {
    for (const [kind, expected] of [["GeoJSON", [1, 1, 0.25, 0.25]], ["Line", [1, 1, 0.25]]]) {
      let stop;
      const actual = await new Promise((resolve, reject) => {
        stop = startFeedbackOpacity({
          kind,
          mark: { fields: new Map([["interactionOpacity", { update: (array) => resolve(Array.from(array.ref.js()).map(Number)) }]]) },
          entry: {
            props: {}, interactionIndex: drawn,
            interaction: { owner, generation: owner.generation, scope: view, selection: owner.selection, selectionOpacity: 0.25 },
          },
          report: reject,
        });
      });
      stop?.();
      assert.deepEqual(actual, expected, kind);
    }
  } finally {
    view.dispose(); indices.dispose(); drawn.dispose(); scope.dispose();
  }
});
