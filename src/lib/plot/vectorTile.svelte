<script lang="ts">
  import { onCoordinateView, coordinateView } from "./utils/viewContext.js";
  import { useViewServices } from "./utils/viewServices.js";
  // VectorTile (TODO 24): vector tiles named by the caller, drawn as a styled basemap. A compound
  // mark: GeoJSON parts (a Text for place names) in a fixed order, plus the loading, which the
  // composition surface does not offer, so it lives with the core marks. Live (TODO 35, the
  // default in a flat 2D view): the tiles the camera shows load too, drawn by tile slots
  // (vectorTileLive.svelte). Under a 3D flyover camera (TODO 66) the slots draw a flat basemap,
  // live or not, with the tiles' buildings extruded. docs/VECTOR-TILES.md has the surface.
  import { getContext, onDestroy, tick, untrack } from "svelte";
  import { T, useThrelte, useThrelteUserContext } from "@threlte/core";
  import GeoJSON from "./geojson.svelte";
  import Text from "./bound/label.svelte";
  import { getOptionsContext, setOptionsContext } from "./utils/context.js";
  import { createScheduler, stableKey } from "./utils/providers.js";
  import { mountCause, settleClock, settlePreparations } from './rendering/viewSettlement.js';
import { settleUploads } from './rendering/uploadSettlement.js';
  import { reportDataError } from "./utils/dataErrors.js";
  import { pendingRootContent, ROOT_CONTENT_CONTEXT } from "./utils/rootFrameSelection.js";
  import { AXIS_CONTEXT } from "./utils/axisFrame.js";
  import { fitMapViewport } from "./utils/mapFit.js";
  import { DEFAULT_TILES, decodeTile, fetchTileBytes, localPlane, resolveTiles, tileBounds, tileDataBytes, tileDataEntry, tileKey } from "./utils/vectorTiles.js";
  import { PARTS, layerDrawn, lineWidth, liveStyleIssue, mixColor, resolveSourceLayers, resolveStyles, splitFeatures, vectorTileScheme } from "./utils/vectorTileStyle.js";
  import { placeKind, placeLabels } from "./utils/vectorTileLabels.js";
  import { flyoverGround, liveInverse } from "./utils/vectorTileView.js";
  import { BooleanType, ScalarType } from "./objects/types.js";
  import { spherical } from "./utils/coordinates.js";
  import VectorTileLive from "./vectorTileLive.svelte";
  import { projectFeature } from "./utils/vectorTileMesh.js";
  import { THEME_CONTEXT } from "./utils/theme.js";
  import { themePreset } from "./utils/themePresets.js";
  import type { VectorTileProps } from "./publicTypes.js";
  let {
    url = undefined,
    tile = undefined,
    tiles = undefined,
    bounds = undefined,
    zoom = undefined,
    data = undefined,
    styles = undefined,
    scheme = undefined,
    sourceLayers = undefined,
    clip = true,
    fit = true,
    origin = undefined,
    unitsPerMeter = 1,
    plane = "xy",
    name = undefined,
    visible = undefined,
    opacity = undefined,
    onclick = undefined,
    onload = undefined,
    onerror = undefined,
    live = true,
    minZoom = 0,
    maxZoom = 14,
    zoomBias = undefined,
    attribution = undefined,
    tileData = undefined,
    extrudeBuildings = undefined,
  }: VectorTileProps = $props();
  const { renderer, camera } = useThrelte() as any;
  const viewServices = useViewServices();
  const options = getOptionsContext().splitUnique(untrack(() => name), "group", "VectorTile");
  setOptionsContext(options);
  onDestroy(() => options.dispose());
  // The settings pane's "3D buildings" (TODO 66.4): extrude the tiles' buildings in a 3D flyover.
  options.ensure("extrudeBuildings", new BooleanType({ defaultValue: true, label: "3D buildings" }));
  $effect(() => { if (extrudeBuildings !== undefined) options.set("extrudeBuildings", extrudeBuildings); });
  const extrudeStore = options.store("extrudeBuildings");
  options.ensure("zoomBias", new ScalarType({ defaultValue: 0, label: "Tile detail", min: -4, max: 4, step: 0.25 }));
  $effect(() => { if (zoomBias !== undefined) options.set("zoomBias", zoomBias); });
  const zoomBiasStore = options.store("zoomBias");
  // The parts mount with the first result: until then the Plot must not pick its root Frame
  // without them (Stage 14's root ownership), as with a Provider.
  const releaseRootPending = pendingRootContent(getContext(ROOT_CONTENT_CONTEXT));
  const errorOwner = {};

  const LINE_PARTS = new Set(["waterways", "paths", "roads", "majorRoads", "railways", "boundaries"]);
  const LABELS: Record<string, string> = {
    background: "Background", land: "Land", green: "Green areas", water: "Water", waterways: "Waterways",
    buildings: "Buildings", other: "Other layers", paths: "Paths", roads: "Roads", majorRoads: "Major roads",
    railways: "Railways", boundaries: "Boundaries", places: "Place names",
  };

  // A url function has no text to compare: equal functions share a key.
  const functionIds = new WeakMap<Function, number>();
  let functions = 0;
  const urlKey = (value) => (typeof value === "function" ? `function ${functionIds.get(value) ?? (functionIds.set(value, ++functions), functions)}` : value);
  const prefixed = (message: string) => (message.startsWith("VectorTile: ") ? message : `VectorTile: ${message}`);

  // With an origin, features are drawn in a local plane (localPlane in utils/vectorTiles.js).
  const projectCollection = (collection, project) =>
    ({ ...collection, features: collection.features.map((feature) => (feature.geometry ? projectFeature(feature, project) : feature)) });

  // The color scheme (TODO 36): the `scheme` prop (a theme preset's name, "default", or part
  // styles), else the enclosing Theme's vectorTile section, else one derived from its colors.
  const themeScope: any = getContext(THEME_CONTEXT);
  let themeValue = $state.raw<any>(themeScope?.read?.());
  $effect(() => themeScope?.subscribe?.((next) => { themeValue = next; }));
  function schemeStyles(value, theme) {
    if (value === "default") return undefined;
    if (typeof value === "string") {
      const preset = themePreset(value);
      if (!preset) throw Error(`VectorTile: scheme "${value}" is not a theme preset; use a preset name, "default", or part styles.`);
      return preset.vectorTile ?? vectorTileScheme(preset);
    }
    if (value !== undefined && value !== null) return value;
    return theme ? theme.vectorTile ?? vectorTileScheme(theme) : undefined;
  }

  // Without a url (and without data), the default tiles, with their credit (DEFAULT_TILES).
  const given = (value) => value !== undefined && value !== null && value !== "";
  const source = $derived(given(url) ? url : data === undefined ? DEFAULT_TILES.url : undefined);
  const credit = $derived(attribution === false ? null
    : typeof attribution === "string" && attribution.trim() ? attribution.trim()
    : !given(url) && data === undefined ? DEFAULT_TILES.attribution : null);

  // The request the props describe, or why they describe none.
  const request = $derived.by(() => {
    try {
      const style = resolveStyles(styles, schemeStyles(scheme, themeValue)), layers = resolveSourceLayers(sourceLayers);
      const list = resolveTiles({ tile, tiles, bounds, zoom });
      const parts = PARTS.filter((part) => style[part]);
      if (data === undefined && given(source) && !list.length)
        throw Error("VectorTile: pass tile, tiles, or bounds with zoom.");
      const project = origin === undefined || origin === null ? null : localPlane(origin, unitsPerMeter);
      return {
        style, sourceLayers: layers, tiles: list, parts, url: source, clip: clip !== false, project,
        key: stableKey({ url: urlKey(source), tiles: list, clip: clip !== false }),
        layersKey: stableKey(layers),
      };
    } catch (error) {
      return { error };
    }
  });

  // Live mode (TODO 35): on by default in a 2D view (Cartesian, or a map in any projection)
  // outside nested Frames. Under a 3D flyover camera (TODO 66: a Cartesian 3D plot, an origin, the
  // xz plane and linear axes; utils/vectorTileView.js flyoverGround) tile slots draw too: "3d"
  // follows the camera, "fixed" (live={false}) draws the requested tiles. Elsewhere in 3D, and
  // with live={false} and translucent styles there, the GeoJSON parts draw the requested tiles.
  // The coordinate options are not reactive: a change bumps liveRevision.
  const scene2dContext = useThrelteUserContext("scene2d");
  let liveRevision = $state(0);
  const stopLiveOptions = ["coordinates", "projection", "plot.cameraMode", "xTransform", "yTransform", "zTransform"]
    .map((key) => options.on(() => untrack(() => liveRevision++), key));
  stopLiveOptions.push(onCoordinateView(options, () => untrack(() => liveRevision++)));
  onDestroy(() => stopLiveOptions.forEach((stop) => stop?.()));
  let liveHandle = $state<any>();
  // The live tiles' first content: the plot's root waits for it, as for the parts (Stage 14).
  let liveContent = $state(false);
  const liveMode = $derived.by((): "2d" | "3d" | "fixed" | false => {
    liveRevision;
    if (data !== undefined || untrack(nestedMap)) return false;
    try {
      if ($scene2dContext) return live !== false && untrack(() => liveInverse(options, { origin, unitsPerMeter })) !== null ? "2d" : false;
      if (options.get("plot.cameraMode") !== "flyover" || untrack(() => flyoverGround(options, { origin, unitsPerMeter, plane })) === null) return false;
      if (live !== false) return "3d";
      return !request.error && !liveStyleIssue(request.style, opacity) ? "fixed" : false;
    } catch {
      return false;
    }
  });
  // Live tiles cover the coarser ones under them with their backgrounds: opaque styles only.
  const liveIssue = $derived(liveMode && liveMode !== "fixed" && !request.error ? liveStyleIssue(request.style, opacity) : "");
  // Automatic bounds (a Cartesian plot's) come from the requested tiles, never from live tiles:
  // loading must not move the view it follows. They count in the tiles' frame, as a mark's do.
  const boundsRoute = viewServices?.domains.route({ frame: getContext(AXIS_CONTEXT), owner: `vectortile-${crypto.randomUUID()}`, facetOwner: {} });
  $effect(() => {
    if (!liveMode || request.error || !request.tiles.length || !boundsRoute?.collects() || untrack(() => spherical(options))) return;
    const project = request.project ?? ((point) => point);
    const boxes = request.tiles.map(tileBounds);
    const [west, south] = [Math.min(...boxes.map((b) => b[0])), Math.min(...boxes.map((b) => b[1]))];
    const [east, north] = [Math.max(...boxes.map((b) => b[2])), Math.max(...boxes.map((b) => b[3]))];
    const corners = [[west, south], [east, north]].map(project);
    untrack(() => {
      boundsRoute.set("x", [Math.min(corners[0][0], corners[1][0]), Math.max(corners[0][0], corners[1][0])]);
      boundsRoute.set("y", [Math.min(corners[0][1], corners[1][1]), Math.max(corners[0][1], corners[1][1])]);
    });
    return () => boundsRoute.clear();
  });
  // Attribution: one credit line per plot, drawn in its lower-left corner and in every export (viewCore).
  $effect(() => viewServices?.credits.set(errorOwner, credit));

  // The result on screen: { data, tiles, key, parts, layersKey }.
  let loaded = $state.raw<any>(undefined);
  let loadError = $state(""),
    pending = $state(false),
    requests = 0;
  const report = (callback, value) => {
    try {
      callback?.(value);
    } catch (error) {
      console.error("VectorTile callback:", error);
    }
  };
  const scheduler = createScheduler({
    view: viewServices,
    async load(next, signal) {
      const started = performance.now();
      const embedded = tileDataBytes(tileData);
      // Embedded tiles (an exported page's tileData) load nothing; the bytes stay for exports.
      const tiles = await Promise.all(next.tiles.map(async (tile) => {
        const bytes = embedded.has(tileKey(tile)) ? embedded.get(tileKey(tile)) : await fetchTileBytes(next.url, tile, { signal });
        // Each tile skips the layers its zoom does not draw (vectorTileStyle.js).
        const layers = (layer) => layerDrawn(layer, next.style, next.sourceLayers, tile[0]);
        return { tile, bytes, features: bytes ? decodeTile(bytes, tile, { url: next.url, clip: next.clip, layers }) : [] };
      }));
      const collection = { type: "FeatureCollection", features: tiles.flatMap((entry) => entry.features) };
      return { collection, bytes: tiles.map(({ tile, bytes }) => ({ tile, bytes })), ms: performance.now() - started };
    },
    publish(next, { collection, bytes, ms }) {
      loaded = { data: collection, bytes, tiles: next.tiles, url: next.url, key: next.key, parts: next.parts, layersKey: next.layersKey };
      loadError = "";
      report(onload, { tiles: next.tiles, features: collection.features.length, ms });
    },
    fail(next, error) {
      loadError = prefixed(error?.message ?? String(error));
      report(onerror, { error });
    },
    onPending(value) {
      pending = value;
    },
  });
  // A result serves a request when it has its tiles and decoded every source layer the
  // request's styles draw (a style change that only hides parts, or recolors them, loads nothing).
  const covers = (result, next) => !!result && result.key === next.key && result.layersKey === next.layersKey &&
    next.parts.every((part) => result.parts.includes(part));
  $effect(() => {
    const next = request;
    const given = data !== undefined, liveTiles = liveMode;
    untrack(() => {
      if (next.error || given || liveTiles || (!next.url && tileData == null) || !next.tiles.length) {
        scheduler.cancel();
        return;
      }
      const waiting = scheduler.pending;
      if (covers(waiting ?? loaded, next)) return;
      // Back to the tiles on screen: the request for others is dropped.
      if (waiting && covers(loaded, next)) {
        scheduler.cancel();
        return;
      }
      const first = requests++ === 0;
      scheduler.schedule(next, { cause: first ? mountCause(viewServices) : undefined });
    });
  });

  const errorText = $derived(request.error ? prefixed(request.error.message ?? String(request.error)) : liveIssue || loadError);
  $effect(() => reportDataError(viewServices, errorOwner, errorText));

  // What is drawn: the given data, else the loaded tiles, split into parts by the current styles.
  const shown = $derived(data !== undefined
    ? { data, tiles: request.error ? [] : request.tiles }
    : loaded ? { data: loaded.data, tiles: loaded.tiles } : undefined);
  const drawStyle = $derived(request.error ? (loaded ? resolveStyles(undefined) : undefined) : request.style);
  const drawLayers = $derived(request.error ? {} : request.sourceLayers);
  // The tiles' zoom draws their kinds and names (the finest of them; every kind for data without
  // tiles).
  const shownZoom = $derived(shown?.tiles.length ? Math.max(...shown.tiles.map((value) => value[0])) : Infinity);
  const split = $derived(shown && drawStyle ? splitFeatures(shown.data, drawStyle, drawLayers, shownZoom) : undefined);
  const parts = $derived.by(() => {
    if (!shown || !drawStyle || !split) return undefined;
    const out: Record<string, any> = { ...split };
    if (drawStyle.background && shown.tiles.length)
      out.background = {
        type: "FeatureCollection",
        features: shown.tiles.map((value) => {
          const [west, south, east, north] = tileBounds(value);
          return { type: "Feature", properties: { layerName: "background", tile: value.join("/") },
            geometry: { type: "Polygon", coordinates: [[[west, south], [east, south], [east, north], [west, north], [west, south]]] } };
        }),
      };
    const project = request.error ? null : request.project;
    if (project) for (const part of Object.keys(out)) out[part] = projectCollection(out[part], project);
    return out;
  });
  // In a Cartesian 3D view every part lies in one plane, so depth alone would let coplanar parts
  // flicker through each other: each part sits a step below the next (a meter in a local plane),
  // and all of them below the plane, so marks standing on it (extruded buildings) rise out of it.
  const cartesian3d = () => options.get("coordinates") === "cartesian" && coordinateView(options) === "3d";
  const lift = (part): [number, number, number] => {
    if (!cartesian3d()) return [0, 0, 0];
    const step = (request.error ? null : request.project) ? Number(unitsPerMeter) : 1e-5;
    const offset = -(PARTS.length - PARTS.indexOf(part)) * step;
    return plane === "xz" ? [0, offset, 0] : [0, 0, offset];
  };
  // Place names: the named points (the first point of a MultiPoint) that show at the tiles' zoom,
  // most important first and none overlapping (vectorTileLabels.js), a Text per text size.
  const places = $derived.by(() => {
    if (!drawStyle?.places) return undefined;
    const project = request.error ? null : request.project, candidates = [];
    for (const feature of split?.places?.features ?? []) {
      const text = feature.properties?.name ?? feature.properties?.name_en;
      if (text === undefined || text === null || text === "") continue;
      const coordinates = feature.geometry.type === "MultiPoint" ? feature.geometry.coordinates[0] : feature.geometry.coordinates;
      const position = project ? project(coordinates) : coordinates;
      candidates.push({ text: String(text), coordinates, position: [position[0], position[1]], ...placeKind(feature.properties) });
    }
    const groups = placeLabels(candidates, Number.isFinite(shownZoom) ? shownZoom : 14, { size: drawStyle.places.size ?? 13 });
    return groups.length ? groups : undefined;
  });
  const partStyle = (part) => {
    const { fill, color, width, size, opacity: partOpacity, outlineColor, outlineWidth } = drawStyle?.[part] ?? {};
    const out: Record<string, any> = {};
    if (LINE_PARTS.has(part)) Object.assign(out, { color: color ?? fill, width: width === undefined ? width : lineWidth(part, Number(width), shownZoom) });
    else Object.assign(out, { fill, outlineWidth: outlineWidth ?? 0, ...(outlineColor !== undefined ? { outlineColor } : {}),
      ...(color !== undefined ? { color } : {}), ...(width !== undefined ? { width } : {}), ...(size !== undefined ? { size } : {}) });
    const alpha = partOpacity ?? opacity;
    if (alpha !== undefined) out.opacity = partOpacity !== undefined && opacity !== undefined ? partOpacity * opacity : alpha;
    if (visible !== undefined) out.visible = visible;
    return out;
  };

  $effect(() => {
    if (parts === undefined && !errorText && !(liveMode && liveContent)) return;
    let canceled = false;
    tick().then(() => { if (!canceled) releaseRootPending(); });
    return () => { canceled = true; };
  });

  // Fit: when the tiles change, a 2D map root frames them. Its controls exist once the plot's
  // camera does, so a fit waits for them (a few frames at most).
  let fitted = "";
  const nestedMap = () => ["coordinates", "projection"].some((key) => (options as any).owner?.(key)?.frameDefinition?.parent != null);
  function fitViewport(list) {
    let [west, south, east, north] = tileBounds(list[0]);
    for (const value of list.slice(1)) {
      const b = tileBounds(value);
      west = Math.min(west, b[0]); south = Math.min(south, b[1]); east = Math.max(east, b[2]); north = Math.max(north, b[3]);
    }
    const rect = camera?.current?.userData?.plotRect ?? { width: renderer.domElement?.clientWidth ?? 0, height: renderer.domElement?.clientHeight ?? 0 };
    return fitMapViewport(options, viewServices?.navigation.controls.current, rect, [west, south, east, north]);
  }
  // Live tiles select from the view, so they wait for the first fit (fitReady), which in live mode
  // frames the requested tiles from their numbers, before any load.
  let fitReady = $state(false);
  $effect(() => {
    const list = liveMode ? (request.error ? [] : request.tiles) : shown?.tiles ?? [];
    // A 3D camera is not fitted to the tiles (as for the GeoJSON parts in 3D).
    if (!fit || !list.length || liveMode === "3d" || liveMode === "fixed") {
      fitReady = true;
      return;
    }
    const key = stableKey(list);
    if (key === fitted) return;
    let frame = 0, attempts = 0;
    const attempt = () => {
      if (untrack(() => fitViewport(list))) {
        fitted = key;
        fitReady = true;
      } else if (++attempts < 240) frame = requestAnimationFrame(attempt);
      else fitReady = true;
    };
    attempt();
    return () => cancelAnimationFrame(frame);
  });

  const handles: Record<string, any> = $state({});
  // The place names' Labels, one per text size: getParts() names the first `places`.
  const placeHandles: any[] = $state([]);
  /**
   * Resolves once the loads requested before this call are shown (or failed) and the parts
   * have prepared them. With { loads: false } (a scene update being applied) it waits for
   * nothing: the Plot settles the parts' own preparation.
   */
  export async function whenSettled({ loads = true } = {}) {
    if (!loads) return;
    await tick();
    const until = settleClock();
    await scheduler.settle(until);
    await tick();
    if (liveMode) await liveHandle?.whenSettled();
    await Promise.all([...Object.values(handles), ...placeHandles].map((handle) => handle?.whenSettled?.()));
    await settlePreparations(viewServices, until);
    await settleUploads(viewServices);
  }
  /** The tiles on screen and their features, as decoded (not in live mode: getTileData). */
  export function getResult() {
    if (liveMode || !shown) return undefined;
    return { data: shown.data, tiles: shown.tiles.map((value) => [...value]) };
  }
  /**
   * The tiles on screen as raw bytes, [{ tile, bytes }] with base64 bytes (exports embed them as
   * tileData): the requested tiles, and in live mode the current level's tiles too.
   */
  export function getTileData() {
    if (liveMode) return liveHandle?.getTileData() ?? [];
    return (loaded?.bytes ?? []).map(({ tile, bytes }) => tileDataEntry(tile, bytes));
  }
  /** The mounted parts' marks, by part name. */
  export const getParts = () => ({ ...Object.fromEntries(Object.entries(handles).filter(([, handle]) => handle)),
    ...(placeHandles.some(Boolean) ? { places: placeHandles.find(Boolean) } : {}) });
  export const getMark = () => Object.values(handles).find(Boolean)?.getMark?.();
  export const getLegendSource = () => undefined;
  /** Load state: pending while a load is in flight; error is the message on the plot. */
  export const getStatus = () => (liveMode && liveHandle
    ? { ...liveHandle.getStatus(), error: errorText }
    : { pending, error: errorText, tiles: shown?.tiles.length ?? 0, features: shown?.data?.features?.length ?? 0, live: null });
  onDestroy(() => {
    releaseRootPending();
    scheduler.dispose();
    reportDataError(viewServices, errorOwner, "");
    viewServices?.credits.set(errorOwner, null);
  });
