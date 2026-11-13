import test from "node:test";
import assert from "node:assert/strict";
import { numpy as np } from "@hmplot/jax";
import { createDataScope } from "../../src/lib/plot/utils/categorical.js";
import {
  forceTopology as forceTopologyImpl,
  forceStep,
  forceConstraint,
  initialPositions,
} from "../../src/lib/plot/utils/force.js";
import { add } from '../../src/lib/plot/utils/expressions.js';
import { createExpressionEvaluator } from '../../src/lib/plot/utils/expressionPlans.js';
import { graphFixture } from './helpers/graphFixture.js';
import { layoutBoundary, layoutRelation, markLayoutPolicy, registerLayoutView } from '../../src/lib/plot/utils/forceContext.js';

test('Force initial expressions reuse the consumer program and retain seeded missing positions', async () => {
  const scope = createDataScope(), evaluator = createExpressionEvaluator();
  scope.update({ weight: Float32Array.from([2, NaN, 8]) });
  const topology = { nodeScope: scope, config: { dimensions: 2 }, n: 3,
    degree: np.zeros([3]), initial: np.array([[1, 7], [10, 8], [20, 9]]) };
  try {
    for (const offset of [1, 2]) {
      const positions = await initialPositions(topology, scope, { x: add('weight', offset), y: 0 }, evaluator);
      try { assert.deepEqual(Array.from(await positions.ref.data()), [2 + offset, 0, 10, 0, 8 + offset, 0]); }
      finally { positions.dispose(); }
    }
    assert.equal(evaluator.stats.traces, 1);
    assert.equal(evaluator.stats.hits, 1);
  } finally { evaluator.dispose(); topology.degree.dispose(); topology.initial.dispose(); scope.dispose(); }
});

test('private layout policy keeps node dragging and iteration out of ordinary tables', () => {
  const force = { select() {}, constrain() {}, read() {} };
  let drag = true;
  const nodes = layoutRelation(force, 'nodes', () => drag);
  assert.deepEqual(markLayoutPolicy(nodes), { iterative: true, force: nodes });
  assert.equal(markLayoutPolicy(nodes, false).force, null);
  assert.equal(markLayoutPolicy(nodes, true).force, null);
  assert.equal(markLayoutPolicy(nodes, { x: 'x' }).force, null);
  drag = false;
  assert.equal(markLayoutPolicy(nodes).force, null);
  drag = true;
  const edges = layoutRelation(nodes, 'edges');
  assert.equal(markLayoutPolicy(edges).iterative, true);
  assert.equal(markLayoutPolicy(edges).force, null);
  assert.equal(markLayoutPolicy(layoutRelation(edges, 'nodes', () => true)).force?.constrain, force.constrain);
  const tree = layoutRelation({ iterative: false }, 'nodes', () => true);
  assert.deepEqual(markLayoutPolicy(tree), { iterative: false, force: null });
  assert.deepEqual(markLayoutPolicy(undefined), { iterative: false, force: null });
});

test('selectors and drawing children share one retained private layout view registration', () => {
  let registered = 0, released = 0;
  const layout = { registerView() { registered++; return () => released++; } }, view = {};
  const nodes = layoutRelation(layout, 'nodes'), edges = layoutRelation(nodes, 'edges');
  const selector = registerLayoutView(nodes, view), mark = registerLayoutView(edges, view);
  assert.equal(registered, 1);
  selector(); selector();
  assert.equal(released, 0);
  mark();
  assert.equal(released, 1);
  const remount = registerLayoutView(edges, view);
  assert.equal(registered, 2);
  remount();
  assert.equal(released, 2);
  assert.doesNotThrow(registerLayoutView(nodes, undefined));
  assert.doesNotThrow(registerLayoutView(undefined, view));
});

test('optional independent data suspends and restores inherited layout policy and view registrations', () => {
  let inherited = true, registered = 0, released = 0;
  const force = { select() {}, constrain() {}, registerView() { registered++; return () => released++; } };
  const boundary = layoutBoundary(layoutRelation(force, 'nodes', () => true), () => inherited), view = {};
  const child = layoutRelation(boundary, 'nodes', () => true);
  assert.equal(markLayoutPolicy(child).force, child);
  const first = registerLayoutView(child, view);
  inherited = false; first();
  assert.deepEqual(markLayoutPolicy(child), { iterative: false, force: null });
  const independent = registerLayoutView(child, view); independent();
  assert.deepEqual([registered, released], [1, 1]);
  assert.deepEqual(markLayoutPolicy(layoutBoundary(child, () => true)), { iterative: false, force: null });
  inherited = true;
  assert.equal(markLayoutPolicy(child).force, child);
  const restored = registerLayoutView(child, view); restored(); restored();
  assert.deepEqual([registered, released], [2, 2]);
  assert.equal(layoutBoundary(undefined, () => true), undefined);
});

