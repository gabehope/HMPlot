// TODO 118.1: how a mark applies an update to its published preparation (utils/markUpdatePlan.js).
import test from "node:test";
import assert from "node:assert/strict";
import { planMarkUpdate, planFeedbackUpdate } from "../../src/lib/plot/utils/markUpdatePlan.js";
import { channelDependencyKey } from "../../src/lib/plot/binding/preparationDependencies.js";
import { col, mean } from "../../src/lib/plot/utils/expressions.js";

const columns = { a: [1, 2], b: [3, 4], c: [5, 6], label: ["p", "q"] };
const rows = () => ({ length: 2, version: 1, has: (field) => field in columns, get: (field) => columns[field],
  metadata: () => undefined });

/**
 * A published preparation and an update to it. The update changes nothing but the dependency
 * keys of `changed`; `live` are the channels whose upstream columns are live (the animation's).
 */
function fixture(kind, { channels: extra = {}, changed = [], live = changed } = {}) {
  const channels = { x: "a", y: "b", ...(kind === "Text" ? { text: "label" } : {}), ...extra };
  const markScope = rows();
  const keys = (bumped) => Object.fromEntries(["__rowKey", ...Object.keys(channels)]
    .map((name) => [name, [name, bumped.includes(name) ? 2 : 1]]));
  const liveChannels = Object.fromEntries(live.map((name) => [name, channels[name]]));
  const request = { markScope, generation: 1, revision: 1, channels, dependencies: keys([]),
    liveDependencies: channelDependencyKey(channels, markScope, liveChannels),
    staticDependencies: kind === "Text" ? channelDependencyKey(channels, markScope) : null };
  const entry = { request };
  return {
    state: { kind, entry, shown: entry, requested: request, mark: {}, transitioning: false, interactivePositions: false,
      placement: false, domainsFixed: true },
    next: { scope: markScope, markScope, generation: 1, revision: 1, props: { ...channels },
      animation: { channels: {}, liveChannels }, dependencies: keys(changed), mode: null },
  };
}
const plan = ({ state, next }) => planMarkUpdate(state, next);
const action = (update) => plan(update).action;
const withChange = (update, change) => (change(update), update);

test("an unchanged Text keeps its preparation unless something could read it differently", () => {
  assert.deepEqual(plan(fixture("Text")), { action: "reuse-static" });
  assert.equal(action(fixture("Points")), "prepare", "static reuse is Text's alone");
  // A transition on screen does not stop static reuse (it keeps the active keyed fade).
  assert.equal(action(withChange(fixture("Text"), ({ state }) => (state.transitioning = true))), "reuse-static");
  for (const [reason, change] of [
    ["a tooltip", ({ state }) => (state.entry.tooltip = {})],
    ["a hover binding", ({ state }) => (state.entry.interaction = { hover: {} })],
    ["a handler", ({ state, next }) => (state.entry.request.channels.onclick = next.props.onclick = () => {})],
    ["a padded view", ({ state }) => (state.entry.paddedMode = "prefix")],
    ["a Force drag", ({ state }) => (state.interactivePositions = true)],
    ["a Dodge layout", ({ state }) => (state.placement = true)],
    ["an inferred scale", ({ state }) => (state.entry.scaleBindings = [{ scale: { normalization: { explicit: false } } }])],
    ["a disposed mark", ({ state }) => (state.mark.isDisposed = true)],
    ["a newer full preparation", ({ state }) => (state.requested = {})],
    ["a new data generation", ({ next }) => (next.generation = 2)],
    ["a new revision", ({ next }) => (next.revision = 2)],
    ["a different channel", ({ next }) => (next.props.text = "a")],
    ["a changed text column", ({ next }) => (next.dependencies.text = ["text", 2])],
  ])
    assert.equal(action(withChange(fixture("Text"), change)), "prepare", reason);
  // Unknown dependencies fall back to the static key, which live upstream columns rule out.
  assert.equal(action(withChange(fixture("Text"), ({ next }) => (next.dependencies.x = null))), "reuse-static");
  assert.equal(action(withChange(fixture("Text", { live: ["x"] }), ({ next }) => (next.dependencies.x = null))),
    "prepare");
});

