import { transformForward, scaleValueAt } from "./scaleTransforms.js";
import { Color } from "three/webgpu";
import { isCustomShape, isShape, shapeVertices, shapeOutline } from "./shapes.js";
import { contourPath } from "./shapePaths.js";
import { formatDatetime } from "./datetime.js";
import { markBinding } from "./markBinding.js";
import { format } from "d3";
/** A mark's legend metadata: its accepted binding's (Stage 117.2). */
const legendOf = (mark) => markBinding(mark)?.legend;
const objects = new WeakMap();
export const GUIDE_CONTEXT = Symbol("HMPlot guides");
export function resolveGuide(target) {
  return target?.getLegendSource?.() ?? target;
}
export function guideObject(handle) {
  return handle?.guideMark?.() ?? objects.get(handle);
}
/**
 * The authored scope path of a mark: each ancestor scope's name as written (unnamed
 * components use their per-parent ordinal label, e.g. "Sprites 2"). A Facet cell scope (the
 * cell's Plot, or an embedded cell's Frame) sets `definitionAlias = "*"`, so every cell's
 * mount of one authored mark shares the key while two authored sibling marks do not.
 * Nodes the user did not write are left out, so they cannot change a mark's identity: Theme
 * scopes (relabelled "Theme: <name>" on every preset change) and scopes flagged
 * `internalScope`.
 * `repeated: true` reads every alias as "*": a Partition with legendGroups gives each group
 * its own legend definition, but its groups still repeat one authored mark (connections).
 */
export function definitionKey(options, { repeated = false } = {}) {
  const parts = [];
  for (let node = options; node?.defaults; node = node.defaults) {
    if (node.definitionAlias) { parts.push(repeated ? "*" : node.definitionAlias); continue; }
    if (node.presentation?.kind === "theme" || node.internalScope) continue;
    // Cell plots are ordinal siblings ("Plot 7", "Plot 8"); their scopes above are shared.
    parts.push(node.presentation?.label ?? node.identifier);
  }
  return parts.reverse().join("/");
}
export function registryFor(options) {
  for (let n = options; n; n = n.defaults)
    if (n.guideRegistry) return n.guideRegistry;
}
/**
 * Hide or show one category of a definition. `state` is the group's shared
 * `{hidden: {channel: Set}, isolation: {channel: {value, before}}}`; every mount reads it, so
 * the toggle is applied once and each mount is then refreshed. Shift-isolate hides every other
 * value of `domain`; repeating it restores the hidden set from before.
 */
