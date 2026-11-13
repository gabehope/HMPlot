<script lang="ts">
  import { useReporter } from "./utils/reporter.js";
  import type { FrameContext } from "./utils/internalTypes.js";
  import { getContext, setContext, onDestroy, tick, untrack } from "svelte";
  import { useThrelte } from "@threlte/core";
  import { VIEW_CONTEXT, AXIS_CONTEXT } from "./utils/axisFrame.js";
  import { unionDomains } from "./utils/markDomains.js";
  import { pngScale } from "./utils/documentExport.js";
  import {
    embeddedFacetLayout,
    validateFacetConfig,
  } from "./utils/embeddedFacets.js";
  import { diagnostic } from "./utils/diagnostics.js";
  import {
    ALIGN_GROUP,
    ALIGN_MEMBER,
    createAlignGroup,
  } from "./utils/alignGroup.svelte.js";
  import { provideClockScope } from "./utils/clockScope.js";
  import PlotControls from "../options/plotControls.svelte";
  import PlotDialogs from "../options/plotDialogs.svelte";
  import { PlotChrome } from "../options/plotChrome.svelte.js";
  import { optionsRoot } from "../options/options.js";
  import { ensureAxisOptions } from "./utils/axisOptions.js";
  import { ensureHeatmapOptions } from "./objects/defaultOptions.js";
  import { FieldType, SelectType, IntegerType } from "./objects/types.js";
  import type { FacetProps, CategoryValue } from "./publicTypes.js";
  import {
    categorical,
    categoryBounds,
    DATA_CONTEXT,
  } from "./utils/categorical.js";
  import { partitionFacets } from "./utils/facets.js";
  import { tryNormalizeFacetSpec } from "./utils/facetSpec.js";
  import { fieldScaleDomains } from "./utils/axisColumns.js";
  import { reportDataError } from "./utils/dataErrors.js";
  import { useViewServices } from "./utils/viewServices.js";
  import { partitionGroup } from "./utils/facetService.js";
  import { initializePlot } from "../jaxExtensions/setup.js";
  import { createTransformRegistry } from "./utils/transformRegistry.js";
  import Cell from "./facetCell.svelte";
  import { linkedViewport, normalizeViewport } from "./utils/viewport.js";
  import { composedDocument } from "./utils/sceneDocumentExport.js";
  import { DEFAULT_FONT } from "./utils/defaultFont.js";
  import { createFacetEngine } from "./utils/facetEngine.js";
  import { createScaleRegistry } from "./utils/scaleResources.js";
  import { GUIDE_CONTEXT, createGuideRegistry } from "./utils/guides.js";
  import GuideHost from "./guides/guideHost.svelte";
  import {
    endpointDescriptor,
    EXTERNAL_FACET_ENDPOINT_ERROR,
  } from "./utils/connections.js";
  import { exportGuides } from "./utils/guideExport.js";
  import { exportDocumentGuides } from "./utils/guideDocumentExport.js";
  import { ownTexts } from "./utils/textExport.js";
  import { limitError } from "./utils/limits.js";
  import PlotText from "./plotText.svelte";
  let {
    name = "Facet",
    settings = {},
    layout = undefined,
    bandPadding = 0.1,
    row,
    column,
    wrap,
    rowOrder,
    columnOrder,
    fields = undefined,
    pairs = undefined,
    triangle = undefined,
    diagonal = undefined,
    as = undefined,
    scales = undefined,
    resolve = undefined,
    link = "auto",
    children,
    gap = 16,
    cacheSize = 64,
    exportHTML = undefined,
    legend = undefined,
    title = undefined,
    subtitle = undefined,
    caption = undefined,
  }: FacetProps & {
    exportHTML?: () => Promise<Blob | { blob: Blob; warnings?: string[] }>;
  } = $props();
  const embeddedView = getContext<FrameContext>(VIEW_CONTEXT),
    parentFrame: any = getContext(AXIS_CONTEXT);
  const embedded = Boolean(embeddedView);
  // A standalone Facet's cells share one clock (TODO 50), unless one exists above it; an
  // embedded Facet's cells are frames of its Plot, already one clock.
  if (!embedded) provideClockScope();
  if (embedded && !parentFrame)
    throw Error("Embedded Facet requires a Frame or Plot scope.");
  const parent: any = getContext(DATA_CONTEXT);
  if (!parent) throw Error("Facet requires a Data scope.");
  // A Facet owns frames and layout; a Partition repeats children inside one frame. Nesting a
  // Facet inside a Partition would ask each group for its own grid in the same place.
  if (partitionGroup())
    throw Error(
      "Facet cannot be nested inside Partition; partition inside the Facet instead.",
    );
  export const getSelection = () => parent.read()?.identity?.selection;
  export const getBrush = () => parent.read()?.identity?.brush;
  export const getHover = () => parent.read()?.identity?.hover;
  /**
   * The uniquely named endpoint mark repeated in this Facet's cells, for connect():
   * `connect(facet.endpoint("values"), {key: "id"})` joins the cells in facet order. Embedded
   * Facets only: an external Facet's cells are separate views, which connections do not cross.
   */
  export const endpoint = (
    name: string,
    config: Partial<{ at: string }> = {},
  ) => {
    if (!embedded) throw Error(EXTERNAL_FACET_ENDPOINT_ERROR);
    return endpointDescriptor({
      scope: facetOptions,
      name,
      at: config.at,
      scopeKind: "Facet",
    });
  };
  const facetOptions = (
    getContext<any>("hmplot-plot-scope") ?? optionsRoot
  ).splitUnique(untrack(() => name));
  ensureHeatmapOptions(facetOptions);
  facetOptions.setPresentation({ kind: "facet", label: untrack(() => name) });
  setContext("hmplot-plot-scope", facetOptions);
  // An external grid hosts one legend for every cell (embedded facets already share their
  // Plot's legend). legend="cell" opts back into one legend per cell: the cells then keep
  // their own registries, so flipping it remounts them.
  const facetGuides: any = !embedded ? createGuideRegistry() : null;
  if (facetGuides) {
    setContext(GUIDE_CONTEXT, facetGuides);
    facetOptions.guideRegistry = facetGuides;
  }
  // A grid's cells line up their plot areas (TODO 136.10 slice 5, utils/alignGroup): their Plots
  // join it, a scene's through its Plot node.
  const cellGroup = !embedded ? createAlignGroup(() => element) : null;
  if (cellGroup) {
    setContext(ALIGN_GROUP, cellGroup);
    setContext(ALIGN_MEMBER, cellGroup);
  }
  $effect(() => {
    if (cellGroup && element) return cellGroup.watch(element);
  });
  onDestroy(() => facetGuides?.dispose());
  const cellLegends = $derived(legend === "cell");
  const gridGuides = $derived(!!facetGuides && !cellLegends);
  export const getLegendSource = () => facetGuides?.handle;
  const facetLegend = $derived(
    legend && legend !== "cell"
      ? {
          position:
            typeof legend === "object"
              ? (legend.position ?? "bottom")
              : "bottom",
        }
      : false,
  );
  // legend={false} on the Facet also suppresses the automatic legend its cells request.
  const suppressLegend = $derived(legend === false);
  let shell = $state<HTMLDivElement>();
  const columnNames = untrack(() => {
    try {
      return parent.read().keys();
    } catch {
      return [];
    }
  });
  for (const k of ["row", "column"])
    facetOptions.ensure(
      "facet" + k[0].toUpperCase() + k.slice(1),
      new SelectType({ defaultValue: "", options: ["", ...columnNames] }),
    );
  facetOptions.ensure(
    "facetWrap",
    new IntegerType({ defaultValue: 0, min: 0, step: 1 }),
  );
  facetOptions.ensure(
    "facetGap",
    new IntegerType({ defaultValue: 16, min: 0, step: 1 }),
  );
  facetOptions.ensure(
    "facetScales",
    new SelectType({
      defaultValue: "shared",
      options: ["shared", "field", "free-x", "free-y", "free-z", "free"],
    }),
  );
  for (const family of ["color", "size", "width", "shape"])
    facetOptions.ensure(
      "facet" + family[0].toUpperCase() + family.slice(1) + "Resolution",
      new SelectType({
        defaultValue: "shared",
        options: ["shared", "independent"],
      }),
    );
  facetOptions.ensure(
    "facetLink",
    new SelectType({
      defaultValue: "auto",
      options: ["auto", "none", "x", "y", "xy", "grid"],
    }),
  );
  for (const key of ["rowOrder", "columnOrder"])
    facetOptions.ensure(
      "facet" + key[0].toUpperCase() + key.slice(1),
      new FieldType({ defaultValue: [], ui: { ui: "text" } }),
    );
  // The structural props as one spec (utils/facetSpec.js); its defaults decide the effective
  // scales and layout: "field" and "grid" with fields or pairs. Errors surface from the partition.
  const spec = $derived(
    tryNormalizeFacetSpec({
      row,
      column,
      wrap,
      rowOrder,
      columnOrder,
      fields,
      pairs,
      triangle,
      diagonal,
      as,
    }).spec,
  );
  const effectiveScales = $derived(scales ?? spec?.defaultScales ?? "shared");
  const effectiveLayout = $derived(layout ?? spec?.defaultLayout ?? "bands");
  const splitRow = $derived(spec?.splitRow ?? Boolean(row)),
    splitColumn = $derived(spec?.splitColumn ?? Boolean(column));
  let settingSync = false;
  // Settings and export buttons in the facet's top corner (TODO 60), shown faintly while it is
  // hovered, and the pane and panel they open (options/plotChrome.svelte.ts).
  const chrome = new PlotChrome({ canHover: true });
  let shellHovered = $state(false);
  const syncSettings = () => {
    const props = {
      row: row ?? "",
      column: column ?? "",
      wrap: wrap ?? 0,
      gap,
      scales: effectiveScales,
      link,
      rowOrder: rowOrder ?? [],
      columnOrder: columnOrder ?? [],
      colorResolution: resolve?.color ?? "shared",
      sizeResolution: resolve?.size ?? "shared",
      widthResolution: resolve?.width ?? "shared",
      shapeResolution: resolve?.shape ?? "shared",
    };
    settingSync = true;
    for (const [k, v] of Object.entries(props))
      facetOptions.set("facet" + k[0].toUpperCase() + k.slice(1), v);
    settingSync = false;
  };
  // Seed explicit component props before subscribing. Otherwise an eager
  // settings listener can replace row/column with defaults before the first
  // reactive synchronization runs.
  untrack(syncSettings);
  $effect(() => {
    const props = {
      row,
      column,
      wrap,
      gap,
      scales: effectiveScales,
      resolve,
      link,
      rowOrder,
      columnOrder,
    };
    untrack(syncSettings);
  });
  // A pane value equal to the default the spec gives is not written back as an explicit prop
  // (Reset in the pane returns to "shared", the setting's own default).
  const settingsOff = facetOptions.on(() => {
    if (settingSync) return;
    row = facetOptions.get("facetRow") || undefined;
    column = facetOptions.get("facetColumn") || undefined;
    wrap =
      (row && column) ||
      pairs !== undefined ||
      (fields !== undefined && (row || column))
        ? undefined
        : facetOptions.get("facetWrap") || undefined;
    gap = facetOptions.get("facetGap");
    const nextScales = facetOptions.get("facetScales");
    if (!(scales === undefined && nextScales === spec?.defaultScales))
      scales = nextScales;
    resolve = {
      color: facetOptions.get("facetColorResolution"),
      size: facetOptions.get("facetSizeResolution"),
      width: facetOptions.get("facetWidthResolution"),
      shape: facetOptions.get("facetShapeResolution"),
    };
    link = facetOptions.get("facetLink");
    rowOrder = facetOptions.get("facetRowOrder")?.length
      ? facetOptions.get("facetRowOrder")
      : undefined;
    columnOrder = facetOptions.get("facetColumnOrder")?.length
      ? facetOptions.get("facetColumnOrder")
      : undefined;
  });
  export const openSettings = (anchor = chrome.settingsButton) =>
    chrome.openSettings(anchor);
  export const closeSettings = () => chrome.closeSettings();
  export const subscribeSettings = (listener) => {
    // Only what the viewer edited in the settings pane (the user layer, TODO 136.7): the Facet's
    // props are the scene's own, and replaying them wrote defaults back as props.
    const emit = () => {
      const values = {
        row,
        column,
        wrap,
        gap,
        scales,
        resolve,
        link,
        rowOrder,
        columnOrder,
      };
      listener(
        Object.fromEntries(
          Object.entries(values).filter(([key]) =>
            facetOptions.userKeys?.has(key),
          ),
        ),
      );
    };
    emit();
    return facetOptions.on(emit);
  };
  // Embedded Facets have no error element of their own: their errors show on the Plot.
  const renderer = embedded
    ? (() => {
        try {
          return useThrelte().renderer;
        } catch {
          return undefined;
        }
      })()
    : undefined;
  const viewServices = embedded ? useViewServices() : undefined;
  const errorOwner = {};
  const automaticScales = createScaleRegistry();
  onDestroy(() => {
    settingsOff();
    automaticScales.dispose();
    facetOptions.dispose();
  });

  let measured = $state(900);

  let result = $state.raw<any>(null),
    error = $state(""),
    views = $state.raw<Record<string, any>>({}),
    alive = true,
    element = $state<HTMLDivElement>();
  // The grid's columns as laid out (a wrap fits as many as the width takes).
  const gridColumns = $derived(
    wrap
      ? Math.max(1, Math.min(result?.columns ?? 1, Math.floor(measured / 220)))
      : (result?.columns ?? 1),
  );
  const plots = new Map<string, any>(),
    domains = new Map<
      string,
      Map<any, { cell: string; bounds: number[]; columns?: any[] }>
    >(),
    // The column identities per axis each mark plots, by its domain owner (frame route).
    ownerColumns = new Map<any, Record<string, any[]>>();
  // scales="field" (TODO 21 F3): one grouping pass over every registered domain, coalesced in a
  // microtask, assigns each mounted cell's axes (utils/axisColumns.js fieldScaleDomains).
  let fieldPass = false;
  function scheduleFieldScales() {
    if (fieldPass) return;
    fieldPass = true;
    queueMicrotask(() => {
      fieldPass = false;
      if (alive && effectiveScales === "field") applyFieldScales();
    });
  }
  function applyFieldScales() {
    const current = result;
    if (!current) return;
    const entries = [];
    for (const [axis, values] of domains)
      for (const [owner, entry] of values)
        entries.push({
          cell: entry.cell,
          axis,
          bounds: entry.bounds,
          columns:
            entry.columns ??
            ownerColumns.get(owner)?.[axis.slice(axis.lastIndexOf(":") + 1)],
        });
    const assigned = fieldScaleDomains(
      entries,
      new Map(current.cells.map((cell) => [cell.key, cell])),
      current,
    );
    for (const key of embedded ? cellFrames.keys() : plots.keys())
      for (const [axis, bounds] of assigned.get(key) ?? [])
        assignDomain(key, axis, bounds);
  }
  let partitionKey = "";
  let engine: any,
    forced = $state<string | null>(null),
    estimatedHeight = $state(280),
    linked = $state<any>(null);
  const gridX = new Map<any, any>(),
    gridY = new Map<any, any>();
  // Retain a configurable number of offscreen cells; visible cells never count against
  // this budget. Eviction preserves the existing camera/settings memory path.
  let warmCells = $state<string[]>([]);
  const cacheLimit = $derived.by(() => {
    if (!Number.isSafeInteger(cacheSize) || cacheSize < 0)
      throw Error(
        "Facet.cacheSize must be a nonnegative integer (offscreen cells).",
      );
    return cacheSize;
  });
  $effect(() => {
    if (warmCells.length > cacheLimit)
      warmCells = cacheLimit === 0 ? [] : warmCells.slice(-cacheLimit);
  });
  const memories = new Map();
  const iterative = new Map();
  let controlVersion = $state(0);
  const transformRegistry = createTransformRegistry(() => controlVersion++);
  export const getTransform = (name: string) => transformRegistry.get(name);
  const jobs = new Set<Promise<any>>();
  const track = (p) => {
    jobs.add(p);
    embeddedView?.trackPreparation?.(p);
    p.finally(() => jobs.delete(p)).catch(() => {});
    return p;
  };
  const frameTemplates = new Map();
  const cellFrames = new Map<string, Map<string, any>>();
  function assignDomain(cell, axis, bounds) {
    const split = axis.lastIndexOf(":");
    const frame = cellFrames.get(cell)?.get(axis.slice(0, split));
    if (embedded) frame?.setDomain(axis.slice(split + 1), bounds);
    else plots.get(cell)?.setDomain(axis, bounds);
  }
  // One set of outer axes (TODO 136.10 slice 5, as ggplot's facet_grid): an axis the cells share
  // and pan together is labeled once per grid column (x, on its lowest cell, or its highest for
  // a top axis) and per grid row (y, on its leftmost, or its rightmost for a right axis); the
  // other cells keep its ticks and grid. link="auto" (the default) pans the shared axes
  // together, so the labels stay true for every cell; "none" keeps each cell's own.
  const sharedAxis = (axis: string) =>
    !embedded &&
    (effectiveScales === "shared" ||
      (effectiveScales.startsWith("free-") &&
        effectiveScales !== "free-" + axis));
  const autoLink = $derived(
    sharedAxis("x") && sharedAxis("y")
      ? "xy"
      : sharedAxis("x")
        ? "x"
        : sharedAxis("y")
          ? "y"
          : "none",
  );
  const effectiveLink = $derived(link === "auto" ? autoLink : link);
  const cellPlaces = $derived.by(() => {
    const cells = result?.cells ?? [],
      columns = gridColumns,
      placed =
        cells.length > 0 && cells.every((c: any) => c.gridRow && c.gridColumn);
    return new Map<string, { row: number; column: number }>(
      cells.map((c: any, i: number) => [
        c.key,
        placed
          ? { row: c.gridRow, column: c.gridColumn }
          : { row: Math.floor(i / columns) + 1, column: (i % columns) + 1 },
      ]),
    );
  });
  /** Which neighbors label this cell's axes: per axis, whether a cell sits on each side. */
  function innerAxes(cell: any) {
    const own = cellPlaces.get(cell.key),
      mode = effectiveLink,
      linked = (axis: string) =>
        sharedAxis(axis) && (mode === "xy" || mode === "grid" || mode === axis);
    const none = {
      x: { before: false, after: false },
      y: { before: false, after: false },
    };
    if (!own) return none;
    const others = [...cellPlaces.values()];
    const x = linked("x"),
      y = linked("y");
    return {
      // x: before is above, after below; y: before is left, after right.
      x: {
        before:
          x && others.some((p) => p.column === own.column && p.row < own.row),
        after:
          x && others.some((p) => p.column === own.column && p.row > own.row),
      },
      y: {
        before:
          y && others.some((p) => p.row === own.row && p.column < own.column),
        after:
          y && others.some((p) => p.row === own.row && p.column > own.column),
      },
    };
  }
  const controller = {
    /** Which of the cell's axes another cell labels (outer axes). */
    inner: (cell: any) => innerAxes(cell),
    // The Facet's options node: connection endpoints select repeated marks by it.
    scope: facetOptions,
    // The Facet's showExport and menu (TODO 128), which its cells' Plots follow.
    chrome: () => ({ showExport: settings.showExport, menu: settings.menu }),
    registerFrame(cell, slot, entry) {
      if (!cellFrames.has(cell.key)) cellFrames.set(cell.key, new Map());
      const group = cellFrames.get(cell.key);
      group.set(slot, entry);
      queueMicrotask(() => {
        if (alive) controller.refresh();
      });
      return () => {
        if (group.get(slot) === entry) group.delete(slot);
        if (!group.size) cellFrames.delete(cell.key);
      };
    },
    appearanceResolution(family) {
      return resolve?.[family] ?? "shared";
    },
    scaleExtent: (pipeline, field, transform) =>
      track(engine.scaleExtent(pipeline, field, transform)),
    autoScale(frameKey, identity, family, config) {
      if (controller.appearanceResolution(family) === "independent")
        return undefined;
      return automaticScales.resolve(`${frameKey}:${identity}`, family, config);
    },
    updateAutoScales(frameKey, family, config) {
      automaticScales.updateDefaults(family, config, `${frameKey}:`);
    },
    autoCategory(frameKey, identity, family, palette) {
      if (controller.appearanceResolution(family) === "independent")
        return undefined;
      return automaticScales.resolveCategory(
        `${frameKey}:${identity}`,
        family,
        palette,
      );
    },
    frameSettings(slot, options) {
      let template = frameTemplates.get(slot);
      if (!template) {
        template = facetOptions.splitUnique(
          "Axis " + (Number(slot) + 1) + " defaults",
        );
        template.setPresentation({
          kind: "axis",
          label: "Axis " + (Number(slot) + 1) + " defaults",
        });
        ensureAxisOptions(template.ensureChild("plot"));
        frameTemplates.set(slot, template);
      }
      const previous = new Map();
      const apply = () => {
        for (const [source, target, prefix] of [
          [template, options, ""],
          [template.ensureChild("plot"), options.ensureChild("plot"), "plot."],
        ])
          for (const [key, value] of source.values) {
            if (!target.has(key)) continue;
            const path = prefix + key,
              current = target.get(key),
              before = previous.get(path);
            const generated =
              /^[xyz]bounds$/.test(key) &&
              JSON.stringify(options.inferredDomains?.[key[0]]) ===
                JSON.stringify(current);
            if (
              !previous.has(path) ||
              JSON.stringify(before) === JSON.stringify(current) ||
              generated
            ) {
              target.set(key, value);
              previous.set(path, value);
            }
          }
      };
      apply();
      const off = [template.on(apply), template.ensureChild("plot").on(apply)];
      return () => off.forEach((f) => f());
    },
    saveIterative(cell, slot, value) {
      const key = cell.key + ":" + slot;
      iterative.get(key)?.then((saved) => saved.dispose());
      iterative.set(key, value);
    },
    takeIterative(cell, slot) {
      const key = cell.key + ":" + slot,
        value = iterative.get(key);
      iterative.delete(key);
      return value;
    },
    transformSettings(name) {
      controlVersion;
      return transformRegistry.settings(name);
    },
    registerTransform: (name, handle) =>
      transformRegistry.register(name, handle),
    transform: (cell, kind, scope, config) =>
      track(engine.transform(cell, kind, scope, config)),
    bins: (cell, slot, kind, scope, config, signal) =>
      track(engine.bins(slot, kind, scope, config)),
    define: (cell, slot, kind, props, pipeline, options) =>
      track(engine.define(slot, kind, props, pipeline, options)),
    track,
    forced: (key) => forced === key,
    warm: (key) => warmCells.includes(key),
    visibility: (key, visible) => {
      const rest = warmCells.filter((k) => k !== key);
      warmCells =
        visible || cacheLimit === 0 ? rest : [...rest, key].slice(-cacheLimit);
    },
    forget: (key) => {
      warmCells = warmCells.filter((k) => k !== key);
    },
    height: (value) => {
      if (value > 40) estimatedHeight = value;
    },
    get estimatedHeight() {
      return estimatedHeight;
    },
    refresh() {
      if (effectiveScales === "field") return scheduleFieldScales();
      for (const key of embedded ? cellFrames.keys() : plots.keys())
        for (const [axis, entries] of domains) {
          const free =
            effectiveScales === "free" ||
            effectiveScales === "free-" + axis.split(":").at(-1);
          const all = [...entries.values()]
            .filter((e) => !free || e.cell === key)
            .map((e) => e.bounds);
          if (all.length)
            assignDomain(key, axis, [
              Math.min(...all.map((b) => b[0])),
              Math.max(...all.map((b) => b[1])),
            ]);
        }
    },
    memory: (cell) => memories.get(cell.key),
    get scales() {
      return effectiveScales;
    },
    get source() {
      return parent.read();
    },
    register(cell, plot) {
      if (plots.has(cell.key))
        throw Error("Each facet must contain exactly one Plot.");
      if (effectiveLink === "grid" && !plot.handle?.gridLinkCompatible?.())
        throw Error('Facet link="grid" supports Cartesian 2D plots only.');
      plots.set(cell.key, { ...plot, row: cell.row, column: cell.column });
      controller.refresh();
      if (memories.has(cell.key))
        tick().then(() => {
          if (plots.has(cell.key)) controller.refresh();
        });
      return () => {
        memories.set(cell.key, plot.snapshot?.());
        plots.delete(cell.key);
      };
    },
    viewport(cell) {
      const local = views[cell.key];
      if (!linked || effectiveLink === "none") return local;
      if (effectiveLink === "grid") {
        let value = local;
        if (gridX.has(cell.column))
          value = linkedViewport(value, gridX.get(cell.column), "x");
        if (gridY.has(cell.row))
          value = linkedViewport(value, gridY.get(cell.row), "y");
        return value;
      }
      return linkedViewport(local, linked, effectiveLink);
    },
    changed(cell, next) {
      if (effectiveLink === "none") {
        views = { ...views, [cell.key]: next };
        return;
      }
      linked = normalizeViewport(next);
      if (effectiveLink === "grid") {
        gridX.set(cell.column, linked);
        gridY.set(cell.row, linked);
        const updated = { ...views, [cell.key]: linked };
        for (const [key, plot] of plots) {
          if (key === cell.key) continue;
          let value = updated[key];
          if (Object.is(plot.column, cell.column))
            value = linkedViewport(value, linked, "x");
          if (Object.is(plot.row, cell.row))
            value = linkedViewport(value, linked, "y");
          updated[key] = value;
        }
        views = updated;
        return;
      }
      const updated = { ...views, [cell.key]: linked };
      for (const key of plots.keys()) {
        if (key === cell.key) continue;
        updated[key] = linkedViewport(updated[key], next, effectiveLink);
      }
      views = updated;
    },
    /** The columns per axis a mark plots (namedMark, by its domain owner); null withdraws. */
    axisColumns(owner, columns) {
      const before = JSON.stringify(ownerColumns.get(owner) ?? null);
      if (columns) ownerColumns.set(owner, columns);
      else ownerColumns.delete(owner);
      if (
        effectiveScales === "field" &&
        before !== JSON.stringify(columns ?? null)
      )
        scheduleFieldScales();
    },
    /** `columns`: the identities the mark plots on this axis, when the engine computed them. */
    domain(cell, axis, bounds, owner, columns = undefined) {
      let entries = domains.get(axis);
      if (!entries) {
        entries = new Map();
        domains.set(axis, entries);
      }
      if (bounds) entries.set(owner, { cell: cell.key, bounds, columns });
      else entries.delete(owner);
      if (effectiveScales === "field") return scheduleFieldScales();
      const free =
        effectiveScales === "free" ||
        effectiveScales === "free-" + axis.split(":").at(-1);
      const domain = unionDomains(
        [...entries.values()]
          .filter((e) => !free || e.cell === cell.key)
          .map((e) => e.bounds),
      );
      if (!domain) return;
      for (const key of embedded ? cellFrames.keys() : plots.keys())
        if (!free || key === cell.key) assignDomain(key, axis, domain);
    },
  };
  $effect(() => {
    let source;
    const config = {
      row,
      column,
      wrap,
      rowOrder,
      columnOrder,
      fields,
      pairs,
      triangle,
      diagonal,
      as,
    };
    try {
      source = parent.read();
      source.version;
    } catch (e) {
      untrack(() => (error = e.message));
      return;
    }
    const key = JSON.stringify([source.version, config]);
    if (untrack(() => result) && partitionKey === key) return;
    const cancel = new AbortController();
    untrack(() =>
      track(
        initializePlot()
          .then(() =>
            partitionFacets(source, config, { signal: cancel.signal }),
          )
          .then((next) => {
            if (!alive || cancel.signal.aborted) {
              next.dispose();
              return;
            }
            const old = result;
            engine?.dispose();
            engine = createFacetEngine(next.cells, (slot, results) => {
              for (const entry of results)
                for (const [axis, bounds] of Object.entries(entry.bounds))
                  controller.domain(
                    { key: entry.cell },
                    axis,
                    bounds,
                    `${slot}:${entry.cell}`,
                    entry.columns?.[axis],
                  );
            });
            partitionKey = key;
            // Configured facet order (row-major): endpoint registries sort cells by it.
            next.cells.forEach((cell: any, index) => {
              cell.index = index;
            });
            result = next;
            error = "";
            domains.clear();
            tick().then(() => old?.dispose());
          })
          .catch((e) => {
            if (e.name !== "AbortError" && !cancel.signal.aborted)
              error = e.message;
          }),
      ),
    );
    return () => cancel.abort();
  });
  $effect(() => {
    // The layout prop, not the effective one: a spec's default is valid wherever the Facet is.
    validateFacetConfig({
      embedded,
      link,
      layout,
      scales: effectiveScales,
      resolve,
      splitRow,
      splitColumn,
      wrap,
    });
  });
  $effect(() => reportDataError(viewServices, errorOwner, error));
  onDestroy(() => reportDataError(viewServices, errorOwner, ""));
  let initializedGrid = "";
  $effect(() => {
    const mode = effectiveLink,
      current = result,
      key = `${partitionKey}:${mode}`;
    if (mode !== "grid" || !current || initializedGrid === key) return;
    initializedGrid = key;
    untrack(() => {
      gridX.clear();
      gridY.clear();
      for (const cell of current.cells) {
        const value = normalizeViewport(views[cell.key]);
        if (!gridX.has(cell.column)) gridX.set(cell.column, value);
        if (!gridY.has(cell.row)) gridY.set(cell.row, value);
      }
      linked = normalizeViewport(
        current.cells.length ? views[current.cells[0].key] : undefined,
      );
      views = Object.fromEntries(
        current.cells.map((cell) => {
          let value = views[cell.key];
          value = linkedViewport(value, gridX.get(cell.column), "x");
          value = linkedViewport(value, gridY.get(cell.row), "y");
          return [cell.key, value];
        }),
      );
    });
  });
  export const getFrames = () =>
    (result?.cells ?? []).flatMap((cell) =>
      [...(cellFrames.get(cell.key)?.values() ?? [])].map((entry) => ({
        frame: entry.handle,
        row: cell.row,
        column: cell.column,
      })),
    );
  const embeddedLayout = $derived(
    embedded
      ? embeddedFacetLayout(result?.cells ?? [], {
          splitRow,
          splitColumn,
          layout: effectiveLayout,
          wrap,
          bandPadding,
          gap,
          width: embeddedView.width(),
          height: embeddedView.height(),
        })
      : null,
  );
  const extentOwner = crypto.randomUUID();
  const categoryOverrides = new Map();
  function restoreCategories() {
    for (const [a, saved] of categoryOverrides) {
      const options = parentFrame.options;
      if (options.categoryAxes?.[a] === saved.scale) {
        if (saved.previous) options.categoryAxes[a] = saved.previous;
        else delete options.categoryAxes[a];
        if (
          JSON.stringify(options.get(a + "bounds")) ===
          JSON.stringify(saved.bounds)
        )
          options.set(a + "bounds", saved.previousBounds);
        options.set(
          "_categoryRevision",
          (options.get("_categoryRevision") ?? 0) + 1,
        );
      }
    }
    categoryOverrides.clear();
  }
  $effect(() => {
    const current = result,
      mode = effectiveLayout,
      splitAxes = { x: splitColumn, y: splitRow };
    if (!embedded || !current) return;
    untrack(() => {
      restoreCategories();
      if (mode !== "bands") return;
      for (const a of "xy") {
        if (!splitAxes[a]) continue;
        const options = parentFrame.options;
        if (
          options.get(a + "Transform") !== "linear" ||
          options.get("coordinates") !== "cartesian"
        )
          throw Error(
            "Embedded categorical bands require Cartesian linear parent dimensions.",
          );
        const domain = [
          ...new Set<CategoryValue>(
            current.cells.map((cell) => cell[a === "x" ? "column" : "row"]),
          ),
        ];
        if (!domain.length || options.categoryAxes?.[a]) continue;
        const scale = categorical({ domain }),
          bounds = categoryBounds(a, domain.length, options);
        categoryOverrides.set(a, {
          scale,
          previous: options.categoryAxes?.[a],
          bounds,
          previousBounds: options.get(a + "bounds"),
        });
        options.categoryAxes ??= {};
        options.categoryAxes[a] = scale;
        if (!parentFrame.hasExplicitDomains(a))
          options.set(a + "bounds", bounds);
        options.set(
          "_categoryRevision",
          (options.get("_categoryRevision") ?? 0) + 1,
        );
      }
    });
  });
  onDestroy(restoreCategories);
  $effect(() => {
    if (!embeddedLayout) return;
    for (const a of "xy")
      parentFrame.domain(a, embeddedLayout.extent[a], extentOwner);
  });
  onDestroy(() => {
    if (embedded)
      for (const a of "xy") parentFrame.domain(a, null, extentOwner);
  });
  export const getPlots = () =>
    (result?.cells ?? []).flatMap((cell) => {
      const plot = plots.get(cell.key);
      return plot
        ? [{ plot: plot.handle, row: cell.row, column: cell.column }]
        : [];
    });
  export async function exportCells(format = "png", options: any = {}) {
    if (embedded)
      throw Error(
        "Embedded facet cells share one canvas. Export the enclosing Plot instead.",
      );
    await whenSettled();
    if (!result) throw Error("Facet data is not ready.");
    const version = result,
      items = [];
    try {
      for (const cell of version.cells) {
        forced = cell.key;
        for (let attempt = 0; !plots.has(cell.key); attempt++) {
          if (!alive || result !== version)
            throw Error("Facet data changed during export.");
          if (attempt > 500) throw Error("Facet plot did not initialize.");
          await new Promise((resolve) => setTimeout(resolve, 20));
        }
        await whenSettled();
        if (result !== version)
          throw Error("Facet data changed during export.");
        const plot = plots.get(cell.key).handle;
        const output =
          format === "png"
            ? await plot.exportPNG({ scale: options.scale ?? 2 })
            : await plot[format === "svg" ? "exportSVG" : "exportPDF"](options);
        items.push({
          key: cell.key,
          row: cell.row,
          column: cell.column,
          blob: output?.blob ?? output,
          report: output?.report ?? null,
        });
      }
      return { items };
    } finally {
      forced = null;
    }
  }
  $effect(() => {
    effectiveScales;
    untrack(() => controller.refresh());
  });
  export const whenSettled = async (options = undefined) => {
    const deadline = Date.now() + 30000;
    for (
      let pass = 0;
      pass < 3 || jobs.size || [...plots.values()].some((p) => !p.ready());
      pass++
    ) {
      if (!alive) throw Error("Facet has been unmounted.");
      if (Date.now() > deadline)
        throw Error(
          "Facet preparation did not complete. Check the plot errors and retry.",
        );
      await tick();
      await Promise.all([...jobs]);
      await engine?.whenSettled();
      await Promise.all(
        [...plots.values()].map(async (p) => {
          await p.initialize();
          await p.handle.whenSettled(options);
        }),
      );
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
    if (embedded) await embeddedView.whenSettled(options);
    if (error) throw Error(error);
  };
  export async function exportPNG(options = {}) {
    if (embedded)
      throw Error(
        "Embedded facets share one canvas. Export the enclosing Plot instead.",
      );
    // A cell's PNG (a Plot's) has scale x the device pixel ratio pixels per CSS pixel; the grid
    // is drawn at the same resolution (`pixels`), so each cell's image fills its box (TODO 69).
    const scale = pngScale(options),
      pixels = scale * (window.devicePixelRatio || 1);
    await whenSettled();
    if (!result) throw Error("Facet data is not ready.");
    const version = result,
      images = [];
    // The grid's canvas: 128 MiB at 4 bytes a pixel.
    const preflight = () => {
      const count = Math.ceil(
        element.scrollWidth * element.scrollHeight * pixels * pixels,
      );
      if (count * 4 > 128 * 1024 * 1024)
        throw limitError("exportPixels", {
          component: "Facet",
          what: "a PNG export",
          count,
          limit: (128 * 1024 * 1024) / 4,
        });
    };
    preflight();
    try {
      for (const cell of version.cells) {
        forced = cell.key;
        for (let attempt = 0; !plots.has(cell.key); attempt++) {
          if (!alive || result !== version)
            throw Error("Facet data changed during export.");
          if (attempt > 500) throw Error("Facet plot did not initialize.");
          await new Promise((resolve) => setTimeout(resolve, 20));
        }
        await whenSettled();
        if (result !== version)
          throw Error("Facet data changed during export.");
        const plot = plots.get(cell.key),
          host = plot.element(),
          container = host.closest(".facet-cell");
        images.push({
          cell,
          container,
          offset:
            host.getBoundingClientRect().top -
            container.getBoundingClientRect().top,
          blob: await plot.handle.exportPNG({ scale }),
        });
        preflight();
      }
      await tick();
      preflight();
      const bounds = element.getBoundingClientRect(),
        canvas = document.createElement("canvas");
      canvas.width = Math.ceil(element.scrollWidth * pixels);
      canvas.height = Math.ceil(element.scrollHeight * pixels);
      const context = canvas.getContext("2d");
      if (!context) throw Error("Unable to allocate the facet export canvas.");
      context.fillStyle = "#fff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      for (const { cell, container, offset, blob } of images) {
        const bitmap = await createImageBitmap(blob),
          box = container.getBoundingClientRect(),
          x = box.left - bounds.left + element.scrollLeft,
          y = box.top - bounds.top + element.scrollTop;
        context.fillStyle = "#586272";
        context.font = `${12 * pixels}px ${DEFAULT_FONT}`;
        context.fillText(cell.label, (x + 4) * pixels, (y + 17) * pixels);
        context.drawImage(bitmap, x * pixels, (y + offset) * pixels);
        bitmap.close();
      }
      if (!alive || result !== version)
        throw Error("Facet data changed during export.");
      const grid = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (blob) =>
            blob ? resolve(blob) : reject(Error("PNG encoding failed.")),
          "image/png",
        ),
      );
      // Grid legends, and the Facet's own title and caption (TODO 46), around the cells.
      return gridGuides || ownTexts(shell).length
        ? await exportGuides(grid, element, shell, {
            maxTextureDimension2D: 16384,
            maxBufferSize: 2 ** 30,
          })
        : grid;
    } finally {
      forced = null;
    }
  }
  async function exportVector(format: "svg" | "pdf", options = {}) {
    if (embedded)
      throw Error(
        "Embedded facets share one canvas. Export the enclosing Plot instead.",
      );
    await whenSettled();
    if (!result) throw Error("Facet data is not ready.");
    const version = result,
      fragments = [],
      root = element.getBoundingClientRect();
    try {
      for (const cell of version.cells) {
        forced = cell.key;
        for (let attempt = 0; !plots.has(cell.key); attempt++) {
          if (!alive || result !== version)
            throw Error("Facet data changed during export.");
          if (attempt > 500) throw Error("Facet plot did not initialize.");
          await new Promise((resolve) => setTimeout(resolve, 20));
        }
        await whenSettled();
        const plot = plots.get(cell.key),
          host = plot.element(),
          container = host.closest(".facet-cell"),
          box = container.getBoundingClientRect(),
          hostBox = host.getBoundingClientRect(),
          value = await plot.handle.exportSVG({
            ...options,
            width: hostBox.width,
            height: hostBox.height,
          }),
          text = await value.blob.text(),
          body = text
            .replace(/^.*?<svg[^>]*>/s, "")
            .replace(/<\/svg>\s*$/s, ""),
          x = box.left - root.left + element.scrollLeft,
          y = box.top - root.top + element.scrollTop,
          offset = hostBox.top - box.top;
        const label = String(cell.label).replace(
          /[&<>"']/g,
          (c) =>
            ({
              "&": "&amp;",
              "<": "&lt;",
              ">": "&gt;",
              '"': "&quot;",
              "'": "&apos;",
            })[c],
        );
        fragments.push({
          svg: `<text x="${x + 4}" y="${y + 17}" font-family="${DEFAULT_FONT.replace(/"/g, "&quot;")}" font-size="12" fill="#586272">${label}</text><g transform="translate(${x} ${y + offset})">${body}</g>`,
          report: value.report,
        });
      }
      if (!gridGuides && !ownTexts(shell).length)
        return await composedDocument(
          fragments,
          element.scrollWidth,
          element.scrollHeight,
          format,
          options,
        );
      const grid = await composedDocument(
        fragments,
        element.scrollWidth,
        element.scrollHeight,
        "svg",
        options,
      );
      return await exportDocumentGuides(grid, element, shell, format, options);
    } finally {
      forced = null;
    }
  }
  export const exportSVG = (options = {}) => exportVector("svg", options);
  export const exportPDF = (options = {}) => exportVector("pdf", options);
  onDestroy(() => {
    alive = false;
    for (const value of iterative.values())
      value.then((saved) => saved.dispose());
    iterative.clear();
    transformRegistry.dispose();
    engine?.dispose();
    result?.dispose();
  });
  // Its error is a diagnostic of its scene node too (TODO 136.6, utils/reporter.js).
  const reportError = useReporter("Facet");
  $effect(() => reportError(error));
  // Cells narrower than a plot's axes and controls take (the overlay needs 120 px, the
  // buttons 160) are a warning: the grid shrinks its columns to the width instead of scrolling.
  const reportNarrow = useReporter("Facet", { severity: "warning" });
  $effect(() => {
    measured;
    // The grid as measured now (its first value is a guess); a hidden grid (0 px) says nothing.
    const width = element?.clientWidth ?? 0,
      columns = gridColumns,
      cell = Math.floor((width - gap * (columns - 1)) / columns),
      narrow = !embedded && !!result?.cells?.length && width > 0 && cell < 160;
    untrack(() =>
      reportNarrow(
        narrow
          ? diagnostic(
              "layout.facetCells",
              `Facet: ${columns} column${columns === 1 ? "" : "s"} leave${columns === 1 ? "s" : ""} each cell ${cell}px wide, too narrow for its axes and controls. Use fewer columns (wrap), or give the grid more width.`,
              { component: "Facet" },
            )
          : "",
      ),
    );
  });
</script>

{#if embedded}
  {#each embeddedLayout.cells as item (item.cell.key)}
    <Cell cell={item.cell} {controller} embedded frameX={item.x} frameY={item.y}
      >{@render children?.()}</Cell
    >
  {/each}
{:else}
  {#if error}<p role="alert">{error}</p>{/if}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="facet-shell"
    bind:this={shell}
    data-export-host
    onpointerenter={(event) => {
      if (event.pointerType !== "touch") shellHovered = true;
    }}
    onpointerleave={() => (shellHovered = false)}
  >
    {#if settings.showTrigger !== false}<PlotControls
        label={name}
        corner="top"
        revealed={shellHovered}
        touch={!chrome.canHover}
        settingsOpen={chrome.settingsOpen}
        exportOpen={chrome.exportOpen}
        canExport={settings.showExport !== false &&
          !!(exportPNG || exportSVG || exportHTML)}
        bind:settingsButton={chrome.settingsButton}
        bind:exportButton={chrome.exportButton}
        onsettings={(button) => chrome.toggleSettings(button)}
        onexport={(button) => chrome.toggleExport(button)}
      />{/if}
    <PlotText options={facetOptions} part="heading" {title} {subtitle} />
    {#if gridGuides}<GuideHost
        registry={facetGuides}
        position="top"
        defaultLegend={facetLegend}
        suppress={suppressLegend}
      />{/if}
    <div class="facet-body">
      {#if gridGuides}<GuideHost
          registry={facetGuides}
          position="left"
          defaultLegend={facetLegend}
          suppress={suppressLegend}
        />{/if}
      <div
        bind:this={element}
        class="facets"
        bind:clientWidth={measured}
        style:--columns={gridColumns}
        style:gap={`${gap}px`}
      >
        {#key cellLegends}{#each result?.cells ?? [] as cell (cell.key)}<Cell
              {cell}
              {controller}
              ownLegend={cellLegends}>{@render children?.()}</Cell
            >{/each}{/key}
      </div>
      {#if gridGuides}<GuideHost
          registry={facetGuides}
          position="right"
          defaultLegend={facetLegend}
          suppress={suppressLegend}
        />{/if}
    </div>
    {#if gridGuides}<GuideHost
        registry={facetGuides}
        position="bottom"
        defaultLegend={facetLegend}
        suppress={suppressLegend}
      />{/if}
    <PlotText options={facetOptions} part="caption" {caption} />
    <PlotDialogs
      {chrome}
      options={facetOptions}
      label={name}
      allowSharedDefaults={false}
      {exportPNG}
      {exportSVG}
      {exportPDF}
      {exportHTML}
    />
  </div>
{/if}

<style>
  .facet-shell {
    position: relative;
  }
  .facet-body {
    display: flex;
    align-items: flex-start;
    min-width: 0;
  }
  .facet-body > .facets {
    flex: 1;
    min-width: 0;
  }

  .facets {
    display: grid;
    /* Facets never scroll (TODO 136.10 slice 6): the columns share the width, and cells too
       narrow for their axes warn. */
    grid-template-columns: repeat(var(--columns), minmax(0, 1fr));
    align-items: start;
  }
  p {
    font: 12px system-ui;
    color: #9d3535;
  }
</style>
