import test from "node:test";
import assert from "node:assert/strict";
import { numpy as np } from "@hmplot/jax";
import { keyedLifecycle } from "../../src/lib/plot/utils/keyedLifecycle.js";
import { createDataScope } from "../../src/lib/plot/utils/categorical.js";
import { col } from "../../src/lib/plot/utils/expressions.js";

function prepared(keys, positions, size) {
  return { keyTokens: keys, props: { position: np.array(positions), size: np.array(size), fill: "steelblue" } };
}

test('numeric endpoint expressions use new enter data and previous exit data through interrupted updates',()=>{
  const frames=[prepared(['root','old'],[[0,0],[1,1]],[4,4]),prepared(['root','new'],[[5,5],[6,6]],[4,4]),
    prepared(['root','later'],[[10,10],[11,11]],[4,4])];
  frames.forEach((frame,i)=>{frame.markScope=createDataScope();frame.markScope.update({parentX:[NaN,i*5],parentY:[NaN,i*5]});
    frame.lifecycleConfig={channelExit:{x:col.parentX,y:col.parentY}};});
  const config={channelEnter:{x:col.parentX,y:col.parentY},channelExit:{x:col.parentX,y:col.parentY},channelDuration:100};
  const first=keyedLifecycle(frames[0],frames[1],'Points',config);
  assert.deepEqual(first.source.props.position.ref.js(),[[0,0],[5,5],[1,1]]);
  assert.deepEqual(first.target.props.position.ref.js(),[[5,5],[6,6],[0,0]]);
  first.show('target');
  const second=keyedLifecycle(first.shown(),frames[2],'Points',config);
  assert.deepEqual(second.source.props.position.ref.js(),[[5,5],[10,10],[6,6],[0,0]]);
  assert.deepEqual(second.target.props.position.ref.js(),[[10,10],[11,11],[5,5],[0,0]]);
  second.dispose();first.dispose();frames.forEach(frame=>{frame.markScope.dispose();frame.props.position.dispose();frame.props.size.dispose();});
});

test("keyed instance staging aligns reordered, entered, and exited values", () => {
  const old = prepared(["a", "b"], [[1, 1], [2, 2]], [4, 5]);
  const next = prepared(["b", "c"], [[20, 20], [30, 30]], [8, 9]);
  const transition = keyedLifecycle(old, next, "Points", { enter: true, exit: true, animationDuration: 100 });
  assert.ok(transition);
  assert.deepEqual(transition.source.props.position.ref.js(), [[2, 2], [30, 30], [1, 1]]);
  assert.deepEqual(transition.target.props.position.ref.js(), [[20, 20], [30, 30], [1, 1]]);
  assert.equal(transition.source.props.animation, false);
  assert.equal(transition.target.props.animation, true);
  assert.deepEqual(transition.source.lifecycleOpacity.ref.js(), [1, 0, 1]);
  assert.deepEqual(transition.target.lifecycleOpacity.ref.js(), [1, 1, 0]);
  assert.deepEqual(transition.source.lifecycleInteraction.index.ref.js(), [0, 1, 0]);
  assert.deepEqual(transition.source.lifecycleInteraction.valid.ref.js(), [true, true, false]);
  assert.equal(transition.source.lifecycleInteraction.sourceLength, 2);
  assert.equal(transition.source.lifecycleInteraction.outputLength, 3);
  transition.dispose();
  old.props.position.dispose(); old.props.size.dispose();
  next.props.position.dispose(); next.props.size.dispose();
});

test("connected paths remain atomic", () => {
  const old = prepared(["a"], [[1, 1]], [4]);
  const next = prepared(["b"], [[2, 2]], [4]);
  assert.equal(keyedLifecycle(old, next, "Line", { enter: true, exit: true }), null);
  old.props.position.dispose(); old.props.size.dispose();
  next.props.position.dispose(); next.props.size.dispose();
});


test("fade is an explicit lifecycle effect", () => {
  const old = prepared(["a"], [[1, 1]], [4]);
  const next = prepared(["b"], [[2, 2]], [4]);
  const transition = keyedLifecycle(old, next, "Points", { enter: "fade", exit: { effect: "fade", duration: 80 }, animationDuration: 100 });
  assert.ok(transition);
  assert.equal(transition.duration, 100);
  transition.dispose();
  old.props.position.dispose(); old.props.size.dispose();
  next.props.position.dispose(); next.props.size.dispose();
});