export function applyCategoryToggle(state, channel, value, isolate, domain = []) {
  const hidden = (state.hidden[channel] ??= new Set());
  if (isolate) {
    const active = state.isolation[channel];
    if (active?.value === value) {
      state.hidden[channel] = active.before;
      delete state.isolation[channel];
    } else {
      state.isolation[channel] = { value, before: new Set(hidden) };
      state.hidden[channel] = new Set(domain.filter((v) => v !== value));
    }
  } else {
    hidden.has(value) ? hidden.delete(value) : hidden.add(value);
    delete state.isolation[channel];
  }
  return state;
}
export function createGuideRegistry() {
  const marks = new Set(),
    listeners = new Set(),
    guides = new Map(),
    groups = new Map(),
    groupHandles = new Map(),
    keys = new Map(),
    states = new Map(),
    automaticRequests = new Map();
  let queued = false,
    disposed = false;
  const notify = () => {
    if (queued || disposed) return;
    queued = true;
    queueMicrotask(() => {
      queued = false;
      if (disposed) return;
      refile();
      listeners.forEach((fn) => fn());
    });
  };
  // Shared hide/show state per definition: `visible` for the series entry, hidden categories
  // per channel. New mounts (a Facet cell scrolled into view, an offscreen cell forced for an
  // export, a new Partition group) start from it.
  const stateFor = (key) => {
    let state = states.get(key);
    if (!state) states.set(key, (state = { visible: undefined, hidden: {}, isolation: {} }));
    return state;
  };
  const file = (mark, key) => {
    keys.set(mark, key);
    if (!groups.has(key)) groups.set(key, new Set());
    groups.get(key).add(mark);
  };
  const unfile = (mark) => {
    const key = keys.get(mark), group = groups.get(key);
    group?.delete(mark);
    if (!group?.size) { groups.delete(key); groupHandles.delete(key); }
    keys.delete(mark);
    return key;
  };
  // A mark's key follows its scope path: a renamed ancestor or a Partition switching
  // legendGroups re-files the mark under its new key (its shared state moves with it).
  const refile = () => {
    for (const mark of marks) {
      const key = definitionKey(mark.options), old = keys.get(mark);
      if (key === old) continue;
      unfile(mark);
      if (old !== undefined && states.has(old) && !states.has(key) && !groups.has(key))
        states.set(key, states.get(old));
      file(mark, key);
    }
  };
  const registry = {
    marks,
    guides,
    notify,
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    /** Every mounted mark of one authored definition. */
    definitionMarks(key) {
      refile();
      return [...(groups.get(key) ?? [])].filter((mark) => !mark.isDisposed);
    },
    /** The key a mark is filed under (its current definitionKey). */
    keyOf: (mark) => (refile(), keys.get(mark)),
    /** The shared category hide state of a definition; mounts read hidden sets from it. */
    categoryState: (key) => stateFor(key),
    /** Hide or show one category value in every mount of a definition. */
    toggleCategory(key, channel, value, isolate) {
      const live = registry.definitionMarks(key);
      const domain = live.map((mark) => markBinding(mark)?.legend?.categories?.[channel]?.scale?.domain).find(Boolean) ?? [];
      applyCategoryToggle(stateFor(key), channel, value, isolate, domain);
      for (const mark of live) markBinding(mark)?.legend?.refresh();
      notify();
    },
    /** A nested plot asks the root to show the automatic legend; the latest request wins. */
    requestAutomatic(id, config) {
      if (!config) automaticRequests.delete(id);
      else automaticRequests.set(id, config);
      notify();
      return () => { automaticRequests.delete(id); notify(); };
    },
    get automatic() {
      return [...automaticRequests.values()].at(-1) ?? false;
    },
    addGuide(id, config) {
      guides.set(id, config);
      notify();
      return () => {
        guides.delete(id);
        notify();
      };
    },
    dispose() {
      disposed = true;
      marks.clear();
      guides.clear();
      groups.clear();
      groupHandles.clear();
      keys.clear();
      states.clear();
      automaticRequests.clear();
      listeners.forEach((fn) => fn());
      listeners.clear();
    },
  };
  // One legend entry per authored definition: its handle reads appearance from the first
  // live mount and fans visibility out to all of them.
  const groupHandle = (key) => {
    let handle = groupHandles.get(key);
    if (handle) return handle;
    const live = () => registry.definitionMarks(key);
    // Mounts are compared on their authored appearance (not in-flight animated colors), only
    // once prepared, and a mismatch is reported once it holds for two reads in a row.
    let pending = null, warned = null;
    const authored = (mark) => JSON.stringify([
      cssColor(mark.options.get(mark.isGuideText ? "labelColor" : "fillColor") ?? "#547ba2"),
      mark.options.get("shape") ?? null,
    ]);
    handle = {
      kind: "mark",
      subscribe: registry.subscribe,
      guideMark: () => live()[0],
      entry() {
        const mounts = live(), first = mounts[0];
        if (!first) return undefined;
        const entry = markEntry(first);
        const prepared = mounts.filter((mark) => legendOf(mark));
        const reference = prepared[0] && authored(prepared[0]);
        const mismatch = prepared.slice(1).map(authored).find((other) => other !== reference) ?? null;
        if (mismatch && mismatch === pending && mismatch !== warned) {
          warned = mismatch;
          console.warn(`Legend: mounts of ${entry.label} differ in appearance; the legend shows the first.`);
        }
        pending = mismatch;
        return entry;
      },
      setVisible(value) {
        stateFor(key).visible = !!value;
        // A viewer's legend toggle: the user layer, which exports carry (TODO 136.7).
        for (const mark of live()) mark.options.set("visible", !!value, { layer: "user" });
      },
    };
    groupHandles.set(key, handle);
    return handle;
  };
  registry.groupHandle = groupHandle;
  registry.handle = {
    kind: "plot",
    subscribe: registry.subscribe,
    entries: () => (refile(), [...new Set([...marks].map((m) => keys.get(m)))].map(groupHandle)),
  };
  /**
   * A plot inside a Facet: one entry per definition among its own marks. Each is that plot's
   * mount handle, so guideObject() reaches the cell's own mark while entry() and setVisible()
   * act on the definition, in every cell.
   */
  registry.scopedHandle = (scope) => ({
    kind: "plot",
    subscribe: registry.subscribe,
    entries: () => {
      refile();
      const own = new Map();
      for (const mark of marks) {
        let inside = false;
        for (let node = mark.options; node && !inside; node = node.defaults) inside = node === scope;
        const key = keys.get(mark);
        if (inside && !own.has(key)) own.set(key, mark.guideHandle ?? groupHandle(key));
      }
      return [...own.values()];
    },
  });
  registry.register = (mark) => {
    const o = mark.options;
    const key = definitionKey(o);
    // The mount's handle resolves to its mark (guideObject) but acts on its definition: a
    // Legend given one mount of a facet or partition mark lists and toggles every mount.
    const group = () => groupHandle(keys.get(mark) ?? definitionKey(o));
    const handle = {
      kind: "mark",
      subscribe: registry.subscribe,
      // Resolves without the module's WeakMap, so a second copy of this module (a test's own
      // import, a hot reload) still reaches the mark.
      guideMark: () => mark,
      entry: () => (refile(), group().entry()),
      setVisible: (value) => group().setVisible(value),
    };
    mark.guideHandle = handle;
    objects.set(handle, mark);
    marks.add(mark);
    file(mark, key);
    const state = states.get(key);
    if (state?.visible !== undefined && o.get("visible") !== state.visible) o.set("visible", state.visible);
    const off = o.on(() => {
      mark.visible = o.get("visible") !== false;
      notify();
    });
    mark.visible = o.get("visible") !== false;
    notify();
    return () => {
      off();
      marks.delete(mark);
      objects.delete(handle);
      unfile(mark);
      notify();
    };
  };
  return registry;
}
function cssColor(value) {
  try {
    const color = value?.isVector3
      ? new Color().setRGB(value.x, value.y, value.z)
      : new Color(value);
    return "#" + color.getHexString();
  } catch {
    return "#547ba2";
  }
}
/** With Partition legendGroups, a group scope names itself so its entries read "Fit · Adelie";
 * nested Partitions join every enclosing label, outermost first ("Fit · Adelie · Male"). */
