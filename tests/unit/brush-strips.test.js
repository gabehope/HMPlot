import test from "node:test";
import assert from "node:assert/strict";
import {
  drawnStrips, stripAt, brushHitMode, resizedRect, translatedRect, bandInStrip,
  stripColumn, constraintPixels, bandsFor, brushConstraint, movedSpan, nudgedSpan,
  axisFrameKeys, stripBindings,
} from "../../src/lib/plot/utils/brushStrips.js";
import { axisWorld } from "../../src/lib/plot/utils/axes.js";

// One label character is 6 px wide in these tests.
const measure = (text) => 6 * String(text).length;
const axis = (overrides) => ({ tickSize: 5, labelOffset: 3, labels: ["0", "50"], angle: 0, ...overrides });

test("strips cover the drawn ticks and labels on each side", () => {
  // Bottom x axis at y = 250 and left y axis at x = 200 of a frame spanning 200..400 x 50..250.
  const bottomLeft = drawnStrips({
    x: axis({ line: 250, from: 200, to: 400, sign: 1 }),
    y: axis({ line: 200, from: 50, to: 250, sign: -1, labels: ["0", "1000"] }),
  }, { fontSize: 10, measure });
  assert.deepEqual(bottomLeft.x, { left: 200, right: 400, top: 250, bottom: 250 + 5 + 3 + 12 });  // 1.2 em line
  assert.deepEqual(bottomLeft.y, { left: 200 - (5 + 3 + 24), right: 200, top: 50, bottom: 250 }); // widest label only
  const topRight = drawnStrips({
    x: axis({ line: 50, from: 200, to: 400, sign: -1 }),
    y: axis({ line: 400, from: 50, to: 250, sign: 1 }),
  }, { fontSize: 10, measure });
  assert.deepEqual(topRight.x, { left: 200, right: 400, top: 50 - 20, bottom: 50 });
  assert.deepEqual(topRight.y, { left: 400, right: 400 + 5 + 3 + 12, top: 50, bottom: 250 });
});

test("strips follow label placement, offsets, rotation, and hidden labels", () => {
  // Inside placement flips the sign, so the strip lies inside the frame.
  const inside = drawnStrips({ x: axis({ line: 250, from: 200, to: 400, sign: -1 }) }, { fontSize: 10, measure });
  assert.deepEqual(inside.x, { left: 200, right: 400, top: 230, bottom: 250 });
  // A larger label offset and an axis offset (the line moved 10 px out) move the strip with it.
  const offset = drawnStrips({ y: axis({ line: 190, from: 50, to: 250, sign: -1, labelOffset: 9 }) }, { fontSize: 10, measure });
  assert.deepEqual(offset.y, { left: 190 - (5 + 9 + 12), right: 190, top: 50, bottom: 250 });
  // Labels off: only the tick marks remain.
  const bare = drawnStrips({ x: axis({ line: 250, from: 200, to: 400, sign: 1, labels: [] }) }, { fontSize: 10, measure });
  assert.deepEqual(bare.x, { left: 200, right: 400, top: 250, bottom: 255 });
  // Rotated x labels reach further: a 90 degree label is as deep as it is wide.
  const rotated = drawnStrips({ x: axis({ line: 250, from: 200, to: 400, sign: 1, labels: ["1000"], angle: 90 }) }, { fontSize: 10, measure });
  assert.ok(Math.abs(rotated.x.bottom - (250 + 5 + 3 + 24)) < 1e-9);
  // Nothing drawn: no ticks and no labels, or an axis the overlay does not draw.
  assert.equal(drawnStrips({ x: axis({ line: 250, from: 200, to: 400, sign: 1, tickSize: 0, labels: [] }) }).x, null);
  assert.deepEqual(drawnStrips({ x: null, y: undefined }), { x: null, y: null });
});

test("stripAt returns the innermost frame when strips nest", () => {
  const outer = { key: "1", depth: 1, strips: { x: { left: 200, right: 400, top: 250, bottom: 272 }, y: null } };
  const inner = { key: "2", depth: 2, strips: { x: { left: 250, right: 300, top: 250, bottom: 260 }, y: null } };
  assert.deepEqual(stripAt([260, 255], [outer, inner]), { frame: inner, axis: "x" });
  // Depth decides, not registration order.
  assert.deepEqual(stripAt([260, 255], [inner, outer]), { frame: inner, axis: "x" });
  assert.deepEqual(stripAt([350, 255], [outer, inner]), { frame: outer, axis: "x" });
  assert.equal(stripAt([300, 150], [outer, inner]), null);
});

