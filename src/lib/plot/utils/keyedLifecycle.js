import { evaluateTransientExpression } from "./expressionPlans.js";
import { Array as JaxArray, numpy as np } from "@hmplot/jax";
import { asArray, shapeOf } from "./data.js";
import { Color } from "three/webgpu";
import { kindsWith } from "./markKinds.js";
import { isExpression } from "./expressions.js";

/** Marks whose keyed updates stage their instances (utils/markKinds.js). */
const INSTANCE_KINDS = new Set(kindsWith("keyed"));

function setting(value, fallbackDuration, fallbackEasing) {
  if (!value) return null;
  if (value === true || value === "fade")
    return { effect: "fade", duration: fallbackDuration, easing: fallbackEasing };
  if (typeof value !== "object" || value.effect !== undefined && value.effect !== "fade")
    throw Error(`Unsupported lifecycle effect: ${value.effect ?? value}. Use "fade".`);
  const duration = Number(value.duration ?? fallbackDuration);
  if (!Number.isFinite(duration) || duration < 0)
    throw Error("Lifecycle duration must be finite and nonnegative.");
  return {
    effect: "fade",
    duration,
    easing: value.easing ?? fallbackEasing,
  };
}

function compatible(value, count) {
  const shape = shapeOf(value?.codes ?? value);
  return shape.length && shape[0] === count ? shape : null;
}

function hostGather(oldValue, nextValue, indices, fallback) {
  const old = Array.from(oldValue), next = Array.from(nextValue);
  return indices.map((index, row) => index >= 0 ? old[index] : next[fallback[row]]);
}

function gpuGather(oldValue, nextValue, oldCount, nextCount, preferred, fallback, owned) {
  const oldShape = compatible(oldValue, oldCount), nextShape = compatible(nextValue, nextCount);
  if (!oldShape || !nextShape || JSON.stringify(oldShape.slice(1)) !== JSON.stringify(nextShape.slice(1))) return null;
  if (!(oldValue instanceof JaxArray) && !(nextValue instanceof JaxArray) &&
      (Array.isArray(oldValue) || ArrayBuffer.isView(oldValue)) &&
      (Array.isArray(nextValue) || ArrayBuffer.isView(nextValue)) &&
      (typeof oldValue[0] === "string" || typeof oldValue[0] === "boolean" || typeof nextValue[0] === "string" || typeof nextValue[0] === "boolean"))
    return hostGather(oldValue, nextValue, preferred, fallback);
  const a = asArray(oldValue), b = asArray(nextValue);
  try {
    const ai = np.array(preferred.map((value) => Math.max(0, value)), { dtype: np.int32 });
    const bi = np.array(fallback.map((value) => Math.max(0, value)), { dtype: np.int32 });
    const maskBase = np.array(preferred.map((value) => value >= 0), { dtype: np.bool });
    const mask = oldShape.length > 1
      ? maskBase.ref.reshape([preferred.length, ...oldShape.slice(1).map(() => 1)])
      : maskBase;
    const av = np.take(a.ref, ai.ref, 0), bv = np.take(b.ref, bi.ref, 0);
    const result = np.where(mask.ref, av.ref, bv.ref);
    for (const value of new Set([ai, bi, mask, maskBase, av, bv])) value.dispose();
    owned.push(result);
    return result;
  } finally { a.dispose(); b.dispose(); }
}

/**
 * A dictionary column ({categories, codes}: a Text's text, read through a Filter or from Python)
 * gathered as gpuGather gathers arrays: both frames' codes on one list of categories, the
 * preferred frame's and then the other's new ones.
 */