function partitionSuffix(options) {
  const labels = [];
  for (let node = options; node; node = node.defaults)
    if (node.partitionLabel) labels.push(node.partitionLabel);
  return labels.reverse().join(" \u00b7 ");
}
export function markEntry(mark) {
  const o = mark.options,
    field = mark.fields?.get("color") ?? mark.fields?.get("fill"),
    suffix = partitionSuffix(o);
  return {
    id: definitionKey(o),
    label: (o.get("label") || o.presentation.label || o.name) + (suffix ? ` \u00b7 ${suffix}` : ""),
    labeled: !!o.get("label"),
    participates: o.get("legend") !== false,
    visible: o.get("visible") !== false,
    color: cssColor(
      mark.animatedOptionNodes?.get("fillColor")?.value ??
        o.get(mark.isGuideText ? "labelColor" : "fillColor") ??
        "#547ba2",
    ),
    scalar: !!field?.isBufferNode,
    shape: mark.isGuideText
      ? "text"
      : mark.band || mark.legendArea
        ? "area"
        : (SWATCH_BY_KIND[mark.exportKind] ?? (mark.material?.isLine2NodeMaterial ? "line" : "point")) === "point"
          ? (o.get("shape") ?? "circle")
          : (SWATCH_BY_KIND[mark.exportKind] ?? "line"),
    opacity: o.get("opacity") ?? 1,
    dashed: o.get("dashed") ?? false,
    rotation: o.get("rotation") ?? 0,
    outline: cssColor(o.get("outlineColor") ?? "#30343b"),
    outlineWidth: o.get("outlineWidth") ?? 0,
  };
}
/**
 * The legend swatch each mark kind draws (2026-10-22), from the kind every mark object declares
 * (exportKind) instead of its material: a stroke for the line-like kinds, a filled square for
 * the area-like kinds, the mark's own shape for point kinds, text for labels.
 */