</script>

{#if liveMode}
  {#if !liveIssue && !request.error}
    {#key liveMode}
      <VectorTileLive bind:this={liveHandle} mode={liveMode === "2d" ? "2d" : "3d"} fixed={liveMode === "fixed"} extrude={$extrudeStore !== false}
        url={source} urlKey={urlKey(source)} requested={request.tiles} styles={request.style}
        sourceLayers={request.sourceLayers} clip={clip !== false} {origin} {unitsPerMeter} {minZoom} {maxZoom} zoomBias={$zoomBiasStore} {tileData}
        {visible} ready={fitReady} {onclick} {onload} {onerror} oncontent={() => (liveContent = true)} onrequestederror={(error) => {
          loadError = error ? prefixed(error?.message ?? String(error)) : "";
          if (error) report(onerror, { error });
        }} />
    {/key}
  {/if}
{:else if parts}
  {#each PARTS as part (part)}
    {#if part === "places"}
      {#if places && drawStyle?.places}
        <!-- On the xz plane, names stand where the parts' own rotation puts their points. -->
        <T.Group position={lift(part)} rotation={plane === "xz" ? [-Math.PI / 2, 0, 0] : [0, 0, 0]}>
          {#each places as group, i (group.key)}
            <Text bind:this={placeHandles[i]} name={LABELS.places} position={group.position} text={group.text}
              size={group.size} color={group.muted ? mixColor(drawStyle.places.color ?? drawStyle.places.fill, drawStyle.background?.fill ?? "#ffffff", 0.45) : drawStyle.places.color ?? drawStyle.places.fill} legend={false}
              {...(drawStyle.places.opacity !== undefined || opacity !== undefined ? { opacity: (drawStyle.places.opacity ?? 1) * (opacity ?? 1) } : {})}
              {...(visible !== undefined ? { visible } : {})} />
          {/each}
        </T.Group>
      {/if}
    {:else if parts[part]}
      <T.Group position={lift(part)}>
        {#if LINE_PARTS.has(part)}
          <GeoJSON bind:this={handles[part]} name={LABELS[part]} data={parts[part]} {plane} legend={false} {onclick} {...partStyle(part)}  fill={null} />
        {:else}
          <GeoJSON bind:this={handles[part]} name={LABELS[part]} data={parts[part]} {plane} fit={false} legend={false} {onclick} {...partStyle(part)} />
        {/if}
      </T.Group>
    {/if}
  {/each}
{/if}
