import { numpy as np, lax, Array as JaxArray } from "@hmplot/jax";
import { deviceScalar, deviceArray } from "./deviceParams.js";
import { asArray, shapeOf } from "./data.js";
import {
  expressionFields,
  expressionDescriptor,
  expressionHasTween,
} from "./expressions.js";
import { interactionVersion } from "./interaction.js";
import { viewState as makeViewState, viewStateKey } from "./viewState.js";
import { planProgram } from "./programs.js";

/**
 * TWEEN STATE (TODO 28 Part B). A tween() in a Calculate column (or inside a mark channel's
 * expression) keeps, for each row, where its motion started (`from`), where it is going (`to`)
 * and when it started (`start`, view-clock ms). Its value at time t is
 *   from + (to - from) * ease(clamp((t - start) / duration, 0, 1))
 * computed with jax operations, so a Bin, a Filter or mean() downstream sees the moving values.
 * (RowTransition, the marks' engine, writes into a GPUBuffer, which jax-js cannot take as an
 * array.) When a row's target changes, it starts again from its current value: a tween over a
 * moving value trails it by about the duration.
 *
 * Rows are kept in SLOT order: the source rows of the evaluating scope (its sourceIndices(), so
 * a Sort, a Filter or a Sample keeps each observation's motion, and a row that leaves and
 * returns resumes), or the scope's own rows where it has none (an aggregate's rows, a Fold's
 * repeated rows): by position. A new data version realigns the slots by key when the table has
 * one, else by position. Writing slots back takes a scatter (lax.scatter, jax-js fork patch
 * 0008); reading them is a gather.
 *
 * `end` (host ms) is when the last retarget lands: while the clock is before it the values
 * move, known without reading anything back. A retarget is assumed to move (whether any target
 * really changed would take a readback).
 */
const AT_REST = -1e30; // a start so early that the row has arrived
const VALUE_PROGRAMS = new Map();
function tweenValues({ easing, step }, { from, to, start, params }) {
  const owned = [],
    own = (array) => (owned.push(array), array);
  try {
    const p = own(
      np.clip(params.ref.slice(0).sub(start).div(params.ref.slice(1)), 0, 1),
    );
    const e = easeArray(p, easing, own);
    const moved = own(
      step
        ? np.where(e.ref.greaterEqual(0.5), to.ref, from.ref)
        : from.ref.add(to.ref.sub(from.ref).mul(e.ref)),
    );
    const finite = own(
      np.logicalAnd(np.isfinite(from.ref), np.isfinite(to.ref)),
    );
    return np.where(finite.ref, moved.ref, to);
  } finally {
    owned.forEach((array) => array.dispose());
    from.dispose();
    params.dispose();
  }
}

/** The easings of animation.js ease() as jax operations on progress p in [0, 1]. */
export function easeArray(p, easing, own) {
  // pow() and tail() return arrays the next operation consumes; the results are owned.
  const pow = (x, k) =>
    k === 2 ? x.ref.mul(x.ref) : x.ref.mul(x.ref).mul(x.ref);
  const half = () => own(p.ref.less(0.5));
  const tail = (k) => {
    const q = own(p.ref.mul(-2).add(2));
    return own(pow(q, k).mul(-0.5).add(1));
  };
  switch (easing) {
    case "linear":
      return p;
    case "quad-in":
      return own(pow(p, 2));
    case "quad-out":
      return own(p.ref.mul(p.ref.mul(-1).add(2)));
    case "quad-in-out":
      return own(np.where(half().ref, pow(p, 2).mul(2), tail(2).ref));
    case "cubic-in":
      return own(pow(p, 3));
    case "cubic-out": {
      const q = own(p.ref.mul(-1).add(1));
      return own(pow(q, 3).mul(-1).add(1));
    }
    case "sine-in-out":
      return own(np.cos(p.ref.mul(Math.PI)).mul(-0.5).add(0.5));
    default:
      return own(np.where(half().ref, pow(p, 3).mul(4), tail(3).ref));
  }
}

