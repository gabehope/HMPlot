// TODO 30.10: Dodge's collision layout on the host against the GPU version's rule, brute force.
import test from "node:test";
import assert from "node:assert/strict";
import { numpy as np } from "@hmplot/jax";
import { placeGlyphs } from "../../src/lib/plot/utils/dodgePlacement.js";
import { dodgeOffsets } from "../../src/lib/plot/utils/dodge.js";

function random(seed) {
  return () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
}
/**
 * The GPU version's choice for the glyph at placement rank k, given the earlier glyphs' offsets:
 * candidates 0, then y_j + dy_j and y_j - dy_j for every earlier glyph j (dy 0 when j cannot
 * touch; any group), valid when clear of every earlier glyph of the same group; the first
 * nearest valid candidate wins.
 */
function gpuChoice(k, x, radius, group, order, padding, offsets) {
  const i = order[k], plus = [], minus = [];
  for (let m = 0; m < k; m++) {
    const j = order[m], dx = x[i] - x[j], rr = (radius[i] + radius[j] + padding) ** 2;
    const dy = Math.sqrt(Math.max(rr - dx * dx, 0));
    plus.push(offsets[j] + dy);
    minus.push(offsets[j] - dy);
  }
  let best = null;
  for (const c of [0, ...plus, ...minus]) {
    let clear = true;
    for (let m = 0; m < k && clear; m++) {
      const j = order[m];
      if (group[j] !== group[i]) continue;
      const dx = x[i] - x[j], rr = (radius[i] + radius[j] + padding) ** 2;
      if ((c - offsets[j]) ** 2 + dx * dx < rr - 1e-4) clear = false;
    }
    if (clear && (best === null || Math.abs(c) < Math.abs(best))) best = c;
  }
  return best;
}
function layout(n, seed, groups) {
  const next = random(seed);
  const x = Float32Array.from({ length: n }, () => Math.round(next() * 40) * 2.5);
  const radius = Float32Array.from({ length: n }, () => 3 + Math.floor(next() * 3));
  const group = Float32Array.from({ length: n }, () => Math.floor(next() * groups));
  const order = Int32Array.from({ length: n }, (_, i) => i).sort((a, b) => ((a * 7919) % n) - ((b * 7919) % n));
  return { x, radius, group, order };
}

test("each glyph goes where the GPU rule put it, given the same earlier glyphs (ties aside)", () => {
  for (const [n, seed, groups, padding] of [[60, 3, 1, 1], [120, 5, 3, 0.5], [200, 9, 2, 2], [150, 11, 1, 0]]) {
    const { x, radius, group, order } = layout(n, seed, groups);
    const got = placeGlyphs(x, radius, group, order, padding);
    let same = 0;
    for (let k = 0; k < n; k++) {
      const i = order[k], want = gpuChoice(k, x, radius, group, order, padding, got);
      // The same distance from the baseline; the side can differ only on an exact tie.
      assert.ok(Math.abs(Math.abs(got[i]) - Math.abs(want)) < 1e-3, `n=${n} rank ${k}: ${got[i]} vs ${want}`);
      if (Math.abs(got[i] - want) < 1e-3) same++;
    }
    assert.ok(same >= n * 0.98, `n=${n}: ${same} of ${n} on the same side`);
  }
});

test("no two glyphs of a group overlap", () => {
  const { x, radius, group, order } = layout(400, 17, 3);
  const padding = 1, y = placeGlyphs(x, radius, group, order, padding);
  for (let i = 0; i < x.length; i++)
    for (let j = i + 1; j < x.length; j++) {
      if (group[i] !== group[j]) continue;
      const d2 = (x[i] - x[j]) ** 2 + (y[i] - y[j]) ** 2;
      assert.ok(d2 >= (radius[i] + radius[j] + padding) ** 2 - 1e-2, `${i} and ${j} overlap`);
    }
});

test("dodgeOffsets reads back once and keeps the seeded order", async () => {
  const position = np.array([0, 0, 0, 10, 10]), radius = np.array([2, 2, 2, 2, 2]);
  const a = await dodgeOffsets(position, radius, { seed: 4 }), b = await dodgeOffsets(position, radius, { seed: 4 });
  assert.deepEqual(Array.from(await a.data()), Array.from(await b.data()));
  const at = np.array([0, 0, 0]), size = np.array([1, 1, 1]);
  const three = Array.from(await (await dodgeOffsets(at, size, { padding: 0 })).data()).sort((p, q) => p - q);
  assert.deepEqual(three, [-2, 0, 2]);
  for (const array of [position, radius, at, size]) array.dispose();
});

