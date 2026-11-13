import { trackPreparation } from "../rendering/viewSettlement.js";
import { markAnimation } from "./markAnimation.js";
import { isAnimate, TRANSFORM_KINDS, checkTiming } from "./animation.js";
import { expressionFields, expressionTweens, isExpression } from "./expressions.js";
import { viewStateReads } from "./viewState.js";
import { CONNECTION_FIELDS } from "./connectionPrepare.js";

/**
 * A mark's channel animation, out of namedMark.svelte (TODO 32.6) so it is tested alone:
 * which channels animate and how (channelAnimation), which field each channel writes
 * (channelField), and the per-component specs of the mark's fields (fieldAnimation).
 * `options` is the mark's options node, `scope` its data scope (for current live columns), and
 * `transformKind(axis)` the scale-space kind of an axis.
 */
const AXES = ["x", "y", "z"];
// Props that are not channels: nothing there animates, and animate() is an error.
const NOT_CHANNELS = new Set(["enterEffect", "exitEffect", "identity", "select", "hover", "brush", "nearby", "nearest", "respond", "series",
  "animation", "animationDuration", "animationEasing", "selectionOpacity", "name", "options", "curve", "curveAlpha",
  "connections", "drag", "depthWrite"]);

// Channel-level animation: animate() descriptors unwrap to their value (props is edited in
// place). Expression producers evaluate tween() in raw units; upstream columns already hold
// current values and suppress implicit duplicate interpolation. @time is procedural. Inside interval()
// @time makes it stepped instead (TODO 28): re-evaluated at each step, which is an ordinary
// data change and animates as one. Over a live view (a transform reads @time) the implicit
// transition is off: every frame brings new data.
/** @param {import("./markPlanTypes.js").Channels} props
 * @param {{options: import("../../options/options.js").OptionsNode, scope?: import("./dataViewTypes.js").RowScope|null}} inputs
 * @returns {import("./markPlanTypes.js").PreparedAnimation} */
export function channelAnimation(props, { options, scope }) {
  const duration = () => Number(props.animationDuration ?? options.get("animationDuration") ?? 300);
  const easing = () => props.animationEasing ?? options.get("animationEasing") ?? "cubic-in-out";
  const channels = {}, procedural = {}, stepped = {}, tweened = {}, enter = {}, exit = {}, tracked = {}, clocked = {}, liveChannels = {};
  for (const [key, value] of Object.entries(props)) {
    if (/^on|Scale$/.test(key) || NOT_CHANNELS.has(key)) {
      if (isAnimate(value)) throw Error(`${key}: animate() belongs on a mark channel, and ${key} is not one.`);
      continue;
    }
    if (isAnimate(value)) {
      checkTiming("animate", value);
      channels[key] = { duration: value.duration ?? duration(), easing: value.easing ?? easing(), scale: true };
      if (value.enter !== undefined) enter[key] = value.enter;
      if (value.exit !== undefined) exit[key] = value.exit;
      props[key] = value.value;
      if (isExpression(value.value) && viewStateReads(value.value).live)
        throw Error(`${key}: animate() of a @time expression; @time already moves every frame. Inside interval(@time, ms) it animates each step.`);
    }
    const inner = props[key];
    // A channel reading the pointer or the visible domain re-evaluates as they change, without a
    // transition (TODO 45, 19).
    const none = { live: false, stepped: false, tracked: false };
    // A composed vector (start={["x", "@view_y_min"]}) reads what its components read.
    const reads = isExpression(inner) || typeof inner === "string" ? viewStateReads(inner)
      : Array.isArray(inner) ? inner.reduce((output, item) => viewStateReads(item, output), { ...none }) : none,
      timed = reads.live || reads.tracked;
    const tweens = isExpression(inner) ? expressionTweens(inner) : [];
    const read = typeof inner === "string" ? [inner] : isExpression(inner) ? [...expressionFields(inner)] : [];
    // An expression's own tween is evaluated by its producer; an upstream live
    // column already contains current values. Neither starts a second mark transition.
    if (tweens.length) tweened[key] = inner;
    if (read.some((field) => scope?.liveColumns?.has?.(field))) liveChannels[key] = inner;
    if (timed) procedural[key] = inner;
    else if (reads.stepped) stepped[key] = inner;
    if (reads.tracked) tracked[key] = inner;
    if (reads.live || reads.stepped) clocked[key] = inner;
  }
  // `tracked`: the channels that read the pointer or the visible domain; `clocked`: those that read
  // @time (they step on the clock; a mark whose timed channels are only tracked steps as the
  // pointer moves or the view changes).
  return { channels, procedural, stepped, tweened, enter, exit, tracked, clocked, liveChannels, live: Boolean(scope?.live) };
}
// The field a channel writes is not always named after it: x/y/z are components of
// position, categorical and RGB colors write categoryColor / categoryOutline, a shape
// column writes symbolCode, and per-row opacity rides the interactionOpacity field.
export function channelField(channel, frame) {
  const out = frame?.props ?? {};
  if (['Rect','Prism'].includes(frame?.kind) && /^[xyz][01]$/.test(channel))
    return channel[1] === '0' ? 'position' : 'extent';
  if (AXES.includes(channel) || channel === "position") return "position";
  if ((channel === "fill" || channel === "color") && out.categoryColor !== undefined &&
      (frame.metadata?.[channel] || out[channel] === "#92989f")) return "categoryColor";
  if (channel === "outlineColor" && out.categoryOutline !== undefined && out.outlineColor === undefined) return "categoryOutline";
  if ((channel === "shape" || channel === "shapeField") && out.symbolCode !== undefined) return "symbolCode";
  if (channel === "opacity" && frame.scalarOpacity) return "_channelOpacity";
  if (channel === "opacity" && frame.expressionOpacity) return "interactionOpacity";
  return channel;
}
// Field-level specs for the mark's fields, per component: an explicit animate()/tween
// component, a suppressed (procedural) component, or null for the implicit transition.
// Scale-space kinds: position components use their axis transform, continuous color, size
// and width channels their normalization's transform, shape codes step at 0.5, and tweens
// move in raw units.
/** @param {import("./markPlanTypes.js").PreparedAnimation|undefined} animation
 * @param {import("./internalTypes.js").PreparedMark} next
 * @param {(axis: string) => number} transformKind
 * @param {(axis: string) => number} [transformConstant]
 * @returns {{specs: Record<string, import("./markPlanTypes.js").AuthoredFieldAnimation>, kinds: Record<string, number[]>}} */