const identities = new WeakMap();
let nextIdentity = 0;
const identityOf = (value) => {
  if (value === null || typeof value !== "object") return value;
  if (!identities.has(value)) identities.set(value, ++nextIdentity);
  return `#${identities.get(value)}`;
};

/**
 * The slots of a scope's rows: `slots` (int32, one per row, owned by the caller) into a space of
 * `count`, or null when the rows are the slots (a Data scope, an aggregate, repeated rows).
 * A padded view's physical rows are its parent's rows.
 */
export function tweenSlots(scope) {
  const rows = scope?.physical ? scope.parent : scope;
  if (
    !rows ||
    rows.identityRows ||
    rows.aggregate ||
    rows.repeatsRows ||
    !rows.sourceIndices
  )
    return {
      slots: null,
      count: scope?.length ?? 0,
      positional: Boolean(rows?.aggregate || rows?.repeatsRows),
    };
  const slots = rows.sourceIndices();
  if (!slots) return { slots: null, count: scope.length, positional: true };
  return {
    slots,
    count: rows.sourceLength ?? rows.identity?.length ?? scope.length,
    positional: false,
  };
}

export class TweenState {
  constructor({ duration, easing, step = false }) {
    this.duration = Math.max(Number(duration), 1e-6);
    this.easing = easing;
    this.step = step;
    this.current = null;
    this.currentTime = undefined;
    this.categories = [];
    this.facts = new Map();
    this.from = this.to = this.start = this.known = null;
    this.count = 0;
    this.scalar = false;
    this.end = -Infinity;
    this.key = null;
    this.identity = undefined;
    this.generation = undefined;
    this.tokens = undefined;
    this.scheme = undefined;
  }
  inFlight(time) {
    return time < this.end;
  }
  /** Every slot's value at `time` (owned by the caller). */
  valuesAt(time) {
    if (this.current && Object.is(this.currentTime, time))
      return this.current.ref;
    this.current?.dispose();
    // One interpolation program per easing/kind; consumers of this frame share the result.
    // Retained references keep an older published revision valid after the next tick.
    this.current =
      time >= this.end
        ? this.to.ref
        : planProgram(
            VALUE_PROGRAMS,
            { easing: this.easing, step: this.step },
            tweenValues,
          )({
            from: this.from.ref,
            to: this.to.ref,
            start: this.start.ref,
            params: deviceArray([time, this.duration]),
          });
    this.currentTime = time;
    return this.current.ref;
  }
  /** The value of each row whose slot is `slots` (null: the rows are the slots), at `time`. */
  rowsAt(slots, time) {
    const values = this.valuesAt(time);
    if (this.scalar || !slots) return values;
    return np.take(values, np.maximum(slots.ref, 0), 0);
  }
  /**
   * New targets for the rows in `slots` (null: the rows are the slots) of a space of `count`, at
   * `time`: rows whose target changed start again from their current value; the others keep
   * their motion; rows seen for the first time rest at their target.
   */
  retarget(target, slots, count, time, arrive = false) {
    const owned = [],
      own = (a) => (owned.push(a), a);
    const scalar = target.shape.length === 0;
    try {
      const t = own(deviceScalar(time));
      if (
        !this.from ||
        this.scalar !== scalar ||
        (!scalar &&
          (this.count !== count ||
            this.to.shape.length !== target.shape.length ||
            target.shape
              .slice(1)
              .some((size, at) => this.to.shape[at + 1] !== size)))
      ) {
        this.dispose();
        this.scalar = scalar;
        this.count = count;
        if (scalar || !slots) {
          this.to = target.ref.astype(np.float32);
          this.from = this.to.ref.add(0);
          this.start = np.full(this.to.shape, AT_REST, { dtype: np.float32 });
          this.known = np.ones(this.to.shape, { dtype: np.bool });
        } else {
          const rows = slots.shape[0];
          const dimensions = target.shape.slice(1);
          this.to = lax.scatter(target.ref.astype(np.float32), slots.ref, [
            count,
            ...dimensions,
          ]);
          this.from = this.to.ref.add(0);
          this.start = np.full(this.to.shape, AT_REST, { dtype: np.float32 });
          this.known = lax
            .scatter(
              np.ones([rows, ...dimensions], { dtype: np.int32 }),
              slots.ref,
              [count, ...dimensions],
            )
            .greater(0);
        }
        this.end = -Infinity;
        return;
      }
      // Current state for these rows.
      const current = own(this.rowsAt(slots, time));
      const gather = (a) =>
        scalar || !slots
          ? own(a.ref)
          : own(np.take(a.ref, np.maximum(slots.ref, 0), 0));
      const oldTo = gather(this.to),
        oldFrom = gather(this.from),
        oldStart = gather(this.start);
      let known = gather(this.known);
      if (slots && !scalar) {
        const shown = own(
          slots.ref
            .greaterEqual(0)
            .reshape([slots.shape[0], ...target.shape.slice(1).map(() => 1)]),
        );
        known = own(np.logicalAnd(known.ref, shown.ref));
      }
      const next = own(target.ref.astype(np.float32));
      const same = own(
        np.logicalOr(
          next.ref.equal(oldTo.ref),
          np.logicalAnd(np.isnan(next.ref), np.isnan(oldTo.ref)),
        ),
      );
      const changed = own(np.logicalAnd(known.ref, np.logicalNot(same.ref)));
      // A live drag's change (TODO 38 decision 7): the changed rows arrive at once.
      const from = own(
        np.where(
          changed.ref,
          arrive ? next.ref : current.ref,
          np.where(known.ref, oldFrom.ref, next.ref),
        ),
      );
      const start = own(
        np.where(
          changed.ref,
          arrive ? AT_REST : t.ref,
          np.where(known.ref, oldStart.ref, AT_REST),
        ),
      );
      if (scalar || !slots) {
        this.replace({
          from: from.ref,
          to: next.ref,
          start: start.ref,
          known: np.ones(next.shape, { dtype: np.bool }),
        });
      } else {
        const rows = slots.shape[0];
        const dimensions = target.shape.slice(1),
          shape = [count, ...dimensions];
        const written = own(
          lax
            .scatter(
              np.ones([rows, ...dimensions], { dtype: np.int32 }),
              slots.ref,
              shape,
            )
            .greater(0),
        );
        const put = (values, old) =>
          np.where(
            written.ref,
            lax.scatter(values.ref, slots.ref, shape),
            old.ref,
          );
        this.replace({
          from: put(from, this.from),
          to: put(next, this.to),
          start: put(start, this.start),
          known: np.logicalOr(this.known.ref, written.ref),
        });
      }
      this.end = Math.max(this.end, time + this.duration);
    } finally {
      for (const a of owned) a.dispose();
    }
  }
  /** Realign to a new slot space: slot i takes old slot index[i] (host int array; -1: none). */
  remap(index, count) {
    if (this.scalar || !this.from) return;
    const at = deviceArray(index, { dtype: "int32" });
    try {
      const safe = np.maximum(at.ref, 0),
        valid = at.ref
          .greaterEqual(0)
          .reshape([count, ...this.known.shape.slice(1).map(() => 1)]);
      const take = (a) => np.take(a.ref, safe.ref, 0);
      this.replace({
        from: take(this.from),
        to: take(this.to),
        start: take(this.start),
        known: np.logicalAnd(take(this.known), valid.ref),
      });
      safe.dispose();
      valid.dispose();
      this.count = count;
    } finally {
      at.dispose();
    }
  }
  /** Reduced motion and zero duration establish the displayed value as the next origin. */
  finish() {
    this.replace({
      from: this.to.ref,
      start: np.full(this.to.shape, AT_REST, { dtype: np.float32 }),
    });
    this.end = -Infinity;
  }
  replace(next) {
    this.facts = new Map();
    this.current?.dispose();
    this.current = null;
    this.currentTime = undefined;
    for (const [name, value] of Object.entries(next)) {
      this[name]?.dispose();
      this[name] = value;
    }
  }
  dispose() {
    this.facts = new Map();
    this.current?.dispose();
    this.current = null;
    this.currentTime = undefined;
    for (const name of ["from", "to", "start", "known"]) {
      this[name]?.dispose();
      this[name] = null;
    }
  }
}