export const SWATCH_BY_KIND = Object.freeze({
  line: "line", segments: "line", "billboard-arrows": "line", "solid-arrows": "line",
  "geo-segments": "line", errorbars: "line",
  band: "area", triangles: "area", "polar-rect": "area", "geo-faces": "area", prism: "area", raster: "area",
  points: "point", labels: "text",
});

export function seriesEntries(target, automatic = false) {
  const source = resolveGuide(target);
  const handles = Array.isArray(source)
    ? source.map(resolveGuide)
    : source?.kind === "plot"
      ? source.entries()
      : source
        ? [source]
        : [];
  return handles
    .filter((h) => h?.kind === "mark")
    .filter((h) => h.entry())
    .map((h) => ({ handle: h, ...h.entry() }))
    .filter((e) => !automatic || (e.labeled && e.participates));
}
export function toggleSeries(entries, id, isolate, previous) {
  if (isolate) {
    if (previous?.id === id) {
      for (const e of entries)
        if (previous.visibility.has(e.id))
          e.handle.setVisible(previous.visibility.get(e.id));
      return null;
    }
    const visibility = new Map(entries.map((e) => [e.id, e.visible]));
    for (const e of entries) e.handle.setVisible(e.id === id);
    return { id, visibility };
  }
  const e = entries.find((e) => e.id === id);
  e?.handle.setVisible(!e.visible);
  return null;
}

/** The SVG fill rule a legend symbol draws with: "evenodd" for shapes registered with it. */
export function guideFillRule(shape) {
  return isShape(shape) ? shapeOutline(shape)?.fillRule ?? "nonzero" : "nonzero";
}

// The first eight built-ins have hand-tuned legend symbols (the circle and square are drawn by
// the legend itself); every other shape draws from its outline.
const HAND_DRAWN = new Set(["circle", "square", "diamond", "triangle", "hexagon", "plus", "cross", "star"]);
export function guideSymbol(shape) {
  // Shape space is [-1, 1] with y up; the swatch is centered at (13, 9). A polygon draws its
  // vertices; any other shape its outline, curves as curves.
  if (isCustomShape(shape) || (isShape(shape) && !HAND_DRAWN.has(shape))) {
    const vertices = shapeVertices(shape);
    if (vertices) return "M" + vertices.map(([x, y]) => `${13 + 6 * x},${9 - 6 * y}`).join(" L") + "Z";
    return contourPath(shapeOutline(shape).contours, (x, y) => [13 + 6 * x, 9 - 6 * y]);
  }
  const polygon = (n) =>
    Array.from({ length: n }, (_, i) => {
      const a = (i * 2 * Math.PI) / n - Math.PI / 2;
      return `${i ? "L" : "M"}${13 + 6 * Math.cos(a)},${9 + 6 * Math.sin(a)}`;
    }).join(" ") + "Z";
  if (shape === "diamond") return "M13 2L20 9L13 16L6 9Z";
  if (shape === "triangle") return polygon(3);
  if (shape === "hexagon") return polygon(6);
  if (shape === "plus" || shape === "cross")
    return "M11 3H15V7H19V11H15V15H11V11H7V7H11Z";
  if (shape === "star")
    return (
      Array.from({ length: 10 }, (_, i) => {
        const a = (i * Math.PI) / 5 - Math.PI / 2,
          r = i % 2 ? 2.7 : 6;
        return `${i ? "L" : "M"}${13 + r * Math.cos(a)},${9 + r * Math.sin(a)}`;
      }).join(" ") + "Z"
    );
  return null;
}

