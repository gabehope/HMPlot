/**
 * Stage 22: declaration order for 2D marks.
 *
 * Every mark component (NamedMark, GeoJSON) owns one slot, anchored by an empty <template>
 * marker in the DOM. Threlte renders the component tree inside the View's <canvas>, and
 * Svelte inserts delayed `{#if}` content at its anchor and moves keyed content with its
 * component, so document order of the markers is declaration order, however late a mark's
 * data finishes preparing. The drawing objects registered under a slot get consecutive
 * renderOrder values: slots in document order, then each slot's objects by sub-index.
 *
 * A "layered" scene (the View's scene in 2D, an offscreen surface chart) also merges three's
 * opaque render items into the transparent list, so opaque and translucent marks interleave
 * by renderOrder. Materials are untouched: forcing material.transparent changes shaders that
 * branch on it. Other scenes keep native queues and renderOrder 0.
 *
 * Except a flat basemap in 3D (TODO 66.2: a live VectorTile under a flyover). Its objects carry
 * `plotBasemap` and draw first, in declaration order, without depth (BASEMAP_ORDER on): coplanar
 * map parts keep their written order with no height offsets. Then the colorless ground plane
 * (`plotGround`, GROUND_ORDER) writes the ground's depth once, and every other 3D mark draws
 * with depth as usual, so a building stands on the map. The basemap's translucent items (place
 * names) move into the opaque list: renderOrder only orders within one list, and three draws the
 * transparent list after every opaque item.
 */

// Node.DOCUMENT_POSITION_PRECEDING / FOLLOWING, spelled out so this module loads in node.
const PRECEDING = 2, FOLLOWING = 4;
export const LAYER_MARKER = "data-plot-layer";

/** Sort comparator for DOM nodes by document order. */
export function documentOrder(a, b) {
  if (a === b) return 0;
  const position = a.compareDocumentPosition(b);
  if (position & FOLLOWING) return -1;
  if (position & PRECEDING) return 1;
  return 0;
}

/** Objects a slot can order: drawing objects, not groups or cameras. */
export const isDrawingObject = (object) =>
  !!object?.isObject3D && !!object.material && !!(object.isPlotObject || object.options);

const layeredScenes = new WeakSet();
const registries = new WeakMap();

/** The renderOrder of a 3D scene's first basemap object; the next ones follow (TODO 66.2). */
export const BASEMAP_ORDER = -(2 ** 30);
/** The renderOrder of the ground plane, after every basemap object and before other marks. */
export const GROUND_ORDER = -(2 ** 29);

/**
 * A 3D render list's basemap (TODO 66.2): its items in the opaque list (translucent ones moved
 * there, out of the transparent and double-pass lists), drawn without depth testing or writing.
 * A material that still has them (a rebuild sets depthWrite again) changes here, before its
 * pipeline is chosen. Returns whether the list has basemap items.
 */
export function liftBasemap(list) {
  if (layeredScenes.has(list.scene)) return false;
  let found = false;
  // In place: the render list keeps its arrays from frame to frame.
  const keep = (items) => {
    let n = 0;
    for (const item of items) if (!item.object?.plotBasemap) items[n++] = item;
    items.length = n;
  };
  if (list.transparent.some((item) => item.object?.plotBasemap)) {
    for (const item of list.transparent) if (item.object?.plotBasemap) list.opaque.push(item);
    keep(list.transparent);
    if (list.transparentDoublePass) keep(list.transparentDoublePass);
  }
  for (const item of list.opaque) {
    if (!item.object?.plotBasemap) continue;
    found = true;
    const material = item.material;
    if (material && (material.depthTest || material.depthWrite)) {
      material.depthTest = false;
      material.depthWrite = false;
      material.needsUpdate = true;
    }
  }
  return found;
}

/**
 * Move a render list's opaque items into its transparent list when its scene is layered.
 * three sorts the transparent list afterwards (groupOrder, renderOrder, depth, id).
 */
