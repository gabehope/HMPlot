let nextId = 0;
let nextNodeId = 0;

const identity = (value) => value;

function isArrayLike(value) {
  return Array.isArray(value) || ArrayBuffer.isView(value);
}

// Type markers such as three.js's own isColor key say what an object is, not
// what it holds.
const isMarker = (key) => /^is[A-Z]/.test(key);

function isPlainObject(value) {
  if (!value || typeof value !== "object") return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/** Plain settings that can travel to Python or an HTML export, without runtime handles. */
export function isSettingValue(value, ancestors = new Set()) {
  if (value === null || typeof value === "string" || typeof value === "boolean")
    return true;
  if (typeof value === "number") return Number.isFinite(value);
  if ((!Array.isArray(value) && !isPlainObject(value)) || ancestors.has(value))
    return false;
  ancestors.add(value);
  // JSON omits undefined object members; array slots must have actual values.
  const children = Array.isArray(value)
    ? value
    : Object.values(value).filter((v) => v !== undefined);
  const valid = children.every((child) => isSettingValue(child, ancestors));
  ancestors.delete(value);
  return valid;
}

// Extras compare by value: plain objects key by key, anything else as an option value.
function extrasEqual(left, right) {
  if (isPlainObject(left) && isPlainObject(right)) {
    const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
    return [...keys].every((key) => extrasEqual(left[key], right[key]));
  }
  return valuesEqual(left, right);
}

// Vector- and color-like objects compare by their components; any other own
// keys (a label, nested metadata) must also match by value, so {x, y, label}
// changes emit. Symmetric: the answer does not depend on argument order.
function compareComponents(left, right, components) {
  const present = components.filter(
    (component) => component in left || component in right,
  );
  if (!present.length) return false;
  const extras = new Set(
    [...Object.keys(left), ...Object.keys(right)].filter(
      (key) => !components.includes(key) && !isMarker(key),
    ),
  );
  return (
    present.every((component) => valuesEqual(left[component], right[component])) &&
    [...extras].every((key) => extrasEqual(left[key], right[key]))
  );
}

function valuesEqual(left, right) {
  if (Object.is(left, right)) return true;
  if (isArrayLike(left) && isArrayLike(right)) {
    if (left.length !== right.length) return false;
    return Array.from(left).every((value, index) =>
      valuesEqual(value, right[index]),
    );
  }
  if (left && right && typeof left === "object" && typeof right === "object") {
    // A class's own equals() is trusted only against its own kind; a mixed pair
    // (Color and a plain {r, g, b}) compares components, in either order.
    if (
      typeof left.equals === "function" &&
      Object.getPrototypeOf(left) === Object.getPrototypeOf(right) &&
      left.equals(right)
    )
      return true;
    if (compareComponents(left, right, ["x", "y", "z", "w"])) return true;
    if (compareComponents(left, right, ["r", "g", "b", "a"])) return true;
  }
  return false;
}

function valuesEquivalent(left, right, transform = identity) {
  if (valuesEqual(left, right)) return true;
  try {
    return valuesEqual(transform(left), transform(right));
  } catch {
    return false;
  }
}

/**
 * The layers a node's own values come from, highest first (TODO 136.7): the viewer's edits (the
 * settings pane, a legend toggle), the authored props, the theme, and what data preparation
 * derives (a datetime axis, a scale's options). Below them a node reads its kind defaults, then
 * what it inherits, then the definition. A layer is written and cleared on its own, so a theme or
 * a preparation never replaces an authored value, and exports carry the user layer only.
 * The theme layer is lazy (TODO 136.12): it takes options no component has registered yet, and an
 * option registered later takes its theme value as it is registered, so results do not depend on
 * mount order.
 */
const LAYERS = /** @type {const} */ (["user", "authored", "theme", "derived"]);

class OptionsNode {
  constructor(defaults, parent, name = "Options", identifier) {
    this.uid = `options-${nextNodeId++}`;
    // Counts this node's changes (an emit, here or in what it depends on, or notifyAny): a
    // snapshot taken at one revision holds while it stays (TODO 143.4).
    this.revision = 0;
    this.presentation = {};
    this._name = name;
    if (!identifier) {
      identifier = `${this.name}-${nextId++}`;
    }
    this._identifier = identifier;

    this.parent = parent;
    this.defaults = defaults;
    defaults?.dependents.set(this.identifier, this);

    // Each option's own value here: its highest layer's, or on a root node its definition.
    this.values = new Map();
    /** @type {Map<string, Map<string, unknown>>} */
    this.layers = new Map(LAYERS.map((layer) => [layer, new Map()]));
    this.definitions = new Map();
    // Options set on this node (in any layer, not a definition's default), and this node's own
    // defaults for shared options (setKindDefault).
    this.explicit = new Set();
    this.kindDefaults = new Map();
    this.valueTypes = new Map();
    this.presentationTypes = new Map();
    this.children = new Map();
    this.childrenListeners = new Set();
    this.dependents = new Map();
    this.dependentsListeners = new Set();
    this.listeners = new Map();
    this.structureListeners = new Set();
    this.transforms = new Map();
    this._params = this.defaults?.snapshot() ?? {};
    this._optionStores = new Map();
    this._displayList = undefined;

    this._optionsProxy = new Proxy(
      {},
      {
        get: (_, prop) => {
          if (this.has(prop)) return this.get(prop);
          if (this.hasChild(prop)) return this.child(prop).options;
          return undefined;
        },
        set: (_, prop, value) => {
          if (!this.has(prop)) {
            throw new Error(`Unknown option ${String(prop)} on ${this.name}`);
          }
          this.set(prop, value);
          return true;
        },
        has: (_, prop) => this.has(prop) || this.hasChild(prop),
      },
    );

    this._transformedProxy = new Proxy(
      {},
      {
        get: (_, prop) => {
          if (this.has(prop)) return this.getTransformed(prop);
          if (this.hasChild(prop)) return this.child(prop).transformed;

          return undefined;
        },
        set: (_, prop, value) => {
          throw new Error(
            `Cannot set transformed value ${String(prop)} on ${this.name}`,
          );
        },
        has: (_, prop) => this.has(prop) || this.hasChild(prop),
      },
    );

    this._storesProxy = new Proxy(
      {},
      {
        get: (_, prop) => {
          if (this.has(prop)) return this.store(prop);
          if (this.hasChild(prop)) return this.child(prop).stores;
          return undefined;
        },
        has: (_, prop) => this.has(prop) || this.hasChild(prop),
      },
    );
  }

  static ANY = Symbol("any");

  get name() {
    return this._name;
  }

  get identifier() {
    return this._identifier;
  }

  get params() {
    return this._params;
  }

  get options() {
    return this._optionsProxy;
  }

  get transformed() {
    return this._transformedProxy;
  }

  get stores() {
    return this._storesProxy;
  }

  static key(type) {
    return typeof type === "string" ? type : type?.name;
  }

  static path(option) {
    if (typeof option !== "string") return null;

    const dot = option.indexOf(".");
    const dash = option.indexOf("-");
    const index =
      dot > 0 && (dash < 0 || dot < dash) ? dot : dash > 0 ? dash : -1;

    if (index <= 0 || index >= option.length - 1) return null;
    return [option.slice(0, index), option.slice(index + 1)];
  }

  static visibleSpec(spec) {
    return !!spec?.ui;
  }

  get keys() {
    const defaultKeys = this.defaults ? this.defaults.keys : [];
    return [...new Set([...defaultKeys, ...this.values.keys()])];
  }

  get definitionRoot() {
    return this.defaults?.definitionRoot ?? this;
  }

  get displayList() {
    return this._displayList ?? this.defaults?.displayList;
  }

  get hasOwnDisplayList() {
    return this._displayList !== undefined;
  }

  getChildDefaults(type) {
    const key = OptionsNode.key(type);
    return this.children.get(key) ?? this.defaults?.getChildDefaults(key);
  }

  child(type) {
    const key = OptionsNode.key(type);
    if (!this.hasChild(key))
      throw new Error(`Unknown child ${key} on ${this.name}`);

    let node = this.children.get(key);
    if (!node) {
      // Materialize every intermediate scope. Skipping an unmaterialized
      // namespace would permanently bypass its future local overrides.
      node = new OptionsNode(this.defaults?.child(key), this, key);
      this.children.set(key, node);
      this.emitChildren();
    }
    return node;
  }

  hasChild(type) {
    const key = OptionsNode.key(type);
    return this.children.has(key) || !!this.defaults?.hasChild(key);
  }

  defineChild(type) {
    if (this.defaults) {
      return this.ensureChild(type);
    }

    const key = OptionsNode.key(type);
    if (this.hasChild(key)) {
      throw new Error(`Child ${key} already exists on ${this.name}`);
    }
    const child = new OptionsNode(null, this, key);
    this.children.set(key, child);
    this.emitChildren();
    return child;
  }

  ensureChild(type) {
    const key = OptionsNode.key(type);
    if (!this.hasChild(key)) {
      const root = this.definitionRoot;
      if (root !== this) {
        root.ensureChild(key);
      } else {
        const child = new OptionsNode(null, this, key);
        this.children.set(key, child);
        this.emitChildren();
      }
    }
    return this.child(key);
  }

  normalizeDefinition(option, defaultValue, valueType, transform) {
    let type = null;

    if (defaultValue?.isFieldType) {
      type = defaultValue;
      defaultValue = type.defaultValue;
      valueType = {
        ...type.ui(),
        label:
          type.label === type.name || type.label === "field"
            ? option
            : type.label,
        type,
      };
      transform = transform ?? ((data) => type.transform(data));
    } else if (valueType?.isFieldType) {
      type = valueType;
      valueType = {
        ...type.ui(),
        label:
          type.label === type.name || type.label === "field"
            ? option
            : type.label,
        type,
      };
      transform = transform ?? ((data) => type.transform(data));
    } else if (valueType?.type) {
      type = valueType.type;
      valueType = { ...valueType };
    }

    if (!valueType) throw new Error(`Need to specify type for ${option}`);
    if (type && !valueType.type) valueType.type = type;

    return {
      defaultValue,
      valueType,
      transform: transform ?? identity,
    };
  }

  defineLocal(option, defaultValue, valueType, transform) {
    if (!option) throw new Error("Need to specify option");
    if (this.defaults) {
      throw new Error(
        `Cannot define option ${option} on dependent node ${this.name}`,
      );
    }

    const definition = this.normalizeDefinition(
      option,
      defaultValue,
      valueType,
      transform,
    );

    if (this.values.has(option)) {
      console.warn(`Option ${option} already exists on ${this.name}`);
    }

    this.valueTypes.set(option, definition.valueType);
    this.definitions.set(option, definition.defaultValue);
    if (!this.explicit.has(option)) this.values.set(option, definition.defaultValue);
    this.transforms.set(option, definition.transform);
    this.emit(option);
    this.emitStructure();
  }

  define(option, defaultValue, valueType, transform) {
    if (!option) throw new Error("Need to specify option");

    const path = OptionsNode.path(option);
    if (path) {
      const [childName, childOption] = path;
      this.ensureChild(childName).define(
        childOption,
        defaultValue,
        valueType,
        transform,
      );
      return this;
    }

    const root = this.definitionRoot;
    if (root !== this) {
      root.define(option, defaultValue, valueType, transform);
      return this;
    }

    this.defineLocal(option, defaultValue, valueType, transform);
    return this;
  }

  ensure(option, defaultValue, valueType, transform) {
    if (!this.has(option)) {
      this.define(option, defaultValue, valueType, transform);
    }
    return this;
  }

  getType(option) {
    const path = OptionsNode.path(option);
    if (path) {
      const [childName, childOption] = path;
      return this.hasChild(childName)
        ? this.child(childName).getType(childOption)
        : undefined;
    }

    return (
      this.presentationTypes.get(option) ??
      (this.valueTypes.has(option)
        ? this.valueTypes.get(option)
        : this.defaults?.getType(option))
    );
  }

  getTransform(option) {
    const path = OptionsNode.path(option);
    if (path) {
      const [childName, childOption] = path;
      return this.hasChild(childName)
        ? this.child(childName).getTransform(childOption)
        : identity;
    }

    const transform = this.transforms.has(option)
      ? this.transforms.get(option)
      : this.defaults?.getTransform(option);
    return typeof transform === "function" ? transform : (x) => x;
  }

  has(option) {
    const path = OptionsNode.path(option);
    if (path) {
      const [childName, childOption] = path;
      const child =
        this.children.get(childName) ??
        this.defaults?.getChildDefaults(childName);
      return !!child?.has(childOption);
    }

    return this.values.has(option) || !!this.defaults?.has(option);
  }

  get(option) {
    const path = OptionsNode.path(option);
    if (path) {
      const [childName, childOption] = path;
      return this.hasChild(childName)
        ? this.child(childName).get(childOption)
        : undefined;
    }

    if (this.values.has(option)) {
      return this.values.get(option);
    }
    if (this.kindDefaults.has(option) && !this.defaults?.isExplicit(option))
      return this.kindDefaults.get(option);
    return this.defaults?.get(option);
  }

  /** Whether `option` was set on this node or a node it inherits from (not a default). */
  isExplicit(option) {
    return this.explicit.has(option) || !!this.defaults?.isExplicit(option);
  }

  /**
   * This node's own default for an option several mark types share (TODO 32.3): Arrows and
   * Arrows both have headLength, 3 and 10 pixels. One definition serves every mark,
   * and the first mark to define an option used to set its default for all of them. The kind
   * default applies unless this node or a node it inherits from sets the option.
   */
  setKindDefault(option, value) {
    if (!this.has(option)) throw new Error(`Unknown option ${option} on ${this.name}`);
    if (this.kindDefaults.has(option) && valuesEqual(this.kindDefaults.get(option), value)) return;
    this.kindDefaults.set(option, value);
    this.emit(option);
  }

  getTransformed(option) {
    return this.getTransform(option)(this.get(option));
  }

  /**
   * Set an option in one of its layers (TODO 136.7): "authored" by default; "user" for the
   * viewer's edits (the settings pane, a legend toggle), which exports and Python edits carry;
   * "theme" for a Theme's values; "derived" for what data preparation works out. A lower layer's
   * value applies only while no higher layer on this node sets the option; undefined removes the
   * layer's value.
   * @param {string} option @param {unknown} value
   * @param {{layer?: "user" | "authored" | "theme" | "derived"}} [options]
   */
  set(option, value, { layer = "authored" } = {}) {
    const path = OptionsNode.path(option);
    if (path) {
      const [childName, childOption] = path;
      this.child(childName).set(childOption, value, { layer });
      return;
    }

    // A theme's value of an option not registered yet waits in its layer (emit resolves it).
    if (layer === "theme" && !this.has(option)) {
      if (value === undefined) this.layers.get("theme").delete(option);
      else this.layers.get("theme").set(option, value);
      return;
    }
    if (!this.has(option)) {
      throw new Error(`Unknown option ${option} on ${this.name}`);
    }
    const own = this.#layer(layer);
    const user = this.layers.get("user").has(option);
    // A changed authored value is the author's latest word: it replaces the viewer's edit (a
    // bound prop, a Python assignment). One set again unchanged leaves the edit.
    if (layer === "authored" && user &&
        (own.has(option) !== (value !== undefined) || !valuesEqual(own.get(option), value)))
      this.layers.get("user").delete(option);
    // An undefined value is no value in this layer: an absent prop shows what is below it.
    if (value === undefined) own.delete(option);
    else own.set(option, value);
    const { changed, gained } = this.#resolve(option);
    // A new user value notifies even when it equals the value shown: the snapshot now carries it.
    if (changed || user !== this.layers.get("user").has(option)) this.emit(option);
    // Explicit even when it equals the default: it overrides a dependent's kind default.
    else if (gained) this.#emitKindDefaults(option);
  }

  /**
   * A Theme's values for this node (TODO 136.12): the theme layer replaced, an option the theme no
   * longer sets cleared from it. Options not registered yet take theirs when they are.
   * @param {Record<string, unknown>} values
   */
  setThemeValues(values) {
    for (const option of [...this.layers.get("theme").keys()])
      if (values[option] === undefined) this.clear(option, { layer: "theme" });
    for (const [option, value] of Object.entries(values))
      if (value !== undefined) this.set(option, value, { layer: "theme" });
  }

  /** Set what data preparation works out (the derived layer), below anything authored or edited. */
  derive(option, value) {
    this.set(option, value, { layer: "derived" });
  }

  /** The options the viewer set here (the user layer), which exports and Python edits carry. */
  get userKeys() {
    return new Set(this.layers.get("user").keys());
  }

  /** Whether `layer` on this node sets `option`. */
  inLayer(option, layer) {
    return this.#layer(layer).has(option);
  }

  #layer(layer) {
    const own = this.layers.get(layer);
    if (!own)
      throw new Error(`Unknown options layer ${layer} on ${this.name}; use one of ${LAYERS.join(", ")}.`);
    return own;
  }

  /** Recompute `option`'s own value from its layers; says whether it changed or became explicit. */
  #resolve(option) {
    const had = this.values.has(option),
      previous = this.values.get(option),
      wasExplicit = this.explicit.has(option);
    const layer = LAYERS.find((name) => this.layers.get(name).has(option));
    if (layer) {
      this.values.set(option, this.layers.get(layer).get(option));
      this.explicit.add(option);
    } else {
      this.explicit.delete(option);
      if (this.definitions.has(option)) this.values.set(option, this.definitions.get(option));
      else this.values.delete(option);
    }
    return {
      changed: had !== this.values.has(option) || !valuesEqual(previous, this.values.get(option)),
      gained: !wasExplicit && this.explicit.has(option),
    };
  }

  /** Dependents whose kind default an option set here now overrides see the change. */
  #emitKindDefaults(option) {
    for (const dependent of this.dependents.values())
      if (dependent.kindDefaults.has(option) && !dependent.values.has(option)) dependent.emit(option);
      else dependent.#emitKindDefaults(option);
  }

  /**
   * Remove this node's own value of `option`: every layer's, or only `layer`'s, so the next layer
   * down (or what the node inherits) shows.
   * @param {string} option @param {{layer?: "user" | "authored" | "theme" | "derived"}} [options]
   */
  clear(option, { layer = undefined } = {}) {
    const path = OptionsNode.path(option);
    if (path) {
      const [childName, childOption] = path;
      this.child(childName).clear(childOption, { layer });
      return;
    }

    if (!this.has(option)) {
      // A waiting theme value (set's "theme" layer): nothing resolved or shown yet.
      if (!layer || layer === "theme") this.layers.get("theme").delete(option);
      return;
    }
    if (!this.defaults) {
      throw new Error(
        `Cannot clear root/default option ${option} on ${this.name}`,
      );
    }
    // Types and transforms live only on root nodes (defineLocal rejects dependents),
    // so clearing an override removes just the local value.
    const layers = layer ? [this.#layer(layer)] : [...this.layers.values()];
    // An absent override changes neither the value nor its provenance. In particular,
    // repeated prop resets must not wake every listener in the dependent tree.
    if (!layers.some((own) => own.has(option))) return;
    for (const own of layers) own.delete(option);
    this.#resolve(option);
    this.emit(option);
  }

  /**
   * Call `fn` when `option` changes (any option by default); returns the unsubscribe.
   * @param {string | symbol} [option]
   */
  on(fn, option = OptionsNode.ANY) {
    const path = OptionsNode.path(option);
    if (path) {
      const [childName, childOption] = path;
      return this.child(childName).on(fn, childOption);
    }

    let set = this.listeners.get(option);
    if (!set) {
      set = new Set();
      this.listeners.set(option, set);
    }
    set.add(fn);
    return () => set.delete(fn);
  }

  /**
   * Tell the any-option listeners here and on the dependents that something they read beside
   * this node's options changed (TODO 136.12: the Plot's view context, notified as "viewContext").
   * @param {string} reason
   */
  notifyAny(reason) {
    this.revision++;
    for (const listener of this.listeners.get(OptionsNode.ANY) ?? []) listener(this.params, reason);
    for (const dependent of this.dependents.values()) dependent.notifyAny(reason);
  }

  emit(option) {
    this.revision++;
    // Registered after a theme set it (emit reaches every dependent from the definition):
    // its theme value applies now (TODO 136.12).
    if (!this.explicit.has(option) && this.layers.get("theme").has(option) && this.has(option))
      this.#resolve(option);
    this.params[option] = this.getTransform(option)(this.get(option));
    for (const listener of this.listeners.get(option) ?? []) {
      listener(this.params[option]);
    }
    // An any-option listener also receives the option that changed.
    for (const listener of this.listeners.get(OptionsNode.ANY) ?? []) {
      listener(this.params, option);
    }
    for (const dependent of this.dependents.values()) {
      dependent.emit(option);
    }
  }

  store(option) {
    const path = OptionsNode.path(option);
    if (path) {
      const [childName, childOption] = path;
      return this.child(childName).store(childOption);
    }

    if (this._optionStores.has(option)) return this._optionStores.get(option);

    const store = {
      subscribe: (run) => {
        run(this.get(option));
        return this.on(() => run(this.get(option)), option);
      },
      /** @param {unknown} value @param {{layer?: "user" | "authored" | "theme" | "derived"}} [options] */
      set: (value, options = {}) => {
        // An inherited value set again is no edit, unless the viewer sets it: that pins it.
        if (
          options.layer !== "user" &&
          this.defaults &&
          !this.values.has(option) &&
          valuesEquivalent(value, this.get(option), this.getTransform(option))
        ) {
          return;
        }
        this.set(option, value, options);
      },
      update: (fn) => store.set(fn(this.get(option))),
    };

    this._optionStores.set(option, store);
    return store;
  }

  onChildren(fn) {
    this.childrenListeners.add(fn);
    return () => this.childrenListeners.delete(fn);
  }

  emitChildren() {
    for (const listener of this.childrenListeners) {
      listener(this.children);
    }
    this.emitStructure();
    this.parent?.emitChildren();
    this.defaults?.emitDependents();
  }

  childrenStore() {
    const store = {
      subscribe: (run) => {
        run(this.children);
        return this.onChildren(run);
      },
    };
    return store;
  }

  onDependents(fn) {
    this.dependentsListeners.add(fn);
    return () => this.dependentsListeners.delete(fn);
  }

  emitDependents() {
    for (const listener of this.dependentsListeners) {
      listener(this.dependents);
    }
    this.emitStructure();
  }

  dependentsStore() {
    const store = {
      subscribe: (run) => {
        run(this.dependents);
        return this.onDependents(run);
      },
    };
    return store;
  }

  onStructure(fn) {
    this.structureListeners.add(fn);
    return () => this.structureListeners.delete(fn);
  }

  emitStructure() {
    for (const listener of this.structureListeners) {
      listener(this);
    }
  }

  structureStore() {
    const store = {
      subscribe: (run) => {
        run(this);
        return this.onStructure(run);
      },
    };
    return store;
  }

  setDisplayList(displayList) {
    const next =
      displayList == null ? undefined : Array.from(displayList, String);
    if (valuesEqual(next, this._displayList)) return this;
    this._displayList = next;
    this.emitStructure();
    this.parent?.emitChildren();
    this.defaults?.emitDependents();
    return this;
  }

  setPresentation(presentation) {
    if (
      Object.entries(presentation).every(
        ([key, value]) => this.presentation[key] === value,
      )
    )
      return this;
    Object.assign(this.presentation, presentation);
    this.emitStructure();
    return this;
  }

  owner(option) {
    const path = OptionsNode.path(option);
    if (path)
      return this.hasChild(path[0])
        ? this.child(path[0]).owner(path[1])
        : undefined;
    return this.values.has(option) ? this : this.defaults?.owner(option);
  }

  setDisplay(displayList) {
    return this.setDisplayList(displayList);
  }

  displayAllowsOption(option) {
    const displayList = this.displayList;
    if (displayList === undefined) return true;
    return displayList.includes(option);
  }

  displayAllowsChild(childName) {
    const displayList = this.displayList;
    if (displayList === undefined) return true;
    return displayList.some((entry) => {
      if (entry === childName) return true;
      const path = OptionsNode.path(entry);
      return path?.[0] === childName;
    });
  }

  visibleKeys() {
    const keys = this.keys.filter((key) =>
      OptionsNode.visibleSpec(this.getType(key)),
    );
    const displayList = this.displayList;
    if (displayList === undefined) return keys;

    return displayList.filter((entry) => {
      if (OptionsNode.path(entry)) return false;
      return keys.includes(entry) && this.displayAllowsOption(entry);
    });
  }

  hasVisibleContent({ showDependents = true, allowedChildren = [] } = {}) {
    if (this.visibleKeys().length > 0) return true;

    const allowed = new Set(allowedChildren);
    for (const [name, child] of this.children) {
      if (allowed.size && !allowed.has(name)) continue;
      if (!this.displayAllowsChild(name)) continue;
      if (child.hasVisibleContent({ showDependents })) return true;
    }

    if (showDependents) {
      for (const dependent of this.dependents.values()) {
        if (dependent.hasVisibleContent({ showDependents })) return true;
      }
    }

    return false;
  }

  usedChildNames(seen = new Set()) {
    if (seen.has(this)) return new Set();
    seen.add(this);

    const names = new Set(this.children.keys());
    for (const child of this.children.values()) {
      for (const name of child.usedChildNames(seen)) names.add(name);
    }
    for (const dependent of this.dependents.values()) {
      for (const name of dependent.usedChildNames(seen)) names.add(name);
    }
    return names;
  }

  hasNodeName(identifier) {
    return (
      this.dependents.has(identifier) ||
      this.hasChild(identifier) ||
      this.has(identifier)
    );
  }

  availableDependentIdentifier(identifier) {
    if (!identifier) return identifier;

    const base = String(identifier);
    if (!this.hasNodeName(base)) return base;

    let index = 1;
    let candidate = `${base}${index}`;
    while (this.hasNodeName(candidate)) {
      index += 1;
      candidate = `${base}${index}`;
    }
    return candidate;
  }

  splitUnique(identifier, kind, fallback = "Group") {
    const node = this.split(this.availableDependentIdentifier(identifier));
    if (kind) {
      const used = new Set(
        [...this.dependents.values()]
          .filter((item) => item !== node)
          .map((item) => item.presentation.label),
      );
      const base = String(identifier ?? "").trim();
      let index = 1,
        label = base || `${fallback} ${index}`;
      while (used.has(label))
        label = base ? `${base} (${++index})` : `${fallback} ${++index}`;
      node.setPresentation({ kind, label, type: fallback });
    }
    return node;
  }

  split(identifier) {
    if (identifier && this.dependents.has(identifier)) {
      return this.dependents.get(identifier);
    }

    const node = new OptionsNode(this, undefined, this.name, identifier);
    this.emitDependents();
    return node;
  }

  maybeSplit(identifier) {
    if (!identifier) {
      return this;
    }

    return this.split(identifier);
  }

  /** @param {Record<string, any>} params @param {{layer?: "user" | "authored" | "theme" | "derived"}} [options] */
  populate(params, options = {}) {
    for (const [key, value] of Object.entries(params)) {
      if (this.has(key)) {
        this.set(key, value, options);
      } else if (this.hasChild(key)) {
        this.child(key).populate(value, options);
      }
    }
    return this;
  }

  snapshot() {
    return {
      ...(this.defaults?.snapshot() ?? {}),
      ...this.params,
    };
  }

  dispose() {
    if (this.isDisposed) return;
    this.isDisposed = true;
    this.listeners.clear();
    this.childrenListeners.clear();
    this.dependentsListeners.clear();
    this.structureListeners.clear();
    this._optionStores.clear();
    this.presentationTypes.clear();
    this.transforms.clear();
    this.defaults?.dependents.delete(this.identifier);
    this.defaults?.emitDependents();
    this.parent?.children.delete(this.name);
    this.parent?.emitChildren();

    for (const dep of this.dependents.values()) {
      dep.dispose();
    }
    this.dependents.clear();

    for (const child of this.children.values()) {
      child.dispose();
    }
    this.children.clear();
  }
}

const optionsRoot = new OptionsNode();
export { OptionsNode, optionsRoot };