/** Channels a Legend can explain. */
export const LEGEND_CHANNELS = ["fill", "color", "shape", "outlineColor", "size", "width", "opacity"];
/** The color channels a Plot's default legend explains when a category column drives them. */
const CATEGORICAL_COLORS = ["fill", "color", "outlineColor"];

/**
 * Whether an explicit Legend `{channel, target}` explains `channel` of `mark` (TODO 134.9): it is
 * for that channel or for every channel (no channel), and targets the whole plot, a mount of the
 * mark's definition or a mark sharing its scale.
 */
function legendCovers(legend, mark, channel) {
  if (legend.channel && legend.channel !== channel) return false;
  const source = resolveGuide(legend.target());
  if (source?.kind === "plot") return true;
  const scaleOf = (m) => markBinding(m)?.scales?.[channel] ?? legendOf(m)?.categories?.[channel]?.scale;
  const key = mark?.options && definitionKey(mark.options), scale = scaleOf(mark);
  return (Array.isArray(source) ? source.map(resolveGuide) : [source]).some((handle) => {
    const other = guideObject(handle);
    return !!other && (other === mark || (!!key && other.options && definitionKey(other.options) === key) ||
      (scale !== undefined && scaleOf(other) === scale));
  });
}

/**
 * Categorical swatches for `channel`, merged with every other categorical channel driven by
 * the same column (fill and shape by "species" draw colored symbols). Attributes no category
 * channel drives come from the mark's constant appearance.
 */
export function categoryEntries(mark, channel) {
  const categories = legendOf(mark)?.categories ?? {}, meta = categories[channel];
  if (!meta) return null;
  const base = markEntry(mark);
  const related = Object.entries(categories)
    .filter(([name, other]) => name !== channel && meta.field && other.field === meta.field)
    .map(([, other]) => other);
  const pointShape = ["line", "area", "text"].includes(base.shape) ? null : base.shape;
  return meta.entries.map((entry) => {
    const swatch = {
      value: entry.value, label: entry.label, visible: entry.visible,
      color: base.color, shape: channel === "width" || base.shape === "line" ? "line" : pointShape ?? "square",
      size: null, width: null, opacity: base.opacity, outline: base.outline, outlineWidth: base.outlineWidth,
    };
    // Point color legends retain the drawn glyph. Filled regions use a square; a shared
    // shape encoding below can still override either default.
    if ((channel === "fill" || channel === "color") && swatch.shape !== "line" && mark.exportKind !== "points") swatch.shape = "square";
    for (const source of [meta, ...related]) {
      const match = source.entries.find((item) => Object.is(item.value, entry.value));
      if (!match) continue;
      for (const key of ["color", "shape", "size", "width", "opacity", "outline"])
        if (match[key] !== undefined) swatch[key] = match[key];
    }
    if (swatch.outline !== base.outline && !swatch.outlineWidth) swatch.outlineWidth = 1.5;
    return swatch;
  });
}

