<script lang="ts">
  import { useViewServices } from "./utils/viewServices.js";
  // A live VectorTile (TODO 35): the requested tiles, then the tiles the 2D camera shows at a zoom
  // that fits the view, each drawn by a tile slot (vectorTileSlot.svelte) as soon as a worker has
  // prepared it. Layers, bottom to top: the requested tiles, the tiles an exported page embeds,
  // the previous zoom level (until the current one covers the view), the current level. Every
  // style is opaque (liveStyleIssue), so each layer covers the ones under it. docs/VECTOR-TILES.md.
  // In a 3D flyover (TODO 66, mode "3d") the same layers lie flat in the ground plane, drawn before
  // the plot's 3D geometry without depth (utils/layerOrder.js), a colorless ground plane writes
  // their depth, and the live level's buildings stand on them; the tiles follow the camera through
  // a loading area sized by its height (vectorTileView.js flyoverView). `fixed` draws the
  // requested tiles only (live={false}).
  import { onDestroy, tick, untrack } from "svelte";
  import { T, injectPlugin, useTask, useThrelte, useThrelteUserContext } from "@threlte/core";
  import { DoubleSide, MeshBasicNodeMaterial, PlaneGeometry, Vector3 } from "three/webgpu";
  import Slot from "./vectorTileSlot.svelte";
  import Text from "./bound/label.svelte";
  import { getOptionsContext } from "./utils/context.js";
  import { stableKey } from "./utils/providers.js";
  import { currentCause, trackPreparation } from './rendering/viewSettlement.js';
  import { diagnostic } from "./utils/diagnostics.js";
  import { selectLiveTiles, tileAt, tileBounds, tileDataBytes, tileDataEntry, tileKey, tilesInBox, viewZoom } from "./utils/vectorTiles.js";
  import { placeLabels } from "./utils/vectorTileLabels.js";
  import { mixColor } from "./utils/vectorTileStyle.js";
  import { flyoverGround, flyoverView, liveInverse, liveView, tileCoordinateSettings } from "./utils/vectorTileView.js";
  import { GROUND_ORDER, isDrawingObject, registryOf } from "./utils/layerOrder.js";
  import { createRequestScheduler } from "./utils/requestScheduler.js";
  import { arrayBytes, createLru, createTileCache, RETRY_AFTER } from "./utils/vectorTileCache.js";
  import { acquireTileWorkers } from "./utils/vectorTileWorker.js";
  import { paintTile } from "./utils/vectorTileMesh.js";
  let {
    mode = "2d",
    fixed = false,
    extrude = true,
    url,
    urlKey,
    requested,
    styles,
    sourceLayers,
    clip = true,
    origin = undefined,
    unitsPerMeter = 1,
    minZoom = 0,
    maxZoom = 14,
    zoomBias = 0,
    tileData = undefined,
    visible = undefined,
    ready = true,
    onclick = undefined,
    onload = undefined,
    onerror = undefined,
    onrequestederror = undefined,
    oncontent = undefined,
  }: any = $props();
  const { renderer, camera, scene, invalidate } = useThrelte() as any;
  const viewServices = useViewServices();
  const scene2dContext: any = useThrelteUserContext("scene2d");
  // Not reactive: VectorTile remounts this component for another mode.
  const three = untrack(() => mode === "3d"), still = untrack(() => fixed);
  const options = getOptionsContext();
  let coordinates = $state.raw(tileCoordinateSettings(options));
  let coordinateKey = untrack(() => stableKey(coordinates));
  // "viewContext": the plot's 2D or 3D view changed (OptionsNode.notifyAny, TODO 136.12).
  const stopCoordinates = options.on((_, key) => {
    if (!["coordinates", "projection", "projectionCenter", "viewContext", "sphericalView", "angleUnit", "anglePeriod", "xbounds"].includes(key)) return;
    const next = tileCoordinateSettings(options);
    // Orthographic turns leave the worker's geometry alone.
    const keyNext = stableKey(next);
    if (keyNext !== coordinateKey) {
      coordinateKey = keyNext;
      untrack(() => { coordinates = next; });
    }
  });
  onDestroy(stopCoordinates);
  const workers = acquireTileWorkers();
  // 16 requests at once, as MapLibre: an HTTP/2 server (VersaTiles, most tile CDNs) answers a
  // view's tiles in one round trip; the browser still holds an HTTP/1 server to 6.
  // Under a flyover (TODO 66) the tiles loaded ahead of the view (the ring) hold at most half the
  // requests: a camera that keeps moving finds slots free for the tiles it then shows.
  const SPECULATIVE = 1e6;
  const scheduler = createRequestScheduler({ maxRequests: 16, debounceTime: 16, maxWait: 100,
    ...(untrack(() => mode === "3d") ? { speculative: SPECULATIVE, maxSpeculative: 8 } : {}) });
  // Under every level, at its zoom: the world's background square (the map's land color where
  // nothing has loaded yet, not the plot's), the zoom-0 tile (the planet), then the overview.
  const LAYERS = { world: -2, planet: -1.5, overview: -1, base: 0, embedded: 1, previous: 2, current: 3 };

  const report = (callback, value) => {
    try { callback?.(value); } catch (error) { console.error("VectorTile callback:", error); }
  };

  // What a worker needs besides a tile's bytes; a change prepares every tile on screen again. Of the
  // styles that is which parts draw and which have outlines: colors, widths and sizes paint on the
  // main thread (paintTile), and a change of them repaints the tiles on screen (TODO 63.4).
  const shapes = $derived(Object.fromEntries(Object.entries(styles ?? {}).map(([part, style]: [string, any]) =>
    [part, style ? { outlineWidth: Number(style.outlineWidth) > 0 ? 1 : 0 } : style])));
  const settings = $derived({
    styles: shapes, sourceLayers, clip: clip !== false, ...coordinates, maxZoom,
    origin: origin ?? undefined, unitsPerMeter,
    // Buildings (TODO 66.3): extruded or flat in 3D; in 2D every building is flat, as before.
    extrude: three ? extrude !== false : undefined,
  });
  const jobKey = $derived(stableKey({ ...settings, url: urlKey }));

  // Tile records by layer and tile: { id, layer, tile, key, state, slot, places, generation }.
  // States: loading, prepared (a ring tile's arrays, waiting for the view), shown, failed.
  const records = new Map<string, any>();
  // The live level: its zoom, the view's exact tiles, and a ring of neighbours loaded ahead of a
  // pan (drawn, never waited for).
  let current: { z: number; tiles: any[]; ring: any[]; exact: Set<string>; all: any[]; view: any; overview: Set<string> } | null = null;
  let liveZoom = $state<number | undefined>(undefined);
  // Prepared tiles (a worker's arrays), so a tile seen again shows without fetching or preparing:
  // the last 48, and at most 48 MB of arrays (TODO 63.5; a dense city tile's are about 2 MB).
  const prepared = createLru({ maxEntries: 48, maxBytes: 48 * 2 ** 20, size: arrayBytes });
  // Tiles in use (any layer, any state) keep their raw bytes in the cache, which holds 256 tiles
  // and 64 MB otherwise: exports embed the ones on screen, and a click on a tile whose features
  // a worker forgot prepares it again from them.
  const inUse = new Map<string, number>();
  const use = (key, change) => {
    const count = (inUse.get(key) ?? 0) + change;
    if (count > 0) inUse.set(key, count); else inUse.delete(key);
  };
  const newCache = () => createTileCache({ url, scheduler, keep: (key) => inUse.has(key) });
  let cache = untrack(newCache);
  let cacheUrl = untrack(() => urlKey);
  let alive = true;

  // Slots, in draw order: the keyed each moves a reassigned slot without rebuilding it. Each slot
  // registers its handle when it mounts (bind:this is briefly unset while a keyed item moves).
  type SlotEntry = { id: number; order: number[]; rows?: number[] };
  let slots = $state.raw<SlotEntry[]>([]);
  const slotHandles = new Map<number, any>(), slotWaiters = new Map<number, ((handle: any) => void)[]>();
  const registerSlot = (id: number, handle: any) => {
    if (!handle) return void slotHandles.delete(id);
    slotHandles.set(id, handle);
    for (const resolve of slotWaiters.get(id) ?? []) resolve(handle);
    slotWaiters.delete(id);
  };
  const slotHandle = (id: number) => slotHandles.get(id) ??
    new Promise((resolve) => slotWaiters.set(id, [...(slotWaiters.get(id) ?? []), resolve]));
  const free: number[] = [];
  let nextSlot = 0;
  const byOrder = (a, b) => a.order.reduce((d, v, i) => d || v - b.order[i], 0);
  // Orders collect, and the list is sorted and published once per microtask (a selection moves
  // many slots at once). Unchanged entries keep their identity so a slot move does not
  // update every other keyed item in the list.
  const orders = new Map<number, SlotEntry>();
  let ordering = false;
  function publish() {
    if (ordering) return;
    ordering = true;
    queueMicrotask(() => {
      ordering = false;
      if (!alive) return;
      slots = [...orders.values()].sort(byOrder);
    });
  }
  function place(id: number, order: number[]) {
    const previous = orders.get(id);
    if (previous && previous.order.length === order.length && previous.order.every((value, i) => value === order[i])) return;
    orders.set(id, { id, order, rows: firstRows.get(id) });
    publish();
  }
  // A free slot for a tile of `counts` rows: one that holds them without growing, the smallest
  // such, else the one that grows fewest marks. A mark that grows gets new buffers, and three.js
  // builds its material again: slots reused in turn by zoom-14 tiles (5k areas) and zoom-8 ones
  // (30k) grew 67 times in one zoom out and back (35).
  // A new slot is made at its first tile's size: made small, it grew at once (two builds).
  const firstRows = new Map<number, number[]>();
  const rowsOf = (counts) => [counts.faces, counts.lines, counts.points, counts.buildings ?? 0];
  function freeSlot(counts) {
    if (!free.length) {
      if (counts) firstRows.set(nextSlot, rowsOf(counts));
      return nextSlot++;
    }
    const need = counts ? rowsOf(counts) : [0, 0, 0, 0];
    let best = 0, score = Infinity;
    free.forEach((id, i) => {
      const capacity = slotHandles.get(id)?.rowsHeld?.() ?? [0, 0, 0, 0];
      const grows = need.filter((rows, k) => rows > capacity[k]).length;
      const spare = capacity.reduce((n, rows, k) => n + Math.max(0, rows - need[k]), 0);
      if (grows * 1e12 + spare < score) { score = grows * 1e12 + spare; best = i; }
    });
    return free.splice(best, 1)[0];
  }
  // Finer tiles draw over coarser ones whatever their layer (a requested tile finer than the live
  // level stays on top); at one zoom the layers keep their order.
  async function acquireSlot(record, counts = undefined) {
    const [z, x, y] = record.tile, order = [z, LAYERS[record.layer], x, y];
    if (record.slot !== undefined) {
      place(record.slot, order);
      return record.slot;
    }
    const id = freeSlot(counts);
    record.slot = id;
    place(id, order);
    return id;
  }
  function releaseSlot(record) {
    if (record.slot === undefined) return;
    slotHandles.get(record.slot)?.clear();
    place(record.slot, [99, record.slot]);
    free.push(record.slot);
    record.slot = undefined;
  }
  // Free slots keep their buffers for the next tiles (a slot made or grown costs a node graph,
  // 63.1). Past FREE_BYTES of them, once the view has been still for TRIM_DELAY, the largest goes,
  // one every TRIM_STEP while the view stays still (TODO 63.5): a repeated zoom keeps finding
  // slots, and a zoom through dense tiles does not keep their capacity for good.
  const FREE_BYTES = 64 * 2 ** 20, TRIM_DELAY = 1000, TRIM_STEP = 250;
  let trimTimer: ReturnType<typeof setTimeout> | undefined;
  function trimSlots() {
    clearTimeout(trimTimer);
    if (!alive || performance.now() - movedAt < TRIM_DELAY) return;
    const bytes = free.map((id) => slotHandles.get(id)?.bytesHeld?.() ?? 0);
    if (bytes.reduce((a, b) => a + b, 0) <= FREE_BYTES) return;
    const largest = bytes.indexOf(Math.max(...bytes)), id = free[largest];
    free.splice(largest, 1);
    orders.delete(id);
    firstRows.delete(id);
    publish();
    trimTimer = setTimeout(trimSlots, TRIM_STEP);
  }

  // Loading: bytes through the cache, arrays from a worker, then the slot's upload.
  const recordId = (layer, tile) => `${layer}|${tileKey(tile)}`;
  const isCurrent = (record) => records.get(record.id) === record;
  function priorityOf(record) {
    if (!alive || !isCurrent(record)) return -1;
    if (record.layer !== "current") return 0;
    const rank = current?.tiles.findIndex((tile) => tileKey(tile) === record.key) ?? -1;
    if (rank >= 0) return rank + 1;
    const ring = current?.ring.findIndex((tile) => tileKey(tile) === record.key) ?? -1;
    return ring < 0 ? -1 : (three ? SPECULATIVE : current!.tiles.length) + ring + 1;
  }
  let liveFailures = 0;
  async function prepare(record) {
    const generation = ++record.generation, key = jobKey, job = settings;
    const stillWanted = () => isCurrent(record) && record.generation === generation && alive;
    if (record.state !== "shown") record.state = "loading";
    record.pending = true;
    try {
      await load(record, generation, key, job, stillWanted);
    } finally {
      if (record.generation === generation) record.pending = false;
      settledChanged();
    }
  }
  // Prepared arrays by job and tile; the world square (tile 0/0/0's background) apart from tile 0/0/0.
  const tileJob = (key, record) => `${key}|${record.layer === "world" ? "world" : record.key}`;
  async function load(record, generation, key, job, stillWanted) {
    let result = record.waiting?.key === key ? record.waiting.result : prepared.get(tileJob(key, record));
    const world = record.layer === "world" && job.projection === "orthographic";
    // What a worker prepares this tile from, besides its bytes (a click on it after the worker has
    // forgotten its features prepares it again).
    const tileJobOf = { ...job, tile: record.tile, world, minArea: record.tile[0] < job.maxZoom ? 16 : 0 };
    record.waiting = undefined;
    try {
      if (!result) {
        // The world square is the zoom-0 tile's background part: nothing to fetch.
        const bytes = record.layer === "world" ? null
          : await cache.load(record.tile, { priority: () => priorityOf(record), missing: record.layer === "base" ? "error" : "empty" });
        if (!stillWanted()) return;
        // Below maxZoom a finer tile replaces this one as the view zooms in: its sub-pixel rings
        // (about a pixel at the tile's largest size) are left out (minArea).
        // On the globe the world square reaches the poles (Web Mercator tiles stop at 85 degrees).
        result = await workers.process(tileJob(key, record), { ...tileJobOf, bytes }, { priority: () => (stillWanted() ? priorityOf(record) : -1) });
        prepared.set(tileJob(key, record), result);
      }
    } catch (error) {
      if (!stillWanted()) return;
      // Canceled while unwanted, and wanted again since (the view came back): load it again.
      if (error?.name === "AbortError") {
        if (priorityOf(record) >= 0) prepare(record);
        return;
      }
      record.state = "failed";
      if (record.layer === "base") {
        record.error = error;
        onrequestederror?.(error);
        oncontent?.();
      } else {
        // A live tile that fails shows what is under it; the plot shows no error.
        if (!liveFailures++) console.warn(diagnostic("vectortile.live", `VectorTile: a live tile failed, and the tiles under it stay on screen: ${error?.message ?? error}`, { component: "VectorTile" }).message);
        report(onerror, { error, tile: [...record.tile] });
        // Asked for again once the cache would fetch it, while the view still has it: a dropped
        // request otherwise left a hole until the view moved away and back.
        setTimeout(() => {
          if (stillWanted() && record.state === "failed" && priorityOf(record) >= 0) prepare(record);
        }, RETRY_AFTER + 50);
      }
      return;
    }
    // A tile the view left while its worker ran (or whose record was replaced) stops here, before
    // it changes its record or takes a slot (TODO 63.7: it held a slot no one released).
    if (!stillWanted()) return;
    // A ring tile waits prepared, without a slot, until the view reaches it (select): drawn off
    // screen it held a slot's GPU memory and drew every frame (35: 23 slots, 325 MB).
    if (record.layer === "current" && record.state !== "shown" && !current?.exact.has(record.key)) {
      record.state = "prepared";
      record.waiting = { key, result };
      return;
    }
    const handle = await slotHandle(await acquireSlot(record, result.counts));
    if (!stillWanted()) return;
    const shown = await handle.set(tileJob(key, record), result, paintTile(result, styles), () => priorityOf(record));
    if (!shown || !stillWanted()) return;
    record.state = "shown";
    record.result = result;
    record.job = { key: tileJob(key, record), job: tileJobOf };
    record.error = undefined;
    oncontent?.();
    record.places = result.places;
    record.features = result.counts.features;
    record.buildings = result.counts.buildings ?? 0;
    extrusionChanged();
    if (record.layer === "base") {
      if ([...records.values()].every((other) => other.layer !== "base" || !other.error)) onrequestederror?.(null);
      baseLoaded();
    }
    placesChanged();
  }
  function add(layer, tile) {
    const id = recordId(layer, tile);
    const record = { id, layer, tile, key: tileKey(tile), state: "loading", pending: true, slot: undefined, places: null, generation: 0, features: 0 };
    records.set(id, record);
    use(record.key, 1);
    prepare(record);
    return record;
  }
  function remove(record) {
    if (records.get(record.id) === record) use(record.key, -1);
    records.delete(record.id);
    record.generation++;
    releaseSlot(record);
  }
  function move(record, layer) {
    records.delete(record.id);
    Object.assign(record, { layer, id: recordId(layer, record.tile) });
    records.set(record.id, record);
    acquireSlot(record);
  }

  // A fixed 3D basemap (live={false}) draws the requested tiles only.
  if (!still) add("world", [0, 0, 0]);

  // The requested tiles: the bottom layer, and the fallback where live tiles fail.
  let baseStarted = 0;
  function baseLoaded() {
    const base = [...records.values()].filter((record) => record.layer === "base");
    if (base.length && base.every((record) => record.state === "shown") && baseStarted) {
      report(onload, { tiles: base.map((record) => [...record.tile]), features: base.reduce((n, record) => n + record.features, 0), ms: performance.now() - baseStarted });
      baseStarted = 0;
    }
  }
  $effect(() => {
    const list = requested, key = urlKey, embedded = tileData;
    untrack(() => {
      if (key !== cacheUrl) resetAll();
      // An exported page's tiles first, so the requested ones among them load nothing.
      const bytes = tileDataBytes(embedded);
      for (const entry of embedded ?? []) cache.seed(entry.tile, bytes.get(tileKey(entry.tile)));
      const wanted = new Set(list.map(tileKey));
      for (const record of [...records.values()]) if (record.layer === "base" && !wanted.has(record.key)) remove(record);
      baseStarted = performance.now();
      for (const tile of list) if (!records.has(recordId("base", tile))) add("base", tile);
      // The other embedded tiles are the exported view, drawn under the live levels.
      for (const entry of embedded ?? [])
        if (!wanted.has(tileKey(entry.tile)) && !records.has(recordId("embedded", entry.tile))) add("embedded", entry.tile);
      onrequestederror?.(null);
      select({ force: true });
    });
  });
  // Seed embedded bytes before starting the planet background, including offline exports.
  // The whole world at zoom 0 (TODO 61), always loaded under everything else: a globe's minimap
  // shows every continent, and a quick pan shows coarse land and water, not the bare square.
  // Not when minZoom leaves zoom 0 out (a source without it).
  $effect(() => {
    const allowed = minZoom === 0 && !still;
    void urlKey;
    untrack(() => {
      const record = records.get(recordId("planet", [0, 0, 0]));
      if (!allowed) { if (record) remove(record); return; }
      if (!record) add("planet", [0, 0, 0]);
    });
  });

  // A new projection, or styles that draw other parts, prepares every tile again; each keeps its
  // slot meanwhile. New colors, widths or sizes repaint the tiles shown, with no worker job.
  let preparedKey = untrack(() => jobKey), paintedKey = untrack(() => stableKey(styles));
  $effect(() => {
    const key = jobKey, paint = stableKey(styles);
    untrack(() => {
      if (key !== preparedKey) {
        preparedKey = key;
        paintedKey = paint;
        track();
        for (const record of records.values()) prepare(record);
        placesChanged();
        return;
      }
      if (paint === paintedKey) return;
      paintedKey = paint;
      for (const record of records.values())
        if (record.state === "shown" && record.result && record.slot !== undefined)
          slotHandles.get(record.slot)?.repaint(paintTile(record.result, styles));
    });
  });
  function resetAll() {
    for (const record of [...records.values()]) if (record.layer !== "world") remove(record);
    cache.clear();
    cache = newCache();
    cacheUrl = urlKey;
    current = null;
  }

  // Selection: the view's exact tiles at the zoom that fits it (vectorTiles.js selectLiveTiles),
  // and the ring of tiles around them, at most MAX_RING, loaded after them. While the view pans,
  // the ring is the next tiles ahead of it, at most LEAD (TODO 63.7): `direction` is the pan's
  // [x, y] signs in tile columns and rows.
  const MAX_RING = 32, LEAD = 8;
  function neighbours(tiles, z, direction = null) {
    const n = 2 ** z, inside = new Set(tiles.map(tileKey)), out = new Map();
    const ahead = (dx, dy) => !direction || (dx !== 0 && Math.sign(dx) === direction[0]) || (dy !== 0 && Math.sign(dy) === direction[1]);
    for (const [, x, y] of tiles)
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          if (!ahead(dx, dy)) continue;
          const tile: [number, number, number] = [z, (((x + dx) % n) + n) % n, y + dy], key = tileKey(tile);
          if (tile[2] >= 0 && tile[2] < n && !inside.has(key) && !out.has(key)) out.set(key, tile);
        }
    return [...out.values()].slice(0, direction ? LEAD : MAX_RING);
  }
  const intersects = (tile, box) => {
    const [west, south, east, north] = tileBounds(tile);
    return south < box[3] && north > box[1] && [-360, 0, 360].some((shift) => west + shift < box[2] && east + shift > box[0]);
  };
  // The tiles the last selection covered (its zoom, view, ring and overview tiles, in any order).
  let coverage = "";
  const keysOf = (tiles) => tiles.map(tileKey).sort().join(" ");
  function select({ force = false } = {}) {
    if (!ready || !alive) return;
    // Requested tiles only: nothing follows the camera, but whenSettled waits for them.
    if (still) {
      if (force) { track(); settledChanged(); extrusionChanged(); }
      return;
    }
    const view = three ? flyoverSelection() : view2d();
    // A flyover's area grows with its height: a finer level must fit with room to spare (TODO 66.0).
    const selection = view ? selectLiveTiles(view, { minZoom, maxZoom, zoomBias, current: current?.z, hold: three ? 0.75 : 1 }) : null;
    const base = new Set(requested.map(tileKey));
    const tiles = selection ? selection.tiles.filter((tile) => !base.has(tileKey(tile))) : [];
    // The ring loads once the camera has been still for RING_DELAY ms: during a zoom it would
    // make slots for tiles the next level replaces.
    const settledView = performance.now() - movedAt >= RING_DELAY && selection?.z === current?.z;
    // Panning at one zoom, the tiles ahead load as the ring (prepared, drawn when the view reaches
    // them): 63.0's pan showed each new column 100-150 ms after it came into view.
    const panning = !settledView && selection && current && selection.z === current.z ? [
      Math.sign(Math.round((view.center[0] - current.view.center[0]) * 1e6)),
      -Math.sign(Math.round((view.center[1] - current.view.center[1]) * 1e6))] : null;
    const ring = !selection ? [] : (settledView ? neighbours(selection.tiles, selection.z)
      : panning && (panning[0] || panning[1]) ? neighbours(selection.tiles, selection.z, panning) : []).filter((tile) => !base.has(tileKey(tile)));
    // The overview: the tiles OVERVIEW zooms coarser that cover the view (one to four), loaded first.
    // They reach eight times as far each way, so a quick zoom out or pan shows them, coarse,
    // where the live level has not loaded yet.
    const overviewZoom = selection ? Math.max(minZoom, selection.z - OVERVIEW) : undefined;
    const overview = (selection && overviewZoom! < selection.z ? tilesInBox(view.box as [number, number, number, number], overviewZoom!, view.center, 4) : [])
      // The planet is tile 0/0/0 already.
      .filter((tile) => tile[0] > 0 || !records.has(recordId("planet", tile)));
    // A camera move within the same tiles (most frames of a pan or a zoom) only reorders them,
    // nearest the center first for the requests and workers, and moves the view the names and the
    // previous level follow (TODO 63.7): no records change, so nothing new is tracked or settled.
    const covers = selection ? `${selection.z}|${keysOf(tiles)}|${keysOf(ring)}|${keysOf(overview)}` : "";
    if (!force && current && selection && covers === coverage) {
      Object.assign(current, { tiles, ring, all: selection.tiles, view });
      return;
    }
    coverage = covers;
    if (selection && current && selection.z !== current.z) {
      // The shown tiles of the level on screen join the previous ones, of any zoom: each stays
      // until shown tiles of the new level cover it (settledChanged). A quick zoom through levels
      // that never finished loading keeps the last one that did. Tiles not shown yet go.
      for (const record of [...records.values()])
        if (record.layer === "current") {
          if (record.state !== "shown") { remove(record); continue; }
          const id = recordId("previous", record.tile), older = records.get(id);
          if (older) remove(older);
          move(record, "previous");
        }
    }
    for (const tile of overview) if (!records.has(recordId("overview", tile))) add("overview", tile);
    current = selection ? { z: selection.z, tiles, ring, exact: new Set(tiles.map(tileKey)), all: selection.tiles, view, overview: new Set(overview.map(tileKey)) } : null;
    liveZoom = current?.z;
    const wanted = new Set([...tiles, ...ring].map(tileKey));
    for (const record of [...records.values()])
      if (record.layer === "current" && !wanted.has(record.key)) remove(record);
    for (const tile of [...tiles, ...ring]) {
      const record = records.get(recordId("current", tile));
      // A ring tile the view now shows: its prepared arrays upload.
      if (record?.state === "prepared" && current?.exact.has(record.key)) prepare(record);
      if (record) continue;
      // Back to a level still on screen: its tile shows at once.
      const earlier = records.get(recordId("previous", tile));
      if (earlier?.state === "shown") move(earlier, "current");
      else add("current", tile);
    }
    scheduler.update();
    // Requests under way for tiles the view left free their places (a quick zoom through levels),
    // and the tiles it left fall under the cache's budget again.
    cache.prune();
    cache.trim();
    track();
    settledChanged();
    extrusionChanged();
  }
  function view2d() {
    const box = $scene2dContext?.viewbox, canvas = renderer?.domElement;
    const inverse = box && liveInverse(options, { origin, unitsPerMeter });
    return inverse && liveView(inverse, { x: [...box.x], y: [...box.y] }, canvas?.clientWidth ?? 0, canvas?.clientHeight ?? 0);
  }
  // The flyover's view (TODO 66.0): none until the plot's camera is set up, or for a camera that is
  // not Y-up (the ground plane is horizontal).
  const direction = new Vector3();
  function flyoverSelection() {
    const eye = camera?.current, canvas = renderer?.domElement;
    if (!eye?.isPerspectiveCamera || !viewServices.navigation.camera.current || !(eye.up.y > 0.999999 * eye.up.length())) return null;
    const ground = flyoverGround(options, { origin, unitsPerMeter, plane: "xz" });
    if (!ground) return null;
    eye.updateMatrixWorld();
    return flyoverView({ position: eye.position.toArray(), direction: eye.getWorldDirection(direction).toArray(), fov: eye.fov, zoom: eye.zoom, aspect: eye.aspect },
      ground, canvas?.clientWidth ?? 0, canvas?.clientHeight ?? 0);
  }
  const RING_DELAY = 150, OVERVIEW = 3;
  // A globe turns by its projectionCenter, not the 2D camera.
  let turned = $state(0);
  const stopTurn = options.on(() => untrack(() => turned++), "projectionCenter");
  onDestroy(() => stopTurn?.());
  let movedAt = 0, ringTimer: ReturnType<typeof setTimeout> | undefined;
  // The camera moved: select now, the ring once it has been still, trim once it has been longer.
  function moved() {
    movedAt = performance.now();
    select();
    placesChanged();
    clearTimeout(ringTimer);
    ringTimer = setTimeout(() => alive && select(), RING_DELAY + 10);
    clearTimeout(trimTimer);
    trimTimer = setTimeout(trimSlots, TRIM_DELAY + 10);
  }
  $effect(() => {
    void [ready, minZoom, maxZoom, zoomBias, turned];
    if (three) {
      untrack(moved);
      return;
    }
    const box = $scene2dContext?.viewbox;
    if (!box) return;
    // Reading the box subscribes: the camera moved (or, on the globe, its center turned).
    void [box.x[0], box.x[1], box.y[0], box.y[1]];
    untrack(moved);
  });
  // A 3D camera is not a store: each frame that draws compares it with the last selection's (its
  // place, turn, lens and the canvas's size), so a move, a look, a change of height or lens, and a
  // resize select again, at most once a frame (TODO 66.1). The ground plane follows it.
  let cameraKey = "";
  function cameraCheck() {
    const eye = camera?.current, canvas = renderer?.domElement;
    if (!three || !alive || !eye?.isPerspectiveCamera) return;
    const key = [...eye.position.toArray(), ...eye.quaternion.toArray(), ...eye.up.toArray(), eye.fov, eye.zoom, eye.aspect, eye.far,
      canvas?.clientWidth, canvas?.clientHeight, viewServices.navigation.camera.current ? 1 : 0].join(",");
    if (key !== cameraKey) {
      cameraKey = key;
      placeGround(eye);
      if (!still) moved();
    }
    // The move's selection is tracked (or there was none to make): the move is served.
    const served = cameraMove;
    cameraMove = null;
    served?.resolve();
  }
  useTask(cameraCheck, { autoInvalidate: false });
  // A camera move (Scene3D tells its listeners at once: controls, setCamera, a glide) is work the
  // plot settles: until the next frame selects for it (or two frames pass without one), and then
  // the selection it starts, which takes its cause (track). Without this, whenSettled() right
  // after setCamera() resolved before the frame that selects the new view's tiles.
  let cameraMove: { cause: number; resolve: () => void } | null = null;
  function cameraMoved() {
    if (!three || still || !alive || cameraMove) return;
    let resolve = () => {};
    const promise = new Promise<void>((settle) => (resolve = settle));
    cameraMove = { cause: currentCause(viewServices), resolve };
    trackPreparation(viewServices, promise, cameraMove.cause, { load: true });
    invalidate();
    requestAnimationFrame(() => requestAnimationFrame(cameraCheck));
  }
  if (three && viewServices) onDestroy(viewServices.navigation.onCameraMove(cameraMoved));

  // Settling: each selection is tracked (plot.whenSettled and exports wait for it) until its
  // exact tiles, the requested tiles and the tiles drawn under them (the world square, the zoom-0
  // tile and the selection's overview) are shown or failed; a newer selection takes it over.
  // Without the ones under, an export depended on which tile arrived first: the docs' globe
  // exported before or after its zoom-0 tile (final validation, 2026-10-02).
  let job: any = null;
  function track() {
    const next: any = { settled: false };
    next.promise = new Promise((resolve) => (next.resolve = resolve));
    if (job && !job.settled) { job.settled = true; job.resolve(next.promise); }
    job = next;
    // A selection a camera move asked for serves that move (cameraMoved): whenSettled after a
    // setCamera waits for it.
    trackPreparation(viewServices, next.promise, cameraMove?.cause, { load: true });
  }
  const done = (record) => !record.pending;
  const MAX_PREVIOUS = 12;
  // Whether two tiles of any zooms overlap: the finer one lies inside the coarser one.
  const overlaps = ([za, xa, ya], [zb, xb, yb]) => (za <= zb
    ? Math.floor(xb / 2 ** (zb - za)) === xa && Math.floor(yb / 2 ** (zb - za)) === ya
    : Math.floor(xa / 2 ** (za - zb)) === xb && Math.floor(ya / 2 ** (za - zb)) === yb);
  function settledChanged() {
    const awaited = [...records.values()].filter((record) => record.layer === "base" || record.layer === "embedded" ||
      record.layer === "world" || record.layer === "planet" || (record.layer === "overview" && current?.overview.has(record.key)) ||
      (record.layer === "current" && current?.exact.has(record.key)));
    if (current) {
      // A previous tile goes once every exact tile of the live level over it is shown (a failed
      // or loading one keeps it as the fallback), or once it leaves the view; past MAX_PREVIOUS,
      // the farthest from the view's center go first.
      const shownAt = (tile) => ["current", "base"].some((layer) => records.get(recordId(layer, tile))?.state === "shown");
      const previous = [];
      for (const record of [...records.values()]) {
        if (record.layer !== "previous") continue;
        if (!intersects(record.tile, current.view.box)) { remove(record); continue; }
        const over = current.all.filter((tile) => overlaps(tile, record.tile));
        if (over.length && over.every(shownAt)) remove(record);
        else previous.push(record);
      }
      // The overview before this one goes once this one is shown (or failed).
      const overview = [...records.values()].filter((record) => record.layer === "overview");
      if (overview.filter((record) => current!.overview.has(record.key)).every((record) => record.state === "shown" || record.state === "failed"))
        for (const record of overview) if (!current.overview.has(record.key)) remove(record);
      if (previous.length > MAX_PREVIOUS) {
        const [cx, cy] = current.view.center, distance = (record) => {
          const [west, south, east, north] = tileBounds(record.tile);
          return Math.hypot((west + east) / 2 - cx, (south + north) / 2 - cy);
        };
        previous.sort((a, b) => distance(b) - distance(a)).slice(0, previous.length - MAX_PREVIOUS).forEach(remove);
      }
    }
    if (job && !job.settled && awaited.every(done)) { job.settled = true; job.resolve(); }
  }

  // Extruded buildings (TODO 66.3): only the live level's tiles (with a fixed basemap, the requested
  // tiles) show theirs, each tile once. A requested or exported tile at the live zoom stands in for
  // the live tile it is (a requested one is never selected again; an exported one until the live
  // tile shows). The previous level, the overview and the world stay flat: a zoom out to a level
  // without buildings (Shortbread has them at zoom 14) shows none rather than keeping old ones.
  function extrudes(record) {
    if (!three || extrude === false || !record.buildings) return false;
    if (record.layer === "current") return true;
    if (still || !current) return record.layer === "base";
    if (record.tile[0] !== current.z) return false;
    if (record.layer === "base") return true;
    return record.layer === "embedded" && records.get(recordId("current", record.tile))?.state !== "shown";
  }
  function extrusionChanged() {
    if (!three) return;
    for (const record of records.values())
      if (record.state === "shown" && record.slot !== undefined) slotHandles.get(record.slot)?.extrude(extrudes(record));
  }
  // The ground plane (TODO 66.2): colorless, it writes the ground's depth once the flat basemap has
  // drawn, under the camera and out to its far plane, so buildings, other 3D marks and fog see a
  // ground. Not a mark: no legend, bounds, minimap or feature (interactive.svelte keeps it in the
  // picking pass, where it writes depth only).
  const groundGeometry = new PlaneGeometry(2, 2).rotateX(-Math.PI / 2);
  const groundMaterial = new MeshBasicNodeMaterial({ colorWrite: false, side: DoubleSide });
  let groundMesh = $state.raw<any>(null);
  onDestroy(() => { groundGeometry.dispose(); groundMaterial.dispose(); });
  function placeGround(eye) {
    const ground = groundMesh && flyoverGround(options, { origin, unitsPerMeter, plane: "xz" });
    if (!ground) return;
    groundMesh.position.set(eye.position.x, ground.y, eye.position.z);
    groundMesh.scale.set(eye.far, 1, eye.far);
    groundMesh.updateMatrixWorld();
  }
  // In 3D every drawing object below this component but the buildings is the flat basemap: the
  // slots' areas, lines and points, and the place names (layerOrder.js orders and draws them).
  if (three)
    injectPlugin("plotBasemap", (args: any) => {
      $effect.pre(() => {
        const ref = args.ref;
        if (!isDrawingObject(ref) || ref.isTileBuildings || ref.plotBasemap) return;
        ref.plotBasemap = true;
        registryOf(scene)?.changed();
        invalidate();
      });
    });

  // Place names: a Text per text size over every slot, updated once the camera has been still for
  // 150 ms, so text layout never runs mid-pan.
  // - Only tiles at most one zoom finer than the live level name places: zoomed far out, a
  //   requested zoom-14 tile's dozen names would stack on one point.
  // - The finest of those tiles at a place names it: a name is left out where a finer tile is
  //   shown (it has its own names there), so a failed live tile leaves the requested tiles' names.
  // - Which of those show is vectorTileLabels.js placeLabels: the kinds the view's zoom shows, the
  //   most important first, each name once, none overlapping another.
  // - The names hide as soon as the live zoom leaves the one they were chosen for (zooming out,
  //   a finer level's names would otherwise linger until the camera rests).
  let places = $state.raw<{ groups: { key: string; size: number; muted: boolean; position: number[][]; text: string[] }[]; zoom: number | undefined } | null>(null);
  let placesTimer: ReturnType<typeof setTimeout> | undefined;
  const placesShown = $derived(!!places && (places.zoom === undefined || places.zoom === liveZoom));
  // A new live level places its names at once (its kinds and sizes differ, and names hidden for
  // a whole zoom looked like a flash); otherwise once the camera has been still for 150 ms.
  function placesChanged() {
    clearTimeout(placesTimer);
    if (places && current && places.zoom !== current.z) placeNames();
    else placesTimer = setTimeout(placeNames, 150);
  }
  function placeNames() {
    clearTimeout(placesTimer);
    placesTimer = undefined;
    if (!alive) return;
    const deepest = (current?.z ?? Infinity) + 1;
    const shown = [...records.values()].filter((record) => record.state === "shown" && record.places && record.tile[0] <= deepest)
      .sort((a, b) => b.tile[0] - a.tile[0]);
    const zooms = new Map<number, Set<string>>();
    for (const record of shown) (zooms.get(record.tile[0]) ?? zooms.set(record.tile[0], new Set()).get(record.tile[0]))!.add(record.key);
    const levels = [...zooms.keys()];
    const candidates = [];
    for (const record of shown)
      record.places.text.forEach((text, i) => {
        const coordinates: [number, number] = [record.places.coordinates[2 * i], record.places.coordinates[2 * i + 1]];
        if (levels.some((z) => z > record.tile[0] && zooms.get(z)!.has(tileKey(tileAt(coordinates, z) as [number, number, number])))) return;
        candidates.push({ text, coordinates, position: [record.places.position[2 * i], record.places.position[2 * i + 1]],
          kind: record.places.kind?.[i] ?? -1, weight: record.places.weight?.[i] ?? 0 });
      });
    const zoom = current?.view ? viewZoom(current.view) : current?.z;
    const groups = zoom === undefined || !styles.places ? [] : placeLabels(candidates, zoom, { size: styles.places.size ?? 13 });
    // The same names in the same places keep their Text marks as they are (TODO 63.8): a pan
    // within the same tiles, or a still view's tiles arriving, placed every name again.
    const next = groups.length ? { groups, zoom: current?.z } : null;
    if (next && places && next.zoom === places.zoom && JSON.stringify(next.groups) === JSON.stringify(places.groups)) return;
    places = next;
  }

  // Clicks: a slot names the tile and feature index; the worker that prepared it has the feature.
  async function picked({ event, key, featureIndex }) {
    if (!onclick) return;
    // A worker that has forgotten the tile's features prepares it again (TODO 63.5).
    const again = async () => {
      const record = [...records.values()].find((each) => each.job?.key === key);
      if (!record) return null;
      const bytes = record.layer === "world" ? null : await cache.load(record.tile, { missing: record.layer === "base" ? "error" : "empty" }).catch(() => undefined);
      return bytes === undefined ? null : { ...record.job.job, bytes };
    };
    const feature = await workers.feature(key, featureIndex, again);
    if (feature && alive) report(onclick, { ...event, feature, featureIndex });
  }

  /**
   * The requested tiles and the live tiles on screen (not the ring loaded around them), as raw
   * bytes: exports embed them.
   */
  export function getTileData() {
    const out = [];
    for (const record of records.values()) {
      if (!(record.layer === "base" || (record.layer === "current" && record.state === "shown" && current?.exact.has(record.key)))) continue;
      const entry = cache.peek(record.tile);
      if (entry?.status === "ready") out.push(tileDataEntry(record.tile, entry.bytes));
    }
    return out;
  }
  export async function whenSettled() {
    await tick();
    while (job && !job.settled) await job.promise;
    await Promise.all([...slotHandles.values()].map((slot) => slot.whenSettled()));
    // Export/settlement includes the labels of those tiles, not the previous debounce frame.
    if (placesTimer !== undefined) {
      placeNames();
      await tick();
    }
  }
  export function getStatus() {
    const all = [...records.values()];
    const count = (layer, state = undefined) => all.filter((record) => record.layer === layer && (!state || record.state === state)).length;
    return {
      pending: all.some((record) => record.pending),
      tiles: count("base", "shown") + count("current", "shown"),
      features: all.filter((record) => record.state === "shown").reduce((n, record) => n + record.features, 0),
      // In 3D, the tiles whose buildings stand extruded (TODO 66.3).
      ...(three ? { extruded: all.filter((record) => record.state === "shown" && extrudes(record)).length } : {}),
      live: current ? { zoom: current.z, selected: current.tiles.length,
        shown: all.filter((record) => record.layer === "current" && record.state === "shown" && current!.exact.has(record.key)).length,
        failed: all.filter((record) => record.layer === "current" && record.state === "failed" && current!.exact.has(record.key)).length,
        ring: current.ring.length,
        previous: count("previous"), overview: count("overview", "shown"), slots: slots.length, requests: scheduler.active + scheduler.waiting,
        center: [...current.view.center] } : null,
    };
  }
  export const getSlots = () => slots.map((slot) => slotHandles.get(slot.id)).filter(Boolean);
  onDestroy(() => {
    alive = false;
    cameraMove?.resolve();
    clearTimeout(placesTimer);
    clearTimeout(ringTimer);
    clearTimeout(trimTimer);
    if (job && !job.settled) { job.settled = true; job.resolve(); }
    scheduler.dispose();
    workers.release();
  });