export function mergeRenderList(list) {
  if (!layeredScenes.has(list.scene) || !list.opaque.length) return false;
  for (const item of list.opaque) list.transparent.push(item);
  list.opaque.length = 0;
  return true;
}

const hookedLists = new WeakSet();
/**
 * three r183 has no public way to change queue membership, so wrap RenderList#finish, which
 * the renderer calls after projecting a scene and before sorting its lists. RenderList is
 * not exported; reach its prototype through the renderer's (private) list cache.
 */
export function hookRenderLists(renderer, scene, camera) {
  const lists = renderer?._renderLists;
  if (!lists?.get) return false;
  const proto = Object.getPrototypeOf(lists.get(scene, camera));
  if (hookedLists.has(proto)) return true;
  if (typeof proto.finish !== "function") throw Error("Mark layering: three's RenderList has no finish(); the queue merge needs updating.");
  const finish = proto.finish;
  proto.finish = function () {
    const result = finish.apply(this, arguments);
    if (!mergeRenderList(this) && basemapScenes.has(this.scene)) liftBasemap(this);
    return result;
  };
  hookedLists.add(proto);
  return true;
}
/** Whether the render list of this scene and camera merges queues (tests). */
export const renderListsHooked = (renderer, scene, camera) => {
  const lists = renderer?._renderLists;
  return !!lists?.get && hookedLists.has(Object.getPrototypeOf(lists.get(scene, camera)));
};

// 3D scenes with basemap objects (their registries count them).
const basemapScenes = new WeakSet();

export class LayerSlot {
  constructor() {
    this.registry = null;
    this.node = null;
    this.objects = new Map();
    this.subs = 0;
  }
  /** A fixed position for one drawing component within this slot (its template order). */
  nextSub() {
    return this.subs++;
  }
  /** Register a drawing object at a sub-index; returns its unregister function. */
  add(sub, object) {
    this.objects.set(sub, object);
    this.registry?.changed();
    return () => {
      if (this.objects.get(sub) !== object) return;
      this.objects.delete(sub);
      this.registry?.release(object);
      this.registry?.changed();
    };
  }
}

export class LayerRegistry {
  constructor(scene, { compare = documentOrder, invalidate = () => {} } = {}) {
    this.scene = scene;
    this.compare = compare;
    this.invalidate = invalidate;
    this.slots = [];
    this.dirty = false;
    /** Completed re-sorts, for tests: idle frames must not add any. */
    this.sorts = 0;
  }
  get layered() {
    return layeredScenes.has(this.scene);
  }
  attach(slot, node) {
    slot.registry = this;
    slot.node = node;
    this.slots.push(slot);
    this.changed();
  }
  detach(slot) {
    const index = this.slots.indexOf(slot);
    if (index >= 0) this.slots.splice(index, 1);
    for (const object of slot.objects.values()) this.release(object);
    slot.registry = null;
    slot.node = null;
    this.changed();
  }
  /** An object leaving its slot returns to three's default order. */
  release(object) {
    if (object.renderOrder !== 0) {
      object.renderOrder = 0;
      this.invalidate();
    }
  }
  /** Something changed that can move a layer: re-sort once, in a microtask. */
  changed() {
    if (this.dirty) return;
    this.dirty = true;
    queueMicrotask(() => this.flush());
  }
  /**
   * Re-sort and renumber when something changed; a no-op otherwise. Returns whether any
   * object's renderOrder changed. `rendering`: called from inside a render, which already
   * uses the new orders, so no new frame is requested.
   */
  flush({ rendering = false } = {}) {
    if (!this.dirty) return false;
    this.dirty = false;
    this.sorts++;
    this.slots.sort((a, b) => this.compare(a.node, b.node));
    const layered = this.layered;
    let layer = 0, basemap = 0, changed = false;
    for (const slot of this.slots)
      for (const sub of [...slot.objects.keys()].sort((a, b) => a - b)) {
        const object = slot.objects.get(sub);
        // In 3D a basemap object draws before everything else, in written order (TODO 66.2).
        const order = layered ? layer++ : object.plotBasemap ? BASEMAP_ORDER + basemap++ : 0;
        if (object.renderOrder !== order) {
          object.renderOrder = order;
          changed = true;
        }
      }
    if (basemap) basemapScenes.add(this.scene); else basemapScenes.delete(this.scene);
    if (changed && !rendering) this.invalidate();
    return changed;
  }
  /** Drawing objects in layer order (tests and diagnostics). */
  ordered() {
    return this.slots.flatMap((slot) => [...slot.objects.keys()].sort((a, b) => a - b).map((sub) => slot.objects.get(sub)));
  }
}

