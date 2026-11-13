// @ts-check
/**
 * A Plot's view context (TODO 136.12): what the plot knows about its view, as typed fields on one
 * object instead of private option keys (_coordinateView, _explicitViewport, _radialExtent) that
 * carried them as messages through the options tree. The Plot owns it (viewCore.svelte attaches
 * it to its options); a frame, a mark or a scene below finds it by walking up its options'
 * defaults, as axisCategory finds a band scale. A scope that sees its view differently (a
 * surface's texture marks draw on a chart) attaches a context of its own over its parent's.
 * Nothing here is a setting: it is never exported, edited or replayed.
 */

/**
 * @typedef {"2d" | "3d" | "chart"} CoordinateView how the plot's coordinates are viewed: a 2D
 *   chart, a 3D scene, or a surface's texture (the chart a textured Heatmap drapes).
 * @typedef {object} ViewContextFields
 * @property {CoordinateView} mode
 * @property {boolean} explicitViewport the Plot was given a viewport: marks that frame a map
 *   (GeoJSON, VectorTile; mapFit.js) leave it.
 * @property {[number, number] | null} radialExtent an orthographic globe's radial (z) extent, as
 *   its z axis infers it; the globe's radius reads it before zbounds.
 */

/** @type {ViewContextFields} */
const DEFAULTS = { mode: "2d", explicitViewport: false, radialExtent: null };

/** @param {unknown} a @param {unknown} b */
const same = (a, b) =>
  a === b ||
  (Array.isArray(a) &&
    Array.isArray(b) &&
    a.length === b.length &&
    a.every((value, i) => Object.is(value, b[i])));

export class ViewContext {
  /** @type {ViewContext | Partial<ViewContextFields> | null} */
  #parent;
  /** @type {Partial<ViewContextFields>} */
  #fields;
  /** @type {Set<() => void>} */
  #listeners = new Set();
  /** @type {(() => void) | null} */
  #stopParent = null;

  /**
   * @param {ViewContext | Partial<ViewContextFields> | null} [parent] the context whose fields this one does not set
   * @param {Partial<ViewContextFields>} [fields]
   */
  constructor(parent = null, fields = {}) {
    this.#parent = parent;
    this.#fields = parent ? { ...fields } : { ...DEFAULTS, ...fields };
  }

  /** @template {keyof ViewContextFields} K @param {K} key @returns {ViewContextFields[K]} */
  #field(key) {
    if (key in this.#fields)
      return /** @type {ViewContextFields[K]} */ (this.#fields[key]);
    if (!this.#parent) return DEFAULTS[key];
    // A parent may be a frame snapshot's plain copy (snapshotAxisOptions.js).
    return this.#parent instanceof ViewContext
      ? this.#parent.#field(key)
      : /** @type {ViewContextFields[K]} */ (
          this.#parent[key] ?? DEFAULTS[key]
        );
  }

  get mode() {
    return this.#field("mode");
  }
  get explicitViewport() {
    return this.#field("explicitViewport");
  }
  get radialExtent() {
    return this.#field("radialExtent");
  }

  /**
   * Change fields; listeners hear once, and only when a value changed.
   * @param {Partial<ViewContextFields>} changes
   */
  update(changes) {
    let changed = false;
    for (const [key, value] of Object.entries(changes)) {
      const field = /** @type {keyof ViewContextFields} */ (key);
      if (!(field in DEFAULTS))
        throw Error(
          `ViewContext: unknown field ${key} (expected ${Object.keys(DEFAULTS).join(", ")}).`,
        );
      if (same(this.#field(field), value)) continue;
      /** @type {Record<string, unknown>} */ (this.#fields)[field] =
        Array.isArray(value) ? [...value] : value;
      changed = true;
    }
    if (changed) this.#notify();
  }

  #notify() {
    for (const listener of [...this.#listeners]) listener();
  }

  /**
   * Hear a change of any field this context shows, its parent's included. A child context
   * listens to its parent only while it has listeners of its own.
   * @param {() => void} listener @returns {() => void}
   */
  on(listener) {
    this.#listeners.add(listener);
    if (this.#parent instanceof ViewContext && !this.#stopParent)
      this.#stopParent = this.#parent.on(() => this.#notify());
    return () => {
      this.#listeners.delete(listener);
      if (!this.#listeners.size && this.#stopParent) {
        this.#stopParent();
        this.#stopParent = null;
      }
    };
  }
}

/** @typedef {{viewContext?: ViewContext | null, defaults?: any}} ViewContextOwner */

/**
 * The view context `options` sees: its own Plot's (or scope's), found up its defaults. Null
 * outside a Plot.
 * @param {ViewContextOwner | null | undefined} options
 * @returns {ViewContext | null}
 */
export function viewContextOf(options) {
  for (let node = options; node; node = node.defaults)
    if (node.viewContext) return node.viewContext;
  return null;
}

/**
 * How `options` sees its coordinates ("2d" outside a Plot, as the option's default was).
 * @param {ViewContextOwner | null | undefined} options
 * @returns {CoordinateView}
 */
export const coordinateView = (options) => viewContextOf(options)?.mode ?? "2d";

/**
 * The view context of a Plot (its own, whatever Plot it is inside), made on first use.
 * @param {ViewContextOwner} options the Plot's options
 * @param {Partial<ViewContextFields>} [fields]
 * @returns {ViewContext}
 */
export function attachViewContext(options, fields = {}) {
  if (!Object.hasOwn(options, "viewContext") || !options.viewContext)
    options.viewContext = new ViewContext(null, fields);
  return options.viewContext;
}

/**
 * A scope that sees its view differently (a surface's texture marks draw on a chart): a context
 * over the one it would otherwise see, setting only `fields`.
 * @param {ViewContextOwner} options the scope's options
 * @param {Partial<ViewContextFields>} fields
 * @returns {ViewContext}
 */
export function overrideViewContext(options, fields) {
  return (options.viewContext = new ViewContext(
    viewContextOf(options.defaults),
    fields,
  ));
}

/**
 * Listen to the view context `options` sees (found now: the Plot attaches it before its
 * frames, marks and scenes mount).
 * @param {ViewContextOwner | null | undefined} options
 * @param {() => void} listener
 * @returns {() => void}
 */
export const onViewContext = (options, listener) =>
  viewContextOf(options)?.on(listener) ?? (() => {});

/**
 * Hear how `options` sees its coordinates change (2D to 3D, a surface's chart).
 * @param {ViewContextOwner | null | undefined} options
 * @param {(mode: CoordinateView) => void} listener
 * @returns {() => void}
 */
export function onCoordinateView(options, listener) {
  let last = coordinateView(options);
  return onViewContext(options, () => {
    const next = coordinateView(options);
    if (next !== last) listener((last = next));
  });
}

/**
 * A store of how `options` sees its coordinates.
 * @param {ViewContextOwner | null | undefined} options
 * @returns {import("svelte/store").Readable<CoordinateView>}
 */
export const coordinateViewStore = (options) => ({
  subscribe(run) {
    run(coordinateView(options));
    return onCoordinateView(options, run);
  },
});
