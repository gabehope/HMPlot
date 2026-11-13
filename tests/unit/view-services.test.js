// Typed per-view services (Stage 117.1, src/lib/plot/utils/viewServices.ts).
import test from "node:test";
import assert from "node:assert/strict";
import {
  capability,
  createViewServices,
} from "../../src/lib/plot/utils/viewServices.ts";
import {
  acquireMarkBinding,
  markBinding,
} from "../../src/lib/plot/utils/markBinding.js";

test("a capability's old owner releasing leaves its replacement in place", () => {
  const slot = capability();
  const first = slot.install("first");
  const second = slot.install("second");
  first();
  assert.equal(slot.current, "second");
  second();
  second();
  assert.equal(slot.current, undefined);
  // The same value installed by two owners is still two installs.
  const value = {};
  const a = slot.install(value);
  slot.install(value);
  a();
  assert.equal(slot.current, value);
});

test("a view shows its reporters' errors, each owner clearing only its own", () => {
  const shown = [];
  const { diagnostics } = createViewServices({
    showErrors: (message) => shown.push(message),
  });
  const mark = {},
    brush = {},
    error = Object.assign(Error("Points: no column x"), {
      diagnostic: { code: "field" },
    });
  diagnostics.report(mark, error);
  diagnostics.report(brush, "Brush: one axis");
  diagnostics.report({}, "");
  assert.equal(diagnostics.renderDiagnostic, error);
  diagnostics.report(mark, "");
  assert.deepEqual(shown, [
    "Points: no column x",
    "Points: no column x · Brush: one axis",
    "Brush: one axis",
  ]);
  assert.equal(diagnostics.renderDiagnostic, null);
  diagnostics.report(
    {},
    {
      severity: "warning",
      code: "layout",
      component: "Plot",
      message: "Plot: narrow layout",
    },
  );
  assert.equal(shown.at(-1), "Brush: one axis");
  assert.equal(diagnostics.list().at(-1).severity, "warning");
});

test("identical messages display once while each diagnostic owner keeps its lifetime", () => {
  let shown;
  const { diagnostics } = createViewServices({
    showErrors: (message) => (shown = message),
  });
  const first = {},
    second = {};
  diagnostics.report(first, "Facet: incompatible fields");
  diagnostics.report(second, "Facet: incompatible fields");
  assert.equal(shown, "Facet: incompatible fields");
  assert.equal(diagnostics.list().length, 2);
  diagnostics.report(first, null);
  assert.equal(shown, "Facet: incompatible fields");
  diagnostics.report(second, null);
  assert.equal(shown, "");
});

test("a mark's domains count in its frame, else its facet cell", () => {
  const { domains } = createViewServices();
  const calls = [];
  const target = (name, collect = true) => ({
    domain: (axis, bounds, owner) => calls.push([name, axis, bounds, owner]),
    collect: () => collect,
  });
  const frame = target("frame", false),
    facet = target("facet"),
    facetOwner = {};
  const framed = domains.route({ frame, facet, owner: "m", facetOwner });
  const faceted = domains.route({ facet, owner: "m", facetOwner });
  assert.equal(framed.collects(), false);
  assert.equal(faceted.collects(), true);
  framed.set("x", [0, 1]);
  faceted.set("y", [2, 3]);
  assert.deepEqual(calls, [
    ["frame", "x", [0, 1], "m"],
    ["facet", "y", [2, 3], facetOwner],
  ]);
  calls.length = 0;
  framed.clear();
  assert.deepEqual(
    calls.map(([name, axis]) => name + axis),
    ["framex", "framey", "framez"],
  );
  // Without a frame or a facet cell nothing collects its domains.
  assert.equal(domains.route({ owner: "m", facetOwner }).collects(), false);
});

test("Scene3D's camera moves reach the listeners registered with its view", () => {
  const { navigation } = createViewServices();
  let moves = 0;
  const release = navigation.onCameraMove(() => moves++);
  navigation.cameraMoved();
  release();
  navigation.cameraMoved();
  assert.equal(moves, 1);
});