function dictionaryGather(preferredValue, fallbackValue, preferredCount, fallbackCount, preferred, fallback, owned) {
  const categories = [...preferredValue.categories], index = new Map(categories.map((value, i) => [value, i]));
  const remap = fallbackValue.categories.map((value) => {
    if (!index.has(value)) { index.set(value, categories.length); categories.push(value); }
    return index.get(value);
  });
  // The fallback frame's codes on the common categories; a missing code (-1) stays missing.
  const codes = asArray(fallbackValue.codes), table = np.array(remap.length ? remap : [-1], { dtype: np.int32 });
  const mapped = np.where(codes.ref.greaterEqual(0), np.take(table, np.maximum(codes.ref, 0).astype(np.int32), 0), -1);
  codes.dispose();
  owned.push(mapped);
  const gathered = gpuGather(preferredValue.codes, mapped, preferredCount, fallbackCount, preferred, fallback, owned);
  return gathered && { categories, codes: gathered };
}

/** A color string as components for a color channel with `channels` entries. */
function colorComponents(value, channels) {
  const color = new Color(value);
  return channels === 4 ? [color.r, color.g, color.b, 1] : [color.r, color.g, color.b].slice(0, channels);
}

/**
 * The value entering (or departing) rows take on a channel: the channel's own array with the
 * animate() enter/exit constants substituted. x/y/z substitute one component of position.
 */
function resolveOverrides(overrides, scope, owned, evaluator) {
  return Object.fromEntries(Object.entries(overrides ?? {}).map(([key, value]) => {
    if (!scope || !(isExpression(value) || typeof value === 'string' && scope.has(value))) return [key, value];
    const result = evaluateTransientExpression(value, scope, { evaluator });
    const array = asArray(result.value);
    owned.push(result, array);
    return [key, array];
  }));
}

function lifecycleValue(key, base, overrides, owned) {
  if (!(base instanceof JaxArray) || !overrides) return null;
  const shape = base.shape, rows = shape[0];
  const channels = shape.length > 1 ? shape[1] : 1;
  const vector=overrides[key] instanceof JaxArray ? overrides[key] : null;
  const components = key === "position" && !vector && !Array.isArray(overrides.position)
    ? ["x", "y", "z"].slice(0, channels).map((axis) => overrides[axis])
    : [overrides[key]];
  if (components.every((value) => value === undefined)) return null;
  let constants = components;
  if (key !== "position" && typeof overrides[key] === "string") constants = colorComponents(overrides[key], channels);
  else if (Array.isArray(overrides[key])) constants = overrides[key];
  if (channels === 1) {
    if(vector){
      if(vector.shape.length!==1||vector.shape[0]!==rows)throw Error('animate enter/exit expression must match the channel rows and components.');
      const filled=np.where(np.isfinite(vector.ref),vector.ref,base.ref);owned.push(filled);return filled;
    }
    const value = Number(constants[0]);
    if (!Number.isFinite(value)) return null;
    const filled = np.full([rows], value);
    owned.push(filled);
    return filled;
  }
  const columns = [];
  for (let c = 0; c < channels; c++) {
    let component=constants[c];
    if(vector){
      if(vector.shape[0]!==rows||vector.shape.length!==2)throw Error('animate enter/exit expression must match the channel rows and components.');
      if(c<vector.shape[1]){const at=np.array(c,{dtype:np.int32});component=np.take(vector.ref,at.ref,1);at.dispose();}
      else component=undefined;
    }
    if(component instanceof JaxArray){
      const at=np.array(c,{dtype:np.int32}),fallback=np.take(base.ref,at.ref,1);at.dispose();
      columns.push(np.where(np.isfinite(component.ref),component.ref,fallback.ref));fallback.dispose();
      if(vector)component.dispose();
      continue;
    }
    const constant = component;
    if (constant === undefined || constant === null || !Number.isFinite(Number(constant))) {
      const at = np.array(c, { dtype: np.int32 });
      const column = np.take(base.ref, at.ref, 1);
      at.dispose();
      columns.push(column);
    } else columns.push(np.full([rows], Number(constant)));
  }
  const stacked = np.stack(columns.map((column) => column.ref), 1);
  columns.forEach((column) => column.dispose());
  owned.push(stacked);
  return stacked;
}

