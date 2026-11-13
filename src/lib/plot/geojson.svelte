<script lang="ts">
  import { coordinateView as viewModeOf } from "./utils/viewContext.js";
  import { useViewServices } from "./utils/viewServices.js";
  import { literalColorChannels, legendCategories } from "./utils/literalColors.js";
  import type { FrameContext } from "./utils/internalTypes.js";
  import {VIEW_CONTEXT, AXIS_CONTEXT} from "./utils/axisFrame.js";
  import {THEME_CONTEXT,markTheme} from "./utils/theme.js";
  const coordinateView=getContext<FrameContext>(VIEW_CONTEXT);
  import { Color } from "three/webgpu";
  import { T, useThrelte, useTask } from "@threlte/core";
  import { getContext, onDestroy, untrack } from "svelte";
  import { numpy as np } from "@hmplot/jax";
  import { getOptionsContext } from "./utils/context.js";
  import { coordinateValue, angularFactor, longitudeOrigin, jointProjectionOf } from "./utils/coordinates.js";
  import { DATA_CONTEXT, isLiteral, categorical } from "./utils/categorical.js";
  import { INPUT_CONTEXT } from "./utils/inputs.js";
  import { geoFeatures } from "./utils/geoData.js";
  import { fitMapViewport, featureBounds } from "./utils/mapFit.js";
  import {
    geoRows,
    geoScope,
    featureAttribute,
    geoArray as asArray,
  } from "./utils/geoAttributes.js";
  import { prepareGeoStyles, geoColorOptions } from "./utils/geoStyles.js";
  import { checkRgbArrays } from "./utils/namedData.js";
  import { createGeoGeometryWorker } from "./utils/geoWorker.js";
  import { installGeoAppearance, setGeoOutlineTranslucent } from "./objects/geoAppearance.js";
  import { ensureOutlineOptions } from "./objects/outlines.js";
  import { GeoFaces } from "./objects/geoFaces.js";
  import { ScatterSprite } from "./objects/scatter.js";
  import { GeoSegments } from "./objects/geoSegments.js";
  import {
    ensureScatter3DOptions,
    ensureSegmentsOptions,
  } from "./objects/defaultOptions.js";
  import {
    BoundsType,
    RangeType,
    ScalarType,
    FieldType,
  } from "./objects/types.js";
  import { updateFields, shapeOf } from "./utils/data.js";
  import { settleUploads } from './rendering/uploadSettlement.js';