/**
 * One guide per distinct scale among `entries` (from seriesEntries) for `channel`: marks
 * sharing a scale resource share a guide; automatic scales keep their own. A lone guide is
 * titled by the Legend's own `label`, else its scale resource's label, else its first mark's
 * label, else the display name of the column that mark's channel plots (as an axis title is; a
 * NetCDF variable's long name and units, TODO 48.6). Several guides are told apart: each takes
 * its scale resource's label, else its first mark's label, else its column's name, and only
 * then the Legend's `label`.
 */
export function guideGroups(entries, channel, label = undefined) {
  const encodes = (m, name) => !!(legendOf(m)?.categories?.[name] || markBinding(m)?.scales?.[name] ||
    name === "opacity" && legendOf(m)?.readOpacityExtent ||
    (name === "fill" || name === "color") && (m?.fields?.get(name) ?? (name === "fill" && m?.band ? m?.fields?.get("color") : null))?.isBufferNode);
  const byScale = new Map();
  for (const { handle } of entries) {
    const m = guideObject(handle);
    if (!encodes(m, channel)) continue;
    const scale = markBinding(m)?.scales?.[channel] ?? legendOf(m)?.categories?.[channel]?.scale;
    const key = scale ?? handle;
    if (byScale.has(key)) continue;
    const entry = markEntry(m);
    byScale.set(key, { handle, scale, markLabel: entry.labeled ? entry.label : undefined, column: legendOf(m)?.channelTitles?.[channel] });
  }
  const groups = [...byScale.values()];
  return groups.map(({ handle, scale, markLabel, column }) => ({
    handle,
    scale,
    label: groups.length === 1 ? label ?? scale?.title ?? markLabel ?? column : scale?.title ?? markLabel ?? column ?? label,
  }));
}

/**
 * What a Legend without a channel explains (TODO 62.3): every channel its marks map from data
 * (categories, a continuous scale, an opacity column), in LEGEND_CHANNELS order, one guide per
 * distinct scale (guideGroups). A mark's column shows once: fill and shape by one column draw one
 * set of symbols, as a channel's legend does. Categorical guides with the same title and
 * categories show once (a Line and Points colored by one column). `label` titles a lone guide.
 * `categorical` keeps only colors mapped from a category column (a Plot's default legend, TODO
 * 136.17); `legends` are the plot's explicit Legends, whose channels are left out (134.9).
 * Returns [{ handle, channel, label }] from seriesEntries' entries.
 * @param {any[]} entries @param {string} [label]
 * @param {{ categorical?: boolean, legends?: { channel?: string, target: () => unknown }[] }} [options]
 */
export function explainedGuides(entries, label = undefined, { categorical = false, legends = [] } = {}) {
  const mapped = (mark, channel) => !!(legendOf(mark)?.categories?.[channel] || !categorical && (markBinding(mark)?.scales?.[channel] ||
    channel === "opacity" && legendOf(mark)?.readOpacityExtent));
  const guides = [], shownFields = new Map(), shownSwatches = new Set();
  // Whether a categorical guide is new: a mark's column shows once, identical swatches once.
  const fresh = (mark, meta, groupLabel) => {
    if (!meta) return true;
    const fields = shownFields.get(mark) ?? new Set();
    shownFields.set(mark, fields);
    if (meta.field && fields.has(meta.field)) return false;
    if (meta.field) fields.add(meta.field);
    const swatches = JSON.stringify([groupLabel ?? null, meta.entries.map((entry) => entry.label)]);
    if (shownSwatches.has(swatches)) return false;
    shownSwatches.add(swatches);
    return true;
  };
  const shown = categorical ? CATEGORICAL_COLORS : LEGEND_CHANNELS;
  const groups = LEGEND_CHANNELS.flatMap((channel) =>
    guideGroups(entries.filter(({ handle }) => mapped(guideObject(handle), channel)), channel).map((group) => {
      const mark = guideObject(group.handle);
      return { group, channel, mark, meta: legendOf(mark)?.categories?.[channel],
        covered: legends.some((legend) => legendCovers(legend, mark, channel)) };
    }));
  // What explicit Legends show counts as shown (any channel they explain, whether or not this
  // legend would show it): a column they list is not listed again for another channel or mark.
  for (const { group, mark, meta, covered } of groups) if (covered) fresh(mark, meta, group.label);
  // A default legend leaves out a color repeating the mark's x or y column: that axis names it
  // (as the color lint does, plotLints.js); legend=true still shows it.
  const onAxis = (mark, channel) => {
    const column = legendOf(mark)?.channelTitles?.[channel];
    return column !== undefined && Object.values(legendOf(mark)?.axisTitles ?? {}).includes(column);
  };
  for (const { group, channel, mark, meta, covered } of groups)
    if (!covered && shown.includes(channel) && !(categorical && onAxis(mark, channel)) && fresh(mark, meta, group.label)) guides.push({ handle: group.handle, channel, label: group.label });
  if (guides.length === 1 && label !== undefined) guides[0].label = label;
  return guides;
}