test("live keyed fades preserve authored row alpha and animate only their own field", () => {
  const old = prepared(["a", "b"], [[1, 1], [2, 2]], [4, 5]);
  const next = prepared(["b", "c"], [[20, 20], [30, 30]], [8, 9]);
  old.expressionOpacity = np.array([0.25, 0.75]);
  next.expressionOpacity = np.array([0.5, 1]);
  const position = { components: [{ suppressed: true }] };
  next.animation = { live: true, specs: { position } };
  const transition = keyedLifecycle(old, next, "Rect", {
    enter: { effect: "fade", duration: 120 }, exit: { effect: "fade", duration: 120 },
    channelEnter: { opacity: 0 }, channelExit: { opacity: 0 },
  });
  try {
    assert.deepEqual(transition.source.expressionOpacity.ref.js(), [0.75, 0, 0.25]);
    assert.deepEqual(transition.target.expressionOpacity.ref.js(), [0.5, 1, 0]);
    assert.deepEqual(transition.source.displayedOpacity.ref.js(), [0.75, 0, 0.25]);
    assert.deepEqual(transition.target.displayedOpacity.ref.js(), [0.5, 1, 0]);
    assert.equal(transition.target.animation.live, true);
    assert.equal(transition.target.animation.specs.position, position);
    assert.deepEqual(transition.source.animation.specs.interactionOpacity.components[0], { suppressed: true });
    assert.deepEqual(transition.target.animation.specs.interactionOpacity.components[0],
      { explicit: true, duration: 120, easing: "cubic-in-out" });
    transition.show("target");
    assert.equal(transition.shown().expressionOpacity, transition.target.expressionOpacity);
  } finally {
    transition.dispose();
    for (const frame of [old, next]) {
      frame.props.position.dispose(); frame.props.size.dispose(); frame.expressionOpacity.dispose();
    }
  }
});

test("the source frame carries the map from union rows to on-screen rows, and chains from what is shown", () => {
  const old = prepared(["a", "b", "c"], [[1, 0], [2, 0], [3, 0]], [4, 4, 4]);
  const next = prepared(["b", "c", "d"], [[2, 10], [3, 10], [4, 10]], [4, 4, 4]);
  const first = keyedLifecycle(old, next, "Points", { enter: "fade", exit: "fade", animationDuration: 500 });
  assert.deepEqual(first.union, ["b", "c", "d", "a"]);
  assert.deepEqual([...first.staging.index], [1, 2, -1, 0]);
  assert.deepEqual([first.staging.rows, first.staging.oldRows], [4, 3]);
  assert.deepEqual([...first.finalStaging.index], [0, 1, 2]);
  // A second update while the first is on screen: a is still departing, c moves on.
  first.show("target");
  const shown = first.shown();
  assert.deepEqual(shown.keyTokens, ["b", "c", "d", "a"]);
  assert.deepEqual(shown.opacityValues, [1, 1, 1, 0]);
  const later = prepared(["c", "d", "e"], [[3, 0], [4, 0], [5, 0]], [4, 4, 4]);
  const second = keyedLifecycle(shown, later, "Points", { enter: "fade", exit: "fade", animationDuration: 500 });
  assert.deepEqual(second.union, ["c", "d", "e", "b", "a"]);
  assert.deepEqual([...second.staging.index], [1, 2, -1, 0, 3]);
  // Rows on screen start from their shown opacity; a keeps fading, b starts to.
  assert.deepEqual(second.source.lifecycleOpacity.ref.js(), [1, 1, 0, 1, 0]);
  assert.deepEqual(second.target.lifecycleOpacity.ref.js(), [1, 1, 1, 0, 0]);
  for (const t of [first, second]) t.dispose();
  for (const p of [old, next, later]) { p.props.position.dispose(); p.props.size.dispose(); }
});

test("a keyed re-order stages without enter/exit when the mark animates, and keeps its own animation settings", () => {
  const old = prepared(["a", "b", "c"], [[1, 1], [2, 2], [3, 3]], [4, 4, 4]);
  const next = prepared(["c", "a", "b"], [[3, 3], [1, 1], [2, 2]], [4, 4, 4]);
  assert.equal(keyedLifecycle(old, next, "Points", {}), null);
  const transition = keyedLifecycle(old, next, "Points", { animates: true });
  assert.deepEqual([...transition.staging.index], [2, 0, 1]);
  assert.equal(transition.finalStaging, null);
  assert.equal(transition.duration, 0);
  assert.equal(transition.source.lifecycleOpacity, undefined);
  assert.equal("animation" in transition.target.props, false);
  // Nothing moved: no lifecycle at all.
  assert.equal(keyedLifecycle(old, old, "Points", { animates: true }), null);
  transition.dispose();
  for (const p of [old, next]) { p.props.position.dispose(); p.props.size.dispose(); }
});