test("changed numeric geometry is written live, with Text's own rules", () => {
  assert.deepEqual(plan(fixture("Points", { changed: ["x"] })), { action: "write-live", channels: { x: "a" } });
  assert.deepEqual(plan(fixture("Text", { changed: ["x"] })), { action: "write-live", channels: { x: "a" } });
  // Unknown dependencies: a Points mark writes its live channels; a Text prepares.
  const unknown = ({ next }) => (next.dependencies.y = null);
  assert.deepEqual(plan(withChange(fixture("Points", { live: ["x"] }), unknown)), { action: "write-live", channels: { x: "a" } });
  assert.equal(action(withChange(fixture("Text", { live: ["x"] }), unknown)), "prepare");
  // Live writes need the published entry on screen, with no transition, and live unchanged reads.
  assert.equal(action(withChange(fixture("Points", { changed: ["x"] }), ({ state }) => (state.shown = null))), "prepare");
  assert.equal(action(withChange(fixture("Text", { changed: ["x"] }), ({ state }) => (state.transitioning = true))), "prepare");
  assert.equal(action(withChange(fixture("Points", { changed: ["x"] }), ({ state }) => (state.entry.request.liveDependencies = []))),
    "prepare");
  assert.equal(action(fixture("Points", { changed: ["fill"], channels: { fill: "c" } })), "prepare", "paint prepares");
  assert.equal(action(withChange(fixture("Text", { changed: ["x"] }), ({ next }) => (next.markScope.metadata = () => ({ type: "categorical" })))),
    "prepare", "a categorical read");
  // TODO 118.4: Dodge's offsets read every row's position, so a dodged mark prepares.
  assert.equal(action(withChange(fixture("Points", { changed: ["x"] }), ({ state }) => (state.placement = true))), "prepare");
  // Rows that follow the mask and an animated opacity: Text writes live, other marks prepare.
  const follows = ({ next }) => (next.scope.followsMask = true);
  assert.equal(action(withChange(fixture("Text", { changed: ["x"] }), follows)), "write-live");
  assert.equal(action(withChange(fixture("Points", { changed: ["x"] }), follows)), "prepare");
  const animated = (channel) => ({ next }) => (next.animation.channels[channel] = { duration: 1 });
  assert.equal(action(withChange(fixture("Text", { changed: ["x"] }), animated("x"))), "prepare");
  // Text's opacity is live over a row opacity no interaction is dimming.
  const opacity = () => fixture("Text", { changed: ["opacity"], channels: { opacity: "c" } });
  assert.equal(action(opacity()), "prepare", "no row opacity");
  const rowOpacity = ({ state }) => (state.entry.expressionOpacity = {});
  assert.equal(action(withChange(withChange(opacity(), rowOpacity), animated("opacity"))), "write-live");
  assert.equal(action(withChange(opacity(), ({ state }) => (state.entry.expressionOpacity = state.entry.interaction =
    { owner: {}, selection: { isSelection: true, active: true } }))), "prepare");
  for (const [reason, change] of [
    ["a Force drag", ({ state }) => (state.interactivePositions = true)],
    ["a Dodge layout", ({ state }) => (state.placement = true)],
    ["a keyed lifecycle's feedback", ({ state }) => (state.entry.lifecycleInteraction = {})],
  ])
    assert.equal(action(withChange(fixture("Text", { changed: ["x"] }), change)), "prepare", reason);
});

test("a scattered mark swaps its row mask when only its valid rows changed", () => {
  const scattered = (kind, options) => withChange(fixture(kind, options), ({ state, next }) => {
    Object.assign(state.entry, { paddedMode: "scattered", filterMembership: {}, valid: {} });
    Object.assign(next, { mode: "scattered" });
    next.markScope.valid = {};
  });
  assert.equal(action(scattered("Points")), "swap-mask");
  for (const [reason, change] of [
    ["inferred axis domains", ({ state }) => (state.domainsFixed = false)],
    ["an inferred scale", ({ state }) => (state.entry.scaleBindings = [{ scale: { normalization: { explicit: false } } }])],
    ["values that follow the mask", ({ next }) => (next.scope.followsMask = true)],
    ["a transition on screen", ({ state }) => (state.transitioning = true)],
    ["another padded form", ({ next }) => (next.mode = "masked")],
    // TODO 118.2: a Calculate before the Filter changes the drawn column with the mask.
    ["a changed column", ({ next }) => (next.dependencies.y = ["y", 2])],
  ])
    assert.equal(action(withChange(scattered("Points"), change)), "prepare", reason);
  assert.equal(action(scattered("Points", { channels: { size: mean(col("a")) } })), "prepare", "a reduction");
  // A Text that keeps its mask writes its geometry live before a swap is considered.
  const kept = withChange(scattered("Text", { changed: ["x"] }), ({ state, next }) => (next.markScope.valid = state.entry.valid));
  assert.equal(action(kept), "write-live");
  assert.equal(action(scattered("Text")), "swap-mask");
});

test("an interaction's membership change rewrites a hovered size in place, else plans again", () => {
  const field = { count: 2 };
  const feedback = (kind, change = () => {}) => {
    const state = { kind, entry: {}, mark: { fields: new Map([["size", field]]) }, placement: false, transitioning: false };
    const next = { props: { size: "@hovered" }, markScope: { length: 2 }, interactionChannels: [["size", "@hovered"]] };
    change(state, next);
    return planFeedbackUpdate(state, next);
  };
  assert.deepEqual(feedback("Points"), { action: "write-feedback", channel: "size", field });
  for (const kind of ["Points3D", "Text", "Rect"]) assert.equal(feedback(kind).action, "replan", kind);
  for (const [reason, change] of [
    ["another channel", (state, next) => (next.interactionChannels = [["fill", "@hovered"]])],
    // Both absent: their undefined counts must not pass as equal.
    ["no writable field and no scope", (state, next) => { state.mark.fields.clear(); next.markScope = undefined; }],
    ["two channels", (state, next) => next.interactionChannels.push(["fill", "@selected"])],
    ["a size scale", (state, next) => (next.props.sizeScale = {})],
    ["a Dodge layout", (state) => (state.placement = true)],
    ["a transition on screen", (state) => (state.transitioning = true)],
    ["series rows", (state) => (state.entry.interactionIndex = {})],
    ["a field of other rows", (state, next) => (next.markScope = { length: 3 })],
  ])
    assert.equal(feedback("Points", change).action, "replan", reason);
});