test("hit modes: outer grab zone, thin bands keep a middle, strip bands never resize across", () => {
  const rect = { left: 100, right: 300, top: 100, bottom: 300 };
  assert.equal(brushHitMode(rect, [96, 200]), "resize-left");            // 4 px outside the edge
  assert.equal(brushHitMode(rect, [305, 305]), "resize-bottomright");
  assert.equal(brushHitMode(rect, [200, 200]), "move");
  assert.equal(brushHitMode(rect, [90, 200]), null);                      // beyond the 6 px margin
  assert.equal(brushHitMode(rect, [90, 200], { outer: 12 }), "resize-left"); // touch margin
  const band = { left: 0, right: 12, top: 100, bottom: 200 };             // a y-strip band 12 px thick
  assert.equal(brushHitMode(band, [6, 150], { axis: "y" }), "move");
  assert.equal(brushHitMode(band, [6, 101], { axis: "y" }), "resize-top");
  assert.equal(brushHitMode(band, [1, 150], { axis: "y" }), "move");      // left edge is inert
  assert.equal(brushHitMode(band, [11, 199], { axis: "y" }), "resize-bottom");
  const thin = { left: 0, right: 100, top: 0, bottom: 9 };
  assert.equal(brushHitMode(thin, [50, 4.5], { axis: "x" }), "move");     // 3 px edges keep a middle
});

test("resize and translate clamp to the bounds and only move the brushed axis", () => {
  const bounds = { left: 0, right: 500, top: 0, bottom: 400 };
  const rect = { left: 100, right: 200, top: 100, bottom: 200 };
  assert.deepEqual(resizedRect(rect, "resize-right", [240, 999], bounds), { left: 100, right: 240, top: 100, bottom: 200 });
  assert.deepEqual(resizedRect(rect, "resize-left", [250, 0], bounds), { left: 200, right: 250, top: 100, bottom: 200 });
  assert.deepEqual(translatedRect(rect, [150, 150], [900, 170], bounds, "x"), { left: 400, right: 500, top: 100, bottom: 200 });
  assert.deepEqual(translatedRect(rect, [150, 150], [150, 175], bounds, "x"), rect);
});

test("a band spans the strip's thickness and the brushed interval", () => {
  const strip = { left: 180, right: 200, top: 50, bottom: 250 };
  assert.deepEqual(bandInStrip(strip, "y", 220, 90), { left: 180, right: 200, top: 90, bottom: 220, axis: "y" });
  assert.deepEqual(bandInStrip(strip, "y", 400, -10), { left: 180, right: 200, top: 50, bottom: 250, axis: "y" });
  assert.equal(bandInStrip(strip, "y", 300, 280), null); // entirely outside the strip
  assert.equal(bandInStrip(strip, "y", NaN, 100), null);
});

test("edits keep the part of a constraint that lies beyond the strip", () => {
  const strip = { left: 180, right: 200, top: 50, bottom: 250 };
  const wide = { left: 180, right: 200, top: 100, bottom: 400, axis: "y" }; // extends 150 px below the strip
  // Moving a wider band shifts the whole interval instead of cutting it to the strip.
  assert.deepEqual(movedSpan(wide, [190, 150], [190, 130], strip, "y"), { ...wide, top: 80, bottom: 380 });
  // A band that fits stays clamped inside the strip.
  const fits = { left: 180, right: 200, top: 100, bottom: 200, axis: "y" };
  assert.deepEqual(movedSpan(fits, [190, 150], [190, 900], strip, "y"), { ...fits, top: 150, bottom: 250 });
  // Nudges: a fitting band cannot leave the strip; a wider one may move while it stays visible.
  assert.equal(nudgedSpan(fits, strip, "y", 60), null);
  assert.deepEqual(nudgedSpan(fits, strip, "y", 10), { ...fits, top: 110, bottom: 210 });
  assert.deepEqual(nudgedSpan(wide, strip, "y", -10), { ...wide, top: 90, bottom: 390 });
  assert.deepEqual(nudgedSpan(wide, strip, "y", -10, true), { ...wide, bottom: 390 }); // Alt: trailing edge only
});

