// The view's frame model (Stage 119.1, src/lib/plot/utils/frameModel.ts): root selection and
// publication, parentage, and per-dimension ownership.
import test from "node:test";
import assert from "node:assert/strict";
import {
  createFrameModel,
  dimensionMode,
  frameOwnership,
  registerFrameContent,
} from "../../src/lib/plot/utils/frameModel.ts";
import { pendingRootContent } from "../../src/lib/plot/utils/rootFrameSelection.js";

test("a frame owns a dimension it configures; a child inherits the rest, a promoted root adopts them", () => {
  const modes = (nested, promoted) =>
    [{}, { domain: [0, 1] }, { side: "top" }, { scale: {} }].map((config) =>
      dimensionMode(config, { nested, promoted }),
    );
  assert.deepEqual(modes(false, false), ["local", "local", "local", "local"]);
  assert.deepEqual(modes(true, false), [
    "inherited",
    "local",
    "inherited",
    "local",
  ]);
  assert.deepEqual(modes(true, true), ["adopted", "local", "adopted", "local"]);
  const state = {
    nested: true,
    promoted: false,
    config: { x: { range: [0, 1] } },
  };
  const ownership = frameOwnership(() => state);
  assert.deepEqual(
    [ownership.owns("x"), ownership.owns("y"), ownership.adopts("y")],
    [true, false, false],
  );
  state.promoted = true;
  assert.deepEqual(
    [ownership.owns("y"), ownership.adopts("y"), ownership.adopts("x")],
    [true, true, false],
  );
});

test("the root publishes only after pending content settles, and a Frame's candidacy follows its props", async () => {
  const model = createFrameModel();
  const props = { x: {} };
  const frame = registerFrameContent(model.content, () => props);
  // A top-level wrapper still preparing its children (a pending one inside the Frame is the
  // Frame's own content and holds nothing).
  const inner = pendingRootContent(frame.context);
  const release = pendingRootContent(model.content);
  assert.equal(model.selectedRoot(), undefined);
  let published = false;
  const publication = model.whenPublished().then(() => (published = true));
  release();
  assert.equal(model.selectedRoot(), frame.key);
  await Promise.resolve();
  assert.equal(published, false, "selected but not yet published");
  assert.equal(model.activate(frame.key), true);
  assert.equal(model.activate(frame.key), false);
  await publication;
  assert.ok(model.isRoot(frame.key) && !model.isRoot(undefined));
  props.x = { range: [0, 1] };
  frame.changed();
  assert.equal(model.selectedRoot(), null, "a ranged Frame is never the root");
  inner();
  frame.release();
  assert.deepEqual(model.entries(), []);
});

test("frames: the root frame, parents, inheritance and whether the implicit root is in use", () => {
  const model = createFrameModel();
  const entry = (
    logicalKey,
    parentKey,
    owned,
    spatial = false,
    parent = root?.options,
  ) => ({
    key: String(logicalKey),
    logicalKey,
    parentKey,
    spatial,
    options: {
      frameDefinition: {
        owns: (axis) => owned.includes(axis),
        parent: parentKey == null ? null : parent,
      },
    },
  });
  let root;
  root = entry(undefined, null, "xyz");
  const frame = entry("f", "0", "xyz");
  model.registerFrame(root);
  const release = model.registerFrame(frame);
  assert.deepEqual([root.slot, frame.slot], [0, 1]);
  assert.equal(model.rootFrame(), root);
  assert.equal(model.promotedOptions(), null);
  assert.equal(model.implicitRootUsed(), false);
  model.activate("f");
  assert.equal(model.rootFrame(), frame);
  // The Plot's own frame stays its implicit root while a Frame is promoted.
  assert.equal(model.implicitRoot(), root);
  assert.equal(model.promotedOptions(), frame.options);
  assert.equal(model.parentKey({ parentFrameKey: "0", promoted: true }), null);
  assert.equal(model.implicitRootActive(), false);
  model.activate(null);
  release();
  // A twin axis (a root-side child that inherits x) uses the implicit root; a spatial one does not.
  const twin = entry("t", "0", "y"),
    inset = entry("i", "0", "y", true);
  model.registerFrame(inset);
  assert.equal(model.implicitRootUsed(), false);
  model.registerFrame(twin);
  assert.ok(
    model.implicitRootUsed() &&
      model.inherits(twin, "x") &&
      !model.inherits(twin, "y"),
  );
  assert.equal(model.inherits(root, "x"), false);
  // Per axis (TODO 134.13): the twin owns its y, so nothing plots on the root's y; a Frame inside
  // the twin that inherits y uses the twin's.
  model.registerFrame(entry("g", "t", "x", false, twin.options));
  assert.deepEqual(
    [model.implicitRootUses("x"), model.implicitRootUses("y")],
    [true, false],
  );
  model.setImplicitRootUnusedAxes(["y"]);
  assert.deepEqual(
    [model.implicitRootShows("x"), model.implicitRootShows("y")],
    [true, false],
  );
  model.setImplicitRootUnusedAxes([]);
  model.setImplicitRootUnused(true);
  assert.equal(model.implicitRootActive(), false);
  model.setImplicitRootUnused(false);
  assert.equal(model.implicitRootActive(), true);
  // Content directly in the Plot uses it too.
  const plain = createFrameModel();
  plain.content.register({ kind: "content", key: "point", parentKey: null });
  assert.equal(plain.implicitRootUsed(), true);
});