async function forceTopology(scope, config, options) {
  const { source, target, nodes, nodeKey, ...settings } = config;
  const fixture = await graphFixture(scope, { source, target, nodes, nodeKey });
  try { return await forceTopologyImpl(fixture.scope, settings, options); }
  finally { fixture.dispose(); }
}
test("force simultaneous springs, duplicates, self loops, and pins match reference", async () => {
  const s = createDataScope();
  s.update({ source: ["a", "a", "b", "c"], target: ["b", "b", "c", "c"] });
  const t = await forceTopology(s, { source: "source", target: "target" });
  const p = np.array([
      [0, 0],
      [40, 0],
      [80, 0],
    ]),
    v = np.zeros([3, 2]),
    pins = np.array([false, false, true]);
  try {
    assert.deepEqual(Array.from(await t.degree.ref.data()), [2, 3, 3]);
    const next = await forceStep(
      t,
      p,
      v,
      pins,
      p,
      { repulsion: 0, centering: 0 },
      1,
    );
    try {
      const x = Array.from(await next.position.ref.data());
      assert.ok(Math.abs(x[0] - 1.2 * Math.pow(0.001, 1 / 300)) < 1e-5);
      assert.ok(Math.abs(x[2] - (40 - 0.6 * Math.pow(0.001, 1 / 300))) < 1e-5);
      assert.equal(x[4], 80);
      assert.ok(Math.abs(next.alpha - Math.pow(0.001, 1 / 300)) < 1e-12);
    } finally {
      next.position.dispose();
      next.velocity.dispose();
    }
  } finally {
    p.dispose();
    v.dispose();
    pins.dispose();
    t.dispose();
    s.dispose();
  }
});
test("force seeded topology reproduces initial positions and rejects negative weights", async () => {
  const s = createDataScope();
  s.update({ source: [1, 2], target: [2, 3], weight: [1, -1] });
  const a = await forceTopology(s, { source: "source", target: "target" }),
    b = await forceTopology(s, { source: "source", target: "target" });
  try {
    assert.deepEqual(await a.initial.ref.data(), await b.initial.ref.data());
    await assert.rejects(
      forceTopology(s, {
        source: "source",
        target: "target",
        weight: "weight",
      }),
      /nonnegative/,
    );
  } finally {
    a.dispose();
    b.dispose();
    s.dispose();
  }
});

test("repeated constraints materialize pins and preserve other nodes without advancing velocity", async () => {
  const state = {
    position: np.array([
      [0, 0],
      [1, 1],
      [2, 2],
    ]),
    pinPosition: np.zeros([3, 2]),
    pins: np.zeros([3], { dtype: np.bool }),
  };
  try {
    for (let i = 0; i < 256; i++) {
      const next = await forceConstraint(state, i % 2, [i, -i], i % 3 !== 0);
      for (const key of Object.keys(next)) {
        state[key].dispose();
        state[key] = next[key];
      }
    }
    assert.deepEqual(
      Array.from(await state.position.ref.data()),
      [254, -254, 255, -255, 2, 2],
    );
    assert.deepEqual(Array.from(await state.pins.ref.data()).map(Boolean), [
      true,
      false,
      false,
    ]);
    await assert.rejects(forceConstraint(state, 4, [0, 0]), /Invalid/);
  } finally {
    Object.values(state).forEach((a) => a.dispose());
  }
});
for(const dimensions of [2,3])for(const [name,source,target] of [
 ['chain',[0,1,2],[1,2,3]],['star',[0,0,0],[1,2,3]],['disconnected',[0,2],[1,3]],['duplicates/self',[0,0,1,2,3],[1,1,1,3,3]],['dense',[0,0,0,1,1,2],[1,2,3,2,3,3]]
])test(`${dimensions}D ${name} force remains finite from coincident starts`,async()=>{
 const scope=createDataScope();scope.update({source,target});const topology=await forceTopology(scope,{source:'source',target:'target',dimensions});let position=np.zeros([topology.n,dimensions]),velocity=np.zeros([topology.n,dimensions]),alpha=1;const pins=np.zeros([topology.n],{dtype:np.bool}),pinned=position.ref;
 try{for(let i=0;i<60;i++){const next=await forceStep(topology,position,velocity,pins,pinned,{dimensions},alpha);position.dispose();velocity.dispose();position=next.position;velocity=next.velocity;alpha=next.alpha;}assert.ok(Array.from(await position.ref.data()).every(Number.isFinite));}finally{position.dispose();velocity.dispose();pins.dispose();pinned.dispose();topology.dispose();scope.dispose();}
});