</script>

{#snippet layers()}
  {#each slots as slot (slot.id)}
    <Slot id={slot.id} firstRows={slot.rows} register={registerSlot} visible={visible ?? true} onpick={onclick ? picked : undefined} />
  {/each}
  {#if places && placesShown && styles.places}
    {#each places.groups as group (group.key)}
    <Text name="Place names" position={group.position} text={group.text} size={group.size}
      color={group.muted ? mixColor(styles.places.color ?? styles.places.fill, styles.background?.fill ?? "#ffffff", 0.45) : styles.places.color ?? styles.places.fill} legend={false} domains={false}
      {...(visible !== undefined ? { visible } : {})} />
    {/each}
  {/if}
{/snippet}
{#if three}
  <!-- The xz plane: the local plane's y is world -z, as GeoJSON's plane="xz". -->
  <T.Group rotation={[-Math.PI / 2, 0, 0]}>
    {@render layers()}
  </T.Group>
  <T.Mesh geometry={groundGeometry} material={groundMaterial} renderOrder={GROUND_ORDER} frustumCulled={false} visible={visible ?? true}
    userData={{ omitOverview: true }} oncreate={(ref: any) => { ref.plotGround = true; groundMesh = ref; cameraKey = ""; }} />
{:else}
  {@render layers()}
{/if}