const binding = (frameKey, identity, overrides = {}) => ({
  frameKey, brushAxis: "y", owner: { id: "rows" },
  brushColumns: { x: { identity: "x", name: "x" }, y: { identity, name: identity } }, ...overrides,
});

test("a strip's column comes from its frame's marks; different columns are ambiguous", () => {
  const one = [binding("1", "a"), binding("1", "a")];
  assert.equal(stripColumn(one, "y").binding, one[0]);
  assert.equal(stripColumn(one, "y").column.identity, "a");
  assert.equal(stripColumn(one, "x"), null); // brush axis "y" only
  const mixed = stripColumn([binding("1", "a"), binding("1", "b")], "y");
  assert.equal(mixed.ambiguous, true);
  assert.deepEqual(mixed.names, ["a", "b"]);
  assert.equal(stripColumn([], "y"), null);
});

test("a strip counts the marks of descendant frames that inherit its axis", () => {
  // 0 root > 1 cell (owns x, y) > 2 Frame owning x (inherits y) > 3 Frame owning y (inherits x),
  // and 1 > 4 owning both. Only frames that plot on the cell's y axis count for its y strip.
  const frames = [
    { key: "0", parentKey: null, inherits: { x: false, y: false } },
    { key: "1", parentKey: "0", inherits: { x: false, y: false } },
    { key: "2", parentKey: "1", inherits: { x: false, y: true } },
    { key: "3", parentKey: "2", inherits: { x: true, y: false } },
    { key: "4", parentKey: "1", inherits: { x: false, y: false } },
  ];
  assert.deepEqual([...axisFrameKeys(frames, "1", "y")].sort(), ["1", "2"]);
  assert.deepEqual([...axisFrameKeys(frames, "1", "x")].sort(), ["1"]);   // 2 owns x; 3 inherits x from 2, not 1
  assert.deepEqual([...axisFrameKeys(frames, "2", "x")].sort(), ["2", "3"]);
  assert.deepEqual([...axisFrameKeys(frames, "0", "y")].sort(), ["0"]);   // 1 owns y
  const bindings = [binding("2", "flipper"), binding("3", "other"), binding("4", "mass")];
  assert.deepEqual(stripBindings(bindings, frames, "1", "y"), [bindings[0]]);
  assert.equal(stripColumn(stripBindings(bindings, frames, "1", "y"), "y").column.name, "flipper");
  // The ambiguity rule spans the strip's frame and its inheriting descendants.
  const mixed = stripColumn(stripBindings([binding("1", "a"), binding("2", "b")], frames, "1", "y"), "y");
  assert.deepEqual(mixed, { ambiguous: true, names: ["a", "b"] });
  // A cycle or a missing parent never loops or matches.
  assert.deepEqual([...axisFrameKeys([{ key: "a", parentKey: "b", inherits: { y: true } }, { key: "b", parentKey: "a", inherits: { y: true } }], "c", "y")], ["c"]);
});

test("bands: one per strip per shared column, none for an ambiguous strip, shared by root and child", () => {
  const strip = (left) => ({ left, right: left + 20, top: 0, bottom: 200 });
  const frames = [
    { key: "1", strips: { x: null, y: strip(0) } },
    { key: "2", strips: { x: null, y: strip(100) } },
    { key: "3", strips: { x: null, y: strip(200) } },
  ];
  const bindings = { 1: [binding("1", "a")], 2: [binding("2", "a")], 3: [binding("3", "a"), binding("3", "b")] };
  // The constraint was made on the root (origin "plot"), on the same column the children plot.
  const constraints = [{ identity: "a", name: "a", bounds: [20, 60], origin: "plot", frame: "0" }];
  const bands = bandsFor(frames, {
    column: (frameKey, axis) => stripColumn(bindings[frameKey], axis),
    constraint: (_, column) => constraints.find((value) => value.identity === column.identity),
    project: (_, axis, constraint) => constraint.bounds.map((value) => 200 - 2 * value),
  });
  assert.deepEqual(bands.map((band) => band.key), ["1:y:a", "2:y:a"]); // frame 3 is ambiguous
  assert.deepEqual(bands[0].rect, { left: 0, right: 20, top: 80, bottom: 160, axis: "y" });
  assert.deepEqual(bands[1].rect, { left: 100, right: 120, top: 80, bottom: 160, axis: "y" });
  // A constraint beyond the strip: the rect is clipped, the span keeps the full interval.
  constraints[0].bounds = [-50, 60];
  const [wide] = bandsFor(frames.slice(0, 1), {
    column: (frameKey, axis) => stripColumn(bindings[frameKey], axis),
    constraint: () => constraints[0],
    project: (_, axis, constraint) => constraint.bounds.map((value) => 200 - 2 * value),
  });
  assert.equal(wide.rect.bottom, 200);
  assert.equal(wide.span.bottom, 300);
});

