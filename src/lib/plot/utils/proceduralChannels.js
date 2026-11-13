// @ts-check
/**
 * Evaluate and write current channel values into an existing mark's fields. Clock/pointer
 * owners coalesce steps; the per-entry queue below serializes producer publications. Each
 * write callback owns its scope holds and releases its temporary values after field updates.
 */
import { numpy as np, Array as JaxArray } from "@hmplot/jax";
import { asArray, channelScalar } from "./data.js";
import { refinesPieces } from "./curves.js";
import { capability, scalarAppearance } from "./markKinds.js";
import { channelField } from "./channelAnimation.js";
import { nameNode } from "./names.js";
import { evaluateExpression, expressionFields } from "./expressions.js";
import { rectangleArrays } from "./rectangles.js";
import { viewState, viewStateKey, sameKey } from "./viewState.js";
import { planProgram } from "./programs.js";
import { frameEdgeCode } from "./frameEdges.js";

const AXES = ["x", "y", "z"];
/** Whether a connection follows the mark's fields. @param {{connectionFollowers?: Iterable<unknown>}} mark */
const hasFollowers = (mark) => {
  for (const _ of mark.connectionFollowers ?? []) return true;
  return false;
};
/** @typedef {import("./internalTypes.js").PreparedMark} PreparedMark */
/** @typedef {import("./markPlanTypes.js").PreparedAnimation} PreparedAnimation */
/** @typedef {import("./markPlanTypes.js").NamedScope} NamedScope */
/** @typedef {Partial<import("./dataViewTypes.js").DictionaryColumn>|null|undefined} DictionaryValue */
/** @typedef {import("./effectiveFieldBinding.js").FieldValue} FieldValue */
/** @typedef {import("./expressionPlanTypes.js").ViewStateRecord} ViewStateRecord */
/** @typedef {Record<string, unknown[]>} ChannelKeys */
/** @typedef {Record<string, JaxArray>} PositionInputs */
/** @type {Map<string, (inputs: PositionInputs) => JaxArray>} */
const positionPrograms = new Map();
/** Consumes base and the supplied component references; returns one owned position array.
 * @param {{dimensions: number}} plan
 * @param {PositionInputs} inputs
 */
function currentPosition({ dimensions }, inputs) {
  const columns = Array.from(
    { length: dimensions },
    (_, i) => inputs[AXES[i]] ?? inputs.base.ref.slice([], i),
  );
  inputs.base.dispose();
  return np.stack(columns, 1);
}

/** Per-channel change keys and evaluation. The existing clock/pointer owners coalesce calls.
 * @param {import("./markPlanTypes.js").LiveChannelWriterOptions} options
 */