test("an Anchor stages a keyed union, so departing endpoints stay until the transition ends", () => {
  const anchor = (keys, positions) => ({ keyTokens: keys, props: { position: np.array(positions) } });
  const old = anchor(["a", "b"], [[0, 1], [0, 2]]);
  const next = anchor(["b", "c"], [[0, 20], [0, 30]]);
  const transition = keyedLifecycle(old, next, "Anchor", { exit: true, animationDuration: 100 });
  assert.ok(transition);
  assert.deepEqual(transition.union, ["b", "c", "a"]);
  // The departing row keeps its position in both frames; b moves from its old place.
  assert.deepEqual(transition.source.props.position.ref.js(), [[0, 2], [0, 30], [0, 1]]);
  assert.deepEqual(transition.target.props.position.ref.js(), [[0, 20], [0, 30], [0, 1]]);
  assert.deepEqual([...transition.staging.index], [1, -1, 0]);
  // A keyed re-order of an animating Anchor follows the keys, like any instanced mark.
  const swapped = anchor(["b", "a"], [[0, 2], [0, 1]]);
  const reordered = keyedLifecycle(old, swapped, "Anchor", { animates: true });
  assert.deepEqual([...reordered.staging.index], [1, 0]);
  transition.dispose(); reordered.dispose();
  for (const p of [old, next, swapped]) p.props.position.dispose();
});

test("a Text's dictionary-encoded text stages like any channel, on the categories of both frames", () => {
  // Text read through a Filter, or sent from Python, is {categories, codes}; each frame has its own.
  const text = (categories, codes) => ({ categories, codes: np.array(codes, { dtype: np.int32 }) });
  const old = { keyTokens: ["a", "b", "c"], props: { position: np.array([[1, 1], [2, 2], [3, 3]]), text: text(["A", "B", "C"], [0, 1, 2]) } };
  const next = { keyTokens: ["b", "c", "d"], props: { position: np.array([[2, 9], [3, 9], [4, 9]]), text: text(["D", "B", "C"], [1, 2, 0]) } };
  const transition = keyedLifecycle(old, next, "Text", { enter: "fade", exit: "fade", animationDuration: 100 });
  assert.deepEqual(transition.union, ["b", "c", "d", "a"]);
  const labels = ({ categories, codes }) => codes.ref.js().map((code) => categories[code]);
  assert.deepEqual(labels(transition.source.props.text), ["B", "C", "D", "A"]);
  assert.deepEqual(labels(transition.target.props.text), ["B", "C", "D", "A"]);
  transition.dispose();
  for (const p of [old, next]) { p.props.position.dispose(); p.props.text.codes.dispose(); }
});

test("animation groups stage enter/exit independently of observation identity", () => {
  const old = prepared(["A:2000", "B:2000"], [[0, 0], [10, 10]], [4, 5]);
  const next = prepared(["B:2001", "C:2001"], [[30, 30], [50, 50]], [5, 6]);
  old.animationCorrespondence = { scheme: "country", tokens: ["A", "B"] };
  next.animationCorrespondence = { scheme: "country", tokens: ["B", "C"] };
  const transition = keyedLifecycle(old, next, "Points", { enter: true, exit: true });
  try {
    assert.deepEqual(transition.source.props.position.ref.js(), [[10, 10], [50, 50], [0, 0]]);
    assert.deepEqual(transition.identityUnion, ["B:2001", "C:2001", "A:2000"]);
    assert.deepEqual(transition.shown().animationCorrespondence.tokens, ["B", "C", "A"]);
    assert.deepEqual(transition.shown().keyTokens, transition.identityUnion);
    assert.deepEqual(old.keyTokens, ["A:2000", "B:2000"]);
    assert.equal(keyedLifecycle(old, { ...next, animationCorrespondence: null }, "Points", { animates: true }), null);
  } finally {
    transition.dispose();
    for (const frame of [old, next]) { frame.props.position.dispose(); frame.props.size.dispose(); }
  }
});