import { trackPreparation, afterCompletedFrame } from './rendering/viewSettlement.js';
  import { latestPreparation } from "./utils/latestPreparation.js";
  import { reportDataError } from "./utils/dataErrors.js";
  import { registryFor } from "./utils/guides.js";
  import { geoInteractions } from "./utils/geoInteractions.js";
  import { createDataIdentity } from "./utils/interaction.js";
  import { TOOLTIP_CONTEXT } from "./utils/tooltip.js";
  import { frameCompatibility, nestedCoordinateOverride } from "./utils/frameMarks.js";
  import { nonlinearFrame } from "./utils/frameMapping.js";
  import { ROOT_CONTENT_CONTEXT } from "./utils/rootFrameSelection.js";
  import { placedFrame } from "./utils/framePlacement.js";
  import { chainedCoordinates } from "./utils/coordinateNodes.js";
  import type { GeoJSONProps } from "./publicTypes.js";
  import { useLayerSlot } from "./utils/layerSlot.svelte.js";
  import { limitError } from "./utils/limits.js";
  import { scaleProps } from "./utils/scaleProps.js";
  let {
    data,
    geometry,
    featureKey,
    dataKey,
    name,
    fill = undefined,
    color,
    height = 0,
    size = undefined,
    width = undefined,
    outlineColor,
    outlineWidth,
    outlineOpacity,
    plane = "xy",
    fit = true,
    ...props
  }: GeoJSONProps = $props();
  const heightBounds = [0, 1];
  const linesOnly = $derived(fill === null);
  const { renderer, invalidate, camera } = useThrelte(),
    parent = getOptionsContext(),
    context = getContext<any>(DATA_CONTEXT),
    themeScope = getContext<any>(THEME_CONTEXT),
    painted = getContext("hmplot-surface-children");
  const viewServices = useViewServices();
  const tooltipContext = getContext<any>(TOOLTIP_CONTEXT);
  // Inputs a click or a hover on a feature writes (TODO 145.2): registered once per input, kept
  // across preparations (a release and a new registration would restore its default).
  const inputStore = getContext<any>(INPUT_CONTEXT) ?? null;
  const heldWriters = new Map<string, () => void>();
  const geoWriters = inputStore ? {
    store: inputStore,
    owners: { select: {}, hover: {} },
    hold(key: string, release: () => void) { if (!heldWriters.has(key)) heldWriters.set(key, release); },
  } : null;
  onDestroy(() => { heldWriters.forEach((release) => release()); heldWriters.clear(); });
  const featureIdentity = createDataIdentity();
  // The component owns this identity across failed and replacement preparations.
  const releaseFeatureIdentity = featureIdentity.retain();
  const rootOwner = getContext<any>(ROOT_CONTENT_CONTEXT);
  const unregisterRootContent = rootOwner?.register({ kind: "content",
    key: crypto.randomUUID(), parentKey: rootOwner.parentKey });
  onDestroy(() => unregisterRootContent?.());
  // Fit (TODO 134.24): a 2D map frames its GeoJSON's features, as VectorTile frames its tiles: a
  // city's districts were a speck in a world map. Its controls exist once the plot's camera
  // does, so a fit waits for them (a few frames at most); a given viewport wins (mapFit.js).
  let featureBox = $state<number[] | null>(null), fittedBox = "";
  $effect(() => {
    const box = featureBox;
    // Flat maps only: a globe shows the whole sphere, and a joint projection (albers-usa,
    // equal-earth) already frames its region.
    if (!box || untrack(() => viewModeOf(local) === "3d" || local.get("projection") === "orthographic" || jointProjectionOf(local))) return;
    const key = box.join(",");
    if (key === fittedBox) return;
    let frame = 0, attempts = 0;
    const attempt = () => {
      const rect = camera?.current?.userData?.plotRect ?? { width: renderer.domElement?.clientWidth ?? 0, height: renderer.domElement?.clientHeight ?? 0 };
      if (untrack(() => fitMapViewport(local, viewServices?.navigation.controls.current, rect, box))) fittedBox = key;
      else if (++attempts < 240) frame = requestAnimationFrame(attempt);
    };
    attempt();
    return () => cancelAnimationFrame(frame);
  });
  // Stage 22: GeoJSON bypasses NamedMark, so it anchors its own layer slot; faces, lines, and
  // points keep that order within it.
  let layerMarker = $state<HTMLTemplateElement>();
  useLayerSlot(() => layerMarker);
  const display = ensureScatter3DOptions(parent);
  ensureSegmentsOptions(parent);
  const local = parent.splitUnique(
    untrack(() => name),
    "mark",
    "GeoJSON",
  );
  display.push(...ensureOutlineOptions(local));
  local.ensure(
    "heightBounds",
    new BoundsType({ defaultValue: [0, 1], label: "Height bounds" }),
  );
  local.ensure(
    "heightRange",
    new RangeType({
      defaultValue: [0, 1],
      min: 0,
      max: 1,
      label: "Height range",
    }),
  );
  local.set("outlineColor", "#f4f2ed");
  local.set("outlineWidth", 0.7);
  const lineOptions = local.splitUnique("boundaries", "mark", "Boundaries"),
    pointOptions = local.splitUnique("points", "mark", "Points");
  lineOptions.populate({
    legend: false,
    interpolation: "angular",
    widthTransform: "linear",
    widthBounds: [0, 1],
    widthRange: [0, 1],
  });
  pointOptions.populate({
    legend: false,
    scaleTransform: "linear",
    scaleBounds: [0, 1],
    scaleRange: [0, 1],
    sizeAttenuation: false,
    shape: "circle",
  });
  // Room for a first allocation only: updateFields grows each mark to the next power of two its
  // prepared geometry needs (TODO 29.2). A 250,000-instance default costs 16 MB of instance
  // matrices per mark, and basemap tiles (TODO 35) mount a dozen GeoJSON marks each. The start
  // stays above what fits a uniform buffer: there three's InstanceNode writes the count into the
  // shader, so every capacity would compile its own pipeline (TODO 17.6b).
  const uniformLimit = (renderer as any).backend?.device?.limits?.maxUniformBufferBindingSize ?? 65536;
  const initialCapacity = 2 ** Math.ceil(Math.log2(uniformLimit / 64 + 1));
  for (const markOptions of [local, lineOptions, pointOptions]) markOptions.set("maxElements", initialCapacity);
  const faces: any = new GeoFaces(local, viewServices, invalidate),
    lines = new GeoSegments(lineOptions, viewServices, invalidate),
    points = new ScatterSprite(pointOptions, viewServices, invalidate);
  points.componentName = lines.componentName = "GeoJSON";
  for (const mark of [faces, lines, points])
    installGeoAppearance(mark, mark === lines);
  const selection = { auto: {}, hidden: {} };
  let revision = $state(0),
    version = 0,
    geometryPreparations = 0,
    alive = true,
    active: any = null,
    pending: Promise<unknown> = Promise.resolve(),
    cache: any;
  let events = $state.raw<any>({}),
    stops = [];
  const stopTheme=themeScope?.subscribe?.(()=>untrack(()=>revision++));
  // GeoJSON renders in mesh space outside the per-vertex frame mapping. Frames publish
  // their placement and ranges after this component first prepares, so re-check when
  // the frame topology changes the answer.
  let frameSupport = "";
  const frameCheck = () =>
    untrack(() => {
      try {
        // A spherical map child (a ranged globe or map, a placed inset) maps
        // its faces and boundaries vertex by vertex through the whole chain,
        // and cuts them at its own horizon and seam. Worker geometry is
        // subdivided to a few degrees, so a bending ancestor (log/sqrt or a
        // polar parent) bends it along with every other mark.
        const nested = local.get("coordinates") === "spherical" && chainedCoordinates(local);
        return frameCompatibility("GeoJSON", { nonlinear: !nested && !!nonlinearFrame(local),
          anchored: !!placedFrame(local) && !nested,
          nestedCoordinates: nested ? null : nestedCoordinateOverride(local) });
      } catch (error) { return error.message; }
    });
  const stopFrameTopology = local.on(() => {
    if (frameCheck() !== frameSupport) untrack(() => revision++);
  }, "_frameTopology");
  const owner = {},
    report = (message) =>
      reportDataError(viewServices, owner, message ? `GeoJSON: ${message}` : "");
  const geometryWorker = createGeoGeometryWorker();
  const preparations = latestPreparation(signal => {
    const drawn = afterCompletedFrame(viewServices, signal);
    // Errors retain the previous mesh too. Request its draw so recovery does not wait for a
    // frame that nobody invalidated after a failed worker job.
    if (!signal.aborted) invalidate();
    return drawn;
  });
  let detail = $state(3);
  let detailTimer: ReturnType<typeof setTimeout>, requestedDetail = 3, lastDetailDistance = NaN;

  useTask(
    () => {
      const c: any = camera.current;
      if (
        !c?.isPerspectiveCamera ||
        local.get("coordinates") !== "spherical" ||
        local.get("sphericalView") === "projected"
      )
        return;
      const distance = Math.max(
        0.01,
        c.position.length() - local.get("baseRadius"),
      );
      const pixels =
        (renderer.domElement.clientHeight * local.get("baseRadius")) /
        (2 * distance * Math.tan((c.fov * Math.PI) / 360));
      const step = Math.max(
        0.5,
        Math.min(
          5,
          Math.pow(
            2,
            Math.floor(
              Math.log2(
                (Math.sqrt((8 * 0.5) / Math.max(1, pixels)) * 180) / Math.PI,
              ),
            ),
          ),
        ),
      );
      // Never coarsen an already prepared map during camera movement. Refining
      // only after the gesture settles avoids repeated worker/upload churn.
      if (step !== requestedDetail || Math.abs(distance - lastDetailDistance) > 1e-6) {
        lastDetailDistance = distance;
        requestedDetail = step;
        clearTimeout(detailTimer);
        if (step < detail) detailTimer = setTimeout(() => {
          if (alive) detail = step;
        }, 250);
      }
    },
    { autoInvalidate: false },
  );
  // A single-extent (nested) flat map splits its features at its own
  // antimeridian, the longitude origin ± 180 degrees. A root map repeats,
  // and an orthographic map has no seam. A joint projection's map (equal-earth,
  // albers, ...) is one extent around its center longitude, root or nested.
  const seamLongitude = () => {
    const joint = jointProjectionOf(local);
    if (joint) return (joint.center / angularFactor(local) + longitudeOrigin(local)) * angularFactor(local) * 180 / Math.PI;
    return local.get("coordinates") === "spherical" && chainedCoordinates(local) &&
      local.get("projection") !== "orthographic"
      ? longitudeOrigin(local) * angularFactor(local) * 180 / Math.PI : 0;
  };
  let coordinateKey = "";
  const stopOptions = local.on(() => {
    const key = JSON.stringify(
      [
        "coordinates",
        "sphericalView",
        "angleUnit",
        "anglePeriod",
        "xbounds",
        "projection",
        "outlineOpacity",
        "heightBounds",
        "heightRange",
        "outlineColor",
        "outlineWidth",
      ].map((k) => local.get(k)).concat(untrack(seamLongitude)),
    );
    if (key !== coordinateKey) {
      coordinateKey = key;
      untrack(() => revision++);
    }
  });
  // heightScale (TODO 137.4): a continuous() scale's domain (by default [0, 1]) and range (by
  // default [0, 1]) are the mark's heightBounds and heightRange. A shared scale's updates redraw.
  let heightScaleVersion = $state(0);
  $effect(() => {
    const scale = props.heightScale;
    if (!scale?.subscribe) return;
    return scale.subscribe(() => heightScaleVersion++);
  });
  const heightScale = $derived.by(() => {
    heightScaleVersion;
    const scale = props.heightScale;
    if (scale === undefined) return { bounds: heightBounds, range: [0, 1], error: "" };
    if (!scale?.isContinuous)
      return { bounds: heightBounds, range: [0, 1], error: `GeoJSON.heightScale is a continuous() scale, such as continuous({ domain: [0, 100], range: [0, 1] }).` };
    // Height is a linear map from an explicit domain (default [0, 1]) to a range; a transform, a
    // midpoint or a "symmetric" domain would be dropped, so each is an error.
    const config: Record<string, any> = scale.normalization.snapshot();
    const unsupported = config.transform !== "linear" ? `transform "${config.transform}"`
      : config.midpoint !== undefined ? "a midpoint" : config.symmetric ? 'a "symmetric" domain' : "";
    return { bounds: config.domain ?? [0, 1], range: scale.range ?? [0, 1],
      error: unsupported && `GeoJSON.heightScale is linear from an explicit domain to a range; ${unsupported} is not supported.` };
  });
  $effect(() => {
    local.populate({ ...props, ...(typeof outlineOpacity === "number" ? {outlineOpacity} : {}),
      heightBounds: heightScale.bounds, heightRange: heightScale.range });
    local.setDisplayList([
      ...display.filter(
        (k) =>
          ![
            "shape",
            "detail",
            "scaleBounds",
            "scaleRange",
            "scaleTransform",
            "sizeAttenuation",
          ].includes(k),
      ),
      "heightBounds",
      "heightRange",
      "missingColor",
    ]);
  });
  $effect(() => {
    revision;
    frameSupport = frameCheck();
    // The legend's visibility sync may show a mark again on any option
    // change, so a diagnosed map also drops its instances; the next
    // successful preparation restores them.
    for (const mark of [faces, lines, points]) {
      mark.visible = !frameSupport;
      if (frameSupport) mark.count = 0;
    }
    if (frameSupport) {
      preparations.cancel();
      version++;
      untrack(() => report(frameSupport));
      invalidate();
      return;
    }
    const scope = context?.read(),
      input = data,
      field = geometry,
      theme = markTheme(themeScope?.read?.() ?? {}, "GeoJSON"),
      localOutlineColor = local.get("outlineColor"),
      localOutlineWidth = local.get("outlineWidth"),
      localOutlineOpacity = local.get("outlineOpacity"),
      // A where() of colors on a color channel (utils/literalColors.js), as marks take it.
      args = literalColorChannels({
        ...theme,
        fill: fill ?? theme.fill ?? "#718b9b",
        color: color ?? theme.color ?? (linesOnly ? "#425669" : undefined),
        height,
        size: size ?? theme.size ?? 8,
        width: width ?? theme.width ?? 1,
        outlineColor: outlineColor ?? (localOutlineColor !== "#f4f2ed" ? localOutlineColor : theme.outlineColor) ?? localOutlineColor,
        outlineWidth: outlineWidth ?? (localOutlineWidth !== 0.7 ? localOutlineWidth : theme.outlineWidth) ?? localOutlineWidth,
        outlineOpacity: typeof outlineOpacity === "number" || local.isExplicit("outlineOpacity") ? localOutlineOpacity
          : outlineOpacity ?? theme.outlineOpacity ?? localOutlineOpacity,
        ...props,
      }, scope);
    const join = { featureKey, dataKey };
    const options = {
      geographic: local.get("coordinates") === "spherical",
      // Projection formulas run on the GPU; only Mercator's latitude cap changes geometry.
      projection: local.get("projection") === "mercator" ? "mercator" : "equirectangular",
      angularStep: detail,
      linesOnly: linesOnly,
      polygonOutlines: linesOnly || args.outlineWidth !== 0,
      // Flat maps need neither hidden underside triangles nor degenerate extrusion walls.
      flat: args.height === 0,
      seamLongitude: untrack(seamLongitude),
      // This budget covers several separate buffers. The device's storage
      // binding limit applies to each buffer, checked after preparation.
      maxBytes: Math.min(
        local.get("coordinates") === "spherical" ? 128 * 1024 * 1024 : 256 * 1024 * 1024,
        ((renderer as any).backend?.device?.limits.maxStorageBufferBindingSize ?? 128 * 1024 * 1024) *
          (local.get("coordinates") === "spherical" ? 1 : 2),
      ),
    };
    const bounds = local.get("heightBounds"),
      range = local.get("heightRange"),
      geoScale = (Math.PI / 180) / angularFactor(local),
      geoOrigin = longitudeOrigin(local);
    const v = ++version;
    const abortController = new AbortController();
    const signal = abortController.signal,
      releaseScope = scope?.retain?.();
    let released = false;
    const release = () => { if (!released) { released = true; releaseScope?.(); } };
    // Finish one active mesh and coalesce its waiting replacements. Canceling the worker on
    // each longitude input prevented any geometry from publishing until the gesture stopped.
    const work = async () => {
      let prepared,
        own = [],
        joinedScope,
        rows;
      const ownArray = (a) => (own.push(a), a);
      try {
        if (plane === "xz" && (local.get("coordinates") !== "cartesian" || viewModeOf(local) !== "3d"))
          throw Error('plane="xz" requires a Cartesian 3D view.');
        scaleProps(props, "GeoJSON");
        if (heightScale.error) throw Error(heightScale.error);
        if (input !== undefined && field !== undefined)
          throw Error("Supply data or geometry, not both.");
        const column = field === undefined ? null : scope?.resolve(field);
        if (field !== undefined && !column?.isGeometryColumn)
          throw Error("geometry must reference a GeoJSON geometry column.");
        const features = column?.features ?? geoFeatures(input),
          source = column?.source ?? input;
        // The box a 2D map frames (TODO 134.24), once the features are known.
        featureBox = fit ? featureBounds(features) : null;
        if (
          !Array.isArray(range) ||
          range.length !== 2 ||
          !range.every((v) => Number.isFinite(v) && v >= 0) ||
          range[1] < range[0]
        )
          throw Error(
            `GeoJSON.heightScale's range must be a finite nonnegative increasing pair.`,
          );
        if (
          !Array.isArray(bounds) ||
          bounds.length !== 2 ||
          !bounds.every(Number.isFinite) ||
          bounds[1] <= bounds[0]
        )
          throw Error(`GeoJSON.heightScale's domain must be a finite increasing pair.`);
        if (painted && args.height !== 0)
          throw Error(
            "Heatmap texture children support flat GeoJSON only; remove height.",
          );
        const key = JSON.stringify(options),
          geometries = features.map((f) => f.geometry);
        if (
          cache?.key !== key ||
          cache?.geometries?.length !== geometries.length ||
          geometries.some((g, i) => g !== cache?.geometries[i])
        ) {
          const mesh = await geometryWorker.prepare(source, options, signal);
          geometryPreparations++;
          if (signal.aborted) return;
          const previous = cache;
          cache = { source, key, mesh, geometries, gpu: new Map() };
          previous?.gpu.forEach((a) => a.dispose());
          previous?.rows?.dispose();
        }
        const mesh = cache.mesh;
        // GeoJSON expands one feature into many triangles and boundary segments.
        // The ordinary mark capacity is an instance count, not a feature count;
        // silently clamping it made larger maps appear almost empty.
        const storageLimit = (renderer as any).backend?.device?.limits.maxStorageBufferBindingSize ?? 128 * 1024 * 1024;
        const capacities = [[faces, mesh.faces], [lines, mesh.lines], [points, mesh.points]] as any;
        for (const [mark, group] of capacities) {
          const required = group.feature.length;
          if (required * 16 > storageLimit)
            throw limitError("storage", { component: "GeoJSON", what: `drawing ${required.toLocaleString("en-US")} ${mark === faces ? "face" : mark === lines ? "line" : "point"} instances`,
              count: required * 16, limit: storageLimit, hint: "Reduce source detail or displayed features." });
        }
        const rowKey = JSON.stringify([
          join.featureKey,
          join.dataKey,
          features.map((f) =>
            join.featureKey === "$id" ? f.id : f.properties?.[join.featureKey],
          ),
        ]);
        const identifiers =
          join.dataKey === undefined ? null : scope?.get(join.dataKey);
        const indexed = column?.indices;
        const gpu = (array) => {
          if (!cache.gpu.has(array))
            cache.gpu.set(
              array,
              array.length
                ? np.array(array)
                : np.zeros([0], {
                    dtype:
                      array instanceof Uint32Array ? np.uint32 : np.float32,
                  }),
            );
          return cache.gpu.get(array).ref;
        };
        if (
          cache.rowKey !== rowKey ||
          cache.identifiers !== identifiers ||
          cache.indexed !== indexed
        ) {
          const next = await geoRows(
            features,
            scope,
            column,
            join.featureKey,
            join.dataKey,
            signal,
          );
          cache.rows?.dispose();
          cache.rows = next;
          cache.rowKey = rowKey;
          cache.identifiers = identifiers;
          cache.indexed = indexed;
        }
        rows = ownArray(cache.rows.ref);
        if (signal.aborted) return;
        joinedScope = geoScope(
          features,
          scope,
          rows,
          join.featureKey !== undefined,
          Boolean(column),
          featureIdentity,
        );
        const resolvedHeight = isLiteral(args.height)
          ? args.height.value
          : joinedScope.resolve(args.height);
        if (typeof resolvedHeight === "string")
          throw Error(`Missing height column: ${resolvedHeight}`);
        const raw = ownArray(
          typeof resolvedHeight === "number"
            ? np.full([features.length], resolvedHeight)
            : asArray(resolvedHeight),
        );
        if (raw.shape.length !== 1 || raw.shape[0] !== features.length)
          throw Error("height requires one numeric value per feature.");
        const mapped = ownArray(
          np.where(
            np.logicalAnd(
              np.isfinite(raw.ref),
              join.featureKey === undefined
                ? np.ones([features.length]).greater(0)
                : rows.ref.greaterEqual(0),
            ),
            np
              .clip(raw.ref.sub(bounds[0]).div(bounds[1] - bounds[0]), 0, 1)
              .mul(range[1] - range[0])
              .add(range[0]),
            0,
          ),
        );
        // A feature-level dummy position carries category masking without exposing vertices.
        const pos = ownArray(np.zeros([features.length, 3]));
        joinedScope.scale = (k) =>
          scope?.scale(k) ?? (selection.auto[k] ??= categorical());
        prepared = prepareGeoStyles(
          { ...args, position: pos },
          joinedScope,
          local,
          selection,
        );
        const settings = prepared.props,
          stroke = prepared.stroke;
        // A numeric fill or line color maps through its domain, else its values' extent (TODO 64.9).
        const colorScales = await geoColorOptions(args, prepared, signal);
        // GPU-array RGB rows: the 0-1 / 0-255 range check, as on every other mark.
        await checkRgbArrays(prepared.rgbChecks);
        if (signal.aborted || !alive) return;
        const visible = ownArray(
          np.logicalAnd(
            np.logicalAnd(
              np.isfinite(asArray(settings.position).slice([], 0)),
              np.isfinite(asArray(stroke.position).slice([], 0)),
            ),
            column?.indices
              ? rows.ref.greaterEqual(0)
              : np.ones([features.length]).greater(0),
          ),
        );
        const arrays: any = { faces: {}, lines: {}, points: {} };
        for (const [family, group] of Object.entries(mesh) as any) {
          if (!["faces", "lines", "points"].includes(family)) continue;
          const ids = ownArray(gpu(group.feature).astype(np.int32));
          const gather = (value) =>
            featureAttribute(value, ids, features.length, own);
          const mask = ownArray(
            np.take(visible.ref, ids.ref, 0).reshape([-1, 1]),
          );
          const h = ownArray(np.take(mapped.ref, ids.ref, 0));
          const position = (a, layers = false) => {
            const p = ownArray(gpu(a).reshape([-1, 3]));
            const rawXY = ownArray(p.ref.slice([], [0, 2]));
            const xy = options.geographic
              ? ownArray(np.concatenate([
                  rawXY.ref.slice([], [0, 1]).mul(geoScale).add(geoOrigin),
                  rawXY.ref.slice([], [1, 2]).mul(geoScale),
                ], 1))
              : ownArray(rawXY.ref);
            const rawZ = ownArray(p.ref.slice([], 2));
            const z = layers
              ? ownArray(rawZ.ref.mul(h.ref))
              : ownArray(rawZ.ref);
            return ownArray(
              np.where(
                mask.ref,
                np.concatenate([xy.ref, z.ref.reshape([-1, 1])], 1),
                np.nan,
              ),
            );
          };
          if (family === "faces") {
            arrays.faces = {
              position: position(group.a),
              cornerB: position(group.b),
              cornerC: position(group.c),
              height: h,
              fill: gather(settings.fill),
              ...(settings.categoryColor
                ? { categoryColor: gather(settings.categoryColor) }
                : {}),
            };
          }
          // Without fill, a polygon's boundary is a line, in the line color and width (a
          // column's too; TODO 64): no outline flag, so no outline paint.
          const outlined = family !== "lines" ? null : ownArray(linesOnly
            ? np.zeros([group.feature.length], { dtype: np.float32 }) : gpu(group.outline));
          if (family === "lines") {
            const outline = outlined;
            // gather's arrays stay owned (released with `own`), and np.where consumes its
            // arguments: hand it new references (a per-feature width freed one twice).
            const borrowed = (value) => value?.ref ?? value;
            arrays.lines = {
              start: position(group.start, true),
              end: position(group.end, true),
              width: ownArray(
                np.where(
                  outline.ref.greater(0),
                  borrowed(gather(settings.outlineWidth)),
                  borrowed(gather(settings.width)),
                ),
              ),
              color: gather(stroke.color),
              geoOutlineOpacity: ownArray(np.where(outline.ref.greater(0), borrowed(gather(settings.outlineOpacity)), 1)),
              ...(stroke.categoryColor
                ? { categoryColor: gather(stroke.categoryColor) }
                : {}),
            };
          }
          if (family === "points")
            arrays.points = {
              position: position(group.position),
              fill: gather(settings.fill),
              size: gather(settings.size),
              geoOutlineColor: gather(settings.categoryOutline ?? settings.outlineColor),
              outlineOpacity: gather(settings.outlineOpacity),
              geoPointOutline: ownArray(
                asArray(gather(settings.outlineWidth)).div(
                  np.maximum(asArray(gather(settings.size)).div(2), 1),
                ),
              ),
              ...(settings.categoryColor
                ? { categoryColor: gather(settings.categoryColor) }
                : {}),
            };
          const colorValue = family === "lines" ? stroke.color : settings.fill;
          let present =
            join.featureKey === undefined
              ? np.ones([features.length]).greater(0)
              : rows.ref.greaterEqual(0);
          if (
            typeof colorValue !== "string" &&
            typeof colorValue !== "number"
          ) {
            const a = ownArray(asArray(colorValue));
            if (a.shape.length === 1)
              present = np.logicalAnd(present, np.isfinite(a.ref));
          }
          const availability = ownArray(
            np.take(present, ids.ref, 0).astype(np.float32),
          );
          if (family === "lines") {
            const flags = ownArray(
              availability.ref.add(outlined.ref.mul(2)).reshape([-1, 1]),
            );
            const outline = gather(settings.categoryOutline ?? settings.outlineColor);
            let rgb;
            if (typeof outline === "string") {
              const c = new Color(outline);
              rgb = np
                .ones([group.feature.length, 3])
                .mul(np.array([c.r, c.g, c.b]));
            } else rgb = asArray(outline);
            arrays.lines.geoPaint = ownArray(
              np.concatenate([rgb, flags.ref], 1),
            );
          } else arrays[family].geoPresent = availability;
        }
        if (signal.aborted || !alive) return;
        const finish = viewServices.updates.gate.current?.();
        try {
          const topology = JSON.stringify([
            geometryPreparations,
            settings._categoryTopology,
          ]);
          for (const mark of [faces, lines, points])
            mark.options.set("_categoryTopology", topology);
          setGeoOutlineTranslucent(lines, typeof settings.outlineOpacity !== "number" || settings.outlineOpacity < 1);
          // The faces' and points' colors (local), and the lines' own when they have a color
          // channel of their own; else the lines follow the fill.
          // The scales' options are derived (TODO 136.7): below anything authored or edited.
          for (const [options, scaleOptions] of [[local, colorScales.fill], [lineOptions, colorScales.color === colorScales.fill ? null : colorScales.color]] as any)
            for (const key of ["valueBounds", "valueTransform", "valueTransformConstant", "valueMidpoint", "cmapIndex", "quantize", "levels", "valueMissing"]) {
              const value = scaleOptions?.[key];
              if (value !== undefined && options.has(key)) options.derive(key, value);
              // A scale without a missing color leaves the theme's (TODO 73.3).
              else if (options === lineOptions || key === "valueMissing") options.clear(key, { layer: "derived" });
            }
          for (const [mark, values, primary] of [
            [faces, arrays.faces, "position"],
            [lines, arrays.lines, "start"],
            [points, arrays.points, "position"],
          ] as any) {
            mark.setCategoryColor(values.categoryColor !== undefined);
            await updateFields(mark, values, primary);
          }
          await settleUploads(viewServices);
          if (signal.aborted || !alive) return;
          const previous = active;
          active = { mesh, features, rows: rows.ref, scope: joinedScope, version: v };
          joinedScope = null;
          previous?.interactions?.dispose({ keepPreview: true });
          previous?.scope.dispose();
          previous?.rows.dispose();
          const guideMark = linesOnly ? lines : faces;
          for (const [channel, mapping] of Object.entries(
            prepared.metadata,
          ) as any) {
            const key = channel === "fill" ? "categoryFill" : "categoryStroke";
            local.ensure(
              key,
              new FieldType({ defaultValue: null, ui: { ui: "categories" } }),
            );
            local.derive(key, { scale: mapping.scale, channel });
            local.setDisplayList([
              ...new Set([...(local.displayList ?? []), key]),
            ]);
          }
          const toggle = (channel: string, value: unknown, isolate?: boolean) => {
            const hidden = (selection.hidden[channel] ??= new Set());
            if (isolate) {
              const old = selection["isolation"];
              if (old?.value === value) {
                selection.hidden[channel] = old.hidden;
                delete selection["isolation"];
              } else {
                selection["isolation"] = { value, hidden: new Set(hidden) };
                selection.hidden[channel] = new Set(
                  prepared.metadata[channel].scale.domain.filter(
                    (v) => v !== value,
                  ),
                );
              }
            } else hidden.has(value) ? hidden.delete(value) : hidden.add(value);
            revision++;
          };
          active.interactions = geoInteractions({
            scope: active.scope, props: args, marks: { faces, lines, points }, guideMark,
            featureIndex: family => gpu(mesh[family].feature),
            view: viewServices, plotDefault: () => tooltipContext?.plotDefault,
            legend: { categories: legendCategories(prepared.metadata), temporal: {}, channelTitles: {}, refresh: () => {}, toggle },
            report: error => report(error?.message ?? String(error)),
            writers: geoWriters,
          });
          stops.forEach((stop) => stop());
          stops = [...prepared.scales].map((scale) =>
            scale.subscribe(() => revision++),
          );
          registryFor(local)?.notify();
          events = Object.fromEntries(
            Object.entries(active.interactions.events)
              .filter(
                ([k, val]) =>
                  /^on(pointer|nearest|click|dblclick|contextmenu)/.test(k) &&
                  typeof val === "function",
              )
              .map(([key, handler]) => [
                key,
                // A click on nothing names no feature: it goes as it came (TODO 145.2: it restores
                // a click-written input's default).
                key === "onpointermissed" ? () => handler :
                (family) => async (event) => {
                  const frame = active,
                    index = event.instanceId,
                    group = frame?.mesh[family];
                  if (
                    !group ||
                    !Number.isInteger(index) ||
                    index < 0 ||
                    index >= group.feature.length
                  )
                    return;
                  const i = group.feature[index];
                  const matched =
                    join.featureKey === undefined || typeof args[key] !== "function"
                      ? undefined
                      : Number(
                          (
                            await np
                              .take(
                                frame.rows.ref,
                                np.array(i, { dtype: np.int32 }),
                                0,
                              )
                              .data()
                          )[0],
                        );
                  if (active !== frame || !alive) return;
                  (handler as Function)({
                    ...event,
                    rowIndex: i,
                    featureIndex: i,
                    featureId: frame.features[i].id,
                    feature: frame.features[i],
                    geometryPart: frame.mesh.parts[group.part[index]],
                    worldPoint: event.point,
                    dataCoordinates:
                      coordinateValue(local, event.point.toArray()) ??
                      event.axisValue,
                    geographicCoordinates:
                      local.get("coordinates") === "spherical"
                        ? coordinateValue(local, event.point.toArray())?.map(
                            (x, i) => i === 0
                              ? ((x - longitudeOrigin(local)) * angularFactor(local) * 180) / Math.PI
                              : i === 1 ? (x * angularFactor(local) * 180) / Math.PI : x,
                          )
                        : undefined,
                    tableRowIndex:
                      matched === undefined || matched < 0
                        ? undefined
                        : matched,
                  });
                },
              ]),
          );
          report("");
          invalidate();
        } finally {
          await finish?.({ skipPreparations: true });
        }
      } catch (e) {
        if (e.name !== "AbortError" && v === version && alive) {
          report(e.message);
          console.error(e);
        }
      } finally {
        prepared?.dispose();
        joinedScope?.dispose();
        own.forEach((a) => a.dispose());
        release();
      }
    };
    pending = trackPreparation(viewServices, preparations.run(work, started => {
      abortController.abort();
      if (!started) release(); // Active readers retain the scope through their finally block.
    }));
  });
  const handlers = (family) =>
    Object.fromEntries(
      Object.entries(events).map(([k, f]) => [k, (f as Function)(family)]),
    );
  export const getLegendSource = () => (linesOnly ? lines : faces).guideHandle;
  export const getMark = () => linesOnly ? lines : faces;
  export const whenSettled = () => pending;
  export const getDiagnostics = () => ({
    geometryPreparations,
    geometryBytes: cache?.mesh.bytes ?? 0,
    features: active?.features.length ?? 0,
    cachedColumns: cache?.gpu.size ?? 0,
    faceInstances: faces.count,
    faceCapacity: faces.manager.maxElements,
    lineInstances: lines.count,
    lineCapacity: lines.manager.maxElements,
  });
  onDestroy(() => {
    clearTimeout(detailTimer);
    alive = false;
    version++;
    const settled = preparations.dispose();
    geometryWorker.dispose();
    stopOptions();
    stopFrameTopology();
    stopTheme?.();
    stops.forEach((stop) => stop());
    report("");
    settled.finally(async () => {
      await settleUploads(viewServices);
      active?.interactions?.dispose();
      active?.scope.dispose();
      active?.rows.dispose();
      releaseFeatureIdentity();
      cache?.gpu.forEach((a) => a.dispose());
      cache?.rows?.dispose();
      faces.dispose();
      lines.dispose();
      points.dispose();
      pointOptions.dispose();
      lineOptions.dispose();
      local.dispose();
    });
  });
</script>

<template bind:this={layerMarker} data-plot-layer></template>
<T.Group rotation={plane === "xz" ? [-Math.PI / 2, 0, 0] : [0, 0, 0]}>
  <T is={faces} {...handlers("faces")} />
  <T is={lines} {...handlers("lines")} />
  <T is={points} {...handlers("points")} />
</T.Group>