const observers = new WeakMap();
const markerIn = (node) =>
  node.nodeType === 1 && (node.hasAttribute?.(LAYER_MARKER) || !!node.querySelector?.(`template[${LAYER_MARKER}]`));

/**
 * One MutationObserver per canvas notices keyed moves (a move is a removal plus an insertion
 * of the marker or an ancestor). It only watches the <canvas> subtree, where Threlte renders
 * the component tree; HTML overlays are siblings outside it.
 */
function watchCanvas(canvas, registry) {
  if (!canvas || typeof MutationObserver === "undefined") return;
  let entry = observers.get(canvas);
  if (!entry) {
    const registriesOfCanvas = new Set();
    const observer = new MutationObserver((records) => {
      for (const record of records)
        for (const node of [...record.addedNodes, ...record.removedNodes])
          if (markerIn(node)) {
            for (const r of registriesOfCanvas) r.changed();
            return;
          }
    });
    observer.observe(canvas, { childList: true, subtree: true });
    entry = { observer, registries: registriesOfCanvas };
    observers.set(canvas, entry);
  }
  entry.registries.add(registry);
}

/** Stop watching a canvas whose renderer is going away. */
export function releaseCanvas(canvas) {
  observers.get(canvas)?.observer.disconnect();
  observers.delete(canvas);
}

/**
 * DOM moves the observer has not delivered yet (a keyed move in the same task as a render or
 * export): mark the canvas's registries changed so the next flush sees them.
 */
export function takeLayerRecords(canvas) {
  const entry = observers.get(canvas);
  if (entry?.observer.takeRecords().some((record) => [...record.addedNodes, ...record.removedNodes].some(markerIn)))
    for (const r of entry.registries) r.changed();
}

/**
 * The registry of a drawing scene, created on first use. Each render of the scene first
 * flushes pending re-sorts (so a render, pick, or export right after a DOM change is
 * already ordered) and hooks the renderer's render lists for the queue merge. A re-sort
 * changes what `view` draws.
 */
export function layerRegistry(scene, renderer, view, invalidate) {
  let registry = registries.get(scene);
  if (registry) return registry;
  registry = new LayerRegistry(scene, {
    invalidate: () => {
      if (view) view.drawing.revision++;
      invalidate?.();
    },
  });
  registries.set(scene, registry);
  watchCanvas(renderer?.domElement, registry);
  const before = scene.onBeforeRender;
  scene.onBeforeRender = function (renderer_, scene_, camera) {
    takeLayerRecords(renderer_?.domElement);
    registry.flush({ rendering: true });
    if (layeredScenes.has(scene) || basemapScenes.has(scene)) hookRenderLists(renderer_, scene, camera);
    return before.apply(this, arguments);
  };
  return registry;
}

export const registryOf = (scene) => registries.get(scene);

/**
 * Mark a scene as a 2D layered scene (or not). Scene2D sets it for the View's scene while
 * mounted; SurfaceTexture sets it for its offscreen chart scene. Turning it off restores
 * renderOrder 0 and three's native queues.
 */
export function setLayeredScene(scene, layered) {
  if (layered) layeredScenes.add(scene);
  else layeredScenes.delete(scene);
  registries.get(scene)?.changed();
}
export const isLayeredScene = (scene) => layeredScenes.has(scene);