export function fieldAnimation(animation, next, transformKind, transformConstant = () => 1) {
  const specs = {}, positionKinds = [transformKind("x"), transformKind("y"), transformKind("z"), 0],
    positionConstants = [transformConstant("x"), transformConstant("y"), transformConstant("z"), 1];
  const step = TRANSFORM_KINDS.step;
  const entry = (field) => (specs[field] ??= {
    kinds: field === "position" || field === "extent" ? [...positionKinds] : field === "symbolCode" ? [step, step, step, step] : [0, 0, 0, 0],
    constants: field === "position" || field === "extent" ? [...positionConstants] : [1, 1, 1, 1],
    components: [null, null, null, null], explicit: false,
  });
  const targets = (channel, field) => ['position','extent'].includes(field) && /^[xyz][01]?$/.test(channel)
    ? [AXES.indexOf(channel[0])] : [0, 1, 2, 3];
  for (const { channel, scale } of next.scaleBindings ?? []) {
    const field = channelField(channel, next), kind = TRANSFORM_KINDS[scale?.normalization?.transform];
    if (field !== "position" && kind !== undefined) {
      const constant = scale.normalization.constant ?? 1;
      Object.assign(entry(field), { kinds: [kind, kind, kind, kind], constants: [constant, constant, constant, constant] });
    }
  }
  for (const [channel, timing] of Object.entries(animation?.channels ?? {})) {
    const field = channelField(channel, next), spec = entry(field);
    const component = { explicit: true, duration: timing.duration, easing: timing.easing };
    for (const c of targets(channel, field)) {
      spec.components[c] = component;
      if (!timing.scale && field !== "symbolCode") spec.kinds[c] = TRANSFORM_KINDS.linear;
    }
    spec.explicit = true;
  }
  // A procedural channel with its own tween timing (a tween over @time) keeps it: each step
  // retargets from the current value. Tweened channels are written at the clock time.
  for (const channel of [...Object.keys(animation?.procedural ?? {}), ...Object.keys(animation?.tweened ?? {}), ...Object.keys(animation?.liveChannels ?? {})]) {
    if (animation.channels?.[channel]) continue;
    const field = channelField(channel, next), spec = entry(field);
    for (const c of targets(channel, field)) spec.components[c] = { suppressed: true };
  }
  // A padded mark's rows show and hide at once as a Filter's kept rows change (TODO 32.12):
  // its row opacity, which carries the mask, never transitions.
  if (next.paddedMode) entry("interactionOpacity").components = [0, 1, 2, 3].map(() => ({ suppressed: true }));
  // A connection-backed mark's positions are its endpoints': they never animate on their own.
  if (next.connections)
    for (const field of CONNECTION_FIELDS) entry(field).components = [0, 1, 2, 3].map(() => ({ suppressed: true }));
  return { specs, kinds: { position: positionKinds } };
}

// The mark object owns its fields, so the transition specs live on it.
/** @param {object|null|undefined} mark
 * @param {import("./markPlanTypes.js").PreparedAnimation|undefined} animation
 * @param {Record<string, unknown>} [values] Accepted targets, supplied once at publication. */
export function applyAnimation(mark, animation, values = undefined) {
  if (!mark) return;
  markAnimation(mark).arrive = Boolean(animation?.arrive);
  // Only publication queues reset writes; replaying the displayed policy is ordinary work.
  markAnimation(mark).schemeReset = Boolean(animation?.schemeReset && values);
  if (!animation?.specs) return;
  const state = markAnimation(mark);
  state.specs = animation.specs;
  state.kinds = animation.kinds;
  state.live = Boolean(animation.live);
  // Equal channel props may never rerun the raw component's effect. Queue this accepted
  // reset now, with its own policy, before a later preparation can replace that policy.
  if (animation.schemeReset && values && mark.manager && mark.fields) {
    const batch = mark.manager.nextBatchId;
    trackPreparation(mark.view, Promise.all(Object.entries(values).map(([name, value]) =>
      mark.fields.get(name)?.update(value, batch))));
  }
}
