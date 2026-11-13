import test from "node:test";
import assert from "node:assert/strict";
import { selectRootFrame, pendingRootContent } from "../../src/lib/plot/utils/rootFrameSelection.js";

const frame = (key, parentKey = null, other = {}) => ({ kind: "frame", key, parentKey, ...other });
const content = (key, parentKey = null) => ({ kind: "content", key, parentKey });

test("a single unplaced top-level Frame owns Plot coordinates through transparent wrappers", () => {
  const entries = [frame("root"), content("point", "root"), frame("inset", "root"),
    content("inner", "inset"), { kind: "decoration", key: "title", parentKey: null }];
  assert.equal(selectRootFrame(entries), "root");
  assert.equal(selectRootFrame([...entries].reverse()), "root");
});

test("direct content, sibling, ranged, placed, and generated spatial frames retain the implicit root", () => {
  for (const entries of [[], [content("point")], [frame("one"), content("outside")],
    [frame("one"), frame("two")], [frame("one", null, { ranged: true })],
    [frame("one", null, { placed: true })], [frame("one", null, { spatial: true })],
    [frame("one"), { kind: "spatial", key: "facet", parentKey: null }]])
    assert.equal(selectRootFrame(entries), null, JSON.stringify(entries));
});

test("a pending wrapper defers root publication until its children register", () => {
  const entries = [frame("root")];
  const owner = { parentKey: null, register(entry) {
    entries.push(entry);
    return () => entries.splice(entries.indexOf(entry), 1);
  } };
  const release = pendingRootContent(owner);
  assert.equal(selectRootFrame(entries), undefined);
  entries.push(content("late"));
  assert.equal(selectRootFrame(entries), undefined);
  release(); release();
  assert.equal(selectRootFrame(entries), null);
});