function stageProps(previous, next, oldIndex, nextIndex, chooseOld, animation, owned, overrides) {
  // The source is an internal keyed-union staging frame. Publish it without
  // interpolation, then animate the target from those completed buffers.
  const props = { ...next.props, ...animation };
  const keys = new Set([...Object.keys(previous.props), ...Object.keys(next.props)]);
  for (const key of keys) {
    const oldValue = previous.props[key], nextValue = next.props[key];
    if (oldValue === undefined || nextValue === undefined || typeof oldValue === "function" || typeof nextValue === "function") continue;
    // Rows without a counterpart read the fallback: entering rows in the source frame
    // (from the next values, or an enter constant), departing rows in the target frame
    // (from the old values, or an exit constant).
    const fallback = chooseOld ? nextValue : oldValue;
    const substituted = lifecycleValue(key, fallback, overrides, owned) ?? fallback;
    const value = (oldValue?.categories && nextValue?.categories ? dictionaryGather : gpuGather)(
      chooseOld ? oldValue : nextValue,
      substituted,
      chooseOld ? previous.keyTokens.length : next.keyTokens.length,
      chooseOld ? next.keyTokens.length : previous.keyTokens.length,
      chooseOld ? oldIndex : nextIndex,
      chooseOld ? nextIndex : oldIndex,
      owned,
    );
    if (value !== null) props[key] = value;
  }
  return props;
}

/**
 * Stage a keyed update as a union frame (source), the animated frame (target), and then the
 * next frame itself. `previous` is what is on screen: the settled previous frame, or the
 * frame an in-flight lifecycle last published (`lifecycle.shown()`), so a second update
 * continues from where rows are rather than where they were going, and rows still departing
 * keep departing. The source frame carries `staging`: the map from union rows to on-screen
 * rows, which the fields use to carry each row's transition state to its new index.
 *
 * Without enter/exit settings, a mark that animates still stages a keyed update whose rows
 * moved (a sort, a new or removed key), so transitions follow each key instead of each
 * position; departing rows then leave at once and new rows appear at their values.
 */
