import test from "node:test";
import assert from "node:assert/strict";
import { noteTransformRun, rerunLints, RERUN_BURST } from "../../src/lib/plot/utils/rerunGuard.js";

// 2026-10-22: a transform re-running on every pointer move lints once its densest second
// reaches RERUN_BURST runs; data and settings runs, and a tween's, never do.
test("the re-run guard lints an interaction-driven transform that bursts, and nothing else", () => {
  const counters = { transformRuns: {}, reruns: new Map() };
  const services = { diagnostics: { counters } };
  const filter = {}, calculate = {}, tweened = {};
  for (let i = 0; i < RERUN_BURST; i++)
    noteTransformRun(services, filter, { kind: "Filter", name: "hovered", cause: "interaction", now: i * 50 });
  for (let i = 0; i < 100; i++) noteTransformRun(services, calculate, { kind: "Calculate", cause: "settings", now: i });
  for (let i = 0; i < 100; i++) noteTransformRun(services, tweened, { kind: "Calculate", cause: "tween", now: i });
  assert.deepEqual(counters.transformRuns, { interaction: RERUN_BURST, settings: 100, tween: 100 });
  const lints = rerunLints(counters);
  assert.equal(lints.length, 1);
  assert.equal(lints[0].code, "lint.rerun-per-pointer");
  assert.match(lints[0].message, /^Filter "hovered": re-ran 10 times within one second because a selection, brush or hover changed/);
  assert.match(lints[0].message, /respond=/);
  // Runs spread over more than a second never burst.
  const slow = { transformRuns: {}, reruns: new Map() }, sort = {};
  for (let i = 0; i < 30; i++) noteTransformRun({ diagnostics: { counters: slow } }, sort, { kind: "Sort", cause: "view", now: i * 400 });
  assert.equal(rerunLints(slow).length, 0);
  assert.equal(slow.reruns.get(sort).burst, 3);
  // Outside a view (no services) nothing is counted and nothing throws.
  noteTransformRun(undefined, {}, { kind: "Filter", cause: "interaction" });
});