const DURATION_UNITS = [["d", 86400000], ["h", 3600000], ["min", 60000], ["s", 1000], ["ms", 1]];
/**
 * Tick labels for a legend over a datetime or duration column (colorbar ticks and ramp
 * labels). Such columns reach the GPU as milliseconds from the column's origin
 * (`temporal.origin`: the first value of a Python datetime64 column, 0 for JS Dates); each
 * label adds it back. Datetimes format like a datetime axis: `pattern` when it holds a `%`
 * directive, else a format chosen from `span` (ms). Durations read in the largest unit that
 * fits twice into `span`.
 * @param {{type: "datetime" | "duration", origin: number | undefined, timezone: string | undefined}} temporal
 */
export function temporalFormat(temporal, pattern = "", span = 0) {
  const origin = temporal.origin ?? 0;
  if (temporal.type === "duration") {
    const [unit, size] = DURATION_UNITS.find(([, size]) => Math.abs(span) >= 2 * size) ?? DURATION_UNITS.at(-1);
    const number = format(",.4~g");
    return (value) => `${number((value + origin) / size)} ${unit}`;
  }
  const custom = typeof pattern === "string" && pattern.includes("%") ? pattern : "";
  const zone = temporal.timezone ?? "UTC";
  return (value) => {
    try { return formatDatetime(value + origin, custom, zone, Math.abs(span)); }
    catch { return formatDatetime(value + origin, "", zone, Math.abs(span)); }
  };
}

/**
 * Sample glyph values for a continuous ramp: `count` points evenly spaced along the scale's
 * output (so a log domain [1, 1000] samples 1, 10, 100, 1000), each with its output value in
 * `range`. With a midpoint (TODO 39.2) the halves follow its piecewise map and the middle
 * sample is the midpoint.
 */
export function rampSamples({ domain, range, transform = "linear", constant = 1, midpoint }, count = 4) {
  if (!domain || domain.length !== 2 || !domain.every(Number.isFinite)) return [];
  const [a, b] = domain.map((v) => transformForward(transform, v, constant));
  if (!Number.isFinite(a) || !Number.isFinite(b)) return [];
  if (a === b) return [{ t: 0.5, value: domain[0], output: (range[0] + range[1]) / 2 }];
  const hasMidpoint = typeof midpoint === "number" && Number.isFinite(midpoint);
  if (hasMidpoint && count % 2 === 0) count += 1;
  const spec = { domain, transform, constant, midpoint: hasMidpoint ? midpoint : undefined };
  return Array.from({ length: count }, (_, index) => {
    const t = index / (count - 1), value = scaleValueAt(t, spec);
    // Round-trip error from log/exp would show as 9.999999 in labels.
    const clean = Math.abs(value - Math.round(value)) < 1e-9 * Math.max(1, Math.abs(value)) ? Math.round(value) : value;
    return { t, value: clean, output: range[0] + t * (range[1] - range[0]) };
  });
}
