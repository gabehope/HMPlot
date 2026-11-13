<script>
  import { createScreenMapping } from "./utils/screenMapping.js";
  import { useViewServices } from "./utils/viewServices.js";
  import { plotGutters } from "./utils/plotLayout.js";
  import { getContext, setContext, onDestroy, untrack } from "svelte";
  import { useThrelte, useTask } from "@threlte/core";
  import { getOptionsContext, setOptionsContext } from "./utils/context.js";
  import {
    VIEW_CONTEXT,
    AXIS_CONTEXT,
    groupedAxis,
  } from "./utils/axisFrame.js";
  import { facetService } from "./utils/facetService.js";
  import { GUIDE_CONTEXT } from "./utils/guides.js";
  import { unionDomains } from "./utils/markDomains.js";
  import { categoryBounds } from "./utils/categorical.js";
  import { dataDomains } from "./utils/dataDomains.svelte.js";
  import { screenPaddedDomain, projectedInsets } from "./utils/labelBounds.js";
  import { labelInsetSides, plotRectangle } from "./utils/viewport.js";
  import { ensureBoundsAnimation, createFrameAnimation } from "./utils/animation.js";
  import {
    axisLayout,
    axisKey,
    polarAxisLayout,
    validateAxis,
    readAxis,
    validateRules,
    validateBands,
    niceDomain,
  } from "./utils/axes.js";
  import { ensureAxisOptions } from "./utils/axisOptions.js";
  import { Matrix4 } from "three/webgpu";
  import { placedFrame, placementMatrix, sphericalTangentBasis, validatePlacement } from "./utils/framePlacement.js";
  import { frameDimensionMapping, frameDimensionStages } from "./utils/frameMapping.js";
  import { configuresScale, frameOwnership } from "./utils/frameModel.js";
  import { AUTOMATIC_RANGES, createScaleRegistry } from "./utils/scaleResources.js";
  import { TRANSFORM_NAMES } from "./utils/scaleTransforms.js";
  import {
    ScalarType,
    BooleanType,
    SelectType,
    FieldType,
    ColormapType,
    RangeType,
    IntegerType,
  } from "./objects/types.js";
  import { reportDataError } from "./utils/dataErrors.js";
  import { normalizeProjectionCenter, installCoordinateModeDefaults, placedExtent } from "./utils/coordinates.js";
  import { CoordinateFrame, validateAngularAxis, boundaryCoordinateDefaults } from "./utils/coordinateFrame.js";
  import { onViewContext } from "./utils/viewContext.js";
  import { COLORMAP_NAMES as COLOR_SCALE_NAMES } from "./utils/colormap.js";
  import AxisRules from "./scenes/axisRules.svelte";
  import GlobeGuides from "./scenes/globeGuides.svelte";
  import Axes3D from "./scenes/axes3d.svelte";
  import { resolveAxisTitle, explicitAxisLabel, combineTitles } from "./utils/axisTitleRules.js";
  import { writable } from "svelte/store";
  import { cartesianMaskSupported, frameMaskPolygon, rectanglePolygon } from "./utils/axisMask.js";
  import { axisGuidesEnabled, cartesian2D, globe2D, hasAxisOverride } from "./utils/axisStyle.js";
  import { trackPreparation, changeSettled } from "./rendering/viewSettlement.js";
  let {
    x = {},
    y = {},
    z = {},
    children,
    name = undefined,
    autoBounds = true,
    axisMask = undefined,
    axisFrame = undefined,
    animateBounds = undefined,
    boundsDuration = undefined,
    boundsEasing = undefined,
    frameMode = false,
    rootLogicalKey = undefined,
    placement: placementProp = undefined,
    coordinates = undefined,
    sphericalView = undefined,
    angleUnit = undefined,
    anglePeriod = undefined,
    baseRadius = undefined,
    radialScale = undefined,
    polarAxis = undefined,
    projection = undefined,
    projectionCenter = undefined,
    parallels = undefined,
    internal = false,
    scaleDefaults: appearanceScales = undefined,
    _facetCell = false,
    ...extraProps
  } = $props();
  $effect(() => {
    if (extraProps.pole !== undefined)
      throw Error("Frame pole was removed; use projectionCenter=[longitude, latitude].");
  });
  const view = getContext(VIEW_CONTEXT),
    parentFrame = getContext(AXIS_CONTEXT),
    facet = facetService();
  if (!view)
    throw Error("Axes must be placed inside a Plot.");
  // The view's root frame (the Plot's own coordinates, the one frame with no enclosing frame) draws
  // in the view's options; a nested frame splits its own, inheriting dimensions independently.
  const viewRoot = !parentFrame;
  const parent = getOptionsContext(),
    options = viewRoot
      ? parent
      : parent.splitUnique(
          untrack(() => name),
          "axis",
          untrack(() => frameMode) ? "Frame" : "Axes",
        );
  const coordinateFrame = new CoordinateFrame(options);
  // An embedded Facet cell: every cell's marks share legend definitions.
  if (untrack(() => _facetCell)) options.definitionAlias = "*";
  options.viewOptions = view.options().viewOptions;
  try {
    options.categoryAxes = untrack(() => ({
      ...groupedAxis({ x, y, z }, { allowAuto: true }).scales,
    }));
  } catch {}
  const styles = options.ensureChild("plot");
  if (!viewRoot)
    options.setPresentation({
      kind: "axis",
      label: untrack(() => name) || (untrack(() => frameMode) ? "Frame" : "Axes"),
    });
  ensureAxisOptions(styles);
  styles.ensure("axisMask", new BooleanType({ defaultValue: false }));
  styles.ensure("axisFrame", new BooleanType({ defaultValue: false }));
  for (const a of "xyz") {
    styles.ensure(
      "frame" + a.toUpperCase() + "Show",
      new BooleanType({ defaultValue: true }),
    );
    if (a !== "z")
      styles.ensure(
        "frame" + a.toUpperCase() + "Side",
        new SelectType({
          defaultValue: a === "x" ? "bottom" : "left",
          options: a === "x" ? ["bottom", "top"] : ["left", "right"],
        }),
      );
  }
  setOptionsContext(options);
  const { renderer, camera, invalidate } = useThrelte();
  const viewServices = useViewServices();
  const screenMapping = createScreenMapping(() => ({ options, camera: camera.current,
    width: view.width(), height: view.height() }));
  viewServices.lifecycle.frameCallbacks.add(screenMapping.draw);
  onDestroy(() => {
    viewServices.lifecycle.frameCallbacks.delete(screenMapping.draw);
    screenMapping.dispose();
  });
  export const getScreenMapping = screenMapping.getScreenMapping;
  export const subscribeScreenMapping = screenMapping.subscribeScreenMapping;
  // Domains whose ends are reductions of the data (extent(column, {where})), read as it changes.
  const readDomains = dataDomains(() => ({ x, y, z }), viewServices);
  ensureBoundsAnimation(options);
  const frameAnimation = createFrameAnimation(renderer, options, invalidate);
  onDestroy(() => { frameAnimation.dispose(); holding?.done?.(); holding = null; });
  const appliedAnimation = new Set();
  $effect(() => {
    const values = { animateBounds, boundsDuration, boundsEasing };
    untrack(() => {
      for (const [key, value] of Object.entries(values)) {
        if (value !== undefined) { options.set(key, value); appliedAnimation.add(key); }
        else if (appliedAnimation.delete(key)) options.clear(key);
      }
    });
  });
  let revision = $state(0),
    domainRevision = $state(0),
    valid = $state.raw({ values: {}, scales: {} });
  let promoted = $state(false);
  let acceptedConfig = $state.raw({ x: {}, y: {}, z: {} });
  let appliedCoordinateKeys = new Set();
  // Which dimensions this frame owns, from the view's frame model (utils/frameModel.ts).
  const ownership = frameOwnership(() => ({ nested: !!parentFrame, promoted, config: acceptedConfig }));
  const owns = ownership.owns;
  // A promoted root keeps an explicit domain the Plot sets for a dimension it
  // does not configure itself (one it adopts), instead of fitting its marks' extents.
  const promotedExplicit = (a) => ownership.adopts(a) && !!parentFrame.hasExplicitDomains?.(a);
  // A child frame's own dimension has a domain once this frame sets one: an explicit domain, a
  // categorical scale, an extent from its marks (directly or shared by facet cells), or a settings
  // edit. Until then its bounds read an ancestor's domain through option inheritance, which is not
  // this frame's, so the dimension draws no axis (a Frame inside the cell that owns x, say). The root
  // frame always has a domain (its default one when there is no data); an inherited dimension has
  // the domain of the frame it inherits from. Ancestors' option changes reach this frame's options
  // as dependents, so `revision` re-runs the placement below when any of them gains a domain.
  const hasDomain = (a) => !parentFrame || promoted || (owns(a) ? options.owner(a + "bounds") === options : parentFrame.hasDomain(a));
  options.frameDefinition = { parent: parentFrame?.options, owns, ranges: new Set(), placement: null, mode: () => view.mode(),
    extent: (mode) => placedExtent(options, mode), matrix: new Matrix4(), inverse: new Matrix4(),
    // Drawn in its own box (a placed, ranged or facet-cell Frame, or one inside them).
    spatial: () => Boolean(entry.spatial) };
  if (options !== parent) onDestroy(installCoordinateModeDefaults(options));
  options.ensure("_frameTopology", new FieldType({defaultValue: "", ui: false}));
  // Which axes of a bent chart or fitted curved child draw guides along the chain.
  options.ensure("_warpedGuides", new FieldType({defaultValue: null, ui: false}));
  for (const a of "xyz") options.ensure("_frame" + a.toUpperCase() + "Range", new RangeType({defaultValue:[-1,1], ui:false}));
  const registeredDomains = new Map();
  // Axis titles (TODO 21 D2): each mark's vote per axis (a column name, null for unnamed data),
  // by owner. A dimension this frame inherits sends its votes to the frame that owns it.
  const registeredNames = new Map(), localNames = { x: new Map(), y: new Map(), z: new Map() };
  let nameRevision = $state(0);
  function axisName(a, vote, owner) {
    const id = `${owner}:${a}`, previous = registeredNames.get(id), inherited = !owns(a) && !!parentFrame;
    if (previous && previous.inherited !== inherited) {
      if (previous.inherited) parentFrame?.axisName?.(a, undefined, owner);
      else if (localNames[a].delete(owner)) nameRevision++;
    }
    if (vote === undefined) registeredNames.delete(id);
    else registeredNames.set(id, { a, vote, owner, inherited });
    if (inherited) return parentFrame.axisName?.(a, vote, owner);
    if (vote === undefined) {
      if (localNames[a].delete(owner)) nameRevision++;
    } else if (!localNames[a].has(owner) || localNames[a].get(owner) !== vote) {
      localNames[a].set(owner, vote);
      nameRevision++;
    }
  }
  const extentOwner = crypto.randomUUID();
  const domains = new Map(),
    inferred = {},
    automaticDomains = {},
    errorOwner = {};
  const placementErrorOwner = {};
  const appearanceRegistry = createScaleRegistry();
  // The Plot's legends and description follow its root frame's categories.
  const guides = viewRoot ? getContext(GUIDE_CONTEXT) : undefined;
  const scaleKeys = [];
  for (const family of ["color", "size", "width"]) {
    const title = family[0].toUpperCase() + family.slice(1);
    const config = untrack(() => appearanceScales?.[family] ?? {});
    const add = (suffix, type) => {
      const key = `scale${title}${suffix}`;
      options.ensure(key, type);
      scaleKeys.push(key);
    };
    add("Domain", new FieldType({ defaultValue: config.domain?.join(", ") ?? "", ui: { ui: "text" } }));
    add("Transform", new SelectType({ defaultValue: config.transform ?? "linear", options: [...TRANSFORM_NAMES] }));
    add("DomainSource", new SelectType({ defaultValue: config.domainSource ?? "data", options: ["data", "source"] }));
    if (family === "color") {
      // Empty inherits the mark's colormap (a theme default, else Viridis).
      add("Colormap", new ColormapType({ defaultValue: config.colormap ?? "", options: ["", ...COLOR_SCALE_NAMES] }));
      add("Quantize", new BooleanType({ defaultValue: config.quantize ?? false }));
      add("Levels", new IntegerType({ defaultValue: config.levels ?? 10, min: 1, step: 1 }));
    } else add("Range", new RangeType({ defaultValue: config.range ?? [...AUTOMATIC_RANGES[family]] }));
  }
  function scaleConfig(family) {
    const title = family[0].toUpperCase() + family.slice(1),
      raw = String(options.get(`scale${title}Domain`) ?? "").trim();
    let domain;
    if (raw && raw !== "auto") {
      const parts = raw.split(",").map((part) => Number(part.trim()));
      if (parts.length !== 2 || parts.some((part) => !Number.isFinite(part)) || parts[0] === parts[1])
        throw Error(`${title} scale domain must be two distinct numbers separated by a comma, or auto.`);
      domain = parts;
    }
    const config = { domain, transform: options.get(`scale${title}Transform`),
      domainSource: options.get(`scale${title}DomainSource`) };
    // symlog's constant and a midpoint come from the scaleDefaults prop only (not settings rows).
    const defaults = untrack(() => appearanceScales?.[family] ?? {});
    for (const key of ["constant", "midpoint"]) if (defaults[key] !== undefined) config[key] = defaults[key];
    if (family === "color") Object.assign(config, {
      colormap: options.get("scaleColorColormap") || undefined,
      quantize: options.get("scaleColorQuantize"),
      levels: options.get("scaleColorLevels"),
    });
    else config.range = options.get(`scale${title}Range`);
    return config;
  }
  function refreshAppearanceScales() {
    try {
      for (const family of ["color", "size", "width"]) {
        const config = scaleConfig(family);
        appearanceRegistry.updateDefaults(family, config);
        facet?.updateAutoScales(definitionKey, family, config);
      }
      reportDataError(viewServices, errorOwner, "");
    } catch (error) {
      reportDataError(viewServices, errorOwner, `Axis appearance scale: ${error.message}`);
    }
  }
  $effect(() => {
    const provided = appearanceScales;
    if (!provided) return;
    untrack(() => {
      for (const family of ["color", "size", "width"]) {
        const config = provided[family];
        if (!config) continue;
        const title = family[0].toUpperCase() + family.slice(1);
        for (const [suffix, value] of Object.entries({
          Domain: config.domain?.join(", ") ?? "",
          Transform: config.transform ?? "linear",
          DomainSource: config.domainSource ?? "data",
          ...(family === "color" ? {
            Colormap: config.colormap ?? "",
            Quantize: config.quantize ?? false,
            Levels: config.levels ?? 10,
          } : { Range: config.range ?? [...AUTOMATIC_RANGES[family]] }),
        })) options.set(`scale${title}${suffix}`, value);
      }
    });
  });
  onDestroy(() => appearanceRegistry.dispose());
  const entry = $state({
    options,
    handle: null,
    key: "",
    logicalKey: untrack(() => rootLogicalKey),
    layout: null,
    box: null,
    placement: null,
    parentKey: parentFrame?.key ?? null,
    spatial: false,
    show2d: false,
    titles: { x: "", y: "", z: "" },
    setDomain,
    joinDomainGroup,
    explicitDomain: (a) => valid.values[a + "bounds"],
    // What the marks' data spans on a dimension, whatever domain is drawn (hm.check's lints).
    dataDomain: (a) => unionDomains([...domains].filter(([key]) => key.endsWith(a)).map(([, bounds]) => bounds)),
  });
  const unregister = view.model.registerFrame(entry);
  // One live descriptor is consumed by data materials, their picking copies and exports.
  // Root axes stay at the viewport margins while panning; spatial children follow their
  // projected frame boundaries. A descendant always intersects each enabled ancestor.
  options.frameDefinition.maskBoundary = (camera, width, height) => {
    if (!styles.get("axisMask") || !cartesianMaskSupported(options)) return null;
    if (entry.spatial || placedFrame(options)) return frameMaskPolygon(options, camera, width, height);
    const w = view.width(), h = view.height();
    if (!(w > 0 && h > 0)) return [];
    // The camera owns the drawable rectangle: hiding axes removes its margins.
    // It remains in live CSS pixels during scaled exports; normalize before resizing.
    // Auxiliary cameras (e.g. minimaps) have no axis gutters.
    const rect = camera?.userData?.plotRect ?? { left: 0, right: w, top: 0, bottom: h };
    return rectanglePolygon({ left: rect.left / w * width, right: rect.right / w * width,
      top: rect.top / h * height, bottom: rect.bottom / h * height });
  };
  const appliedFrameStyles = new Set();
  const maskErrorOwner = {};
  $effect(() => {
    const requested = { axisMask, axisFrame };
    revision;
    parentRevision;
    view.mode();
    untrack(() => {
      // The marks' fragment masks read the setting as they draw: a change draws a frame ...
      const masked = styles.get("axisMask");
      try {
        for (const [key, value] of Object.entries(requested)) {
          if (value !== undefined && typeof value !== "boolean")
            throw Error(`${key} must be true or false.`);
          if (value === true && !cartesianMaskSupported(options))
            throw Error(`${key} requires a rectangular 2D Cartesian frame; set ${key}=false for this coordinate system.`);
          if (value !== undefined) { styles.set(key, value); appliedFrameStyles.add(key); }
          else if (appliedFrameStyles.has(key)) { styles.clear(key); appliedFrameStyles.delete(key); }
        }
        reportDataError(viewServices, maskErrorOwner, "");
      } catch (error) {
        reportDataError(viewServices, maskErrorOwner, `${viewRoot ? "Plot" : "Frame"}: ${error.message}`);
      }
      if (styles.get("axisMask") !== masked) {
        // ... and an on-demand pick drawn under the old mask is stale.
        viewServices.drawing.revision++;
        invalidate();
      }
    });
  });
  onDestroy(() => reportDataError(viewServices, maskErrorOwner, ""));
  entry.key = String(entry.slot);
  $effect(() => {
    const active = view.model.isRoot(rootLogicalKey);
    if (promoted === active) return;
    promoted = active;
    options.frameDefinition.parent = active ? null : parentFrame?.options;
    entry.parentKey = view.model.parentKey({ parentFrameKey: parentFrame?.key ?? null, promoted: active });
    options.set("_frameTopology", JSON.stringify([active, ...[..."xyz"].map((axis) =>
      frameDimensionStages(options, axis).map(({ source, rangeKey }) =>
        [source.identifier, rangeKey, source.get(axis + "Transform")]))]));
    untrack(() => view.model.framesChanged());
  });
  const definitionKey = facet?.embedded ? String(facet.frameSlot()) : entry.key;
  const unregisterFacetFrame = facet?.registerFrame(definitionKey, entry);
  onDestroy(() => unregisterFacetFrame?.());
  function axisScreen(a) {
    if (a === "z" || view.mode() !== "2d" || !cartesianMaskSupported(options)) return { pixels: 0 };
    const width = view.width(), height = view.height();
    if (!(width > 0 && height > 0)) return { pixels: 0 };
    if (entry.spatial) {
      const corners = frameMaskPolygon(options, camera.current, width, height);
      if (corners.length !== 4) return { pixels: 0 };
      const vector = i => [corners[i][0] - corners[0][0], corners[0][1] - corners[i][1]],
        along = vector(a === "x" ? 1 : 3), across = vector(a === "x" ? 3 : 1), length = Math.hypot(...across);
      if (!(length > 0)) return { pixels: 0 };
      const normal = [across[1]/length, -across[0]/length], dot = along[0]*normal[0] + along[1]*normal[1];
      if (dot < 0) { normal[0] *= -1; normal[1] *= -1; }
      return { pixels: Math.abs(dot) / (camera.current?.userData?.[a === "x" ? "zoomX" : "zoomY"] ?? 1), normal };
    }
    const plot = view.options().child("plot"), margins = plot.get("axes2d") ? plotGutters(plot) : {};
    const range = options.get(a + "range"), sign = range[1] < range[0] ? -1 : 1;
    return { pixels: plotRectangle(width, height, margins)[a === "x" ? "width" : "height"], normal: a === "x" ? [sign,0] : [0,sign] };
  }
  // Label room as pixels, not domain (TODO 136.15): the frame the camera fits (the root of a 2D
  // Cartesian plot) gives the room its labels need past each end of an axis to the camera, which
  // insets the data inside the plot area (scene2d, fittedLayout), so the domain stays the data's.
  // Frames drawn through their parent (twins, ranged and placed Frames) keep it in the domain.
  for (const key of ["_labelInsets", "_labelMetrics"])
    options.ensure(key, new FieldType({ defaultValue: undefined, ui: false }));
  // Not when Frames inside it (facet cells, twins) inherit the dimension: they clip to the inset
  // data area, so their labels need the room in the domain.
  const insetRoot = (a) => !entry.spatial && (viewServices?.navigation.rootFrame.current?.() ?? (viewRoot ? options : null)) === options &&
    !untrack(() => view.model.frames().some((f) => f !== entry && view.model.inherits(f, a)));
  function setAxisRoom(key, a, room) {
    const current = options.get(key) ?? {};
    if (JSON.stringify(current[a] ?? null) === JSON.stringify(room)) return;
    const next = { ...current };
    if (room) next[a] = room;
    else delete next[a];
    options.set(key, Object.keys(next).length ? next : undefined);
  }
  function setInset(a, room, metrics = null) {
    // Glyph footprints change with text/style; fitted insets also change with the camera.
    // Only the former start a fresh margin solve, otherwise a refit can oscillate forever.
    setAxisRoom("_labelMetrics", a, metrics);
    setAxisRoom("_labelInsets", a, room);
  }
  function setDomain(a, bounds) {
    if (!owns(a)) return parentFrame.setDomain?.(a, bounds);
    if (!autoBounds) return setInset(a, null);
    if (
      inferred[a] &&
      JSON.stringify(frameAnimation.running(a + "bounds") ? frameAnimation.target(a + "bounds") : options.get(a + "bounds")) !== JSON.stringify(inferred[a])
    )
      return setInset(a, null);
    if (
      valid.values[a + "bounds"] !== undefined ||
      options.categoryAxes?.[a] ||
      promotedExplicit(a)
    )
      return setInset(a, null);
    automaticDomains[a] = bounds;
    const keep = [0, 1].map((i) => Boolean(bounds.anchored?.[i] || bounds.exact?.[i]));
    // Padding is in transformed space: a log axis pads by a factor and stays positive.
    const transform = options.get(a + "Transform") ?? "linear", constant = options.get(a + "TransformConstant") ?? 1;
    const { pixels, normal } = axisScreen(a);
    if (bounds.screen && normal) bounds = Object.assign([...bounds], { anchored: bounds.anchored, screen: projectedInsets(bounds.screen, bounds.crossScreen, normal, a) });
    const config = readAxis(options, a), padding = coordinateFrame.padding(config.padding), data = [bounds[0], bounds[1]];
    if (bounds.screen && pixels > 0 && a !== "z" && insetRoot(a)) {
      // The room past what the ordinary padding already leaves, at most 90% of the area for both
      // sides (as screenPaddedDomain caps it). The padding is a share of the inset area, so the
      // insets solve i + share * (pixels - left - right) = room on each side.
      const ordinary = bounds[0] === bounds[1] ? 0 : padding / (1 + 2 * padding), anchored = bounds.anchored ?? [false, false];
      const share = [0, 1].map((i) => (anchored[i] ? 0 : ordinary)), need = [0, 1].map((i) => bounds.screen[i] - share[i] * pixels);
      const det = (1 - share[0]) * (1 - share[1]) - share[0] * share[1];
      // Solve both sides; a side that needs nothing is 0 and the other solved alone.
      let left = (need[0] * (1 - share[1]) + share[0] * need[1]) / det, right = (need[1] * (1 - share[0]) + share[1] * need[0]) / det;
      if (left < 0) [left, right] = [0, Math.max(0, need[1] / (1 - share[1]))];
      else if (right < 0) [left, right] = [Math.max(0, need[0] / (1 - share[0])), 0];
      const cap = left + right > 0.9 * pixels ? (0.9 * pixels) / (left + right) : 1;
      setInset(a, [left * cap, right * cap], bounds.screen);
      bounds = Object.assign([...bounds], { anchored: bounds.anchored });
    } else setInset(a, null);
    bounds = screenPaddedDomain(bounds, { transform, constant, padding, pixels });
    // Rounded out to tick values (TODO 136.17): a 2D Cartesian linear numeric axis whose ends are
    // the data's (not a baseline's, nor bounds a Heatmap or Image is placed by) ends on ticks past
    // it. padding: 0 keeps the data's ends, and a ranged or placed Frame (spatial) its fit. The
    // rounding takes no pixels: linked plots, facet cells, resizes and exports agree.
    if (padding > 0 && pixels > 0 && a !== "z" && !entry.spatial && transform === "linear" && config.type !== "datetime" && cartesian2D(options))
      bounds = niceDomain(bounds, data, config.tickCount || undefined, { keep, step: config.step });
    inferred[a] = bounds;
    frameAnimation.set(a + "bounds", bounds);
    coordinateFrame.publishDomain(a, bounds, view.options());
  }
  function domain(a, bounds, owner, cause = undefined) {
    const id = `${owner}:${a}`;
    const previous = registeredDomains.get(id);
    const inherited = !owns(a);
    if (previous && previous.inherited !== inherited) {
      if (previous.inherited) parentFrame.domain(a, null, owner);
      else domains.delete(owner + a);
    }
    if (bounds) registeredDomains.set(id, { a, bounds, owner, inherited });
    else registeredDomains.delete(id);
    if (inherited) return parentFrame.domain(a, bounds, owner, cause);
    if (!autoBounds || !coordinateFrame.collects(a)) return;
    if (facet) {
      facet.domain(definitionKey + ":" + a, bounds, owner);
      return;
    }
    if (bounds) domains.set(owner + a, bounds);
    else domains.delete(owner + a);
    // A plot's mount reveals once everything has settled: only later changes are held.
    if (cause !== undefined && bounds && !viewServices?.lifecycle.mounting) hold(a, cause);
    else if (!held.has(a)) refit(a);
  }
  // A domain group (TODO 136.14: LinkViews' plots show one union domain): this frame reports
  // what it shows of its own (its explicit domain, else its marks' union) and unions what the
  // group gives with its marks' domains. An explicit domain still wins here (setDomain).
  // Each group joined, with the domains it gave by axis.
  const groups = new Map();
  const ownDomain = (a) => {
    const own = [...domains].filter(([key]) => key.endsWith(a)).map(([, b]) => b), union = unionDomains(own);
    // A plot whose marks draw nothing keeps its placeholder [0, 1] flagged (emptyDomain): it is
    // no data to give the others, and gives way to theirs.
    return union && own.every((b) => b.empty) ? Object.assign(union, { empty: true }) : union;
  };
  const reported = (a) => valid.values[a + "bounds"] ?? (ownDomain(a)?.empty ? null : ownDomain(a));
  const groupUnion = (a) => unionDomains([ownDomain(a), ...[...groups.values()].map((given) => given[a])].filter(Boolean));
  const timeOrigin = (a) => {
    const axis = readAxis(options, a);
    return axis.type === "datetime" ? axis.timeOrigin ?? 0 : 0;
  };
  // The domains of one change (TODO 143.2): a mark that sets its domain for a change waits here
  // until every mark and transform serving that change has published (a Line over a new
  // Calculate and its labels behind a Filter), so the axis takes one domain for the change, not
  // one per mark as their extents arrive. Held at most HOLD_MS (a slow job of an earlier change).
  const HOLD_MS = 1000;
  const held = new Set();
  let holding = null;
  function hold(a, cause) {
    held.add(a);
    if (holding && holding.cause >= cause) return;
    const own = holding = { cause, done: undefined };
    const work = new Promise((resolve) => { own.done = resolve; });
    const timer = new Promise((resolve) => setTimeout(resolve, HOLD_MS));
    Promise.race([changeSettled(cause, new Set([work])), timer]).then(() => {
      if (holding !== own) return own.done();
      holding = null;
      const axes = [...held];
      held.clear();
      for (const axis of axes) refit(axis);
      own.done();
    });
    if (viewServices) trackPreparation(viewServices, work, cause);
  }
  function refit(a) {
    for (const member of groups.keys()) member.report(a, reported(a), timeOrigin(a));
    const union = groupUnion(a);
    if (union) setDomain(a, union);
    else if (owns(a)) setInset(a, null);
  }
  function joinDomainGroup(domainGroup) {
    const given = {};
    const member = domainGroup.join({
      apply(a, bounds) {
        if (bounds) given[a] = bounds;
        else delete given[a];
        const union = groupUnion(a);
        if (union) untrack(() => setDomain(a, union));
      },
    });
    groups.set(member, given);
    for (const a of domainGroup.axes) refit(a);
    return () => {
      groups.delete(member);
      member.leave();
    };
  }
  $effect(() => {
    revision; parentRevision; view.width(); view.height(); view.mode();
    // Resize/style changes fit cached summaries, without rereading any GPU coordinates.
    untrack(() => { for (const a of "xyz") if (automaticDomains[a]) setDomain(a, automaticDomains[a]); });
  });
  // The titles this frame's axes show (D1): an explicit label (a frame that owns a dimension
  // reads only its own, D5), a positional categorical scale's label, or the one column its
  // marks plot. Never stored in options (D11): entry.titles, and axisTitleState for the pane.
  options.axisTitleState ??= writable({});
  const labelInherits = (a) => !parentFrame || _facetCell || !owns(a);
  $effect(() => {
    revision; parentRevision; nameRevision;
    untrack(() => {
      const titles = {}, state = {};
      for (const a of "xyz") {
        const automatic = combineTitles([...localNames[a].values()]),
          scaleTitle = options.categoryAxes?.[a]?.title ?? "",
          resolved = resolveAxisTitle({ label: explicitAxisLabel(styles, a, { inherit: labelInherits(a) }), scaleTitle, automatic });
        titles[a] = resolved.title;
        state[a] = { ...resolved, automatic: scaleTitle || automatic, inherits: labelInherits(a) };
      }
      options.axisTitleState.set(state);
      if (entry.titles && ["x", "y", "z"].every((a) => entry.titles[a] === titles[a])) return;
      entry.titles = titles;
      if (viewServices) viewServices.diagnostics.counters.axisTitleUpdates++;
      view.model.framesChanged();
    });
  });
  setContext(AXIS_CONTEXT, {
    screenMapping,
    options, domain, setDomain, axisName, key: entry.key,
    parent: parentFrame,
    spatial: () => entry.spatial,
    owns,
    scaleDefaults: () => Object.fromEntries(["color", "size", "width"].map((family) => [family, scaleConfig(family)])),
    facet,
    scaleFor: (identity, family, config) =>
      facet?.autoScale(definitionKey, identity, family, config) ??
      appearanceRegistry.resolve(identity, family, config),
    categoryFor: (identity, family, palette) =>
      facet?.autoCategory(definitionKey, identity, family, palette) ??
      appearanceRegistry.resolveCategory(identity, family, palette),
    collect:()=>autoBounds && coordinateFrame.collects(),
    hasDomain,
    /** Bumps when an explicit bound is removed (here or in a parent frame), so marks that
     * skipped collecting extents for it (hasExplicitDomains) collect them again. */
    get domainRevision() { return domainRevision + (parentFrame?.domainRevision ?? 0); },
    hasExplicitDomains: (...axes) => axes.every((a) => !owns(a)
      ? parentFrame.hasExplicitDomains(a)
      : valid.values[a + "bounds"] !== undefined || promotedExplicit(a)),
  });
  options.axisFrameKey = entry.key;
  options.facetFrameKey = definitionKey;
  options.inferredDomains = inferred;
  const stopDefaults = facet?.frameSettings(definitionKey, options);
  let parentRevision = $state(0);
  // A parent's projection center only moves the mapping (uniforms, the live
  // gather): it re-runs no configuration here, so no mark inside re-prepares.
  const MAPPING_ONLY = new Set(["projectionCenter", "_projectionCenterLongitude", "_projectionCenterLatitude"]);
  const off = [options.on(() => revision++), styles.on(() => revision++), onViewContext(options, () => revision++),
    ...(parentFrame ? [parentFrame.options.on((_, key) => { if (!MAPPING_ONLY.has(key)) parentRevision++; })] : []),
    // The root's configuration depends on the view's coordinate system as a child's does on its
    // parent's (its categorical axes require Cartesian coordinates).
    ...(viewRoot ? [options.on(() => parentRevision++, "coordinates")] : []),
    ...scaleKeys.map((key) => options.on(refreshAppearanceScales, key))];
  // A placement's structure (placed or not, its orientation) configures the frame below; its
  // anchor, size and rotation only move it (see the placement effect after this one).
  const placementShape = $derived(placementProp ? String(placementProp.orientation ?? "") : null);
  $effect(() => {
    parentRevision;
    placementShape;
    const placement = untrack(() => placementProp);
    untrack(() => { if (viewServices) viewServices.diagnostics.counters.frameConfigurations++; });
    // The projection center is applied by its own effect below.
    const coordinateProps = { coordinates, sphericalView, angleUnit, anglePeriod,
      baseRadius, radialScale, polarAxis, projection, parallels };
    const explicitCoordinates = Object.fromEntries(Object.entries(coordinateProps)
      .filter(([, value]) => value !== undefined));
    const given = { x: readDomains.config("x", x), y: readDomains.config("y", y), z: readDomains.config("z", z) };
    const configs = placement ? Object.fromEntries(Object.entries(given).map(([a,c])=>[a,{domain:"auto",...c}])) : given;
    let stops = [];
    try {
      if (readDomains.error) throw Error(readDomains.error);
      const parentCoordinates = parentFrame?.options.get("coordinates"),
        localCoordinates = coordinates ?? parentCoordinates,
        coordinateBoundary = !!parentFrame && !promoted &&
          localCoordinates !== parentCoordinates,
        hasXYRange = x?.range !== undefined && y?.range !== undefined,
        embedding = frameMode && !!parentFrame && !promoted && !placement && hasXYRange,
        curvedParent = embedding && parentCoordinates !== "cartesian",
        curvedChild = embedding && localCoordinates !== "cartesian";
      if (coordinateBoundary && !placement && !hasXYRange)
        throw Error("Nested Frame coordinate overrides require X/Y parent ranges or placement.");
      if (coordinateBoundary && !placement &&
          (view.mode() !== "2d" || z?.range !== undefined))
        throw Error("Ranged coordinate embedding currently requires 2D X/Y ranges.");
      if (embedding && (curvedParent || curvedChild) &&
          (view.mode() !== "2d" || z?.range !== undefined))
        throw Error("Curved Frame embedding currently requires 2D X/Y ranges.");
      if (curvedChild && localCoordinates === "spherical" &&
          ((projection ?? options.get("projection")) !== "orthographic" ||
            (radialScale ?? options.get("radialScale")) !== 0))
        throw Error("A ranged spherical Frame requires a flat orthographic disk.");
      if (coordinates !== undefined && !["cartesian", "polar", "spherical"].includes(coordinates))
        throw Error("Frame coordinates must be cartesian, polar or spherical.");
      if (coordinates === "polar" && view.mode() === "2d" && polarAxis !== undefined && polarAxis !== "Z")
        throw Error("2D polar Frames require polarAxis Z.");
      // A Frame that changes coordinate system starts that system's
      // parameters from their defaults instead of inheriting its parent's: a
      // globe inside a 24-hour polar dial reads degrees, not hours.
      const own = coordinateBoundary
        ? { ...boundaryCoordinateDefaults(localCoordinates), ...explicitCoordinates } : explicitCoordinates;
      untrack(() => {
        for (const key of appliedCoordinateKeys)
          if (!(key in own)) options.clear(key);
        options.populate(own);
        appliedCoordinateKeys = new Set(Object.keys(own));
      });
      if (placement) {
        if (!parentFrame) throw Error("An anchored Frame requires a parent frame.");
        validatePlacement(placement, [x,y,z], parentFrame.options);
        if (placement.orientation === "tangent" ||
            placement.orientation === undefined && parentCoordinates === "spherical")
          sphericalTangentBasis(placement.anchor, parentFrame.options);
      }
      const prepared = groupedAxis(configs, { allowAuto: true });
      const values = { ...prepared.values };
      // Rules and bands are the frame's props: a Frame's own, or the Plot's on its root (TODO 46).
      if (extraProps.rules !== undefined) values.referenceRules = validateRules(extraProps.rules);
      if (extraProps.bands !== undefined) values.referenceBands = validateBands(extraProps.bands);
      if (placement) for (const a of "xyz") values[a + "range"] = [-1,1];
      // An inverted axis is a reversed output range: domains, transforms, ticks, brushing,
      // and picking all go through the same mapping, so nothing else changes.
      for (const a of "xyz") {
        const inverted = values[a + "Invert"] ?? (options.has(a + "Invert") ? options.get(a + "Invert") : false);
        if (!inverted) continue;
        const base = values[a + "range"] ?? options.getType(a + "range")?.type?.defaultValue ?? [-1, 1];
        values[a + "range"] = [base[1], base[0]];
      }
      const scales = { ...prepared.scales }, warpedShow = { x: false, y: false };
      for (const a of "xyz") {
        const inherited = !!parentFrame && !configuresScale(configs[a]);
        if (inherited && !scales[a]) scales[a] = parentFrame.options.categoryAxes?.[a];
        if (parentFrame && configs[a].visible === undefined)
          values["frame" + a.toUpperCase() + "Show"] = !inherited ||
            (configs[a].grid !== undefined && configs[a].grid !== "off");
        // A bent chart or a fitted curved child cannot use straight guides. The
        // overlay draws them along the chain instead (utils/warpedGuides.js),
        // for the axes it owns, like any ranged child, or that ask for them.
        if ((curvedParent && localCoordinates === "cartesian" || curvedChild) && (a === "x" || a === "y")) {
          warpedShow[a] = axisGuidesEnabled(options, configs[a],
            hasAxisOverride(styles, "axes2d") && !!styles.get("axes2d")) && (configs[a].visible ?? !inherited);
          values["frame" + a.toUpperCase() + "Show"] = false;
        }
        // A child that sets its own domain owns a linear scale unless it names a transform.
        if (parentFrame && ({x, y, z})[a]?.domain !== undefined && values[a + "Transform"] === undefined)
          values[a + "Transform"] = "linear";
        // Parent-coordinate intervals compose through the full scale chain.
        if (frameMode && parentFrame && configs[a].range !== undefined) {
          if (curvedParent && (a === "x" || a === "y")) {
            values["_frame" + a.toUpperCase() + "Range"] = values[a + "range"];
            continue;
          }
          if (parentFrame.options.get("coordinates") !== "cartesian")
            throw Error("Parent-coordinate Frame ranges currently require a Cartesian parent.");
          const mapping = frameDimensionMapping(parentFrame.options, a);
          values[a + "range"] = configs[a].range.map(mapping.forward);
          if (!values[a + "range"].every(Number.isFinite))
            throw Error(`Frame ${a}.range is outside the parent scale's valid domain.`);
          values["_frame" + a.toUpperCase() + "Range"] = configs[a].range;
        }
      }
      for (const a of ["x", "y"])
        validateAngularAxis(options.get("coordinates"), a, values["axis" + a.toUpperCase() + "Type"],
          values[a + "Transform"] ?? (options.get("coordinates") === "polar" ? options.get(a + "Transform") : "linear"));
      for (const a of "xyz") {
        if (scales[a] && !scales[a].isCategorical)
          throw Error(`${a}.scale must be a categorical scale.`);
        if (
          scales[a] &&
          (options.get("coordinates") === "spherical" ||
            (values[a + "Transform"] ?? "linear") !==
              "linear" ||
            values["axis" + a.toUpperCase() + "Type"] === "datetime")
        )
          throw Error("Categorical axes require Cartesian linear coordinates.");
      }
      untrack(() => {
        for (const a of "xyz")
          validateAxis(
            readAxis(
              {
                child: () => ({ get: (key) => values[key] ?? styles.get(key) }),
              },
              a,
            ),
          );
        for (const key of Object.keys(valid.values))
          if (!(key in prepared.values) && !(key in values)) {
            frameAnimation.clear(key);
            options.clear(key);
            if (styles.has(key)) styles.clear(key);
            if (/^[xyz]bounds$/.test(key)) {
              delete inferred[key[0]];
              // Marks skip collecting extents for explicit bounds; now they are needed.
              domainRevision++;
            }
          }
        values._warpedGuides = warpedShow.x || warpedShow.y ? warpedShow : null;
        // Retain authored ranges in parent units. Their flattened world ranges are derived
        // from the displayed interval, so a moving parent and child never double-transition.
        const intervals = {}, ordinary = { ...values };
        for (const a of "xyz") {
          const structural = valid.values[a + "Transform"] !== values[a + "Transform"] ||
            Boolean(valid.scales[a]) !== Boolean(scales[a]);
          for (const key of [a + "bounds", a + "range", "_frame" + a.toUpperCase() + "Range"])
            if (Array.isArray(values[key])) {
              delete ordinary[key];
              if (key === a + "range" && frameMode && parentFrame && configs[a].range !== undefined) continue;
              intervals[key] = { value: values[key], snap: structural || !!scales[a] };
            }
        }
        options.populate(ordinary);
        styles.populate(ordinary);
        for (const [key, { value, snap }] of Object.entries(intervals)) frameAnimation.set(key, value, snap);
        options.categoryAxes = scales;
        for (const a of "xyz")
          if (scales[a]) {
            const update = () => {
              options.set(a + "bounds", categoryBounds(a, scales[a].domain.length, options));
              options.set(
                "_categoryRevision",
                options.get("_categoryRevision") + 1,
              );
              guides?.notify();
            };
            update();
            stops.push(scales[a].subscribe(update));
          }
        acceptedConfig = configs;
        if (parentFrame) for (const a of "xyz") {
          // A fitted placement follows its parent's domain and adds nothing to it.
          const i = "xyz".indexOf(a), interval = placement
            ? (placement === "fit" ? null : [placement.anchor[i] ?? 0, placement.anchor[i] ?? 0])
            : frameMode ? configs[a].range : null;
          parentFrame.domain(a, interval ? [Math.min(...interval), Math.max(...interval)] : null, extentOwner);
        }
        options.frameDefinition.placement = placement ?? null;
        invalidate();
        options.frameDefinition.ranges = new Set(frameMode && parentFrame ? [..."xyz"].filter(a => configs[a].range !== undefined) : []);
        options.set("_frameTopology", JSON.stringify([..."xyz"].map(a => frameDimensionStages(options, a).map(({source,rangeKey}) => [source.identifier, rangeKey, source.get(a + "Transform"), Boolean(placedFrame(options))]))));
        valid = { ...prepared, values };
        entry.spatial = Boolean(placement || parentFrame?.spatial?.() || frameMode && parentFrame && Object.values(configs).some(c => c.range !== undefined));
        // A scale ownership change also changes where retained mark extents
        // contribute. Do not wait for unrelated data preparation to replay them.
        for (const item of [...registeredDomains.values()])
          domain(item.a, item.bounds, item.owner);
        // An explicit domain set or cleared changes what this frame reports to its group.
        if (groups.size) for (const a of "xy") refit(a);
        for (const item of [...registeredNames.values()])
          axisName(item.a, item.vote, item.owner);
        reportDataError(viewServices, errorOwner, "");
      });
    } catch (e) {
      untrack(() =>
        reportDataError(viewServices, errorOwner, "Axis: " + e.message),
      );
    }
    return () => stops.forEach((f) => f());
  });
  $effect(() => {
    revision; parentRevision;
    const configs = acceptedConfig;
    untrack(() => {
      if (!frameMode || !parentFrame || placedFrame(options) || parentFrame.options.get("coordinates") !== "cartesian") return;
      for (const a of "xyz") if (configs[a].range !== undefined) {
        const range = options.get("_frame" + a.toUpperCase() + "Range"), mapping = frameDimensionMapping(parentFrame.options, a);
        const world = range.map(mapping.forward);
        if (!world.every((v, i) => v === options.get(a + "range")[i])) options.set(a + "range", world);
      }
    });
  });
  // A placement's anchor, size and rotation only move the frame: the render task maps it with the
  // current placement each frame (placementMatrix), so an animated placement (a planet on its
  // orbit) re-runs none of the configuration above and re-prepares no mark inside.
  $effect(() => {
    const next = placementProp;
    untrack(() => {
      if (!next || !options.frameDefinition.placement || !parentFrame) return;
      try {
        validatePlacement(next, [x, y, z], parentFrame.options);
        if (next.orientation === "tangent" ||
            next.orientation === undefined && parentFrame.options.get("coordinates") === "spherical")
          sphericalTangentBasis(next.anchor, parentFrame.options);
        options.frameDefinition.placement = next;
        for (const [i, a] of [..."xyz"].entries())
          parentFrame.domain(a, next === "fit" ? null : [next.anchor[i] ?? 0, next.anchor[i] ?? 0], extentOwner);
        invalidate();
        reportDataError(viewServices, placementErrorOwner, "");
      } catch (e) {
        reportDataError(viewServices, placementErrorOwner, "Axis: " + e.message);
      }
    });
  });
  // The projection center only moves the mapping: marks follow it through
  // uniforms and connectors through the live gather. Applied apart from the
  // axis configuration above, a center edit re-prepares no mark in this frame
  // and rematches no connector.
  const centerErrorOwner = {}, CENTER_KEYS = ["projectionCenter", "_projectionCenterLongitude", "_projectionCenterLatitude"];
  let centerApplied = false;
  $effect(() => {
    const center = projectionCenter, unit = angleUnit, period = anglePeriod, domain = readDomains.config("x", x)?.domain;
    untrack(() => {
      try {
        if (center === undefined) {
          if (centerApplied) for (const key of CENTER_KEYS) options.clear(key);
          centerApplied = false;
        } else {
          const normalized = normalizeProjectionCenter(center, {
            angleUnit: unit ?? options.get("angleUnit"),
            anglePeriod: period ?? options.get("anglePeriod"),
            xbounds: domain ?? options.get("xbounds") });
          options.populate({ projectionCenter: normalized,
            _projectionCenterLongitude: normalized[0], _projectionCenterLatitude: normalized[1] });
          centerApplied = true;
        }
        reportDataError(viewServices, centerErrorOwner, "");
      } catch (e) {
        reportDataError(viewServices, centerErrorOwner, "Axis: " + e.message);
      }
    });
  });
  useTask(() => {
    const definition = options.frameDefinition;
    if (!definition.placement) {
      reportDataError(viewServices, placementErrorOwner, "");
      return;
    }
    try {
      const matrix = placementMatrix(definition.placement, parentFrame.options, view.mode(), view.frame(), view.width(), view.height(), camera.current,
        definition.extent(view.mode()));
      if (matrix && !matrix.equals(definition.matrix)) {
        definition.matrix.copy(matrix);
        definition.inverse.copy(matrix).invert();
        viewServices.drawing.revision++;
        invalidate();
      }
      reportDataError(viewServices, placementErrorOwner, "");
    } catch (error) {
      reportDataError(viewServices, placementErrorOwner, `Axis: ${error.message}`);
    }
  }, {autoInvalidate:false});
  const layout = $derived.by(() => {
    revision;
    const f = view.frame(),
      w = view.width(),
      h = view.height(),
      rect = view.rectangles();
    if (!f || view.mode() !== "2d" || placedFrame(options)) return null;
    const polar = options.get("coordinates") === "polar",
      p = polar ? polarAxisLayout(options, Math.min(w, h)) : null;
    // A Cartesian root's area; a ranged child's axis already spans only its range.
    const plain = !entry.spatial && (options.get("coordinates") ?? "cartesian") === "cartesian";
    const localRect = entry.spatial ? (() => {
      const x = options.get("xrange").map(v => (v-f.x[0])/(f.x[1]-f.x[0])*w);
      const y = options.get("yrange").map(v => (1-(v-f.y[0])/(f.y[1]-f.y[0]))*h);
      return { left: Math.min(...x), right: Math.max(...x), top: Math.min(...y), bottom: Math.max(...y) };
    })() : rect;
    // With label room (TODO 136.15), ticks only where the plot area shows the domain: at zoom 1
    // the room is a gutter past its ends, zoomed in the data fills the whole area.
    const inset = plain && rect && labelInsetSides(options);
    const span = (a, v) => a === "x" ? (v - f.x[0]) / (f.x[1] - f.x[0]) * w : (1 - (v - f.y[0]) / (f.y[1] - f.y[0])) * h;
    const [x0, x1] = inset ? options.get("xrange").map((v) => span("x", v)).sort((p, q) => p - q) : [], [y0, y1] = inset ? options.get("yrange").map((v) => span("y", v)).sort((p, q) => p - q) : [];
    const area = rect && (inset ? { left: Math.max(rect.left, x0), right: Math.min(rect.right, x1), top: Math.max(rect.top, y0), bottom: Math.min(rect.bottom, y1) } : rect);
    return {
      ...localRect,
      polar,
      // Ticks for the plot's own area, not the margins around it (TODO 134.12).
      x: p?.angular ?? axisLayout(options, "x", f.x, w, plain && rect ? [area.left / w, area.right / w] : null),
      y: options.get("coordinates") === "polar" ? p.radial
        : axisLayout(options, "y", f.y, h, plain && rect ? [1 - area.bottom / h, 1 - area.top / h] : null),
    };
  });
  // A root 2D orthographic globe draws its graticule on the GPU (TODO 141).
  const globe = $derived.by(() => {
    revision;
    return globe2D(options);
  });
  const shown = $derived.by(() => {
    revision;
    const explicit = hasAxisOverride(styles, "axes2d");
    const enabled = !!styles.get("axes2d") && explicit;
    const automatic = ["x", "y"].some(a => axisGuidesEnabled(options, acceptedConfig[a], enabled));
    // The root's axes follow the Plot's policy, and only while it is the root and in use.
    return viewRoot ? (explicit ? enabled : automatic) && view.model.implicitRootActive() : automatic;
  });
  const guides3d = $derived.by(() => {
    revision;
    const configured = styles.get("axes3d");
    if (hasAxisOverride(styles, "axes3d")) return configured;
    return explicit3dAxes.some(Boolean) ? true : configured;
  });
  const explicit3dAxes = $derived.by(() => {
    revision;
    return ["x", "y", "z"].map(a =>
      (hasAxisOverride(styles, "frame" + a.toUpperCase() + "Show") &&
        styles.get("frame" + a.toUpperCase() + "Show") === true) ||
      (hasAxisOverride(styles, axisKey(a, "grid")) &&
        styles.get(axisKey(a, "grid")) !== "off"));
  });
  const show3d = $derived.by(() => {
    revision;
    return view.mode() === "3d" ? !!guides3d : Boolean(placedFrame(options)) && shown;
  });
  // The Plot's axes it leaves to twin Frames (TODO 134.13), read here so the placement follows.
  const rootShows = $derived(Object.fromEntries(["x", "y"].map(a => [a, !viewRoot || view.model.implicitRootShows(a)])));
  $effect(() => {
    revision;
    const l = layout,
      show = shown,
      own = rootShows;
    untrack(() => {
      entry.layout = l;
      entry.show2d = show && !placedFrame(options);
      entry.placement = { spatial: entry.spatial, ...Object.fromEntries(
            ["x", "y", "z"].map((a) => [
              a,
              {
                // A promoted root draws the dimensions it inherits from the Plot
                // as the Plot would have: when the Plot shows its 2D axes.
                show: axisGuidesEnabled(options, acceptedConfig[a],
                  hasAxisOverride(styles, "axes2d") && !!styles.get("axes2d")) &&
                  (styles.get("frame" + a.toUpperCase() + "Show") || ownership.adopts(a) &&
                  !!styles.get("axes2d")) && hasDomain(a) &&
                  own[a] !== false,
                side: a === "z" ? undefined : styles.get("frame" + a.toUpperCase() + "Side"),
                offset: entry.placement?.[a]?.offset ?? 0,
              },
            ]),
          ) };
      view.model.framesChanged();
    });
  });
  export const getAxisLayout = () => layout;
  // Inside a Facet cell the plot's registry is inherited; the view resolves the right handle.
  export const getLegendSource = () => view.getLegendSource?.() ?? registryFor(view.options())?.handle;
  export const getMinimapSource = () => view.getMinimapSource();
  export const getFrameOptions = () => options;
  export const subscribeSettings = (listener) => {
    // Only what the viewer edited (the user layer, TODO 136.7): the Frame's authored props are
    // the scene's, and inferred domains, layout ranges and theme styles are not settings.
    const emit = () => {
      const result = {}, edited = options.userKeys, styled = styles.userKeys;
      for (const a of "xyz") {
        const A = a.toUpperCase(), axis = {};
        if (edited.has(a + "bounds") && !options.categoryAxes?.[a])
          axis.domain = frameAnimation.running(a + "bounds") ? frameAnimation.target(a + "bounds") : options.get(a + "bounds");
        if (edited.has(a + "Transform")) axis.transform = options.get(a + "Transform");
        if (styled.has("axisLabel" + A))
          axis.label = explicitAxisLabel(styles, a, { inherit: labelInherits(a) });
        if (styled.has("frame" + A + "Show")) axis.visible = styles.get("frame" + A + "Show");
        if (a !== "z" && styled.has("frame" + A + "Side")) axis.side = styles.get("frame" + A + "Side");
        // Layout ranges are not public Frame ranges: nested ranges are expressed
        // in parent coordinates. Read the same active mapping stage as rendering.
        if (edited.has(a + "range")) {
          let range = options.get(a + "range");
          if (frameMode && parentFrame && !placedFrame(options)) {
            const rangeKey = "_frame" + A + "Range";
            if (parentFrame.options.get("coordinates") !== "cartesian" ||
                frameDimensionStages(options, a)[0].rangeKey === rangeKey)
              range = frameAnimation.running(rangeKey) ? frameAnimation.target(rangeKey) : options.get(rangeKey);
            else range = range.map(frameDimensionMapping(parentFrame.options, a).inverse);
          }
          axis.range = range;
        }
        if (styled.size) for (const [key, value] of Object.entries(readAxis(options, a)))
          if (styled.has(axisKey(a, key))) axis[key === "timeOrigin" ? "origin" : key] = value;
        if (Object.keys(axis).length) result[a] = axis;
      }
      listener(result);
    };
    emit();
    const stops = [options.on(emit), styles.on(emit)];
    return () => stops.forEach((f) => f());
  };
  entry.handle = {
    getScreenMapping,
    subscribeScreenMapping,
    getAxisLayout,
    getLegendSource,
    getMinimapSource,
    getFrameOptions,
    subscribeSettings,
  };
  onDestroy(() => {
    stopDefaults?.();
    for (const { a, owner, inherited } of registeredDomains.values())
      if (inherited) parentFrame.domain(a, null, owner);
      else facet?.domain(definitionKey + ":" + a, null, owner);
    registeredDomains.clear();
    for (const { a, owner, inherited } of registeredNames.values())
      if (inherited) parentFrame?.axisName?.(a, undefined, owner);
    registeredNames.clear();
    if (parentFrame) for (const a of "xyz") parentFrame.domain(a, null, extentOwner);
    unregister();
    off.forEach((f) => f());
    reportDataError(viewServices, errorOwner, "");
    reportDataError(viewServices, placementErrorOwner, "");
    // The view owns its root frame's options.
    if (!viewRoot) options.dispose();
  });
</script>

{#if globe}
  <GlobeGuides {options} placement={entry.placement} width={view.width()} height={view.height()}
    active={view.mode() === "2d" && shown && !placedFrame(options) && view.width() >= 120 && view.height() >= 80} />
{/if}
{#each layout?.x?.reference?.length || layout?.y?.reference?.length ? [false, true] : [false] as references}
<AxisRules {references} placement={entry.placement}
  {layout}
  width={view.width()}
  height={view.height()}
  active={view.mode() === "2d" && shown}
/>
{/each}
<Axes3D
  {options}
  config={guides3d}
  enabledAxes={view.mode() === "3d" && !hasAxisOverride(styles, "axes3d") && explicit3dAxes.some(Boolean) ? explicit3dAxes : null}
  titles={entry.titles}
  active={show3d}
  flat={view.mode() === "2d"}
  width={view.width()}
  height={view.height()}
  onframe={(box) => {
    entry.box = box;
    view.model.framesChanged();
  }}
/>
{@render children?.()}
