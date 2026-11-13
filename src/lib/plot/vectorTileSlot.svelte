<script lang="ts">
  import { useViewServices } from "./utils/viewServices.js";
  // A live VectorTile's tile slot (TODO 35): one tile's areas, lines and points as three marks,
  // made once and reused. A tile is assigned by uploading tileMesh's arrays (vectorTileMesh.js),
  // colors as categoryColor rows: no per-feature styling runs here (35.0: 1–5 ms per tile).
  // In a 3D flyover (TODO 66, `basemap`) the three draw flat before the plot's 3D geometry, without
  // depth (utils/layerOrder.js), and a fourth mark draws the tile's extruded buildings with depth,
  // shown while the VectorTile extrudes this tile (extrude()).
  import { T, useThrelte } from "@threlte/core";
  import { getContext, onDestroy, onMount, untrack } from "svelte";
  import { getOptionsContext } from "./utils/context.js";
  import { GeoFaces, TileBuildings } from "./objects/geoFaces.js";
  import { GeoSegments } from "./objects/geoSegments.js";
  import { ScatterSprite } from "./objects/scatter.js";
  import { DoubleSide } from "three/webgpu";
  import { TileMeshNodeMaterial, TilePointsNodeMaterial } from "../threeExtensions/materials/tile.js";
  import { installGeoAppearance } from "./objects/geoAppearance.js";
  import { ensureScatter3DOptions, ensureSegmentsOptions } from "./objects/defaultOptions.js";
  import { tilePublication } from "./utils/tilePublication.js";
  import { settleUploads } from './rendering/uploadSettlement.js';
  import { ROOT_CONTENT_CONTEXT } from "./utils/rootFrameSelection.js";
  import { useLayerSlot } from "./utils/layerSlot.svelte.js";
  let { id, firstRows = undefined, visible = true, onpick = undefined, register = undefined, basemap = false }: any = $props();
  const { renderer, invalidate } = useThrelte() as any;
  const viewServices = useViewServices();
  const parent = getOptionsContext();
  const rootOwner = getContext<any>(ROOT_CONTENT_CONTEXT);
  const unregisterRootContent = rootOwner?.register({ kind: "content", key: crypto.randomUUID(), parentKey: rootOwner.parentKey });
  // One layer slot (Stage 22): the areas, then the lines, then the points.
  let layerMarker = $state<HTMLTemplateElement>();
  useLayerSlot(() => layerMarker);
  ensureScatter3DOptions(parent);
  ensureSegmentsOptions(parent);
  // Not listed in the settings: a slot is part of its VectorTile. Each slot instance owns its
  // node: a remounted live layer numbers its slots from 0 again while the old slots' nodes wait
  // for their uploads to settle, and a node named by the number alone was shared with them (TODO
  // 136.1: the new slot's maxElements shrank the old marks, and their disposal took its options).
  const areaOptions = parent.split(`tileSlot${untrack(() => id)}-${crypto.randomUUID()}`),
    lineOptions = areaOptions.split("lines");
  let pointOptions: any = null;
  areaOptions.presentation.hidden = true;
  // A first allocation above what fits a uniform buffer (geojson.svelte, TODO 17.6b); set() grows
  // each mark to the next power of two (TODO 29.2).
  const uniformLimit = renderer?.backend?.device?.limits?.maxUniformBufferBindingSize ?? 65536;
  // `firstRows`, the first tile's [areas, lines, points], sizes each mark for it from the start.
  const capacity = 2 ** Math.ceil(Math.log2(uniformLimit / 64 + 1));
  const first = untrack(() => firstRows) ?? [];
  const sized = (i: number, rows = first[i]) => Math.max(capacity, 2 ** Math.ceil(Math.log2(Math.max(1, rows ?? 0))));
  areaOptions.populate({ legend: false, maxElements: sized(0), outlineWidth: 0 });
  lineOptions.populate({ legend: false, maxElements: sized(1), interpolation: "angular", widthTransform: "linear", widthBounds: [0, 1], widthRange: [0, 1] });
  // A mark's builds while a tile is assigned (a field's first buffer, a grown buffer, the first
  // build) wait for the assignment's end: one build a mark (TODO 63.1; 35 counted 20 a new slot).
  // The slot is not drawn meanwhile, or (a restyle) its frames wait for the upload.
  let deferring = 0;
  const deferred = new Set<any>();
  const deferBuilds = (mark: any) => {
    const proto = Object.getPrototypeOf(mark);
    mark.build = function (...args: any[]) {
      if (deferring) return void deferred.add(this);
      return proto.build.apply(this, args);
    };
    return mark;
  };
  const prepare = (mark: any, isLine = false) => {
    mark.componentName = "VectorTile";
    deferring++;
    try { installGeoAppearance(deferBuilds(mark), isLine); } finally { deferring--; }
    mark.plotTileStorage = true;
    mark.tileStorageFields = new Set(["position", "cornerB", "cornerC", "start", "end", "width", "categoryColor", "size"]);
    mark.categoryColorActive = true;
    mark.count = 0;
    mark.visible = false;
    // Named in messages and export reports by its component (TODO 67.6).
    mark.componentName = "VectorTile";
    return mark;
  };
  const flat = untrack(() => basemap);
  const faces: any = prepare(new GeoFaces(areaOptions, viewServices, invalidate, new TileMeshNodeMaterial({ side: DoubleSide }))),
    lines: any = prepare(new GeoSegments(lineOptions, viewServices, invalidate), true);
  faces.plotBasemap = lines.plotBasemap = flat;
  // Points (the "other" part's, rare in basemaps) are made with the first tile that has them
  // (TODO 63.1): most slots never hold one.
  let points = $state.raw<any>(null);
  function makePoints(rows: number) {
    pointOptions = areaOptions.split("points");
    pointOptions.populate({ legend: false, maxElements: sized(2, rows), scaleTransform: "linear", scaleBounds: [0, 1], scaleRange: [0, 1], sizeAttenuation: false, shape: "circle" });
    points = prepare(new ScatterSprite(pointOptions, viewServices, invalidate, new TilePointsNodeMaterial({ alphaTest: 0.5, alphaToCoverage: true })));
    points.plotBasemap = flat;
    return points;
  }
  // Extruded buildings (TODO 66.3), made with the first tile that has them: one color (the
  // buildings' fill, a uniform), elevations in the corners.
  let buildings = $state.raw<any>(null), buildingOptions: any = null, extruding = false;
  function makeBuildings(rows: number) {
    buildingOptions = areaOptions.split("buildings");
    buildingOptions.populate({ legend: false, maxElements: sized(3, rows), outlineWidth: 0 });
    buildings = prepare(new TileBuildings(buildingOptions, viewServices, invalidate, new TileMeshNodeMaterial({ side: DoubleSide })));
    buildings.categoryColorActive = false;
    return buildings;
  }
  const marks = () => [faces, lines, points, buildings];
  // The tile shown: its worker key and each family's feature index per instance (onclick).
  let shown: any = null;
  let version = 0;
  const built = new Set();

  /** Show a tile: `key` names it to the tile workers; `result` is tileMesh's, `paint` paintTile's. */
  export async function set(key: string, result: any, paint: any, priority = () => 0) {
    const v = ++version;
    const counts = result.counts, gray = "#92989f";
    // First-use and buffer-growth uploads share the renderer's completed-frame budget.
    const rowsOf = [counts.faces, counts.lines, counts.points, counts.buildings ?? 0];
    let release: any;
    if (marks().some((mark, i) => rowsOf[i] && (!mark || !built.has(mark) || rowsOf[i] > (mark.manager?.maxElements ?? Infinity)))) {
      release = await tilePublication(viewServices, () => v !== version, priority);
      if (!release) return false;
      if (v !== version) { release(false); return false; }
    }
    let published = false;
    try {
      if (counts.points && !points) makePoints(counts.points);
      if (rowsOf[3] && !buildings) makeBuildings(rowsOf[3]);
      // The worker's arrays and the paint go straight into the marks' buffers (TODO 63.6: 35 wrapped
      // each in a jax array, spread [x, y, z] rows to four numbers on the GPU, and kept a GPU copy of
      // every field). What is the same for every row (heights, presence, the gray under the colors)
      // is a uniform: each mark's fields keep their kinds and storage nodes from tile to tile,
      // including growth (35: a build per tile made three.js build the material's node
      // graph again for every tile a zoom brought in, 2.5 s of a 6 s zoom).
      const perRow = [
        counts.faces && { position: result.faces.a, cornerB: result.faces.b, cornerC: result.faces.c, categoryColor: paint.faces.color },
        counts.lines && { start: result.lines.start, end: result.lines.end, width: paint.lines.width, categoryColor: paint.lines.color },
        counts.points && { position: result.points.position, size: paint.points.size, categoryColor: paint.points.color },
        rowsOf[3] && { position: result.buildings.a, cornerB: result.buildings.b, cornerC: result.buildings.c },
      ];
      // Buildings: elevations are in their corners (GeoFaces multiplies them by the height, 1).
      const constant = [{ fill: gray, height: 0, geoPresent: 1 }, { color: gray }, { fill: gray, geoPresent: 1, geoOutlineColor: gray, geoPointOutline: 0 },
        { fill: paint.buildings?.fill ?? gray, height: 1, geoPresent: 1 }];
      const each = marks();
      deferring++;
      try {
        await Promise.all(each.map((mark, i) => {
          if (!perRow[i] || !mark) return undefined;
          mark.ensureCapacity(rowsOf[i]);
          if (!built.has(mark)) {
            built.add(mark);
            mark.build();
          }
          return Promise.all([
            ...Object.entries(constant[i]).map(([name, value]) => mark.fields.get(name)?.update(value)),
            ...Object.entries(perRow[i]).map(([name, array]) => mark.fields.get(name).updateHost(array, rowsOf[i])),
          ]);
        }));
      } finally {
        deferring--;
        if (!deferring) {
          for (const mark of deferred) if (!mark.isDisposed) mark.build();
          deferred.clear();
        }
      }
      if (v !== version) { release?.(false); return false; }
      each.forEach((mark, i) => {
        if (!mark) return;
        if (!perRow[i]) mark.count = 0;
        mark.visible = visible && !!perRow[i] && (mark !== buildings || extruding);
      });
      shown = { key, counts, faces: result.faces.feature, lines: result.lines.feature, points: result.points.feature, buildings: result.buildings?.feature };
      invalidate();
      published = true;
      return true;
    } finally { release?.(published); }
  }
  /** New colors, widths and sizes for the tile shown (`paint`: paintTile's), its geometry kept. */
  export async function repaint(paint: any) {
    if (!shown) return;
    const { faces: f, lines: l, points: p, buildings: b } = shown.counts;
    await Promise.all([
      b && buildings?.fields.get("fill").update(paint.buildings.fill),
      f && faces.fields.get("categoryColor").updateHost(paint.faces.color, f),
      l && lines.fields.get("categoryColor").updateHost(paint.lines.color, l),
      l && lines.fields.get("width").updateHost(paint.lines.width, l),
      p && points?.fields.get("categoryColor").updateHost(paint.points.color, p),
      p && points?.fields.get("size").updateHost(paint.points.size, p),
    ]);
    invalidate();
  }
  /** Show nothing (the slot is free). */
  export function clear() {
    version++;
    shown = null;
    extruding = false;
    for (const mark of marks()) {
      if (!mark) continue;
      mark.count = 0;
      mark.visible = false;
    }
    invalidate();
  }
  export const getMarks = () => marks().filter(Boolean);
  /** Show the tile's extruded buildings or not (TODO 66.3): the VectorTile extrudes the tiles of
   * its live level only. */
  export function extrude(on: boolean) {
    if (extruding === !!on) return;
    extruding = !!on;
    if (buildings) buildings.visible = visible && extruding && buildings.count > 0;
    invalidate();
  }
  /** Rows each mark holds before it must grow: areas, lines, points, buildings (0 before the
   * first points or buildings). */
  export const rowsHeld = () => marks().map((mark) => mark?.manager?.maxElements ?? 0);
  /**
   * The GPU bytes the slot's marks hold for their capacity (estimated): each per-row field's
   * buffer, and an instance matrix past what fits a uniform buffer (64 bytes a row).
   */
  export const bytesHeld = () => marks().reduce((total, mark) => {
    if (!mark) return total;
    const rows = mark.manager?.maxElements ?? 0;
    let row = mark.material?.instanceTransform !== false && rows * 64 > uniformLimit ? 64 : 0;
    for (const field of mark.fields.values()) if (field.isBufferNode) row += 4 * (field.channels === 3 ? 4 : field.channels ?? 1);
    return total + rows * row;
  }, 0);
  export const whenSettled = () => settleUploads(viewServices);
  $effect(() => {
    const show = visible;
    if (shown) for (const mark of marks()) if (mark) mark.visible = show && mark.count > 0 && (mark !== buildings || extruding);
    invalidate();
  });

  // The VectorTile holds this handle, not a bind:this (unset while a keyed each moves the slot).
  onMount(() => {
    register?.(id, { set, repaint, clear, extrude, whenSettled, getMarks, rowsHeld, bytesHeld });
    return () => register?.(id, null);
  });

  const pick = (family: string) => (event: any) => {
    const index = event.instanceId, features = shown?.[family];
    if (!onpick || !features || !Number.isInteger(index) || index < 0 || index >= features.length) return;
    onpick({ event, key: shown.key, featureIndex: features[index] });
  };
  onDestroy(() => {
    version++;
    unregisterRootContent?.();
    settleUploads(viewServices).finally(() => {
      for (const mark of marks()) mark?.dispose();
      pointOptions?.dispose();
      buildingOptions?.dispose();
      lineOptions.dispose();
      areaOptions.dispose();
    });
  });
</script>

<template bind:this={layerMarker} data-plot-layer></template>
<T is={faces} {...(onpick ? { onclick: pick("faces") } : {})} />
<T is={lines} {...(onpick ? { onclick: pick("lines") } : {})} />
{#if points}
  <T is={points} {...(onpick ? { onclick: pick("points") } : {})} />
{/if}
{#if buildings}
  <T is={buildings} {...(onpick ? { onclick: pick("buildings") } : {})} />
{/if}