// TODO 118.4: Dodge's layout controller (utils/dodgeLayout.js), which its point mark reaches
// through DODGE_CONTEXT instead of a `dodge` object on its table.
test("the layout covers the rows Dodge hands on, one consumer claims it, and placement options lay out again", async () => {
  const { createDodgeLayout } = await import("../../src/lib/plot/utils/dodgeLayout.js");
  const { interactionScope } = await import("../../src/lib/plot/utils/interaction.js");
  const { createDataScope } = await import("../../src/lib/plot/utils/categorical.js");
  const { createDataView } = await import("../../src/lib/plot/utils/dataView.js");
  const config = { axis: "y", as: "lift", padding: 1, seed: 42 };
  const layout = createDodgeLayout({ config: () => config, track: () => {} });
  const table = createDataScope();
  table.update({ x: [1, 2, 3] });
  const rows = layout.serve(table);
  assert.equal(rows, table, "the rows pass on unchanged");
  assert.ok(layout.covers(rows));
  assert.ok(layout.covers(interactionScope(rows)), "an Interaction between keeps them Dodge's");
  const filtered = createDataView(rows, { mask: np.array([1, 0, 1], { dtype: np.int32 }), count: 2 });
  assert.ok(!layout.covers(filtered), "a transform's output is not");
  assert.ok(!layout.covers(createDataScope()) && !layout.covers(undefined));
  assert.deepEqual(layout.config, config);
  const a = {}, b = {};
  const release = layout.claim(a);
  assert.throws(() => layout.claim(b), /one flat point mark/);
  release();
  layout.claim(b)();
  // A placement option changes: lay out again; the same values watched anew do not.
  const values = { displayScale: 1 }, listeners = new Set();
  const options = () => ({ get: (key) => values[key], on: (listener) => (listeners.add(listener), () => listeners.delete(listener)) });
  let relayouts = 0;
  const watch = layout.watch({ renderer: { domElement: { clientWidth: 100, clientHeight: 100 } }, relayout: () => relayouts++ });
  const stop = watch.options(options(), () => relayouts++);
  assert.equal(relayouts, 1, "the first options it watches");
  stop();
  watch.options(options(), () => relayouts++);
  assert.equal(relayouts, 1, "new options with the same values");
  values.displayScale = 2;
  listeners.forEach((listener) => listener());
  assert.equal(relayouts, 2);
  // The first camera lays out at once; the same pixel scale again does nothing.
  const camera = { projectionMatrix: { elements: [1, 0, 0, 0, 0, 1] } };
  watch.frame(camera);
  watch.frame(camera);
  assert.equal(relayouts, 3);
  watch.dispose();
  filtered.dispose();
  table.dispose();
});


test("zoom placement waits for the gutter refit after a gesture ends", async (t) => {
  const { createDodgeLayout } = await import("../../src/lib/plot/utils/dodgeLayout.js");
  const { createGesture } = await import("../../src/lib/plot/utils/gesture.js");
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const gesture = createGesture();
  const layout = createDodgeLayout({ config: () => ({}), track() {} });
  let relayouts = 0;
  const watch = layout.watch({
    renderer: { domElement: { clientWidth: 100, clientHeight: 100 } },
    view: { navigation: { gesture }, lifecycle: { preparations: new Map() } },
    relayout: () => relayouts++,
  });
  const camera = { projectionMatrix: { elements: [1, 0, 0, 0, 0, 1] } };
  try {
    watch.frame(camera);
    gesture.wheel();
    camera.projectionMatrix.elements[0] = 2;
    watch.frame(camera);
    t.mock.timers.tick(150);
    assert.equal(gesture.active, false);
    assert.equal(relayouts, 1, "the wheel's idle timer releases the gutters before placement");
    camera.projectionMatrix.elements[0] = 2.1;
    watch.frame(camera);
    t.mock.timers.tick(149);
    assert.equal(relayouts, 1);
    t.mock.timers.tick(1);
    assert.equal(relayouts, 2, "only the final camera scale gets a layout");
  } finally {
    watch.dispose(); gesture.cancel();
  }
});