let warnedPositional = new Set();
/** tween.positional: rows are matched by position, so an observation's motion can jump. */
function positional(why) {
  if (warnedPositional.has(why)) return;
  warnedPositional.add(why);
  console.warn(
    `tween.positional: ${why}; pass key= for stable per-observation motion.`,
  );
}

/**
 * Bring `state` to the scope's current slot space: a new data version remaps by key tokens, or
 * keeps positions (same length) or matches them (a new length, with tween.positional).
 */
function align(state, scope, space, correspondence) {
  const scheme = correspondence?.scheme ?? null;
  if (state.scheme !== undefined && state.scheme !== scheme) {
    state.dispose();
    state.key = null;
    state.tokens = undefined;
    state.end = -Infinity;
  }
  state.scheme = scheme;
  if (correspondence) {
    const tokens = correspondence.tokens;
    if (
      state.from &&
      !state.scalar &&
      state.tokens &&
      (tokens.length !== state.tokens.length ||
        tokens.some((token, i) => token !== state.tokens[i]))
    ) {
      if (!state.count) state.dispose();
      else {
        const old = new Map(state.tokens.map((token, i) => [token, i]));
        state.remap(
          tokens.map((token) => old.get(token) ?? -1),
          tokens.length,
        );
      }
      state.key = null;
    }
    state.tokens = tokens;
    return;
  }
  const identity = scope?.identity,
    generation = identity?.generation;
  // A new version of the data: its identity's generation moved, or a new table brought its own.
  const newData =
    state.identity !== undefined &&
    (identity !== state.identity || generation !== state.generation);
  if (!state.from || state.scalar) {
    // Nothing to realign yet; remember the version the state starts from.
  } else if (!space.positional && newData && state.tokens && identity.tokens) {
    const at = new Map(state.tokens.map((token, index) => [token, index]));
    state.remap(
      identity.tokens.map((token) => at.get(token) ?? -1),
      space.count,
    );
  } else if (state.count !== space.count) {
    positional(
      space.positional
        ? "a tween over an aggregate or repeated rows matched its rows by position"
        : "a tween's table changed length and has no key, so its rows were matched by position",
    );
    state.remap(
      Array.from({ length: space.count }, (_, i) => (i < state.count ? i : -1)),
      space.count,
    );
  }
  state.identity = identity;
  state.generation = generation;
  state.tokens = identity?.tokens;
}