test("band projection on a log-scaled child strip", () => {
  // A child y axis over [1, 1000] (log) drawn into parent world [-50, 50]; the canvas is 400 px tall
  // and shows world [-50, 50], so world w is at pixel 200 - 4 w.
  const options = { child: () => ({ get: () => undefined }),
    get: (key) => ({ yTransform: "log", ybounds: [1, 1000], yrange: [-50, 50] })[key] };
  const world = (value) => axisWorld(options, "y", value), pixel = (w) => 200 - 4 * w;
  const pixels = constraintPixels({ identity: "c", bounds: [10, 100] }, { identity: "c" }, world, pixel);
  // log10: 10 and 100 are one and two thirds of the way up the child.
  assert.ok(Math.abs(pixels[0] - (400 - 400 / 3)) < 1e-6 && Math.abs(pixels[1] - (400 - 800 / 3)) < 1e-6, String(pixels));
  const [band] = bandsFor([{ key: "1", strips: { x: null, y: { left: 0, right: 20, top: 0, bottom: 400 } } }], {
    column: () => ({ binding: {}, column: { identity: "c", name: "c" } }),
    constraint: () => ({ identity: "c", bounds: [10, 100] }),
    project: (_, axis, constraint) => constraintPixels(constraint, { identity: "c" }, world, pixel),
  });
  assert.ok(Math.abs(band.rect.top - 400 / 3) < 1e-6 && Math.abs(band.rect.bottom - 800 / 3) < 1e-6);
  // A bound outside the log domain has no pixel; the band is dropped rather than drawn at NaN.
  assert.equal(constraintPixels({ identity: "c", bounds: [-1, 100] }, { identity: "c" }, world, pixel), null);
  // Another column's constraint never projects onto this strip.
  assert.equal(constraintPixels({ identity: "d", bounds: [10, 100] }, { identity: "c" }, world, pixel), null);
  // Categories project to their code interval.
  const categories = { identity: "k", categories: ["p", "q", "r"] };
  assert.deepEqual(constraintPixels({ identity: "k", categories: ["q", "r"] }, categories, (v) => v, (w) => w), [0.5, 2.5]);
});

test("the constraint builder refuses bounds from a degenerate axis", () => {
  const evaluated = [];
  const column = { identity: "y", name: "y", type: "numeric", evaluateConstraint: (value) => evaluated.push(value) };
  const built = brushConstraint(column, { frame: "2", axis: "y", origin: "strip" }, 60, 20);
  assert.deepEqual({ ...built, evaluate: undefined, release: undefined },
    { identity: "y", name: "y", type: "numeric", frame: "2", axis: "y", origin: "strip", bounds: [20, 60], evaluate: undefined, release: undefined });
  built.evaluate();
  assert.deepEqual(evaluated, [{ bounds: [20, 60] }]);
  // axisValue maps through a degenerate domain (log over a range containing 0) to NaN.
  for (const bad of [[NaN, NaN], [NaN, 3], [1, Infinity]])
    assert.throws(() => brushConstraint(column, { axis: "y" }, ...bad), /This axis has no valid domain to brush\./);
  const categorical = brushConstraint({ ...column, categories: ["a", "b", "c"] }, { axis: "y" }, 0.6, 2.2);
  assert.deepEqual(categorical.categories, ["b", "c"]);
});
