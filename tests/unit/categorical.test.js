import test from "node:test";
import assert from "node:assert/strict";
import {
  categorical,
  literal,
  createDataScope,
} from "../../src/lib/plot/utils/categorical.js";
import { axisLayout } from "../../src/lib/plot/utils/axes.js";
import { snapshotDataScope } from "../../src/lib/plot/utils/dataView.js";
test("named columns precede literals; exact keys and explicit literal escape", () => {
  const s = createDataScope();
  s.update({ red: [1], "a.b": [2] });
  assert.deepEqual(s.resolve("red"), [1]);
  assert.equal(s.resolve(literal("red")), "red");
  assert.deepEqual(s.resolve("a.b"), [2]);
  assert.equal(s.resolve("white"), "white");
  assert.throws(() => s.get("missing"), /Missing/);
});
test("data-owned category encoding is lazy, shared and keeps captured snapshots valid", () => {
  const scope = createDataScope(), names = ["B", null, "A", "B"];
  scope.update({ names, x: [1, 2, 3, 4] });
  const snapshot = snapshotDataScope(scope);
  assert.equal(scope.get("names"), names, "ordinary host access is unchanged");
  const coded = scope.encodedColumn("names");
  assert.deepEqual(coded.categories, ["B", "A"]);
  assert.deepEqual(coded.codes.ref.js(), [0, -1, 1, 0]);
  assert.equal(scope.encodedColumn("names"), coded);
  assert.equal(snapshot.encodedColumn("names").codes, coded.codes);
  const live = coded.codes.ref;
  scope.update({ names, x: [4, 3, 2, 1] });
  assert.equal(scope.encodedColumn("names"), coded, "unrelated data updates retain the encoding");
  const old = snapshotDataScope(scope);
  scope.update({ names: ["C", "A", "C", "A"] });
  assert.notEqual(scope.encodedColumn("names").codes, coded.codes);
  assert.deepEqual(old.encodedColumn("names").codes.ref.js(), [0, -1, 1, 0]);
  assert.deepEqual(snapshot.hostColumn("names").categories, ["B", "A"]);
  scope.dispose();
  assert.deepEqual(snapshot.encodedColumn("names").codes.ref.js(), [0, -1, 1, 0]);
  snapshot.dispose(); old.dispose(); live.dispose();
  assert.equal(coded.codes.refCount, 0);
});
test("accepted in-place host changes invalidate encoded values without changing host access", () => {
  const scope=createDataScope(), names=["a","b"];
  scope.update({names}); const snapshot=snapshotDataScope(scope), first=scope.encodedColumn("names"), held=first.codes.ref;
  names[0]="b"; scope.update({names});
  const second=scope.encodedColumn("names");
  assert.notEqual(second.codes,first.codes); assert.equal(scope.get("names"),names);
  assert.deepEqual(second.codes.ref.js(),[1,1]); assert.deepEqual(held.ref.js(),[0,1]);
  assert.deepEqual(snapshot.encodedColumn("names").codes.ref.js(),[0,1]);
  assert.deepEqual(Array.from(snapshot.hostColumn("names").codes),[0,1]); snapshot.dispose();
  held.dispose();scope.dispose();
});
test("rows normalize columns including missing cells and nested scopes do not merge", () => {
  const parent = createDataScope(),
    child = createDataScope();
  parent.update({ x: [1] });
  child.update([{ y: 2 }, { z: 3 }]);
  assert.deepEqual(child.get("y"), [2, undefined]);
  assert.equal(child.has("x"), false);
  assert.throws(() => child.update(null));
  assert.deepEqual(child.get("z"), [undefined, 3]);
});
test("column reference replacements within an object are detected", () => {
  const s = createDataScope(),
    table = { x: [1] };
  s.update(table);
  table.x = [2];
  s.update(table);
  assert.deepEqual(s.get("x"), [2]);
});
test("inferred categories append without recoloring on reorder, filter, or append", () => {
  const s = categorical();
  s.include(["b", "a", null]);
  const before = s.value(0);
  s.include(["a", "c", "b"]);
  assert.deepEqual(s.domain, ["b", "a", "c"]);
  assert.equal(s.value(0), before);
  s.include(["c"]);
  assert.equal(s.domain.length, 3);
});
test("explicit domains preserve types, order and unknowns, and repeat finite palettes", () => {
  const s = categorical({
    domain: [false, 0, "0", "a"],
    range: ["red", "blue"],
  });
  s.include(["new"]);
  assert.deepEqual(s.domain, [false, 0, "0", "a"]);
  assert.equal(s.index(null), -1);
  assert.equal(s.index("new"), -1);
  assert.equal(s.index(false), 0);
  assert.equal(s.value(2), "red");
  assert.equal(s.value(-1), "#92989f");
  assert.throws(() => categorical({ domain: ["a", "a"] }));
  assert.throws(() => categorical({ range: [] }));
});
test("shared mapping editing notifies consumers and detaches", () => {
  const s = categorical({ domain: ["a"] }),
    events = [];
  const off = s.subscribe(() => events.push(1));
  s.setRange(["red"]);
  s.setLabel("a", "Alpha");
  s.setUnknown("#aaaaaa");
  assert.equal(s.label("a"), "Alpha");
  assert.equal(events.length, 3);
  off();
  s.setRange(["blue"]);
  assert.equal(events.length, 3);
});
test("categorical ticks share half-step coordinates and reversed range mapping", () => {
  const scale = categorical({ domain: ["A", "B", "C"] }),
    values = { xbounds: [-0.5, 2.5], xrange: [50, -50] };
  const o = {
    categoryAxes: { x: scale },
    get: (k) => values[k],
    child: () => ({ get: () => undefined }),
  };
  const layout = axisLayout(o, "x", [-50, 50], 600);
  assert.deepEqual(
    layout.major.map((t) => t.label),
    ["C", "B", "A"],
  );
  assert.equal(layout.minor.length, 0);
  assert.ok(Math.abs(layout.major[1].fraction - 0.5) < 1e-8);
});
test("category labels hide only where they overlap: a line high on y, their width on x", () => {
  const layoutFor = (axis, names, pixels, angle = 0) => {
    const values = { [`${axis}bounds`]: [-0.5, names.length - 0.5], [`${axis}range`]: [-50, 50] };
    const o = {
      categoryAxes: { [axis]: categorical({ domain: names }) },
      get: (k) => values[k],
      child: () => ({ get: (k) => (k === "axisTickLabelAngle" || k === `axis${axis.toUpperCase()}TickLabelAngle` ? angle : undefined) }),
    };
    return axisLayout(o, axis, [-50, 50], pixels).major;
  };
  // Twelve rows 33 px apart, names of up to 13 letters: a horizontal dot chart's rows (they
  // needed 55 px or more each, so every other one was dropped).
  const rows = ["Nosdraholstan", "Bororica", "Lanholholis", "Junkarlanland", "Alcenora", "Holgaris",
    "Wesyorica", "Karorisstan", "Finholland", "Nesdraen", "Garvenboria", "Nesjunxania"];
  assert.ok(layoutFor("y", rows, 400).every((t) => t.showLabel));
  // Across, a label hides only where half of it and half of the last one shown overlap.
  const items = ["Revenue", "Cost of goods", "Salaries", "Marketing", "Rent", "Other income", "Taxes", "Net income"];
  assert.ok(layoutFor("x", items, 8 * 80).every((t) => t.showLabel));
  const crowded = layoutFor("x", items, 8 * 30);
  assert.ok(crowded.some((t) => !t.showLabel) && crowded[0].showLabel);
});