/** What a tween's target depends on: its expression, the arrays it reads, the view state. */
function targetKey(inner, scope, view) {
  const fields = [
    ...expressionFields(
      inner,
      new Set(typeof inner === "string" ? [inner] : []),
    ),
  ];
  return JSON.stringify([
    expressionDescriptor(inner),
    fields.map((field) => {
      if (field.startsWith("@")) {
        const resource = scope.interactionResource?.(
          field.replace(/^@any_/, "@"),
        );
        return resource
          ? [identityOf(resource), interactionVersion(resource)]
          : (scope.interactionRevision ?? scope.version);
      }
      return identityOf(scope?.get?.(field));
    }),
    view ? viewStateKey([inner], view) : null,
    expressionHasTween(inner) ? view?.time : null,
    scope?.identity?.generation,
  ]);
}

/** A tween node's path in a configuration (columns.h/args.0), so a re-sent equal expression keeps its state. */
export function tweenPaths(root, prefix, output = new Map()) {
  if (!root?.__hmplotExpression) return output;
  if (!output.has(root)) output.set(root, prefix);
  root.args.forEach((item, at) => tweenPaths(item, `${prefix}/${at}`, output));
  return output;
}

/**
 * The expression producer's hook. State stays in its cache; root and nested numeric
 * tweens both return current values. Whole-channel categorical values step at eased 0.5.
 * `moving` notifies the owner of its next deadline, never publishes interpolation state.
 */
