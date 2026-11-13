import {bytesToBase64, base64ToBytes} from "../encoding/base64.js";
import { mount, unmount } from "svelte";
import SceneRenderer from "./SceneRenderer.svelte";
import { SceneRuntime } from "./runtime.svelte.js";
import { initializePlot } from "../jaxExtensions/setup.js";
import { registerDefaultFont } from "../plot/utils/defaultFont.js";
import { printableSVG } from "../plot/utils/pdfFonts.js";
import { RUNTIME_SCRIPT, pageRuntime } from "./htmlPage.js";
import { toDiagnostic } from "../plot/utils/diagnostics.js";
import { setLintExtents } from "../plot/utils/lintMode.js";

// The page's text (an exported page's snapshot too, TODO 54) uses the bundled font from the
// start, with or without WebGPU.
registerDefaultFont();
// Python prints exported SVG to PDF in a page of its own (exporter.py): this plans its fonts and
// gives the bundled font's @font-face rules.
globalThis.hmplotPrintableSVG = (svg) => printableSVG(svg);

let active;
// A page this runtime exports embeds the runtime itself (TODO 54): in an exported page, the text of
// the page's runtime script; in the export browser's page (exporter.py), the file it loaded.
async function ownSource() {
  const script = document.getElementById(RUNTIME_SCRIPT);
  if (script) return pageRuntime(script.textContent);
  const response = await fetch(import.meta.url);
  if (!response.ok) throw Error(`The standalone runtime could not read its own source (${response.status} from ${import.meta.url}).`);
  return response.text();
}

// A payload's column: inline (base64), as an exported page holds it, or at a URL, as Python's
// export session serves it (exporter.py _Assets.serve: a DevTools message holds at most about
// 100 MB, so ten million rows did not fit in one).
const columnLoader = (payload) => async (id) => {
  const column = payload.columns[id];
  if (!column) throw Error(`Missing standalone column ${id}`);
  if (column.url === undefined) return { descriptor: column.descriptor, payload: base64ToBytes(column.payload) };
  const response = await fetch(column.url);
  if (!response.ok) throw Error(`Standalone column ${id} did not load (${response.status}).`);
  return { descriptor: column.descriptor, payload: new Uint8Array(await response.arrayBuffer()) };
};

// A payload's plugin files (TODO 138.4): { name: { hash, source } } inline, as an exported page
// holds them, or { name: { hash, url } }, as Python's export session serves them. null: none here.
const pluginLoader = (payload) => async ({ name }) => {
  const entry = payload.plugins?.[name];
  if (!entry) return null;
  if (entry.url === undefined) return entry.source;
  const response = await fetch(entry.url);
  if (!response.ok) throw Error(`${response.status} from the export session`);
  return response.text();
};

globalThis.hmplotStandalone = async function hmplotStandalone(payload) {
  if (active) { active.runtime.dispose(); await unmount(active.component); }
  await initializePlot();
  setLintExtents(false);
  const runtime = new SceneRuntime(() => {}),
    target = document.getElementById("hmplot-root") ?? document.body;
  fit(runtime, target, payload.fill);
  const component = mount(SceneRenderer, { target, props: { runtime } });
  const load = columnLoader(payload);
  runtime.pluginSource = pluginLoader(payload);
  // Declarative, so the page can export itself (hm.export_html draws it here, TODO 54).
  runtime.setSerializable(payload.state, load, ownSource);
  await runtime.apply(payload.state, load);
  await drawn(runtime, target);
  active = { runtime, component, fill: payload.fill ?? true };
  return { webgpu: true, revision: payload.state.revision };
};

// Preparation can settle before a Plot's first frame publishes its viewport. Rules
// reading @view_* and asynchronously loaded marks must reach that frame before export.
async function drawn(runtime, target) {
  await runtime.settle();
  const deadline = performance.now() + 30000;
  while ([...target.querySelectorAll(".canvas")].some((canvas) => canvas.getAttribute("aria-busy") !== "false")) {
    if (performance.now() > deadline) throw Error("Standalone plots did not finish their first frame.");
    await new Promise((resolve) => setTimeout(resolve, 16));
  }
  await runtime.settle();
}

