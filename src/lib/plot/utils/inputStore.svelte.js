import { inputValue, VALUE_INPUTS } from "./inputValues.js";
import { getContext, untrack, onDestroy } from "svelte";
import { DATA_CONTEXT } from "./categorical.js";
import { createExpressionEvaluator } from "./expressionPlans.js";
import { isExpression } from "./expressions.js";
import {
  NAME_PATTERN, InputPending, dataKeys, displayValue, initialValue, optionEntries, pendingInitial, sameValue as same, sameOption, scopeValue,
} from "./inputs.js";
import { zonedDate } from "./timeInputs.js";

/**
 * The values of one input context (TODO 41; reads and their substitution are utils/inputs.js).
 * Inputs declare their names here, with their initial values; the viewer's changes set them.
 * `parent` is the context around this one: a read walks out through the contexts until one
 * declares the name, so an inner name shadows an outer one. An input whose first value comes
 * from the data is pending until it is read (TODO 41.2): reading it throws InputPending.
 */
export class InputStore {
  values = $state({});
  // Bumped when a name is declared, withdrawn or settled, so reads that failed or waited re-run.
  version = $state(0);
  #declared = new Map(); // name -> { owner, given, pending }: `given` is the code's last value
  // Marks that write an input on click or hover (TODO 145.2): name -> { token, given, owners:
  // Map(owner -> { label, type }) }. With no widget of that name they declare it together, under
  // `token`, with their one default; a widget of that name owns it and they write its value.
  #writers = new Map();
  // A hover's value over the committed one (TODO 145.2): name -> { committed, writer }.
  #previews = new Map();
  #listeners = new Set();
  #formats = new Map(); // name -> { owner, text }: how the input shows its value (TODO 46)
  constructor(parent = null) {
    this.parent = parent;
  }
  /**
   * Declare the input `name` for `owner` with `value` (pending: its first value is read from the
   * data). A second owner of the name is an error. A later declaration by the same owner applies
   * its value only when that value changed since its last declaration (a new value from code);
   * otherwise the viewer's value stays.
   */
  declare(name, value, owner, pending = false) {
    const entry = this.#declared.get(name);
    // A widget named as an input marks write takes it over: it shows and edits their value.
    const shared = entry && entry.owner === this.#writers.get(name)?.token;
    if (entry && entry.owner !== owner && !entry.leaving && !shared)
      throw Error(`Two inputs are named "${name}" in one input context; give one another name, or put it in an InputContext of its own.`);
    if (shared && entry.owner !== owner) {
      this.#declared.set(name, { owner, given: value, pending });
      if (!pending) this.values[name] = value;
      this.version++;
      return;
    }
    if (!entry || entry.leaving) {
      this.#declared.set(name, { owner, given: value, pending });
      if (!pending) this.values[name] = value;
      this.version++;
    } else if (!pending && !same(entry.given, value)) {
      const waited = entry.pending;
      Object.assign(entry, { given: value, pending: false });
      this.values[name] = value;
      if (waited) this.version++;
    }
  }
  /** The first value of an input that reads the data, now known: it applies while still pending. */
  settle(name, value, owner) {
    const entry = this.#declared.get(name);
    if (!entry || entry.owner !== owner || !entry.pending) return;
    entry.pending = false;
    this.values[name] = value;
    this.version++;
    this.#notify(name, value, "data");
  }
  withdraw(name, owner) {
    const entry = this.#declared.get(name);
    if (entry?.owner !== owner || entry.leaving) return;
    // Gone once the current task ends (TODO 69.16): the readers torn down with it (a scene
    // replaced as a whole) still read its value meanwhile, and an input declared in its place
    // takes the name at once.
    entry.leaving = true;
    queueMicrotask(() => {
      if (this.#declared.get(name) !== entry) return;
      this.#declared.delete(name);
      this.#previews.delete(name);
      // Marks still writing it keep it declared, with their default.
      const writers = this.#writers.get(name);
      if (writers && entry.owner !== writers.token) {
        this.#declared.set(name, { owner: writers.token, given: writers.given, pending: false });
        this.values[name] = writers.given;
      } else delete this.values[name];
      this.version++;
    });
  }
  /**
   * A mark that writes `name` when clicked or hovered (TODO 145.2): `owner` is the mark, `label`
   * its name in errors, `given` its default (undefined: none of its own), `type` the type of the
   * column it writes ("numeric" or "categorical"; null while unknown). Marks writing one name
   * agree on its default and type, else an error names both. Returns the release.
   * @param {string} name @param {object} owner
   * @param {{ label: string, given?: unknown, type?: string | null }} writer
   */
  share(name, owner, { label, given = undefined, type = null }) {
    // Writers join the context that declares the name (a widget's, around this one); with none,
    // they declare it here.
    const declaring = this.#writers.has(name) || this.#declared.has(name) ? this : this.parent?.find(name);
    if (declaring && declaring !== this) return declaring.share(name, owner, { label, given, type });
    let writers = this.#writers.get(name);
    if (!writers) this.#writers.set(name, (writers = { token: {}, given: given ?? null, explicit: given !== undefined, owners: new Map() }));
    for (const [other, info] of writers.owners) {
      if (other === owner) continue;
      if (given !== undefined && writers.explicit && !same(given, writers.given))
        throw Error(`${label} and ${info.label} both write the input "${name}", with different defaults (${JSON.stringify(given)} and ${JSON.stringify(writers.given)}); give them one default.`);
      if (type && info.type && type !== info.type)
        throw Error(`${label} writes the input "${name}" from a ${type} column and ${info.label} from a ${info.type} one; one input holds one kind of value.`);
    }
    // A default given after the input was declared without one applies, whichever writer
    // registered first, unless the viewer has changed the value since (it no longer holds the
    // default it was declared with).
    if (given !== undefined && !writers.explicit) {
      const previous = writers.given;
      Object.assign(writers, { given, explicit: true });
      const entry = this.#declared.get(name);
      if (entry?.owner === writers.token && !entry.leaving) {
        const preview = this.#previews.get(name);
        const shown = preview ? preview.committed : this.values[name];
        entry.given = given;
        if (same(shown, previous)) {
          if (preview) preview.committed = given;
          else this.values[name] = given;
        }
      }
    }
    writers.owners.set(owner, { label, type });
    const entry = this.#declared.get(name);
    if (!entry || entry.leaving) {
      this.#declared.set(name, { owner: writers.token, given: writers.given, pending: false });
      this.values[name] = writers.given;
      this.version++;
    }
    return () => {
      // A writer that goes while its hover shows restores the committed value first.
      this.endPreview(name, owner);
      const current = this.#writers.get(name);
      if (!current?.owners.delete(owner) || current.owners.size) return;
      this.#writers.delete(name);
      if (this.#declared.get(name)?.owner === current.token) this.withdraw(name, current.token);
    };
  }
  /** Whether marks write `name` (TODO 145.2). */
  written(name) {
    return this.#writers.has(name);
  }
  /**
   * A hover's value for `name` (TODO 145.2): readers see it until endPreview, then the committed
   * value again. Not sent on as a change: only commits reach listeners (Python).
   */
  preview(name, value, writer) {
    const store = this.find(name);
    if (!store) return;
    if (store !== this) return store.preview(name, value, writer);
    const entry = this.#declared.get(name);
    if (!entry || entry.pending) return;
    const current = this.#previews.get(name) ?? { committed: this.values[name], writer };
    current.writer = writer;
    this.#previews.set(name, current);
    if (!same(this.values[name], value)) this.values[name] = value;
  }
  /** The hover over `name` by `writer` ended: its committed value again. */
  endPreview(name, writer) {
    const store = this.find(name);
    if (!store) return;
    if (store !== this) return store.endPreview(name, writer);
    const current = this.#previews.get(name);
    if (!current || current.writer !== writer) return;
    this.#previews.delete(name);
    if (!same(this.values[name], current.committed)) this.values[name] = current.committed;
  }
  /** A click's value for `name` (TODO 145.2): the committed value, as a viewer's change. */
  commit(name, value) {
    const store = this.find(name);
    if (!store) return;
    if (store !== this) return store.commit(name, value);
    this.set(name, value, "viewer");
  }
  /**
   * A click on nothing (TODO 145.2): `name` back to its default: the writers' own default= when
   * they give one, else its widget's value from code, else null.
   */
  reset(name) {
    const store = this.find(name);
    if (!store) return;
    if (store !== this) return store.reset(name);
    const writers = this.#writers.get(name);
    this.commit(name, writers?.explicit ? writers.given : this.#declared.get(name)?.given ?? null);
  }
  /**
   * `name` changed: the viewer set it ("viewer"), Python did ("python", another view or code), or
   * the data moved it back into range ("data").
   */
  set(name, value, origin = "viewer") {
    const entry = this.#declared.get(name);
    // A set is committed: a hover's preview over it ends (its leave restores nothing).
    const preview = this.#previews.get(name);
    this.#previews.delete(name);
    if (preview && !entry?.pending && same(this.values[name], value)) {
      if (!same(preview.committed, value)) this.#notify(name, value, origin);
      return;
    }
    if (!entry || (!entry.pending && same(this.values[name], value))) return;
    const waited = entry.pending;
    entry.pending = false;
    this.values[name] = value;
    if (waited) this.version++;
    this.#notify(name, value, origin);
  }
  #notify(name, value, origin) {
    for (const listener of this.#listeners) listener(name, value, origin);
  }
  /** Listen to changes: (name, value, origin) for each. */
  subscribe(listener) {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }
  declares(name) {
    return this.#declared.has(name);
  }
  /** Whether `name`'s value is still to be read from the data. */
  pending(name) {
    this.version;
    return Boolean(this.#declared.get(name)?.pending);
  }
  /** The context that declares `name`: this one or one around it, or null. */
  find(name) {
    this.version;
    return this.#declared.has(name) ? this : this.parent?.find(name) ?? null;
  }
  /** Every name visible here, innermost first. */
  names() {
    this.version;
    return [...new Set([...this.#declared.keys(), ...(this.parent?.names() ?? [])])];
  }
  /**
   * How the input `name` shows its value (a Slider's format, a Select's option label): `text`
   * turns a value into that string. Returns a function that withdraws it.
   */
  describe(name, text, owner) {
    this.#formats.set(name, { owner, text });
    return () => {
      if (this.#formats.get(name)?.owner === owner) this.#formats.delete(name);
    };
  }
  /**
   * The value of `name` as its input shows it (reactive): for {$name} placeholders in text. "…"
   * while it waits for the data; a name no input has is the error `read` gives.
   */
  display(name, where) {
    const store = this.find(name);
    if (store?.pending(name)) return "…";
    const value = this.read(name, where), text = store.#formats.get(name)?.text;
    return text ? String(text(value)) : displayValue(value);
  }
  /**
   * The value of `name` (reactive), InputPending while it waits for the data, `fallback` (a
   * read's default) while nothing declares the input, else an error.
   */
  read(name, where, fallback = undefined) {
    const store = this.find(name);
    if (store) {
      if (store.pending(name)) throw new InputPending(name);
      return store.values[name];
    }
    if (fallback !== undefined) return fallback;
    const names = this.names();
    throw Error(`${where} reads $${name}, but no input named "${name}" is in its input context or around it` +
      (names.length ? ` (inputs here: ${names.join(", ")})` : "") +
      `; add an input with that name (a Slider, Select, ...) or a writer outside ${where.split(".")[0]} ` +
      `(a Button with set=), or give the read a default: input("${name}", { default }).`);
  }
}

/** `value` kept valid for the input's props: a number within [min, max], an existing option. */
function inRange(kind, value, props) {
  if (kind === "Slider" && Array.isArray(value)) return inputValue(kind, { ...props, value });
  if (VALUE_INPUTS.has(kind)) return inputValue(kind, { ...props, value });
  if (kind === "Slider" || kind === "Playback") {
    // A time stays between its bounds too (TODO 53.3).
    if (value instanceof Date) {
      const lo = props.min instanceof Date ? props.min.getTime() : -Infinity, hi = props.max instanceof Date ? props.max.getTime() : Infinity;
      const ms = Math.min(Math.max(value.getTime(), lo), hi);
      return ms === value.getTime() ? value : zonedDate(ms, value.timezone ?? props.min?.timezone);
    }
    if (typeof value !== "number") return value;
    const lo = Number.isFinite(props.min) ? props.min : -Infinity, hi = Number.isFinite(props.max) ? props.max : Infinity;
    return Math.min(Math.max(value, lo), hi);
  }
  const options = optionEntries(props.options).map((entry) => entry.value);
  if (kind === "Select" && props.multiple) return Array.isArray(value) ? value.filter((item) => options.some((option) => sameOption(option, item))) : [];
  if (kind === "Select") return options.find((option) => sameOption(option, value)) ?? options[0] ?? null;
  return value;
}

/**
 * The props of an input that read the data (TODO 41.2), evaluated over the Data scope around the
 * input: min={min("x")}, options={categories("species")}, options={columnNames()}. They are read again
 * when the data changes, never when the input moves. `values` holds the results by key; `ready`
 * says every one is known.
 */
function dataDerived(kind, props) {
  const evaluator = createExpressionEvaluator();
  onDestroy(() => evaluator.dispose());
  const data = getContext(DATA_CONTEXT);
  let values = $state.raw(/** @type {Record<string, any>} */ ({})), ready = $state(false), error = $state("");
  $effect(() => {
    const current = props();
    const keys = dataKeys(kind).filter((key) => isExpression(current[key]));
    if (!keys.length) {
      values = {};
      ready = true;
      error = "";
      return;
    }
    let scope;
    try {
      scope = data?.read?.();
      scope?.version;
    } catch (e) {
      error = e.message;
      return;
    }
    if (!scope) {
      error = `${kind} "${current.name}": ${keys.join(" and ")} read the data, so it needs a Data scope around it.`;
      return;
    }
    let canceled = false;
    (async () => {
      const out = {};
      for (const key of keys) out[key] = await scopeValue(current[key], scope, `${kind}.${key}`, evaluator);
      if (canceled) return;
      values = out;
      ready = true;
      error = "";
    })().catch((e) => {
      if (!canceled) error = e.message;
    });
    return () => {
      canceled = true;
    };
  });
  return {
    get values() { return values; },
    get ready() { return ready; },
    get error() { return error; },
  };
}

/**
 * What an input component does with its store (call it in the component's script): find the
 * nearest input context, refuse a place inside a Plot, declare `name` at once (so readers mounted
 * before it resolve, or wait while its first value is read from the data), follow later changes
 * of name and value, evaluate the props that read the data, and keep the value in range when
 * they change. `owner` is the Python node's id in a scene (the scene declared the input already),
 * else a new object. Returns the store, the owner and the props read from the data (fromData).
 */
export function inputControl(kind, props, contexts) {
  const { store, insidePlot, owner: given } = contexts;
  const name = props().name;
  if (typeof name !== "string" || !NAME_PATTERN.test(name))
    throw Error(`${kind} needs a name, an identifier such as "bins"; received ${JSON.stringify(name)}.` +
      (kind === "Button" ? ' A Button that acts on a press takes set= instead: set={focus.reset()} or set={focus.set(literal("all"))}.' : ""));
  if (!store) throw Error(`${kind} "${name}" needs an input context around it: an InputContext, or a Python Scene.`);
  if (insidePlot) throw Error(`${kind} "${name}" is inside a Plot; put it in a Row beside the Plot.`);
  const owner = given ?? {};
  const initial = (current) => (pendingInitial(kind, current) ? null : initialValue(kind, current));
  store.declare(name, initial(props()), owner, pendingInitial(kind, props()));
  let declared = name;
  $effect.pre(() => {
    const current = props(), next = current.name, value = initial(current), pending = pendingInitial(kind, current);
    // The store's state is written, not read, here: untracked, so this effect follows the
    // props alone.
    untrack(() => {
      if (next !== declared) {
        store.withdraw(declared, owner);
        declared = next;
      }
      store.declare(next, value, owner, pending);
    });
  });
  $effect(() => () => store.withdraw(declared, owner));
  const fromData = dataDerived(kind, props);
  $effect(() => {
    if (!fromData.ready) return;
    const current = { ...props(), ...fromData.values };
    untrack(() => {
      store.settle(current.name, initialValue(kind, current), owner);
      const value = store.values[current.name], kept = inRange(kind, value, current);
      if (!same(kept, value)) store.set(current.name, kept, "data");
    });
  });
  return { store, owner, fromData };
}
