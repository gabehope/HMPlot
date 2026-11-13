// TODO 32.1: a mark's prepared entry is disposed once, releasing what later preparation steps
// added in a fixed order (before its own arrays, newest first; or after them, in order).
import test from "node:test";
import assert from "node:assert/strict";
import { disposeOnce } from "../../src/lib/plot/utils/disposers.js";
import { optionsRoot } from "../../src/lib/options/options.js";
import { prepareNamed } from "../../src/lib/plot/utils/namedData.js";
import { retirePrepared, replaceableRelease } from "../../src/lib/plot/binding/preparedMarkDisposal.js";
import { registerManager } from '../../src/lib/plot/rendering/uploadSettlement.js';
import { createViewServices } from "../../src/lib/plot/utils/viewServices.ts";
import { bindContinuousScales } from "../../src/lib/plot/utils/scaleBindings.js";
import { continuous } from "../../src/lib/plot/utils/scaleResources.js";

test("disposeOnce runs each release once, in order, around the owner's dispose", () => {
  const log = [];
  const owner = disposeOnce({
    dispose() {
      log.push("base");
    },
  });
  owner.own(() => log.push("before 1"));
  owner.own(() => log.push("after 1"), { after: true });
  owner.own(() => log.push("before 2"));
  owner.own(() => log.push("after 2"), { after: true });
  owner.dispose();
  owner.dispose();
  assert.deepEqual(log, ["before 2", "before 1", "base", "after 1", "after 2"]);
  owner.own(() => log.push("late"));
  assert.deepEqual(
    log.at(-1),
    "late",
    "a release added after disposal runs at once",
  );
});

test("a prepared entry can be disposed twice (a failed preparation and its cleanup)", () => {
  const options = optionsRoot.splitUnique("Disposer unit tests");
  const prepared = prepareNamed(
    {
      position: [
        [0, 0],
        [1, 1],
      ],
      size: [1, 2],
    },
    undefined,
    options,
    "Points",
    { hidden: {}, auto: {} },
  );
  let released = 0;
  prepared.own(() => released++);
  prepared.dispose();
  assert.doesNotThrow(() => prepared.dispose());
  assert.equal(released, 1);
});

test("prepared retirement waits for queued consumers, including teardown during a write", async () => {
  let finishWrite, finishGeometry;
  const writes = new Promise((resolve) => { finishWrite = resolve; });
  const geometry = new Promise((resolve) => { finishGeometry = resolve; });
  const renderer = {}, view = createViewServices();
  view.attachRenderer(renderer);
  view.lifecycle.geometryQueue = geometry;
  const releaseManager = registerManager({ renderer, chain: writes });
  let releases = 0;
  const entry = disposeOnce({ dispose() { releases++; } });
  const retired = retirePrepared(view, entry);
  await Promise.resolve();
  assert.equal(releases, 0);
  finishWrite();
  await Promise.resolve();
  assert.equal(releases, 0, "geometry may still borrow the prepared arrays");
  finishGeometry();
  await retired;
  entry.dispose();
  releaseManager();
  assert.equal(releases, 1);
});

test("scale contributions join the prepared owner, including a late commit after disposal", async () => {
  const scale = continuous();
  let releases = 0;
  const contribute = scale.normalization.contribute;
  scale.normalization.contribute = (...args) => {
    const release = contribute.apply(scale.normalization, args);
    return () => { releases++; release(); };
  };
  for (const late of [false, true]) {
    const prepared = prepareNamed({ position: [[0, 0], [1, 1]], fill: [1, 2] }, undefined,
      optionsRoot.splitUnique("Scale owner"), "Points", { hidden: {}, auto: {} });
    await bindContinuousScales({ props: { fill: [1, 2], fillScale: scale }, prepared,
      kind: "Points", owners: {} });
    if (late) prepared.dispose();
    prepared.commitScales();
    prepared.commitScales();
    prepared.dispose();
    prepared.dispose();
  }
  assert.equal(releases, 2);
});

test("a replaceable release holds one reference: each replacement and the entry's disposal release the last", () => {
  const log = [];
  const entry = disposeOnce({ dispose() { log.push("base"); } });
  const live = replaceableRelease(entry);
  live.replace(() => log.push("scope 1"));
  live.replace(() => log.push("scope 2"));
  assert.deepEqual(log, ["scope 1"], "a new scope releases the previous one");
  entry.dispose();
  assert.deepEqual(log, ["scope 1", "scope 2", "base"]);
  live.replace(() => log.push("late"));
  assert.equal(log.at(-1), "late", "a release handed in after disposal runs at once");
});