// The plots fill the page (fill true), fill a page's content at most `fill` px wide (an exported
// page's maximum width, TODO 132.6, so its snapshot is drawn at the page's width), or keep the
// 800px default (false, TODO 132.5).
function fit(runtime, target, fill) {
  runtime.fill = fill !== false;
  if (target !== document.body) target.style.maxWidth = typeof fill === "number" ? `${fill}px` : "";
  return fill;
}

// The mounted scene refit without mounting it again: a viewport or clock set through the export
// session stays.
globalThis.hmplotFill = async function hmplotFill(fill) {
  if (!active || active.fill === fill) return;
  active.fill = fit(active.runtime, document.getElementById("hmplot-root") ?? document.body, fill);
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  await drawn(active.runtime, document.getElementById("hmplot-root") ?? document.body);
};

const base64 = async (blob) => {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  return bytesToBase64(bytes);
};

/**
 * Python's hm.check (R2.8): mount a scene as hmplotStandalone does, but past its errors, and say
 * what it drew. Returns {errors, logged, plots, png, report}: every error the scene showed (a
 * failed preparation, a transform's or Provider's status, each plot's alert), what it wrote to
 * console.error, each mounted plot's marks with their row counts, axes and description (the model
 * its description is written from, describe.js), the scene as a PNG (base64; `scale` its pixel
 * ratio), and its SVG export's report (`vector`: what was drawn as images, and why). The scene
 * stays mounted for exports that follow.
 */
/** The mounted scene's diagnostics (TODO 136.6), for the page and for checks. */
globalThis.hmplotDiagnostics = () => active?.runtime.diagnostics() ?? [];