export function keyedLifecycle(previous, next, kind, options = {}) {
  if (!INSTANCE_KINDS.has(kind) || !previous || !next) return null;
  if ((previous.animationCorrespondence?.scheme ?? null) !== (next.animationCorrespondence?.scheme ?? null)) return null;
  const previousIdentity = previous.keyTokens, nextIdentity = next.keyTokens;
  previous = { ...previous, keyTokens: previous.animationCorrespondence?.tokens ?? previous.keyTokens };
  next = { ...next, keyTokens: next.animationCorrespondence?.tokens ?? next.keyTokens };
  if (!previous.keyTokens || !next.keyTokens) return null;
  const duration = Number(options.animationDuration ?? 300), easing = options.animationEasing ?? "cubic-in-out";
  const channelEnter = Object.keys(options.channelEnter ?? {}).length > 0;
  const channelExit = Object.keys(options.channelExit ?? {}).length > 0;
  const enter = setting(options.enter, duration, easing) ?? (channelEnter ? { effect: "value", duration: options.channelDuration ?? duration, easing } : null);
  const exit = setting(options.exit, duration, easing) ?? (channelExit ? { effect: "value", duration: options.channelDuration ?? duration, easing } : null);
  if (!enter && !exit && !options.animates) return null;
  const oldLookup = new Map(previous.keyTokens.map((key, index) => [key, index]));
  const nextLookup = new Map(next.keyTokens.map((key, index) => [key, index]));
  const entered = next.keyTokens.some((key) => !oldLookup.has(key));
  const exited = previous.keyTokens.some((key) => !nextLookup.has(key));
  const moved = previous.keyTokens.length !== next.keyTokens.length ||
    previous.keyTokens.some((key, index) => next.keyTokens[index] !== key);
  if (!entered && !exited && !moved) return null;
  const lifecycle = Boolean(enter || exit);
  const union = [...next.keyTokens];
  if (exit) for (const key of previous.keyTokens) if (!nextLookup.has(key)) union.push(key);
  const oldIndex = union.map((key) => oldLookup.get(key) ?? -1);
  const nextIndex = union.map((key) => nextLookup.get(key) ?? -1);
  const identityUnion = union.map((_, i) => nextIndex[i] >= 0
    ? nextIdentity?.[nextIndex[i]] ?? `row:${nextIndex[i]}`
    : previousIdentity?.[oldIndex[i]] ?? `row:${oldIndex[i]}`);
  const correspondence = next.animationCorrespondence
    ? { ...next.animationCorrespondence, tokens: union } : null;
  const owned = [];
  const transitionDuration = lifecycle ? Math.max(enter?.duration ?? 0, exit?.duration ?? 0, options.channelDuration ?? 0) : 0;
  const transitionEasing = enter?.easing ?? exit?.easing ?? easing;
  // Enter/exit lifecycles animate their target frame with the lifecycle's timing; a keyed
  // re-order keeps the mark's own animation settings.
  const sourceAnimation = lifecycle ? { animation: false, animationDuration: transitionDuration, animationEasing: transitionEasing } : {};
  const targetAnimation = lifecycle ? { animation: true, animationDuration: transitionDuration, animationEasing: transitionEasing } : {};
  const enterValues=resolveOverrides(options.channelEnter,next.markScope,owned,options.evaluator);
  // Exiting observations belong to the previous layout, not the new subtree.
  const oldExit=resolveOverrides(previous.lifecycleConfig?.channelExit ?? options.channelExit,previous.markScope,owned,options.evaluator);
  const nextExit=resolveOverrides(options.channelExit,next.markScope,owned,options.evaluator);
  // Authored row alpha is outside props after preparation. Stage it by the same keys as
  // geometry, rather than borrowing the new table's shorter/reordered column in a union.
  const hasRowOpacity = previous.expressionOpacity || next.expressionOpacity ||
    enterValues.opacity !== undefined || oldExit.opacity !== undefined;
  const rowOpacity = (frame) => {
    if (!hasRowOpacity) return frame;
    const alpha = frame.expressionOpacity ?? np.ones([frame.keyTokens.length]);
    if (!frame.expressionOpacity) owned.push(alpha);
    return { ...frame, props: { ...frame.props, __rowOpacity: alpha } };
  };
  const oldFrame = rowOpacity(previous), nextFrame = rowOpacity(next);
  const sourceProps = stageProps(oldFrame, nextFrame, oldIndex, nextIndex, true, sourceAnimation, owned,
    { ...enterValues, __rowOpacity: enterValues.opacity });
  const targetProps = stageProps(oldFrame, nextFrame, oldIndex, nextIndex, false, targetAnimation, owned,
    { ...oldExit, __rowOpacity: oldExit.opacity });
  const sourceExpressionOpacity = sourceProps.__rowOpacity, targetExpressionOpacity = targetProps.__rowOpacity;
  delete sourceProps.__rowOpacity; delete targetProps.__rowOpacity;
  const shownExit=Object.fromEntries(Object.entries(nextExit).map(([key,value])=>[key,
    value instanceof JaxArray && oldExit[key] instanceof JaxArray
      ? gpuGather(value,oldExit[key],next.keyTokens.length,previous.keyTokens.length,nextIndex,oldIndex,owned) : value]));
  const fadeIn = enter?.effect === "fade", fadeOut = exit?.effect === "fade";
  // Rows on screen start from their shown opacity (a row still fading keeps fading when its
  // field animates; otherwise it holds the value it reached).
  const sourceValues = union.map((_, index) => oldIndex[index] >= 0 ? previous.opacityValues?.[oldIndex[index]] ?? 1 : fadeIn ? 0 : 1);
  const targetValues = union.map((_, index) => nextIndex[index] >= 0 || !fadeOut ? 1 : 0);
  let sourceOpacity, targetOpacity;
  if (lifecycle) {
    sourceOpacity = np.array(sourceValues);
    targetOpacity = np.array(targetValues);
    owned.push(sourceOpacity, targetOpacity);
  }
  // Interaction resources already describe the new keyed table. Remap their
  // masks onto the temporary union so retained/entering rows line up and
  // exiting rows remain safely unselected while they fade.
  const lifecycleInteractionIndex = np.array(nextIndex.map((index) => Math.max(0, index)), { dtype: np.int32 });
  const lifecycleInteractionValid = np.array(nextIndex.map((index) => index >= 0), { dtype: np.bool });
  owned.push(lifecycleInteractionIndex, lifecycleInteractionValid);
  const lifecycleInteraction = {
    index: lifecycleInteractionIndex,
    valid: lifecycleInteractionValid,
    sourceLength: next.keyTokens.length,
    outputLength: union.length,
  };
  const staging = { index: Int32Array.from(oldIndex), rows: union.length, oldRows: previous.keyTokens.length };
  // The next frame drops the departed rows from the end of the union; the rows before them
  // keep their state (a truncating re-order) instead of snapping.
  const finalStaging = union.length === next.keyTokens.length ? null
    : { index: Int32Array.from(next.keyTokens, (_, index) => index), rows: next.keyTokens.length, oldRows: union.length };
  const displayedOpacity = (expression, fade) => {
    if (!expression || !fade) return expression ?? fade;
    const combined = expression.ref.mul(fade.ref); owned.push(combined); return combined;
  };
  const animation = (staging) => {
    const base = next.animation ?? {}, specs = { ...base.specs };
    const opacity = specs.interactionOpacity ?? specs._channelOpacity ?? specs.opacity;
    // A fade is explicit even over a live upstream producer. Other fields keep their
    // own specs: layout publications must not start another geometry interpolation.
    if (fadeIn || fadeOut || opacity) specs.interactionOpacity = {
      kinds: [0, 0, 0, 0], constants: [1, 1, 1, 1], explicit: true,
      components: Array.from({ length: 4 }, (_, component) => staging ? { suppressed: true }
        : fadeIn || fadeOut ? { explicit: true, duration: transitionDuration, easing: transitionEasing }
        : opacity.components[component]),
    };
    return { ...base, specs };
  };
  const source = { ...next, props: sourceProps, animation: animation(true),
    expressionOpacity: sourceExpressionOpacity, lifecycleOpacity: sourceOpacity,
    displayedOpacity: displayedOpacity(sourceExpressionOpacity, sourceOpacity), lifecycleInteraction };
  const target = { ...next, props: targetProps, animation: animation(false),
    expressionOpacity: targetExpressionOpacity, lifecycleOpacity: targetOpacity,
    displayedOpacity: displayedOpacity(targetExpressionOpacity, targetOpacity), lifecycleInteraction };
  let shown = "source";

  return {
    duration: transitionDuration,
    staging,
    finalStaging,
    union,
    identityUnion,
    source,
    target,
    /** Record which frame is on screen; the next keyed update starts from it. */
    show(stage) { shown = stage; },
    shown() {
      const frame = shown === "target" ? target : source;
      return { props: frame.props, expressionOpacity: frame.expressionOpacity,
        keyTokens: identityUnion, animationCorrespondence: correspondence, opacityValues: shown === "target" ? targetValues : sourceValues,
        lifecycleConfig: { channelExit: shownExit } };
    },
    // One entry per reference: asArray hands out a Data column's one device copy, so two
    // overrides reading the same column push the same array twice.
    dispose() { for (const value of owned.splice(0)) value.dispose?.(); },
  };
}