/** @param {{cache: Map<string, TweenState>, scope?: import("./dataViewTypes.js").RowScope|null,
 * time: number, viewState?: import("./expressionPlanTypes.js").ViewStateRecord,
 * root: import("../publicTypes.js").Expression, prefix: string, moving: (flight: {end: number}) => void,
 * correspondence?: {scheme: string, tokens: string[]}|null,
 * landed?: boolean, arrive?: boolean}} inputs
 * @returns {import("./expressionPlanTypes.js").TweenExpressionHook} */
export function tweenHandler({
  cache,
  scope,
  correspondence = null,
  time,
  viewState,
  root,
  prefix,
  moving,
  landed = false,
  arrive = false,
}) {
  const paths = tweenPaths(root, prefix);
  const view = viewState ?? makeViewState({ time });
  const produce = (node, inner, own) => {
    let value = inner.value?.codes ?? inner.value;
    const host =
      Array.isArray(value) ||
      ArrayBuffer.isView(value) ||
      typeof value === "number" ||
      typeof value === "boolean" ||
      typeof value === "string";
    const categorical =
      inner.categories ||
      inner.value?.categories ||
      ["categorical", "ordinal", "boolean"].includes(inner.metadata?.type) ||
      (Array.isArray(value) &&
        value.some(
          (item) => typeof item === "string" || typeof item === "boolean",
        )) ||
      value?.dtype === "bool" ||
      typeof value === "string" ||
      typeof value === "boolean";
    if (categorical && node !== root)
      throw Error(
        "tween() inside an expression needs numeric values; a categorical or boolean value can only be tweened as a whole channel.",
      );
    const options = node.args[1] ?? {};
    const path = paths.get(node) ?? prefix;
    let state = cache.get(path);
    const duration = options.duration ?? 300,
      easing = options.easing ?? "cubic-in-out",
      step = Boolean(categorical);
    if (
      !state ||
      state.duration !== Math.max(duration, 1e-6) ||
      state.easing !== easing ||
      state.step !== step
    ) {
      state?.dispose();
      state = new TweenState({ duration, easing, step });
      cache.set(path, state);
    }
    const boolean =
      inner.metadata?.type === "boolean" ||
      value?.dtype === "bool" ||
      typeof value === "boolean";
    const space = shapeOf(value).length
      ? correspondence
        ? {
            slots: null,
            count: correspondence.tokens.length,
            positional: false,
          }
        : tweenSlots(scope)
      : { slots: null, count: 0 };
    try {
      align(state, scope, space, correspondence);
      const key = targetKey(node.args[0], scope, view);
      if (key !== state.key) {
        let categories = inner.categories ?? inner.value?.categories;
        if (step && !boolean) {
          const token = (item) => `${typeof item}:${String(item)}`;
          const at = new Map(
            state.categories.map((item, i) => [token(item), i]),
          );
          const code = (item) => {
            if (
              item === null ||
              item === undefined ||
              (typeof item === "number" && Number.isNaN(item))
            )
              return -1;
            const key = token(item);
            if (!at.has(key)) {
              at.set(key, state.categories.length);
              state.categories.push(item);
            }
            return at.get(key);
          };
          if (categories) {
            const mapping = categories.map(code);
            const raw = own(asArray(value));
            const safe = own(
              np
                .where(raw.ref.greaterEqual(0), raw.ref, mapping.length)
                .astype(np.int32),
            );
            value = own(np.take(deviceArray([...mapping, -1]), safe, 0));
          } else if (host)
            value = own(
              asArray(
                Array.isArray(value) || ArrayBuffer.isView(value)
                  ? Array.from(value, code)
                  : code(value),
              ),
            );
          else
            throw Error(
              "tween() of a categorical column needs its category dictionary.",
            );
        } else if (host) value = own(asArray(value));
        if (!(value instanceof JaxArray))
          throw Error(
            "tween() needs a numeric value or a categorical whole channel.",
          );
        const origin =
          inner.metadata?.type === "datetime"
            ? inner.metadata.origin
            : undefined;
        if (Number.isFinite(origin)) {
          state.origin ??= origin;
          if (origin !== state.origin)
            value = own(value.ref.add(deviceScalar(origin - state.origin)));
        }
        state.retarget(value, space.slots, space.count, time, arrive);
        state.key = key;
      }
      if (landed || duration === 0) state.finish();
      if (state.end > time) moving?.({ end: state.end });
      const current = own(state.rowsAt(space.slots, time));
      const metadata = inner.metadata ?? {
        type: boolean ? "boolean" : step ? "categorical" : "numeric",
      };
      const categories = step && !boolean ? [...state.categories] : undefined;
      const typed =
        metadata.type === "datetime" && Number.isFinite(state.origin)
          ? { ...metadata, origin: state.origin }
          : metadata;
      if (boolean)
        return { ...inner, value: own(current.ref.astype(np.bool)), metadata };
      return {
        ...inner,
        value: current,
        metadata: categories ? { ...typed, domain: categories } : typed,
        ...(categories ? { categories } : {}),
      };
    } finally {
      space.slots?.dispose();
    }
  };
  // The producer retains its resolved inputs, rather than rebuilding unchanged target
  // arithmetic while only the clock advances. The ordinary evaluator still resolves all
  // surrounding operators and targets containing moving children at the selected time.
  produce.target = (node, resolve) => {
    const path = `__target/${paths.get(node) ?? prefix}`,
      key = targetKey(node.args[0], scope, view);
    let held = cache.get(path);
    if (!held || held.key !== key) {
      const result = resolve();
      const references = [];
      const retain = (value) => {
        if (value instanceof JaxArray) {
          const reference = value.ref;
          references.push(reference);
          return reference;
        }
        if (value?.codes instanceof JaxArray)
          return { ...value, codes: retain(value.codes) };
        return value;
      };
      const next = {
        key,
        result: { ...result, value: retain(result.value) },
        dispose() {
          references.splice(0).forEach((array) => array.dispose());
        },
      };
      held?.dispose();
      cache.set(path, (held = next));
    }
    return held.result;
  };
  return produce;
}

/**
 * An optional generic column-fact capability. The producer certifies its interval privately,
 * once per endpoint revision; consumers receive only a conservative yes/unknown result.
 * Captured references belong to the published view, so an older retained frame stays valid.
 */
export function tweenColumnFacts(state, cleanup) {
  if (!state?.from || state.step) return undefined;
  const from = state.from.ref,
    to = state.to.ref,
    facts = state.facts;
  cleanup(() => {
    from.dispose();
    to.dispose();
  });
  return (fact) => {
    if (fact !== "finiteNonnegative") return undefined;
    if (!facts.has(fact)) {
      const invalidTo = np.logicalOr(
        np.logicalNot(np.isfinite(to.ref)),
        to.ref.less(0),
      );
      // A missing old endpoint jumps to the target, rather than propagating NaN.
      const invalidFrom = np.logicalAnd(
        np.isfinite(from.ref),
        from.ref.less(0),
      );
      const invalid = np.any(np.logicalOr(invalidTo, invalidFrom));
      const ready = Promise.resolve(invalid.ref.js())
        .then((value) => !value)
        .finally(() => invalid.dispose());
      facts.set(fact, ready);
    }
    return facts.get(fact);
  };
}
