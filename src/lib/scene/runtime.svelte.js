import {bytesToBase64} from "../encoding/base64.js";
import { limitError } from "../plot/utils/limits.js";
import { tick } from "svelte";
import { settingsProps, validateSceneProps } from "./settings.js";
import { zonedDate } from "../plot/utils/timeInputs.js";
import { initialValue, pendingInitial } from "../plot/utils/inputs.js";
import registry from "./registry.json";
import { SceneResources } from "./resources.js";
import { exportSceneDocument, exportScenePNG } from "../plot/utils/sceneDocumentExport.js";
import { stateTitle } from "../plot/utils/describe.js";
import { RUNTIME_PLACEHOLDER, SNAPSHOT_KINDS, cornerColor, htmlPage, pageLayout } from "./htmlPage.js";
import { exportClosure } from "./exportClosure.js";
import { markBinding } from "../plot/utils/markBinding.js";
import { blobDataURL } from "../plot/utils/exportDocument.js";
import { diagnostic, toDiagnostic } from "../plot/utils/diagnostics.js";
import { endpointRegistry } from "../plot/utils/endpointRegistry.js";
import { encodeInitial } from "../plot/utils/providers.js";
import { seriesConstraint } from "../plot/utils/series.js";
import { loadSceneComponents } from "./componentLoading.js";
import { loadScenePlugins, loadedPluginSources, pluginRefsProblem } from "./plugins.js";

// An SVG snapshot above this many bytes suggests snapshot="png" (TODO 54).
const SNAPSHOT_WARNING_BYTES = 5 * 1048576;
// The input kinds (TODO 41): the registry's inputs (options.json marks each `input: true`).
const INPUT_KINDS = new Set(registry.inputs);
// The input contexts: the Scene (always the root), an InputContext, a Template.
const INPUT_CONTEXTS = new Set(registry.inputContexts);

const deadlinePromise = (promise, milliseconds, phase, signal = undefined) => {
  if (signal?.aborted) return Promise.resolve();
  if (!Number.isFinite(milliseconds) || milliseconds <= 0)
    return Promise.reject(diagnostic("bridge.timeout", `Scene command timed out during ${phase}.`, {
      scope: "notebook frontend", details: { phase },
    }));
  let timer, abort;
  return Promise.race([
    Promise.resolve(promise),
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(diagnostic(
        "bridge.timeout",
        `Scene command timed out during ${phase}.`,
        { scope: "notebook frontend", details: { phase } },
      )), milliseconds);
    }),
    ...(signal ? [new Promise(resolve => { abort = () => resolve(); signal.addEventListener("abort", abort, { once: true }); })] : []),
  ]).finally(() => { clearTimeout(timer); if (abort) signal.removeEventListener("abort", abort); });
};
/** A reference whose transform has not mounted: a Data shows nothing until it has. */
const PENDING_REFERENCE = Object.freeze({ dataSource: () => null });