globalThis.hmplotCheck = async function hmplotCheck(payload, { scale = 1, vector = true, timeoutMs = 30000 } = {}) {
  const errors = [], logged = [];
  const note = (list, value) => {
    const text = String(value?.message ?? value ?? "").trim();
    if (text && !list.includes(text)) list.push(text);
  };
  // A ResizeObserver loop notice is the browser deferring a layout, not a failure.
  const log = console.error, uncaught = (event) => {
    const value = event.reason ?? event.error ?? event.message;
    if (!/^ResizeObserver loop/.test(String(value?.message ?? value))) note(errors, value);
  };
  console.error = (...args) => { note(logged, args.map((arg) => arg?.message ?? (typeof arg === "string" ? arg : String(arg))).join(" ")); log(...args); };
  // A tween matching rows by position (tweenState.js) warns on the console; the check keeps it.
  const warn = console.warn;
  console.warn = (...args) => { const text = args.map((arg) => arg?.message ?? String(arg)).join(" "); if (/^tween\.positional/.test(text)) note(logged, text); warn(...args); };
  addEventListener("error", uncaught);
  addEventListener("unhandledrejection", uncaught);
  try {
    if (active) { active.runtime.dispose(); await unmount(active.component); active = null; }
    await initializePlot();
    // Marks read their extents on explicit axes too, for the domain lint (lintMode.js).
    setLintExtents(true);
    const runtime = new SceneRuntime(() => {}),
      target = document.getElementById("hmplot-root") ?? document.body;
    fit(runtime, target, payload.fill);
    const component = mount(SceneRenderer, { target, props: { runtime } });
    active = { runtime, component, fill: payload.fill ?? true };
    const load = columnLoader(payload);
    runtime.pluginSource = pluginLoader(payload);
    runtime.setSerializable(payload.state, load, ownSource);
    // Each step goes on past a failure, so a plot with a broken mark still draws the rest.
    const thrown = [];
    const attempt = async (step) => { try { await step(); } catch (error) { note(errors, error); thrown.push(error); } };
    await attempt(() => runtime.apply(payload.state, load, { timeoutMs }));
    await attempt(() => runtime.settle(timeoutMs));
    const deadline = performance.now() + timeoutMs;
    while ([...target.querySelectorAll(".canvas")].some((canvas) => canvas.getAttribute("aria-busy") !== "false")) {
      if (performance.now() > deadline) { note(errors, `The plots did not finish their first frame in ${timeoutMs / 1000} s.`); break; }
      await new Promise((resolve) => setTimeout(resolve, 16));
    }
    await attempt(() => runtime.settle(timeoutMs));
    // The scene's diagnostics (TODO 136.6): its own error, its statuses', each plot's and what
    // components report through their scene node, each naming its component and node. Uncaught
    // errors become diagnostics of their own.
    // Lints that read the GPU (each Points mark's largest unscaled size) are read first.
    await attempt(() => Promise.all([...runtime.handles.values()].map((entry) => entry.handle?.prepareLints?.())));
    // Warnings (a legend with no mark yet) and lints (a configuration that does nothing, TODO
    // 136.13) are listed apart: only errors fail the check.
    const reported = runtime.diagnostics(), warnings = [], lints = [];
    for (const entry of reported)
      note(entry.severity === "lint" ? lints : entry.severity === "warning" ? warnings : errors, entry.message);
    const plots = [];
    for (const entry of runtime.handles.values()) {
      const handle = entry.handle;
      if (!handle?.getDescriptionModel) continue;
      // The plot's own box (its title, drawing area and caption), not its full-width section.
      const host = entry.element?.querySelector?.("[data-export-host]") ?? entry.element;
      const issue = handle.getRenderError?.() || null, box = host?.getBoundingClientRect?.();
      note(errors, issue);
      plots.push({ id: entry.id, key: entry.key, cell: entry.cell ? { row: entry.cell.row ?? null, column: entry.cell.column ?? null } : null,
        title: handle.getTitle?.() ?? "", description: handle.getDescription?.() ?? "", model: handle.getDescriptionModel(),
        width: box ? Math.round(box.width) : null, height: box ? Math.round(box.height) : null, error: issue });
    }
    // What apply and settle threw keeps its own diagnostic (a code, the component and property).
    for (const error of thrown) {
      const entry = toDiagnostic(error.diagnostic?.severity ? error.diagnostic : error);
      if (entry && !reported.some((known) => known.message === entry.message)) reported.push(entry);
    }
    const known = new Set(reported.map((entry) => entry.message));
    const diagnostics = [...reported, ...errors.filter((text) => !known.has(text)).map((text) => toDiagnostic(text, { code: "page" }))];
    // The picture and the vector report, of whatever the scene drew.
    let png = null, report = null;
    // Nothing drawn (a scene that failed before its plots mounted): its errors say why.
    if (!plots.length) return { errors, warnings, lints, diagnostics, logged, plots, png, report, revision: payload.state.revision };
    try { png = await base64(await runtime.exportScene(scale)); }
    catch (error) { note(errors, `The PNG export failed: ${error?.message ?? error}`); }
    if (vector) {
      try { report = (await runtime.exportSceneDocument("svg", { mode: "auto", rasterDpi: 96, text: "embedded", primitiveBudget: 100000 })).report; }
      catch (error) { note(logged, `The SVG export failed: ${error?.message ?? error}`); }
    }
    return { errors, warnings, lints, diagnostics, logged, plots, png, report, revision: payload.state.revision };
  } finally {
    console.error = log;
    console.warn = warn;
    removeEventListener("error", uncaught);
    removeEventListener("unhandledrejection", uncaught);
  }
};

globalThis.hmplotExport = async function hmplotExport(command, target, args) {
  if (!active) throw Error("No standalone HMPlot scene is mounted.");
  const value = await active.runtime.command({ command, target, args });
  // Other commands (time, camera, viewport) return plain values; exports return a Blob, {blob, report},
  // or a Facet's {items: [...]} of cells.
  if (!command.startsWith("export_")) return { value: value ?? null };
  if (value?.items) {
    return {
      items: await Promise.all(value.items.map(async (item) => {
        const bytes = new Uint8Array(await item.blob.arrayBuffer());
        return {
          key: item.key,
          row: item.row,
          column: item.column,
          payload: bytesToBase64(bytes),
          report: item.report ?? null,
        };
      })),
    };
  }
  const blob = value?.blob ?? value, bytes = new Uint8Array(await blob.arrayBuffer());
  // An HTML export's warnings (what it left out, a large snapshot) ride with its report.
  const report = value?.warnings ? { ...(value.report ?? {}), warnings: value.warnings } : value?.report ?? null;
  return { payload: bytesToBase64(bytes), report };
};