export function createProceduralChannels({
  getKind,
  getMark,
  getEntry,
  getShown,
  pointerNow,
  visibleNow,
  tweenOptions,
  evaluator,
  invalidate,
  report,
  landed,
  afterWrites,
}) {
  /** @type {WeakMap<PreparedMark, ChannelKeys>} */
  const proceduralKeys = new WeakMap();
  const proceduralReported = new Set();
  /** @param {number} time
   * @param {import("./markPlanTypes.js").LiveChannelStepInputs} inputs
   */
  async function step(
    time,
    { scope: currentScope, channels: suppliedChannels, acceptWrites } = {},
  ) {
    const kind = getKind();
    const mark = getMark();
    const entry = getEntry(),
      shown = getShown();
    if (!mark || !entry?.animation || !shown || mark.isDisposed) return false;
    const isCurrent = () =>
      entry === getEntry() && shown === getShown() && !mark.isDisposed;
    const state = viewState({ time, pointer: pointerNow, visible: visibleNow });
    const scope = currentScope ?? entry.markScope,
      rows = scope?.length;
    // Ends at the frame edge that the mark reads in the shader do not change with the view
    // (utils/frameEdges.js): left out of the keys, panning prepares nothing. A connection that
    // follows the mark's ends reads its fields, which then keep following the view.
    const inShader =
      Boolean(mark.frameEdgesInShader?.()) && !hasFollowers(mark);
    /** @param {unknown} expression @param {ViewStateRecord} currentState @param {string} [channel] */
    const dependencyKey = (expression, currentState, channel) =>
      inShader &&
      (channel === "start" || channel === "end") &&
      Array.isArray(expression)
        ? viewKey(
            expression.map((item, i) => (frameEdgeCode(item, i) ? 0 : item)),
            currentState,
          )
        : viewKey(expression, currentState);
    /** @param {unknown} expression @param {ViewStateRecord} currentState */
    const viewKey = (expression, currentState) => [
      ...viewStateKey(
        Array.isArray(expression) ? expression : [expression],
        currentState,
      ),
      ...[
        ...expressionFields(
          expression,
          new Set(typeof expression === "string" ? [expression] : []),
        ),
      ]
        .filter(
          (field) => !field.startsWith("@") && scope?.liveColumns?.has?.(field),
        )
        .map((field) => /** @type {NamedScope} */ (scope).get(field)),
    ];
    // The keys the preparation evaluated at, so a step changes only what changed since.
    if (!proceduralKeys.has(entry))
      proceduralKeys.set(
        entry,
        entry.preparedViewState
          ? Object.fromEntries(
              Object.entries({
                ...entry.animation.procedural,
                ...entry.animation.stepped,
              }).map(([channel, expression]) => [
                channel,
                dependencyKey(
                  expression,
                  /** @type {ViewStateRecord} */ (entry.preparedViewState),
                  channel,
                ),
              ]),
            )
          : {},
      );
    const keys = /** @type {ChannelKeys} */ (proceduralKeys.get(entry));
    /** @type {import("./markPlanTypes.js").Channels} */
    const changed = {};
    /** @type {ChannelKeys} */
    const nextKeys = {};
    for (const [channel, expression] of Object.entries({
      ...entry.animation.procedural,
      ...entry.animation.stepped,
    })) {
      const key = dependencyKey(expression, state, channel);
      if (sameKey(key, keys[channel])) continue;
      changed[channel] = expression;
      nextKeys[channel] = key;
    }
    // A producer publication supplies ordinary current columns. It explicitly schedules
    // this write; upstream live values never create another clock-driven interpolation.
    for (const [channel, expression] of Object.entries(
      suppliedChannels ?? {},
    )) {
      changed[channel] = expression;
      nextKeys[channel] = dependencyKey(expression, state, channel);
    }
    // Tweened channels move while a tween they read is in flight, and write once more on landing.
    const flight = entry.tweenFlight ?? { end: -Infinity, finalDue: false };
    if (time < flight.end || flight.finalDue)
      for (const [channel, expression] of Object.entries(
        entry.animation.tweened ?? {},
      ))
        changed[channel] ??= expression;
    if (!Object.keys(changed).length) return false;
    // Geometry built from the channels when the mark prepares prepares again on a tracked change
    // (TODO 45): ErrorBars' bars from x, y, lower and upper, any mark drawn as refined pieces in
    // a curved frame, and a vector composed of components (a rule's ends, start={[x, "@view_y_min"]}).
    // Writing the position field would not move them.
    if (
      Object.keys(changed).some(
        (channel) =>
          /** @type {PreparedAnimation} */ (entry.animation).tracked?.[
            channel
          ] !== undefined &&
          !(
            scalarAppearance(kind, channel) &&
            entry.channelResults?.[channel]?.cardinality === "scalar"
          ) &&
          (kind === "ErrorBars" ||
            refinesPieces(mark) ||
            Array.isArray(
              /** @type {PreparedAnimation} */ (entry.animation).tracked[
                channel
              ],
            )),
      )
    ) {
      invalidate();
      return true;
    }
    // Position is rebuilt from the prepared frame's columns: when one axis changed, every timed
    // axis is evaluated again (the frame holds its value from preparation, not the last step).
    const timedChannels = {
      ...entry.animation.procedural,
      ...entry.animation.stepped,
      ...entry.animation.tweened,
      ...suppliedChannels,
    };
    if (AXES.some((axis) => axis in changed))
      for (const axis of AXES)
        if (axis in timedChannels) changed[axis] = timedChannels[axis];
    const procedural = changed;
    const map = shown === entry ? null : shown.lifecycleInteraction;
    /** @type {{dispose(): void}[]} */
    const owned = [];
    /** @template {{dispose(): void}} T @param {T} value @returns {T} */
    const own = (value) => (owned.push(value), value);
    let incomplete = false;
    /** @param {import("./internalTypes.js").RendererField|undefined} field @param {FieldValue} value */
    const write = async (field, value) => {
      if (!field) {
        incomplete = true;
        return false;
      }
      const result = await field.update(value);
      const applied = result.status === "applied";
      if (!applied) incomplete = true;
      return applied;
    };
    // Custom evaluators return dynamic payloads: array conversion and field writes validate them.
    /** @overload @param {unknown} expression @param {string} channel @param {true} [broadcast] @returns {JaxArray} */
    /** @overload @param {unknown} expression @param {string} channel @param {false} broadcast @returns {FieldValue} */
    /** @param {unknown} expression @param {string} channel @param {boolean} [broadcast] @returns {FieldValue} */
    const evaluate = (expression, channel, broadcast = true) => {
      if (typeof expression === "string") expression = nameNode(expression); // x="@pointer_x"
      const evaluated = evaluateExpression(expression, scope, {
        evaluator,
        viewState: state,
        rowCount: rows,
        broadcast,
        reductionCache: currentScope ? undefined : entry.reductionCache,
        ...tweenOptions(expression, channel, scope, time, flight),
      });
      owned.push(evaluated);
      if (
        !broadcast &&
        evaluated.cardinality === "scalar" &&
        evaluated.category === undefined &&
        !(/** @type {DictionaryValue} */ (evaluated.value)?.codes)
      )
        return /** @type {FieldValue} */ (evaluated.value);
      return own(
        asArray(
          /** @type {DictionaryValue} */ (evaluated.value)?.codes ??
            evaluated.value,
        ).astype(np.float32),
      );
    };
    // Rows of the next table take the new value; departing rows keep the shown one.
    /** @param {JaxArray} value @param {unknown} fallback @returns {JaxArray} */
    const align = (value, fallback) => {
      if (!map) return value;
      const taken = own(np.take(value.ref, map.index.ref, 0));
      const valid =
        value.shape.length > 1
          ? own(
              map.valid.ref.reshape([-1, ...value.shape.slice(1).map(() => 1)]),
            )
          : map.valid;
      return own(
        np.where(valid.ref, taken.ref, /** @type {JaxArray} */ (fallback).ref),
      );
    };
    /** @param {string} channel @param {string} reason */
    const unsupported = (channel, reason) => {
      if (proceduralReported.has(channel)) return;
      proceduralReported.add(channel);
      report(Error(`${channel}: @time ${reason}.`));
    };
    let positionApplied = false;
    /** @type {Record<string, FieldValue>} */
    const updatedProps = {};
    try {
      if (AXES.some((axis) => axis in procedural)) {
        const base = shown.props.position;
        if (!(base instanceof JaxArray) || base.shape.length !== 2)
          unsupported(
            "position",
            "needs x and y values this mark writes as a position",
          );
        else {
          let stacked;
          if (!map) {
            /** @type {PositionInputs} */
            const inputs = { base: base.ref };
            for (const axis of AXES.slice(0, base.shape[1]))
              if (axis in procedural)
                inputs[axis] = evaluate(procedural[axis], axis).ref;
            // The shared geometry writer assembles one compiled position batch;
            // it does not bind a separate gather for each unchanged component.
            stacked = own(
              planProgram(
                positionPrograms,
                { dimensions: base.shape[1] },
                currentPosition,
              )(inputs),
            );
          } else {
            const columns = [];
            for (let c = 0; c < base.shape[1]; c++) {
              const at = own(np.array(c, { dtype: np.int32 }));
              const column = own(np.take(base.ref, at.ref, 1));
              columns.push(
                procedural[AXES[c]]
                  ? align(evaluate(procedural[AXES[c]], AXES[c]), column)
                  : column,
              );
            }
            stacked = own(
              np.stack(
                columns.map((column) => column.ref),
                1,
              ),
            );
          }
          positionApplied = await write(mark.fields.get("position"), stacked);
          if (positionApplied) updatedProps.position = stacked;
        }
      }
      // The corner writer's channels (Rect's x0..z1, utils/markKinds.js).
      /** @type {readonly string[]} */
      const bounds =
        capability(kind, "liveWriter") === "corners"
          ? capability(kind, "liveChannels")
          : [];
      if (bounds.some((channel) => channel in procedural)) {
        // Rect corner channels describe vector fields, rather than scalar attributes.
        // Rebuild both corners coherently so order/finite validation matches preparation.
        /** @type {import("./markPlanTypes.js").Channels} */
        const corners = {};
        if (
          !map &&
          bounds
            .slice(0, 4)
            .every((channel) => shown.props[channel] !== undefined)
        ) {
          // Borrow unchanged authored corners directly. Apart from avoiding an initial
          // normalization and six gathers, this preserves valid static components when
          // a previously invalid bound becomes valid. Omitted z keeps its normal default.
          for (const channel of bounds) {
            if (channel in timedChannels)
              corners[channel] = evaluate(timedChannels[channel], channel);
            else if (shown.props[channel] !== undefined)
              corners[channel] = shown.props[channel];
          }
          if (shown.props.rotation !== undefined)
            corners.rotation = shown.props.rotation;
        } else {
          let lower = shown.props.position,
            upper = shown.props.extent;
          // Lifecycle unions retain departed rows from the shown normalized geometry.
          if (!(lower instanceof JaxArray) || !(upper instanceof JaxArray)) {
            const initial = rectangleArrays("rect", shown.props);
            Object.values(initial).forEach(own);
            lower = initial.position;
            upper = initial.extent;
          }
          for (let axis = 0; axis < 3; axis++)
            for (const side of [0, 1]) {
              const channel = `${AXES[axis]}${side}`,
                base = side ? upper : lower;
              if (!(base instanceof JaxArray)) {
                unsupported(channel, "needs prepared rectangle corners");
                continue;
              }
              const fallback = own(
                np.take(
                  base.ref,
                  own(np.array(axis, { dtype: np.int32 })).ref,
                  1,
                ),
              );
              corners[channel] = timedChannels[channel]
                ? align(evaluate(timedChannels[channel], channel), fallback)
                : fallback;
            }
        }
        const result = rectangleArrays("rect", corners);
        Object.values(result).forEach(own);
        for (const [fieldName, side] of [
          ["position", "0"],
          ["extent", "1"],
        ]) {
          const applied = await write(
            mark.fields.get(fieldName),
            result[fieldName],
          );
          if (applied) updatedProps[fieldName] = result[fieldName];
          if (applied && isCurrent())
            for (const channel of bounds)
              if (channel.endsWith(side) && channel in procedural)
                keys[channel] = nextKeys[channel];
        }
      }
      for (const [channel, expression] of Object.entries(procedural)) {
        if (AXES.includes(channel) || bounds.includes(channel)) continue;
        if (!isCurrent()) return false;
        if (
          scalarAppearance(kind, channel) &&
          entry.channelResults?.[channel]?.cardinality === "scalar" &&
          !shown.metadata?.[channel] &&
          !shown.rgb?.[channel]
        ) {
          // Inferred scales need a new contribution; a uniform write cannot update their domain.
          if (
            entry.scaleBindings?.some(
              (binding) =>
                binding.channel === channel &&
                !binding.scale.normalization.explicit,
            )
          ) {
            invalidate();
            continue;
          }
          let value = evaluate(expression, channel, false);
          let applied;
          if (channel === "opacity") {
            if (
              value instanceof JaxArray ||
              mark.fields.has("_channelOpacity")
            ) {
              mark.ensureChannelOpacity();
              applied = await write(mark.fields.get("_channelOpacity"), value);
            } else {
              mark.options.set("opacity", value);
              applied = true;
            }
          } else {
            if (
              ["fill", "color", "width"].includes(channel) &&
              typeof value === "number"
            )
              value = channelScalar(value);
            const field = mark.fields.get(channelField(channel, shown));
            if (!field) {
              invalidate();
              continue;
            }
            applied = await write(field, value);
          }
          if (applied && isCurrent()) {
            keys[channel] = nextKeys[channel];
            updatedProps[channelField(channel, shown)] = value;
          }
          continue;
        }
        const name = channelField(channel, shown),
          field = mark.fields.get(name);
        // The label writer writes a supplied opacity as its row opacity, and a clocked per-row
        // opacity (a staggered keyframes() reveal, TODO 136.14b) is the rows' expression opacity:
        // afterWrites makes it the entry's, and the row feedback composes over it again.
        if (
          !field ||
          (name === "interactionOpacity" &&
            !(
              !map &&
              ((capability(kind, "liveWriter") === "labels" &&
                suppliedChannels?.opacity !== undefined) ||
                entry.animation.clocked?.[channel] !== undefined)
            ))
        ) {
          // A tracked channel the mark builds its geometry from (ErrorBars' lower and upper at
          // the visible domain, TODO 45) prepares the mark again; @time there is not supported
          // (it would prepare every frame).
          if (
            entry.animation.tracked?.[channel] !== undefined &&
            entry.animation.clocked?.[channel] === undefined
          )
            invalidate();
          else unsupported(channel, `is not supported on ${kind}'s ${channel}`);
          continue;
        }
        const base = shown.props[name];
        if (
          map &&
          !(base instanceof JaxArray && base.shape[0] === map.outputLength)
        )
          continue;
        const value = align(evaluate(expression, channel), base);
        const applied = await write(field, value);
        if (applied && isCurrent()) {
          keys[channel] = nextKeys[channel];
          updatedProps[name] = value;
        }
      }
      if (positionApplied && isCurrent())
        for (const axis of AXES)
          if (axis in procedural) keys[axis] = nextKeys[axis];
      // Bounds may describe only a complete, accepted batch. In particular, one failed
      // rectangle corner must not publish extents beside the other newly written corner.
      if (
        isCurrent() &&
        !incomplete &&
        Object.keys(updatedProps).length &&
        (!acceptWrites || acceptWrites())
      )
        await afterWrites?.({
          props: { ...shown.props, ...updatedProps },
          updatedProps,
          scope,
          entry,
          shown,
          acceptWrites,
        });
    } finally {
      // Each own() acquired a reference, even when aliases or astype return one object.
      for (const item of owned) item.dispose?.();
    }
    if (
      !isCurrent() ||
      !Object.keys(updatedProps).length ||
      (currentScope && incomplete)
    )
      return false;
    // Connectors follow this endpoint's new rows at the same clock time (Stage 15).
    for (const follow of mark.connectionFollowers ?? []) follow();
    // Landed: this was the last write; the step and hold tracks go (syncProcedural).
    flight.finalDue = flight.end > time;
    if (
      !flight.finalDue &&
      entry.animation.tweened &&
      Object.keys(entry.animation.tweened).length
    )
      landed(entry);
    return true;
  }
  return step;
}

/** @type {WeakMap<object, {newest: number, work: Promise<unknown>}>} */
const queues = new WeakMap();
/**
 * Serialize whole geometry batches for one prepared entry. A newer queued publication skips
 * older batches that have not started; a rejection does not block the next batch. Callbacks
 * own retention and cleanup. This queue changes neither preparation acceptance nor clocks.
 * @template T
 * @param {object} entry
 * @param {number} order
 * @param {() => T | Promise<T>} write
 * @returns {Promise<T | false>}
 */
export function queueLiveGeometry(entry, order, write) {
  let state = queues.get(entry);
  if (!state)
    queues.set(entry, (state = { newest: -Infinity, work: Promise.resolve() }));
  state.newest = Math.max(state.newest, order);
  const work = state.work
    .catch(() => {})
    .then(() => (order < state.newest ? false : write()));
  state.work = work;
  return work;
}