export class SceneRuntime {
  root = $state.raw(null);
  handles = $state.raw(new Map());
  error = $state("");
  // Why the last update was refused (the notebook widget's), shown until one applies. Kept apart
  // from `error`: the restored scene still settles and answers commands.
  rejected = $state("");
  // A static image shown in place of the scene (a notebook view without WebGPU, TODO 71):
  // { note } while it is drawn, then { src, alt, width, height, note }.
  snapshot = $state.raw(null);
  // Whether a Plot without a width fills the scene's host (TODO 132.5; SceneRenderer): false for
  // a headless image export, which has no page to fill and keeps the 800px default.
  fill = $state(true);
  linkedValues = new Map();
  revision = 0;
  resources = new SceneResources();
  disposed = false;
  _disposal = new AbortController();
  _components = {};
  applying = false;
  links = new Map();
  serializable = $state.raw(null);
  browserSettings = new Map();
  interactionStops = [];
  interactionSequences = new Map();
  incomingInteractionSequences = new Map();
  pendingInteractions = new Set();
  // Offsets dragged in this view, sent to Python (TODO 38.5): per table, the layer version last
  // sent (or taken from Python) and the function that sends a pending change now.
  offsetStops = [];
  offsetSequences = new Map();
  offsetSent = new Map();
  offsetFlushes = new Map();
  constructor(send) {
    this.send = send;
  }
  /**
   * The file of a plugin the state names (TODO 138.4, scene/plugins.js), from the host: the
   * widget asks the kernel, a page reads its payload. null: none here.
   * @type {import("./plugins.js").PluginSource}
   */
  pluginSource = () => null;
  /** The plugins whose warnings this scene reports. */
  #pluginWarnings = new Set();
  /**
   * One handle per mounted instance of a node, keyed `${id}:${key}` where `key` is the facet
   * cell key, then each enclosing Partition group key, joined by "/" ("" outside both). `cell`
   * is the facet cell and `group` the innermost Partition group ({key, values, label}).
   */
  register(id, key, handle, element, cell = undefined, group = undefined) {
    const identity = `${id}:${key}`;
    const next = new Map(this.handles);
    const entry={id,key,handle,element,cell,group};
    next.set(identity, entry);
    this.handles = next;
    return () => {
      if(this.handles.get(identity)!==entry)return;
      const next = new Map(this.handles);
      next.delete(identity);
      this.handles = next;
    };
  }
  reference(id, key = "") {
    return (
      [...this.handles.values()].find((h) => h.id === id && h.key === key)
        ?.handle ?? [...this.handles.values()].find((h) => h.id === id)?.handle
    );
  }
  facetFor(target) {
    let found;
    const visit = (node, facet) => {
      if (node.id === target) {
        found = facet;
        return;
      }
      for (const child of node.children ?? [])
        visit(child, node.kind === "Facet" ? node : facet);
    };
    if (this.root) visit(this.root, null);
    return found ? this.reference(found.id) : null;
  }
  props(node, key = "", instance = undefined) {
    const p = this.resources.resolve(node.props, (id) =>
      this.reference(id, key),
    );
    // A component reading a transform's output: until it mounts, a pending
    // reference, so its marks wait for the output rather than draw an empty table.
    if (node.kind === "Data" && node.props?.value?.$ref && p.value === undefined)
      p.value = PENDING_REFERENCE;
    if (node.props?.data?.$ref && p.data === undefined)
      p.data = PENDING_REFERENCE;
    if (this.serializable && (node.kind === "Plot" || node.kind === "Facet")) {
      p.exportHTML = () => this.exportHTML(node.id);
    }
    if (node.kind === "Plot" && p.axes === true) {
      delete p.axes;
      p.axes2d = true;
      p.axes3d = true;
    }
    // A Plot's view, or a figure's (Marginals': its scatter's, TODO 136.16).
    const viewed = node.kind === "Plot" || registry.components[node.kind]?.figure;
    if (viewed) {
      p.onviewportchange = (v) => {
        this.viewport(node.id, v);
        if (!this.applying && !this.disposed && node.events?.includes("viewportchange"))
          this.send({ type: "event", target: node.id, event: "viewportchange",
            payload: { viewport: JSON.parse(JSON.stringify(v)) }, revision: this.revision });
      };
    }
    for (const event of node.events ?? []) {
      if (viewed && event === "viewportchange") continue;
      p[`on${event}`] = (e) => this.event(node.id, key, event, e, instance);
    }
    return p;
  }
  event(id, key, event, e, instance = undefined) {
    // A drag's offsets reach Python before its event, so a callback reads them (TODO 38).
    if (event === "drag" || event === "dragend") this.offsetFlushes.forEach((flush) => flush());
    // A Provider's load and error events are not feedback from applying a state: they are sent
    // while one is applied too, under the revision being applied (TODO 20).
    const provider = event === "load" || event === "error";
    if (this.disposed || (this.applying && !provider)) return;
    if (event === "pointermove" || event === "drag") {
      const now = performance.now(), last = event === "drag" ? "dragTime" : "hoverTime";
      if (now - (this[last] ?? 0) < 1000 / 30) return;
      this[last] = now;
    }
    const payload = {
      facet_cell: (instance ? instance.facet : key) || undefined,
      partition_group: instance?.partition || undefined,
      source_index: e?.instanceId,
      data_coordinates: e?.dataPoint ?? e?.axisValue,
      world_coordinates: e?.point?.toArray?.(),
      aggregate: e?.aggregate,
      row_index: e?.rowIndex,
    };
    const names = {
      index: "source_index",
      sourceIndex: "source_index",
      instanceIndex: "instance_index",
      dataCoordinates: "data_coordinates",
      worldPoint: "world_coordinates",
      uv: "surface_uv",
      feature: "feature",
      featureId: "feature_id",
      featureIndex: "feature_index",
      tableRowIndex: "table_row_index",
      geometryPartPath: "geometry_part_path",
      geometryPart: "geometry_part_path",
      geographicCoordinates: "geographic_coordinates",
      // camerachange
      position: "position",
      target: "target",
      up: "up",
      fov: "fov",
      near: "near",
      far: "far",
      zoom: "zoom",
      mode: "mode",
      // Connectors (Line/Segments/Arrows/Arrows with connections): the picked
      // connection and its endpoint slots (see connectionEvent in connectionPrepare.js).
      connection: "connection",
      // drag and dragend (TODO 38.5): table rows and each column's change; Python gives the
      // rows' keys from its table (a key here may be a BigInt, or a tuple sent as a list).
      row: "row",
      rows: "rows",
      changes: "changes",
      cancelled: "cancelled",
    };
    for (const [from, to] of Object.entries(names)) {
      const v = e?.[from];
      if (v !== undefined) payload[to] = v?.toArray?.() ?? v;
    }
    if (event === "drag" || event === "dragend")
      payload.table = [...this.resources.tables].find(([, table]) => table.identity && table.identity === e?.identity)?.[0];
    if (payload.connection) payload.connection = this.connectionNodes(payload.connection);
    if (provider) {
      // `revision` names the scene revision in Python's event: the load's is load_revision.
      Object.assign(payload, { load_revision: e?.revision, rows: e?.rows, ms: e?.ms });
      if (event === "error") payload.message = e?.error?.message ?? String(e?.error);
    }
    try {
      this.send({
        type: "event",
        target: id,
        event,
        payload: JSON.parse(JSON.stringify(payload)),
        revision: provider ? (this.applyingRevision ?? this.revision) : this.revision,
      });
    } catch (error) {
      this.error = `Event serialization failed: ${error.message}`;
    }
  }
  /**
   * A picked connection with each endpoint slot's scene node id (`node`, null when the endpoint
   * is not a scene node): slots carry the endpoint's registry definition, which every mount of
   * one authored mark shares, so a mark repeated in Facet cells maps to its one node.
   */
  connectionNodes(connection) {
    const nodes = new Map();
    for (const entry of this.handles.values()) {
      const mark = entry.handle?.getMark?.();
      if (!mark?.renderer) continue;
      const definition = endpointRegistry(mark.renderer).entryOf(mark)?.definition;
      if (definition != null && !nodes.has(definition)) nodes.set(definition, entry.id);
    }
    const slot = (value) => value && { ...value, node: nodes.get(value.definition) ?? null };
    return {
      ...connection, source: slot(connection.source), target: slot(connection.target),
      slots: (connection.slots ?? []).map(slot),
      ...(connection.pair ? { pair: connection.pair.map(slot) } : {}),
    };
  }
  statuses = new Map();
  /** Each status's scene node, for its diagnostics. */
  #statusNodes = new WeakMap();
  /** Errors components report through their scene node (TODO 136.6, utils/reporter.js). */
  #reported = new Map();
  /** `owner`'s diagnostic is `entry` (null: it has none). */
  _reportDiagnostic(owner, entry) {
    if (entry) this.#reported.set(owner, entry);
    else this.#reported.delete(owner);
  }
  // Inputs (TODO 41): each input node's context, for Python's messages and the viewer's changes.
  inputContexts = new Map(); // input node id -> { store, name }
  inputSequences = new Map();
  /**
   * Declare the inputs of the context `node` (a Scene, InputContext or Template) in `store`: every
   * input under it outside a nested context, with its value from the scene (the viewer's value
   * stays unless the scene's value changed: InputStore.declare).
   */
  declareInputs(node, store) {
    // An input that left this context gives its name up first, so one added in its place with the
    // same name (a new node) is not taken for a second input of that name.
    const present = new Set(), collect = (current, top) => {
      if (!top && INPUT_CONTEXTS.has(current.kind)) return;
      if (INPUT_KINDS.has(current.kind)) present.add(current.id);
      for (const child of current.children ?? []) collect(child, false);
    };
    collect(node, true);
    for (const [id, context] of this.inputContexts)
      if (context.store === store && !present.has(id)) {
        store.withdraw(context.name, id);
        this.inputContexts.delete(id);
      }
    const visit = (current, top) => {
      if (!top && INPUT_CONTEXTS.has(current.kind)) return;
      if (INPUT_KINDS.has(current.kind) && typeof current.props?.name === "string") {
        // Decoded, so a prop that reads the data (min=hm.min("x")) is an expression here.
        const props = this.resources.resolve(current.props, (id) => this.reference(id, ""));
        const pending = pendingInitial(current.kind, props);
        store.declare(props.name, pending ? null : initialValue(current.kind, props), current.id, pending);
        this.inputContexts.set(current.id, { store, name: current.props.name });
      }
      for (const child of current.children ?? []) visit(child, false);
    };
    visit(node, true);
  }
  /** The viewer set input `name` of `store`: tell Python, which keeps it as the node's value. */
  sendInput(store, name, value) {
    if (this.applying || this.disposed) return;
    const entry = [...this.inputContexts].find(([, context]) => context.store === store && context.name === name);
    if (!entry) return;
    const [target] = entry, sequence = (this.inputSequences.get(target) ?? 0) + 1;
    this.inputSequences.set(target, sequence);
    // A time goes as epoch milliseconds with its zone (TODO 53.3); Python makes it a datetime.
    const encode = (v) => v instanceof Date ? { $datetime: v.getTime(), ...(v.timezone ? { timezone: v.timezone } : {}) }
      : Array.isArray(v) ? v.map(encode) : v;
    this.send({ type: "input", target, value: JSON.parse(JSON.stringify(encode(value ?? null))), sequence, revision: this.revision });
  }
  /** The viewer played or paused a Playback: Python keeps it as the node's `playing`. */
  sendPlaying(target, playing) {
    if (this.applying || this.disposed) return;
    const sequence = (this.inputSequences.get(target) ?? 0) + 1;
    this.inputSequences.set(target, sequence);
    this.send({ type: "input", target, playing: Boolean(playing), sequence, revision: this.revision });
  }
  /** Python set an input's value (another view's viewer moved it, or code assigned it). */
  syncInput(message) {
    const context = this.inputContexts.get(message.target);
    const decode = (v) => v && typeof v === "object" && "$datetime" in v ? zonedDate(v.$datetime, v.timezone)
      : Array.isArray(v) ? v.map(decode) : v;
    if (context && "value" in message) context.store.set(context.name, decode(message.value), "python");
  }
  observeSettings(node, handle) {
    let previous;
    return handle.subscribeSettings((values) => {
      const next = settingsProps(node.kind, values, node.props, handle.getMark?.());
      this.browserSettings.set(node.id, next);
      if (previous && !this.applying) {
        const props = Object.fromEntries(
          Object.entries(next).filter(
            ([k, v]) => JSON.stringify(previous[k]) !== JSON.stringify(v),
          ),
        );
        if(['Frame','Plot','Facet'].includes(node.kind))for(const a of ['x','y','z'])if(props[a])props[a]={...node.props[a],...props[a]};
        if (Object.keys(props).length)
          this.send({
            type: "edit",
            target: node.id,
            props,
            revision: this.revision,
          });
      }
      previous = next;
    });
  }
  /**
   * Make the scene exportable as a page (TODO 54): its declarative `state`, `load(id)` for its
   * columns, and `standalone()`, which resolves to the built standalone runtime's source
   * (python/hmplot/static/standalone.js) that the page embeds. The host provides it: an export
   * from a bundle cannot reach it relative to its own module (Vite inlined that URL as the
   * unbuilt source).
   * @param {any} state
   * @param {(id: string) => any} load
   * @param {() => Promise<string>} [standalone]
   */
  setSerializable(state, load, standalone) {
    this.serializable = { state, load, standalone };
  }
  /**
   * The target as a self-contained page (TODO 54): its state, the standalone runtime and a
   * snapshot shown first ("svg" by default, "png" for very dense plots, false for none), taken
   * from this view, laid out as `page` says (pageLayout: a margin and a maximum width by default,
   * false for a bare page). Resolves to { blob, warnings, report: { snapshot } }. Python's exports pass
   * embedRuntime false and put the runtime in its place (RUNTIME_PLACEHOLDER) themselves.
   * @param {string} [target]
   * @param {{ snapshot?: "svg" | "png" | false | null, embedRuntime?: boolean, page?: boolean | { maxWidth?: number | null, margin?: number } }} [options]
   */
  async exportHTML(target = this.root?.id, { snapshot: snapshotKind = "svg", embedRuntime = true, page = true } = {}) {
    if (!this.serializable)
      throw Error("HTML export is available for declarative scene targets only.");
    if (![false, null, "svg", "png"].includes(snapshotKind))
      throw Error(`HTML export snapshot must be "svg", "png" or false; received ${JSON.stringify(snapshotKind)}.`);
    pageLayout(page);
    // A target with nothing to draw (no plots) gets a page without one, and says so.
    let snapshot = null, unsnapped = null;
    if (snapshotKind)
      try { snapshot = await this.htmlSnapshot(target, snapshotKind); }
      catch (error) { unsnapped = `The page has no snapshot: ${error.message}`; }
    // The traversal is exportClosure's; what this view shows is written into it as it goes.
    const { state, omitted } = exportClosure(this.serializable.state, target, { visit: (node, omitted) => {
      if (SNAPSHOT_KINDS.includes(node.kind) && node.props.snapshot !== false)
        (node.kind === "Provider" ? this.snapshotProvider : this.snapshotVectorTile).call(this, node, omitted);
      const settings = this.browserSettings.get(node.id);
      if (settings) {
        // An axis's settings (domain, transform) merge into its props, as an edit's do: its range
        // stays (TODO 66.5: a flyover's z range was lost, and the exported ground fell to -50).
        const axes = Object.fromEntries(["x", "y", "z"].filter((axis) => settings[axis] && node.props[axis])
          .map((axis) => [axis, { ...node.props[axis], ...settings[axis] }]));
        node.props = { ...node.props, ...settings, ...axes };
      }
      const handle = [...this.handles.values()].find((entry) => entry.id === node.id)?.handle;
      // The view on screen: a 2D plot's viewport, a 3D plot's camera (TODO 66.5: a flyover's page
      // opens where it was exported, over the tiles embedded for that view).
      const camera = handle?.getCamera?.();
      if (camera) Object.assign(node.props, { cameraPosition: camera.position, cameraTarget: camera.target, cameraUp: camera.up });
      else {
        // Only a view the viewer moved: an untouched plot's default viewport is not a setting.
        const viewport = handle?.getViewport?.();
        const moved = viewport && (["x", "y"].some((key) => Math.abs((viewport[key] ?? 0.5) - 0.5) > 1e-9) ||
          ["zoom", "zoomX", "zoomY"].some((key) => Math.abs((viewport[key] ?? 1) - 1) > 1e-9) || viewport.center);
        if (moved || node.props.viewport) node.props.viewport = viewport;
      }
    } });
    // The browser's offsets (TODO 38): newer than Python's while a drag is being sent.
    for (const [id, descriptor] of Object.entries(state.tables)) {
      const layer = this.resources.tables.get(id)?.identity?.offsets;
      if (layer) descriptor.offsets = { version: (descriptor.offsets?.version ?? 0) + 1, length: layer.length, columns: layer.columnsDescriptor() };
    }
    // Export the browser's latest committed interaction state. This can be
    // newer than the accepted Python snapshot while an event is in flight.
    const owners = this.resources.owners();
    for (const [id, descriptor] of Object.entries(state.selections)) {
      const resource = this.resources.selections.get(id);
      if (!resource) continue;
      descriptor.active = resource.active;
      descriptor.owners = Object.fromEntries(
        [...owners.values()]
          .map((owner) => [owner.id, [...resource.rows(owner)]])
          .filter(([, rows]) => rows.length),
      );
      descriptor.constraints = Object.fromEntries(
        [...owners.values()].map((owner) => [owner.id, resource.getConstraints?.(owner, "committed") ?? []]).filter(([, values]) => values.length),
      );
    }
    const columns = {};
    for (const id of Object.keys(state.columns)) {
      const loaded = await this.serializable.load(id);
      const source = loaded.payload ?? loaded;
      const bytes = source instanceof DataView
        ? new Uint8Array(source.buffer, source.byteOffset, source.byteLength)
        : new Uint8Array(source.buffer ?? source, source.byteOffset ?? 0, source.byteLength);
      columns[id] = { descriptor: loaded.descriptor ?? state.columns[id], payload: bytesToBase64(bytes) };
    }
    const bundle = embedRuntime === false ? RUNTIME_PLACEHOLDER : await this.serializable.standalone?.();
    if (typeof bundle !== "string" || !bundle)
      throw Error("HTML export needs the standalone runtime (python/hmplot/static/standalone.js), and this view has none to embed.");
    // The plugins it names that this page loaded travel with it (TODO 138.4); the state names them.
    const plugins = loadedPluginSources(state.plugins);
    const json = JSON.stringify({ state, columns, ...(Object.keys(plugins).length ? { plugins } : {}) }).replaceAll("<", "\\u003c").replaceAll(">", "\\u003e").replaceAll("&", "\\u0026");
    const html = htmlPage({ title: stateTitle(state.root), json, bundle, snapshot, page: pageLayout(page, state.root) });
    const warnings = [...omitted, ...(unsnapped ? [unsnapped] : [])], bytes = snapshot ? (snapshot.svg ?? snapshot.href).length : 0;
    if (snapshotKind === "svg" && bytes > SNAPSHOT_WARNING_BYTES)
      warnings.push(`The page's SVG snapshot is ${(bytes / 1048576).toFixed(1)} MB; snapshot="png" makes a smaller page for dense plots.`);
    return { blob: new Blob([html], { type: "text/html" }), warnings, report: { snapshot: snapshot ? { kind: snapshotKind, bytes } : null } };
  }
  /**
   * The snapshot of `target` for its page: the scene's (or the part's) SVG or PNG export, and
   * the color of its top right corner, where the page's label sits (null if it cannot be read).
   * A target with no export of its own (a Theme, Data, Row, Column or Grid) composes the parts
   * inside it as the scene's export does.
   */
  async htmlSnapshot(target, kind) {
    const method = kind === "png" ? "exportPNG" : "exportSVG";
    const entry = target === this.root?.id ? null : [...this.handles.values()].find((item) => item.id === target && item.handle?.[method]);
    const ids = target === this.root?.id || entry ? null : this.subtree(target);
    const corner = async (blob) => {
      const image = new Image(), url = URL.createObjectURL(blob);
      try { image.src = url; await image.decode(); return cornerColor(image); }
      catch { return null; }
      finally { URL.revokeObjectURL(url); }
    };
    if (kind === "png") {
      const blob = entry ? await entry.handle.exportPNG({ scale: 2 }) : await this.exportScene(2, ids);
      return { kind: "png", href: await blobDataURL(blob?.blob ?? blob), corner: await corner(blob?.blob ?? blob) };
    }
    const result = entry ? await entry.handle.exportSVG({ mode: "auto" }) : await this.exportSceneDocument("svg", { mode: "auto" }, ids);
    const svg = await (result.blob ?? result).text();
    return { kind: "svg", svg, corner: await corner(new Blob([svg], { type: "image/svg+xml" })) };
  }
  /**
   * A Provider in an exported page shows the result on screen and never loads (TODO 20): its
   * last result becomes `initial` (as JSON: rows or columns as fetchJSON/fetchCSV parsed them; an
   * Arrow or Parquet result as binary columns, encodeInitial), and url, params and
   * refreshInterval go. snapshot=False keeps the node, so the page loads.
   */
  snapshotProvider(node, warnings) {
    const handle = [...this.handles.values()].find((entry) => entry.id === node.id)?.handle;
    const result = handle?.getResult?.();
    const { url: _url, params: _params, refreshInterval: _interval, ...props } = node.props;
    node.props = result ? { ...props, initial: encodeInitial(result.data) } : props;
    if (!result && props.initial === undefined) warnings.push(`Provider ${node.id} had no loaded result to embed`);
  }
  /**
   * A VectorTile exports the tiles on screen as raw bytes (tileData, TODO 35: 4-10x smaller than
   * decoded GeoJSON), keeping its url and live: the page draws them with no network, and online
   * a live VectorTile loads over them.
   */
  snapshotVectorTile(node, warnings) {
    const handle = [...this.handles.values()].find((entry) => entry.id === node.id)?.handle;
    const tileData = handle?.getTileData?.();
    if (!tileData?.length) {
      if (node.props.data === undefined && node.props.tileData === undefined) warnings.push(`VectorTile ${node.id} had no loaded tiles to embed`);
      return;
    }
    node.props = { ...node.props, tileData };
  }
  /** A Plot's description, sent to Python when it changes (TODO 49; plot.description). */
  observeDescription(node, handle) {
    let last;
    return handle.subscribeDescription((text) => {
      if (text === last || this.applying || this.disposed) return;
      last = text;
      this.send({ type: "description", target: node.id, text, revision: this.revision });
    });
  }
  /** A transform's or Provider's status, for readiness and failures (whenReady). */
  observeStatus(node, handle) {
    let last;
    this.#statusNodes.set(handle, node);
    const off = handle.subscribe((status) => {
      this.statuses.set(handle, status);
      // A Simulate's running and settled go to Python with its step count (TODO 42), when they
      // change or it starts again: not every step.
      if (status.kind === "Simulate" && !this.applying && !this.disposed &&
          (status.running !== last?.running || status.settled !== last?.settled || status.steps < last.steps)) {
        last = status;
        this.send({ type: "simulate", target: node.id, steps: status.steps, running: status.running,
          settled: status.settled, revision: this.revision });
      }
    });
    return () => {
      off();
      this.statuses.delete(handle);
    };
  }
  /**
   * Send each table's offsets to Python when a drag (or code in the page) changes them, at most
   * ten times a second and always the last state; offsets that came from Python are not sent
   * back. Python acknowledges with its offsets version, which this view then skips.
   */
  observeOffsets() {
    this.offsetStops.splice(0).forEach((stop) => stop());
    this.offsetFlushes.clear();
    for (const [id, table] of this.resources.tables) {
      const layer = table.identity?.offsets;
      if (!layer) continue;
      let timer = null;
      // The version last sent or taken from Python, for this layer (a new table has a new one).
      const sent = () => (this.offsetSent.get(id)?.layer === layer ? this.offsetSent.get(id).version : undefined);
      const mark = () => this.offsetSent.set(id, { layer, version: layer.version });
      // The rows are this table version's: Python takes them while it has that version, whatever
      // the scene's revision (a drag callback that republishes does not make them stale).
      const flush = () => {
        clearTimeout(timer);
        timer = null;
        if (this.disposed || layer.version === sent()) return;
        mark();
        const sequence = (this.offsetSequences.get(id) ?? 0) + 1;
        this.offsetSequences.set(id, sequence);
        this.send({ type: "offsets", table: id, revision: this.revision, table_version: this.resources.tables.get(id)?.version,
          sequence, columns: layer.columnsDescriptor() });
      };
      this.offsetFlushes.set(id, flush);
      // subscribe() reports the current state at once: after an apply re-subscribes, a change
      // still unsent is sent, not dropped. Python's offsets (and the first state) are not sent.
      this.offsetStops.push(layer.subscribe((status) => {
        if (this.disposed) return;
        if (status.hydrated || sent() === undefined) { mark(); return; }
        timer ??= setTimeout(flush, 100);
      }), () => clearTimeout(timer));
    }
  }
  /** Offsets another view dragged, from Python (`offsets`), or Python's version for this view's (`offsets_ack`). */
  syncOffsets({ type, table: id, version = 0, length, columns = {} }) {
    const versions = this.resources.offsetVersions;
    if (version <= (versions.get(id) ?? 0)) return;
    versions.set(id, version);
    if (type === "offsets") this.resources.tables.get(id)?.identity?.offsets.hydrate({ length, columns });
  }
  observeInteractions() {
    this.interactionStops.splice(0).forEach((stop) => stop());
    const bindings = [...this.handles.values()]
      .map((entry) => markBinding(entry.handle?.getMark?.())?.interaction)
      .filter(Boolean);
    for (const [id, resource] of this.resources.selections) {
      const owners = [
        ...[...this.resources.tables.values()].map((table) => table.identity)
          .filter((owner) => owner && [owner.selection, owner.brush, owner.hover, owner.nearby, owner.nearest, owner.tooltip].includes(resource)),
        ...bindings.filter((binding) => [binding.selection, binding.brush, binding.hover, binding.nearby, binding.nearest].includes(resource))
          .map((binding) => binding.owner),
      ].filter((owner, index, values) => owner && values.indexOf(owner) === index);
      let lastRevision = resource.revision;
      this.interactionStops.push(resource.subscribe((status) => {
        if (this.applying || this.disposed || status.revision === lastRevision) return;
        lastRevision = status.revision;
        const sequence = (this.interactionSequences.get(id) ?? 0) + 1;
        this.interactionSequences.set(id, sequence);
        this.pendingInteractions.add(id);
        this.send({
          type: "interaction",
          resource: id,
          revision: this.revision,
          generation: this.revision,
          sequence,
          active: status.active,
          owners: Object.fromEntries(owners.map((owner) => [owner.id, [...resource.rows(owner)]])),
          constraints: Object.fromEntries(owners.map((owner) => [owner.id, resource.getConstraints?.(owner, "committed") ?? []]).filter(([, values]) => values.length)),
        });
      }));
    }
  }
  /**
   * Put a brush's constraints, as Python holds them ({ ownerId: [descriptor] }), back on its
   * owners: each descriptor resolves through the mounted mark that brushes that owner, so this
   * runs once the marks are mounted. Owners are the tables' and standalone identities.
   */
  restoreConstraints(resource, constraints) {
    const owners = this.resources.owners();
    const bindings = [...this.handles.values()].map((entry) => markBinding(entry.handle?.getMark?.())?.interaction).filter(Boolean);
    for (const [ownerId, values] of Object.entries(constraints)) {
      const owner = owners.get(ownerId), binding = bindings.find((item) => item.owner === owner && item.brush === resource);
      if (!owner || !binding) continue;
      const prepared = values.map((value) => {
        const base = Object.values(binding.brushColumns ?? {}).find((column) => column?.identity === value.identity);
        if (!base) return null;
        // A series mark's brush keeps brushing whole series (TODO 62.1).
        return seriesConstraint({ ...value, evaluate: () => base.evaluateConstraint(value.categories ? { categories: value.categories } : { bounds: value.bounds }), release: () => {} },
          value.series !== undefined ? binding.brushSeries : null);
      }).filter(Boolean);
      resource.setConstraints(owner, prepared, { replace: true });
    }
  }
  syncInteraction({ resource: id, owners = {}, constraints = {}, active = false, revision, generation, sequence = 0 }) {
    if ((revision !== undefined && revision !== this.revision) ||
        (generation !== undefined && generation !== this.revision)) return;
    if (sequence <= (this.incomingInteractionSequences.get(id) ?? -1)) return;
    const resource = this.resources.selections.get(id);
    if (!resource) return;
    const available = this.resources.owners();
    const entries = Object.entries(owners)
      .map(([ownerId, rows]) => [available.get(ownerId), rows])
      .filter(([owner]) => owner);
    const sameConstraints = Object.keys(constraints).length === 0 || Object.entries(constraints).every(([ownerId, values]) => {
      const owner = available.get(ownerId), current = owner ? resource.getConstraints?.(owner, "committed") ?? [] : [];
      return current.length === values.length && current.every((value, index) => value.identity === values[index].identity && JSON.stringify(value.bounds) === JSON.stringify(values[index].bounds) && JSON.stringify(value.categories) === JSON.stringify(values[index].categories));
    });
    const same = sameConstraints && resource.active === active && entries.every(([owner, rows]) => {
      const current = [...resource.rows(owner)];
      return current.length === rows.length && current.every((value, index) => value === rows[index]);
    });
    this.incomingInteractionSequences.set(id, sequence);
    this.resources.selectionVersions.set(id, sequence);
    this.pendingInteractions.delete(id);
    if (same) return;
    this.applying = true;
    try {
      if (Object.keys(constraints).length) {
        this.restoreConstraints(resource, constraints);
      } else resource.hydrate(entries, active);
    }
    finally { this.applying = false; }
  }
  viewport(id, v) {
    if (this.linking) return;
    const signature = JSON.stringify(v);
    if (this.linkedValues.get(id) === signature) return;
    this.linkedValues.set(id, signature);
    this.linking = true;
    try {
      for (const link of this.links.values())
        if (link.ids.includes(id))
          for (const target of link.ids)
            if (target !== id) {
              this.reference(target)?.setViewport?.(v, link.axes);
              if (link.axes === "xy")
                this.linkedValues.set(target, signature);
            }
    } finally {
      this.linking = false;
    }
  }
  validate(state) {
    if (state.protocol !== registry.protocol)
      throw Error(`Unsupported scene protocol ${state.protocol}`);
    const ids = new Set(),
      refs = [];
    const visitValue = (v) => {
      if (!v || typeof v !== "object") return;
      if (v.$ref) refs.push(v.$ref);
      else Object.values(v).forEach(visitValue);
    };
    const visit = (n) => {
      if (!registry.components[n.kind])
        throw Error(`Unknown component ${n.kind}`);
      if (ids.has(n.id)) throw Error(`Duplicate node ${n.id}`);
      ids.add(n.id);
      validateSceneProps(n.kind, n.props);
      visitValue(n.props);
      if (n.children.length && !registry.components[n.kind].container)
        throw Error(`${n.kind} cannot have children`);
      n.children.forEach(visit);
    };
    visit(state.root);
    for (const ref of refs)
      if (!ids.has(ref)) throw Error(`Unresolved target ${ref}`);
    const plugins = pluginRefsProblem(state.plugins);
    if (plugins) throw Error(plugins);
  }
  /** Load the plugins `state` names before its components mount; each one's warning is the scene's. */
  async #loadPlugins(state) {
    const results = await loadScenePlugins(state.plugins, this.pluginSource);
    for (const name of this.#pluginWarnings)
      if (!results.has(name)) this._reportDiagnostic(`plugin:${name}`, null);
    this.#pluginWarnings = new Set(results.keys());
    for (const [name, warning] of results) this._reportDiagnostic(`plugin:${name}`, warning);
  }
  async apply(state, load, { timeoutMs = 30000 } = {}) {
    this.applyingRevision = state.revision;
    try { return await this.applyState(state, load, { timeoutMs }); }
    finally { this.applyingRevision = undefined; }
  }
  async applyState(state, load, { timeoutMs = 30000 } = {}) {
    this.send({ type: "status", phase: "preparing", revision: state.revision });
    this.validate(state);
    await this.#loadPlugins(state);
    if (this.disposed) return;
    const components = await loadSceneComponents(state.root);
    if (this.disposed) return;
    this._components = { ...this._components, ...components };
    const update = await this.resources.transaction(state, load), { prepared } = update;
    if (this.disposed) {
      update.retire();
      return;
    }
    this.send({ type: "status", phase: "uploading", revision: state.revision });
    const releases = [...this.handles.values()]
      .filter((h) => h.handle?.beginUpdate)
      .map((h) => h.handle.beginUpdate());
    const previousRoot = this.root;
    this.applying = true;
    try {
      update.activate([...this.handles.values()].map((entry) => markBinding(entry.handle?.getMark?.())?.interaction?.owner), this.pendingInteractions);
      this.root = state.root;
      await tick();
      // Constraint descriptors need mounted marks to resolve their column
      // evaluators, so restore them after the component tree is committed.
      for (const [, resource, , , , constraints] of prepared.selectionUpdates ?? [])
        if (resource && Object.keys(constraints ?? {}).length) this.restoreConstraints(resource, constraints);
      // Providers load after the update is applied: the plots keep rendering meanwhile (TODO 20).
      await this.settle(timeoutMs, { loads: false });
      if (this.disposed) return;
      this.observeInteractions();
      this.observeOffsets();
      this.send({ type: "status", phase: "ready", revision: state.revision });
      this.revision = state.revision;
      this.#watchDiagnostics();
      update.accept();
      this.error = "";
      this.rejected = "";
    } catch (error) {
      this.root = previousRoot;
      update.rollback();
      try {
        await tick();
        if (previousRoot) await this.settle(30000, { loads: false });
      } finally {
        update.retire();
      }
      throw error;
    } finally {
      await Promise.all(
        releases.map((release) => release({ skipPreparations: true })),
      );
      this.applying = false;
    }
  }
  /**
   * Wait until every mounted component has settled. With `loads: false`, Providers' loads are
   * not waited for. A Provider's load error does not fail it: the previous result is still shown
   * (refresh() reports the error).
   */
  /**
   * Every error the scene holds, as Diagnostics naming their component and scene node (TODO
   * 136.6): the scene's own, its transforms' and Providers' statuses, and each plot's (marks,
   * fields, axes, a lost device). hm.check, the exported page, the widget and settle read this.
   * @returns {import("../plot/utils/diagnostics.js").Diagnostic[]}
   */
  diagnostics() {
    return this.#diagnostics(true);
  }
  /** diagnostics(), with the refused update's error only when `refused`. */
  #diagnostics(refused) {
    const out = [toDiagnostic(this.error, { component: "Scene" }),
      ...(refused ? [toDiagnostic(this.rejected, { component: "Scene" })] : [])];
    for (const [handle, status] of this.statuses)
      if (status.error && !status.pending) {
        const node = this.#statusNodes.get(handle);
        out.push(toDiagnostic(status.error, { component: status.kind ?? node?.kind, node: node?.id }));
      }
    for (const h of this.handles.values())
      for (const entry of h.handle?.listDiagnostics?.() ?? []) out.push({ ...entry, node: entry.node ?? h.id });
    out.push(...this.#reported.values());
    const seen = new Set();
    return /** @type {import("../plot/utils/diagnostics.js").Diagnostic[]} */ (
      out.filter((entry) => entry && !seen.has(entry.message) && seen.add(entry.message)));
  }
  /** A timeout that names what was still preparing: each plot's pending work, pending statuses. */
  #outstanding(error) {
    const waiting = [];
    for (const h of this.handles.values()) {
      const pending = h.handle?.getDiagnostics?.()?.pendingPreparations;
      if (pending) waiting.push(`${h.kind ?? "Plot"} ${h.id}: ${pending} preparation${pending === 1 ? "" : "s"}`);
    }
    for (const [handle, status] of this.statuses)
      if (status.pending) waiting.push(`${status.kind ?? this.#statusNodes.get(handle)?.kind ?? "transform"} loading`);
    if (waiting.length && error?.message) error.message = `${error.message} Still waiting on: ${waiting.join("; ")}.`;
    return error;
  }
  async settle(timeoutMs = 30000, { loads = true } = {}) {
    const deadline = performance.now() + timeoutMs;
    while (!this.disposed) {
      await tick();
      const before = this.handles;
      // An error ends the wait at once (TODO 136.2/136.6): work an error stops never settles.
      // A refused update's error (`rejected`) is not the work being waited for.
      let watching = true;
      const failed = new Promise((resolve) => {
        const poll = () => {
          if (!watching || this.disposed) return resolve(null);
          const first = this.#diagnostics(false).find((entry) => entry.severity === "error" && entry.component !== "Provider");
          if (first) resolve(first);
          else setTimeout(poll, 50);
        };
        poll();
      });
      const settled = Promise.all([...before.values()].map((h) => h.handle?.whenSettled?.({ loads }))).then(() => null);
      let stopped;
      try {
        stopped = await deadlinePromise(Promise.race([settled, failed]), deadline - performance.now(),
          "component preparation", this._disposal.signal);
      } catch (error) {
        throw this.#outstanding(error);
      } finally {
        watching = false;
      }
      if (stopped) throw Object.assign(Error(stopped.message), { code: stopped.code, diagnostic: stopped });
      if (this.disposed) return;
      await tick();
      const failure = [...this.statuses.values()].find(
        (s) => !s.pending && s.error && s.kind !== "Provider",
      );
      if (failure) throw Error(`${failure.kind}: ${failure.error}`);
      const plots = [...this.handles.values()].filter(
        (h) => h.handle?.getDiagnostics && h.handle?.getAxisLayout,
      );
      const waiting =
        plots.some((h) => !h.handle.getDiagnostics()) ||
        [...this.statuses.values()].some((s) => s.pending && (loads || s.kind !== "Provider"));
      for (const h of plots) {
        const issue = h.handle.getRenderError?.();
        if (issue) throw h.handle.getRenderDiagnostic?.() ?? Error(issue);
      }
      if (!waiting && before === this.handles) return;
      if (performance.now() > deadline)
        throw diagnostic("bridge.timeout",
          "Scene preparation timed out. Check WebGPU and notebook worker permissions.", {
            scope: "scene", details: { phase: "preparation" },
          });
      await new Promise((resolve) => setTimeout(resolve, 16));
    }
  }
  async command(message) {
    const { command, target, args = {} } = message;
    if (this.error) throw Error(this.error);
    const deadline = performance.now() + (args.timeoutMs ?? 30000);
    const remaining = () => Math.max(1, deadline - performance.now());
    await this.settle(remaining());
    const targets = [...this.handles.values()].filter((h) => h.id === target);
    if (command === "settled") return null;
    if (command === "animations_finished") {
      await deadlinePromise(Promise.all(
        [...this.handles.values()].map((h) =>
          h.handle?.whenAnimationsFinished?.(),
        ),
      ), remaining(), "animation completion");
      return null;
    }
    if (command === "export_html") return this.exportHTML(target, args);
    if (command === "selection") {
      const resource = this.resources.selections.get(target);
      if (!resource) throw Error("Selection resource is not mounted.");
      const owner = [...this.resources.tables.values()].map((table) => table.identity)
        .concat([...this.resources.identities.values()]).find((candidate) => candidate?.id === args.owner);
      if (!owner) throw Error("Selection data owner is not mounted.");
      const operation = args.operation ?? "replace";
      if (operation === "clear") resource.clear(owner);
      else if (operation === "clear_columns") resource.clearColumns(owner, args.columns ?? []);
      else if (["replace", "add", "remove", "toggle"].includes(operation)) resource[operation](owner, args.rows ?? []);
      else throw Error("Unknown selection operation.");
      await tick();
      return {
        ...resource.status(),
        owners: Object.fromEntries([owner].map((item) => [item.id, [...resource.rows(item)]])),
        constraints: { [owner.id]: resource.getConstraints?.(owner, "committed") ?? [] },
      };
    }
    if (command === "export_png") {
      if (target === this.root.id) return this.exportScene(args.scale ?? 2);
      if (args.cells) {
        const facet = this.facetFor(target);
        if (facet?.exportCells) return facet.exportCells("png", args);
      }
      if (targets.length >= 1 && args.cells)
        return {
          items: await Promise.all(
            targets
              .sort((a, b) => a.key.localeCompare(b.key))
              .map(async (entry) => ({
                key: entry.key,
                row: entry.cell?.row,
                column: entry.cell?.column,
                blob: await entry.handle.exportPNG({ scale: args.scale ?? 2 }),
              })),
          ),
        };
      if (targets.length !== 1)
        throw Error(
          "Export a Facet or Scene when a target has multiple cells.",
        );
      if (!targets[0].handle?.exportPNG)
        throw Error("This component does not support PNG export.");
      return targets[0].handle.exportPNG({ scale: args.scale ?? 2 });
    }
    if (command === "export_svg" || command === "export_pdf") {
      const format = command.slice(7);
      if (target === this.root.id) return this.exportSceneDocument(format, args);
      if (args.cells) {
        const facet = this.facetFor(target);
        if (facet?.exportCells) return facet.exportCells(format, args);
      }
      if (targets.length >= 1 && args.cells) {
        const method = format === "svg" ? "exportSVG" : "exportPDF";
        return {
          items: await Promise.all(
            targets
              .sort((a, b) => a.key.localeCompare(b.key))
              .map(async (entry) => {
                if (!entry.handle?.[method])
                  throw Error(`This component does not support ${format.toUpperCase()} export.`);
                const value = await entry.handle[method](args);
                return {
                  key: entry.key,
                  row: entry.cell?.row,
                  column: entry.cell?.column,
                  blob: value?.blob ?? value,
                  report: value?.report ?? null,
                };
              }),
          ),
        };
      }
      if (targets.length !== 1)
        throw Error("Export a Facet or Scene when a target has multiple cells.");
      const method = format === "svg" ? "exportSVG" : "exportPDF";
      if (!targets[0].handle?.[method]) throw Error(`This component does not support ${format.toUpperCase()} export.`);
      return targets[0].handle[method](args);
    }
    if (command === "export_video") {
      // Python's export_mp4(encoder="browser"): the frames export_png gives at each clock time,
      // encoded here by WebCodecs (hmplot/video), and the clock restored as "time" found it.
      const { frameTimes, encodeFrames } = await import("../video.js");
      const times = frameTimes(args), clock = (time, freeze) => this.command({ command: "time", target, args: { time, freeze } });
      const previous = await this.command({ command: "time", target, args: {} }), runtime = this;
      try {
        return await encodeFrames((async function* () {
          for (const time of times) {
            await clock(time, true);
            yield await runtime.command({ command: "export_png", target, args: { scale: args.scale ?? 2 } });
          }
        })(), { fps: args.fps ?? 30 });
      } finally {
        await clock(previous.time, previous.frozen);
      }
    }
    if (command === "time") {
      // A target without a clock of its own (the Scene, a Facet) sets every clock inside it,
      // and a Plot repeated in Facet cells sets each cell's; the first clock is reported.
      const inside = (h) => target === this.root?.id ||
        targets.some((t) => t.element && h.element && t.element !== h.element && t.element.contains(h.element));
      let clocks = targets.filter((h) => h.handle?.getAnimationTime);
      if (!clocks.length) clocks = [...this.handles.values()].filter((h) => h.handle?.getAnimationTime && inside(h));
      if (!clocks.length) throw Error(targets.length || target === this.root?.id ? "Target has no animation clock." : "Target is not mounted.");
      if (args.time !== undefined)
        await Promise.all(clocks.map((h) => h.handle.setAnimationTime(args.time, { freeze: args.freeze ?? true })));
      const clock = clocks[0].handle;
      return { time: clock.getAnimationTime(), frozen: !!clock.getAnimationTimeFrozen?.() };
    }
    if (!targets.length) throw Error("Target is not mounted.");
    if (command === "read") {
      // A Data's or a transform's rows for Python's await node.read() (TODO 145.1).
      const readers = targets.filter((h) => typeof h.handle?.read === "function");
      if (!readers.length) throw Error("read() reads the rows of a Data or a transform; this node has none.");
      if (readers.length > 1)
        throw Error(`read(): this node is repeated in ${readers.length} Facet cells, each with its own rows; read a node outside the Facet.`);
      const table = wireTable(await readers[0].handle.read({ columns: args.columns ?? undefined }));
      // The kernel's connection closes on a message past its limit (python/PROTOCOL.md).
      const bytes = args.maxBytes ? JSON.stringify(table).length : 0;
      if (args.maxBytes && bytes > args.maxBytes)
        throw limitError("readback", { component: "read()", what: "a table sent to Python", count: bytes, limit: args.maxBytes });
      return table;
    }
    if (command === "camera") {
      // A Plot repeated in Facet cells: set_camera moves every cell, get_camera reports the
      // first mounted one. A Facet target addresses the cameras of the Plots inside it.
      const inside = (h) => targets.some((t) => t.element && h.element && t.element !== h.element && t.element.contains(h.element));
      let cameras = targets.filter((h) => h.handle?.getCamera);
      if (!cameras.length) cameras = [...this.handles.values()].filter((h) => h.handle?.getCamera && inside(h));
      cameras = cameras.filter((h) => h.handle.getCamera());
      if (!cameras.length) throw Error("Target has no 3D camera.");
      if (args.state) await Promise.all(cameras.map((h) => h.handle.setCamera(args.state, { animate: !!args.animate })));
      return cameras[0].handle.getCamera() ?? null;
    }
    if (command === "viewport") {
      // Like the camera command, a repeated Plot or enclosing Facet applies
      // one partial state to every mounted cell and reports the first.
      const inside = (h) => targets.some((t) => t.element && h.element &&
        t.element !== h.element && t.element.contains(h.element));
      let viewports = targets.filter((h) => h.handle?.getViewport && !h.handle?.getCamera?.());
      if (!viewports.length) viewports = [...this.handles.values()].filter((h) =>
        h.handle?.getViewport && !h.handle?.getCamera?.() && inside(h));
      if (!viewports.length) throw Error("Target has no 2D viewport.");
      if (args.state) await Promise.all(viewports.map((h) => h.handle.setViewport(args.state)));
      return viewports[0].handle.getViewport();
    }
    for (const t of targets) {
      if (command === "fit") t.handle.fit?.();
      else if (command === "groups") {
        if (!t.handle.getGroups) throw Error("Target is not a Partition.");
        return t.handle.getGroups().map((group) => ({
          key: group.key,
          values: group.values,
          label: group.label,
          marks: group.marks.map((mark) => mark.entry?.()?.label).filter(Boolean),
        }));
      }
      else if (command === "action") {
        if (!t.handle.action) throw Error("Target has no actions");
        await t.handle.action(args.action);
      } else throw Error(`Unknown command ${command}`);
    }
    return null;
  }
  /**
   * The ids of the node `target` and every node under it (empty when it is not in the scene).
   * @param {string} target
   * @returns {Set<string>}
   */
  subtree(target) {
    const ids = new Set();
    const add = (node) => { ids.add(node.id); node.children?.forEach(add); };
    const find = (node) => node.id === target ? add(node) : node.children?.forEach(find);
    if (this.root) find(this.root);
    return ids;
  }
  /**
   * The scene's exportable parts composed as one PNG; with `ids`, only those of these nodes.
   * @param {number} scale
   * @param {Set<string> | null} [ids]
   */
  async exportScene(scale, ids = null) {
    if (!Number.isFinite(scale) || scale <= 0)
      throw Error("Export scale must be positive.");
    const candidates = [...this.handles.values()].filter(
      (h) =>
        h.element && h.handle?.exportPNG && h.handle.exportable?.() !== false && (!ids || ids.has(h.id)),
    );
    const elements = candidates.filter(
      (h) =>
        !candidates.some(
          (parent) => parent !== h && parent.element.contains(h.element),
        ),
    );
    const releases = [...this.handles.values()]
      .map((h) => h.handle?.holdAnimations?.())
      .filter(Boolean);
    try {
      return await exportScenePNG(elements, scale);
    } finally {
      releases.forEach((release) => release());
    }
  }
  /**
   * The scene's exportable parts composed as one SVG or PDF; with `ids`, only those of these nodes.
   * @param {"svg" | "pdf"} format
   * @param {any} options
   * @param {Set<string> | null} [ids]
   */
  async exportSceneDocument(format, options, ids = null) {
    const candidates = [...this.handles.values()].filter((h) =>
      h.element && h.handle?.exportSVG && h.handle?.exportPDF && h.handle.exportable?.() !== false && (!ids || ids.has(h.id)),
    );
    const elements = candidates.filter((h) =>
      !candidates.some((parent) => parent !== h && parent.element.contains(h.element)),
    );
    const releases = [...this.handles.values()].map((h) => h.handle?.holdAnimations?.()).filter(Boolean);
    // The document's title and description (TODO 49): the first title shown, and each plot's
    // description.
    const metadata = { title: elements.map((h) => h.handle.getTitle?.()).find(Boolean) ?? "",
      description: elements.map((h) => h.handle.getDescription?.()).filter(Boolean).join(" ") };
    // What the document leaves out says so (a 3D plot's Minimap, TODO 67.6).
    const omitted = [...this.handles.values()].filter((h) => !ids || ids.has(h.id)).map((h) => h.handle?.exportOmission?.()).filter(Boolean);
    try {
      const result = await exportSceneDocument(elements, format, { ...options, metadata });
      result.report.warnings.push(...new Set(omitted));
      return result;
    }
    finally { releases.forEach((release) => release()); }
  }
  /**
   * Errors that appear after the scene was accepted (a mark's late data error, a lost device) go
   * to Python as they change (TODO 136.6), where scene.diagnostics holds them: reported, not rolled
   * back (decided 2026-10-13). A cheap check every half second; nothing is sent while they hold.
   */
  #diagnosticsTimer = 0;
  #sentDiagnostics = "[]";
  #watchDiagnostics() {
    if (this.#diagnosticsTimer || this.disposed) return;
    this.#diagnosticsTimer = setInterval(() => {
      if (this.disposed) return clearInterval(this.#diagnosticsTimer);
      const list = this.diagnostics(), key = JSON.stringify(list);
      if (key === this.#sentDiagnostics) return;
      this.#sentDiagnostics = key;
      this.send({ type: "diagnostics", diagnostics: list, revision: this.revision });
    }, 500);
  }
  dispose() {
    this.disposed = true;
    clearInterval(this.#diagnosticsTimer);
    this._disposal.abort();
    this.root = null;
    this.serializable = null;
    this.browserSettings.clear();
    this.interactionStops.splice(0).forEach((stop) => stop());
    this.offsetStops.splice(0).forEach((stop) => stop());
  }
}

/**
 * A host table (utils/readback.js) as JSON for the kernel (TODO 145.1): numbers as lists with
 * null where missing, times as {$datetime: ms} (as input values travel), 2D columns as lists of
 * lists, big integers as numbers.
 * @param {{ length: number, version: unknown, columns: Record<string, ArrayLike<unknown>> }} table
 */
export function wireTable(table) {
  /** @param {unknown} v @returns {unknown} */
  const value = (v) => {
    if (typeof v === "number") return Number.isFinite(v) ? v : null;
    if (typeof v === "bigint") return Number(v);
    if (v instanceof Date) return Number.isFinite(v.getTime()) ? { $datetime: v.getTime() } : null;
    if (Array.isArray(v)) return v.map(value);
    return v ?? null;
  };
  /** @type {Record<string, unknown[]>} */
  const columns = {};
  for (const [name, values] of Object.entries(table.columns)) columns[name] = Array.from(values, value);
  return { length: table.length, columns };
}