test("a view's credit line: each distinct credit once, in the order first set", () => {
  const { credits } = createViewServices(),
    lines = [];
  const release = credits.changed.install(() => lines.push(credits.line()));
  const tiles = {},
    other = {},
    third = {};
  credits.set(tiles, "© OpenStreetMap");
  credits.set(other, "Natural Earth");
  credits.set(third, "© OpenStreetMap");
  credits.set(tiles, "");
  release();
  credits.set(other, null);
  assert.deepEqual(lines, [
    "© OpenStreetMap",
    "© OpenStreetMap · Natural Earth",
    "© OpenStreetMap · Natural Earth",
    "Natural Earth · © OpenStreetMap",
  ]);
  assert.equal(credits.line(), "© OpenStreetMap");
});

test("a mark's accepted binding: one publisher's current one, held by readers until they release", () => {
  const view = createViewServices(),
    mark = { view };
  const held = [];
  const binding = (name) => ({
    name,
    retain() {
      held.push(name);
      return () => held.splice(held.indexOf(name), 1);
    },
  });
  const first = binding("first");
  const releaseFirst = view.marks.publish(mark, first);
  assert.equal(markBinding(mark), first);
  // An in-flight pick or export holds what it read across the next publication.
  const pick = acquireMarkBinding(mark);
  const second = binding("second");
  const releaseSecond = view.marks.publish(mark, second);
  releaseFirst();
  assert.equal(
    view.marks.of(mark),
    second,
    "a replaced binding's release leaves its successor",
  );
  assert.equal(pick.value, first);
  assert.deepEqual(held, ["first"]);
  pick.release();
  pick.release();
  assert.deepEqual(held, [], "each acquisition releases once");
  releaseSecond();
  assert.equal(markBinding(mark), undefined);
  assert.equal(
    acquireMarkBinding({}).value,
    undefined,
    "an object outside a view has none",
  );
});

test("a Plot's view context is typed, found up the options, and notifies on change (TODO 136.12)", async () => {
  const { optionsRoot } = await import("../../src/lib/options/options.js");
  const { attachViewContext, viewContextOf } =
    await import("../../src/lib/plot/utils/viewContext.js");
  const plot = optionsRoot.splitUnique("View context plot"),
    mark = plot.splitUnique("mark"),
    inset = plot.splitUnique("inset plot");
  assert.equal(viewContextOf(mark), null, "outside a Plot");
  const context = attachViewContext(plot),
    own = attachViewContext(inset);
  assert.equal(viewContextOf(mark), context);
  assert.equal(viewContextOf(inset.splitUnique("mark")), own);
  let heard = 0;
  const stop = context.on(() => heard++);
  context.update({ explicitViewport: true, radialExtent: [0, 2] });
  context.update({ explicitViewport: true, radialExtent: [0, 2] });
  assert.deepEqual(
    [
      heard,
      context.explicitViewport,
      context.radialExtent,
      own.explicitViewport,
    ],
    [1, true, [0, 2], false],
  );
  // A completed frame's axis snapshot keeps the context as it was.
  const { snapshotAxisOptions } =
    await import("../../src/lib/plot/utils/snapshotAxisOptions.js");
  const snapshot = snapshotAxisOptions(mark);
  context.update({ radialExtent: [0, 4] });
  assert.deepEqual(viewContextOf(snapshot).radialExtent, [0, 2]);
  assert.equal(heard, 2);
  // A scope over a snapshot (an angular axis of a completed frame) reads the copied fields.
  const { ViewContext } =
    await import("../../src/lib/plot/utils/viewContext.js");
  const over = new ViewContext(viewContextOf(snapshot), { mode: "chart" });
  assert.deepEqual([over.mode, over.radialExtent], ["chart", [0, 2]]);
  over.on(() => {})();
  stop();
  context.update({ radialExtent: [0, 3] });
  assert.equal(heard, 2);
  plot.dispose();
});
