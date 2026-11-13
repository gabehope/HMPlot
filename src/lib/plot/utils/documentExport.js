import {
  blobDataURL,
  createExportDocument,
  exportDimensions,
  serializeSVG,
  svgBlob,
} from "./exportDocument.js";
import { isView3D, vectorCandidate, vectorMark, view3DIssue, view3DKind, view3DVectors } from "./vectorExport.js";
import { svgToPDF } from "./pdfFonts.js";
import { axisMaskPolygons, axisMaskElements } from "./axisMask.js";
import { limitError } from "./limits.js";

function cloneSVG(source, x = 0, y = 0) {
  const clone = source.cloneNode(true),
    originals = [source, ...source.querySelectorAll("*")],
    copies = [clone, ...clone.querySelectorAll("*")];
  for (let i = 0; i < copies.length; i++) {
    const style = getComputedStyle(originals[i]);
    for (const key of ["font", "font-size", "font-family", "font-weight", "fill", "stroke", "stroke-width", "paint-order", "color", "opacity", "stroke-dasharray", "stroke-linecap", "stroke-linejoin"])
      copies[i].style.setProperty(key, style.getPropertyValue(key));
  }
  clone.removeAttribute("width");
  clone.removeAttribute("height");
  clone.style.position = "static";
  return { type: "g", attrs: { transform: `translate(${x} ${y})` }, children: [{ type: "raw", svg: new XMLSerializer().serializeToString(clone) }] };
}

async function renderRaster(exportImage, logicalWidth, logicalHeight, dpi) {
  const scale = Math.max(0.1, dpi / 96);
  const blob = await exportImage(scale);
  return { blob, href: await blobDataURL(blob), width: logicalWidth, height: logicalHeight, dpi: scale * 96 };
}

function sceneMarks(scene) {
  const result = [];
  scene.traverse((object) => {
    // omitOverview is a minimap-only concern. Grid/rule layers use it but
    // still belong in document exports.
    if (object.material && object.visible && !object.userData?.omitExport) result.push(object);
  });
  return result;
}

function isolate(objects, keep) {
  const state = objects.map((object) => [object, object.visible]);
  for (const object of objects) object.visible = keep.has(object);
  return () => { for (const [object, visible] of state) object.visible = visible; };
}

/**
 * A scene object's name in an export's messages and report (TODO 67.6): its component's (Points,
 * Arrows3D, GeoJSON), else its export kind, else its three.js type, never its class name, which
 * a build minifies ("hdA was rasterized").
 */
export const componentName = (object) =>
  object.componentName ?? object.constructor?.componentName ?? object.exportKind ?? object.type ?? "object";

/** The plot's presentation effects as a message names them: "sky", "sky and fog", ... */
const listed = (names) => names.length < 3 ? names.join(" and ") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;

export async function buildPlotDocument({
  scene, camera, exportImage, overlays, logicalWidth, logicalHeight, background, effects = () => [], options = {}, label: plotLabel = "The plot",
}) {
  if (!scene || !camera || !exportImage) throw Error("Plot is not ready for document export.");
  const dims = exportDimensions(options, logicalWidth, logicalHeight),
    document = createExportDocument(dims.width, dims.height, { ...options, viewBoxWidth: logicalWidth, viewBoxHeight: logicalHeight });
  // A sky, fog, glow or atmosphere is composited over the whole scene (TODO 37.7): such a plot
  // exports as one raster image, with the effects, as its PNG does. Vectors cannot draw them.
  const shown = effects();
  if (shown.length && document.mode === "vector")
    throw Error(`Vector export cannot draw the plot's ${listed(shown)}. Use mode="auto" to export the plot as one raster image.`);
  if (shown.length && document.mode === "auto") {
    document.mode = "raster";
    document.report.warnings.push(`The plot was exported as one raster image because it shows ${listed(shown)}, which ${shown.length > 1 ? "have" : "has"} no vector form.`);
  }
  const mode = document.mode;
  if (background && background !== "rgba(0, 0, 0, 0)" && background !== "transparent")
    document.elements.push({ type: "rect", attrs: { x: 0, y: 0, width: logicalWidth, height: logicalHeight, fill: background } });
  if (!["auto", "vector", "raster"].includes(mode)) throw Error("Export mode must be auto, vector, or raster.");
  if (!Number.isFinite(document.rasterDpi) || document.rasterDpi < 36 || document.rasterDpi > 1200)
    throw Error("Raster DPI must be between 36 and 1200.");
  if (!["embedded", "outlines"].includes(document.text)) throw Error("Text mode must be embedded or outlines.");
  if (document.text === "outlines")
    document.report.warnings.push("Text outlining is not available yet; text was kept searchable with PDF font substitution.");

  // A 3D view (TODO 70.6) exports its marks as depth-sorted vectors only when every one of them
  // can (view3DIssue); otherwise all of them are one image, as an image and sorted vectors cannot
  // hide one another correctly.
  const marks = sceneMarks(scene), threeD = isView3D(marks, camera),
    records = marks.map((mark, index) => ({ mark, index, kind: threeD ? view3DKind(mark) : vectorCandidate(mark), value: null }));
  const label = (mark) => mark.options?.presentation?.label ?? componentName(mark);
  const unsupported = records.filter(({ kind }) => kind === "raster");
  const listedIssues = () => listed([...new Set(unsupported.map(({ mark }) => `${label(mark)} ${view3DIssue(mark)}`))]);
  if (mode === "vector" && unsupported.length && threeD)
    throw Error(`Vector export cannot draw this 3D view: ${listedIssues()}. In a 3D view only 2D marks export as vectors, ` +
      'and only when all of its marks do. Use mode="auto" to export its marks as one image.');
  if (mode === "vector" && unsupported.length)
    throw Error(`Vector export does not yet support: ${[...new Set(unsupported.map(({ mark }) => label(mark)))].join(", ")}. Use mode=\"auto\".`);

  // Output pixels per logical pixel: a larger export refines curves further
  // (capped, so the primitive budget stays meaningful).
  const detail = Math.min(8, Math.max(1, dims.width / logicalWidth, dims.height / logicalHeight));
  let remainingBudget = document.primitiveBudget,
    backgroundVectors = [], view3D = null;
  /** @param {string} what */
  const primitiveLimit = (what) => limitError("vectorPrimitives", { what: `a vector export of ${what}`, limit: document.primitiveBudget,
    property: "primitiveBudget", hint: 'Raise primitiveBudget, or export with mode="auto", which draws the rest as an image.' });
  const rasterize3D = (reason) => {
    for (const record of records) if (record.kind === "vector" && record.mark.isPlotObject) record.kind = "raster";
    document.report.warnings.push(`${plotLabel}'s 3D view was exported as one image because ${reason}.`);
  };
  if (threeD && mode !== "raster") {
    const drawn = records.filter(({ kind, mark }) => kind === "vector" && mark.isPlotObject);
    if (unsupported.length && drawn.length)
      rasterize3D(`${listedIssues()}; in a 3D view only 2D marks export as vectors, and only when all of its marks do`);
    else if (drawn.length) {
      const ordered = drawn.sort((a, b) => (a.mark.renderOrder ?? 0) - (b.mark.renderOrder ?? 0) || a.index - b.index);
      const value = await view3DVectors(ordered.map(({ mark }) => mark), camera, logicalWidth, logicalHeight, remainingBudget, detail);
      if (value.overflow) {
        if (mode === "vector") throw primitiveLimit("the 3D view");
        rasterize3D("it exceeds the vector primitive budget");
      } else {
        view3D = value;
        remainingBudget -= value.count;
        document.report.vectorPrimitives += value.count;
        document.report.warnings.push(`${plotLabel}'s 3D view was exported as vectors drawn back to front by depth: ` +
          "where marks intersect or cross closely, which one is in front is approximate.");
      }
    }
  }
  if (mode !== "raster") {
    for (const record of records) {
      const { mark, kind } = record;
      // A 3D view's marks are drawn above, sorted together.
      if (kind !== "vector" || threeD && mark.isPlotObject) continue;
      // SVG has mix-blend-mode for screen and multiply; additive and subtractive have no
      // vector equivalent, so those marks are rasterized (or refused in vector mode).
      const blend = mark.options?.has?.("blend") ? mark.options.get("blend") : "normal";
      // A shade (TODO 138.3) is a shader: the mark exports as an image of itself.
      const shade = mark.shade?.applied ? mark.shade.kind : null;
      if (shade) {
        if (mode === "vector") throw Error(`${label(mark)} is shaded by ${shade}, which SVG cannot express. Use mode="auto" to rasterize it.`);
        record.kind = "raster";
        document.report.warnings.push(`${label(mark)} was rasterized because its shade ${shade} has no vector equivalent.`);
        continue;
      }
      if (blend === "additive" || blend === "subtractive") {
        if (mode === "vector") throw Error(`${label(mark)} uses ${blend} blending, which SVG cannot express. Use mode="auto" to rasterize it.`);
        record.kind = "raster";
        document.report.warnings.push(`${label(mark)} was rasterized because ${blend} blending has no vector equivalent.`);
        continue;
      }
      const value = await vectorMark(mark, camera, logicalWidth, logicalHeight, remainingBudget, detail);
      if (value && !value.overflow && (blend === "screen" || blend === "multiply"))
        for (const element of value.elements)
          element.attrs = { ...element.attrs, style: [element.attrs?.style, `mix-blend-mode: ${blend}`].filter(Boolean).join("; ") };
      if (value?.overflow) {
        if (mode === "vector") throw primitiveLimit(label(mark));
        record.kind = "raster";
        document.report.warnings.push(`${label(mark)} was rasterized because it exceeds the vector primitive budget.`);
      } else if (value?.raster) {
        // Content known only after sampling (a fill cut by a horizon or seam).
        if (mode === "vector") throw Error(`${label(mark)} cannot export as vectors: ${value.raster}. Use mode="auto".`);
        record.kind = "raster";
        document.report.warnings.push(`${label(mark)} was rasterized because ${value.raster}.`);
      } else if (value) {
        // Guide meshes have no options and are intentionally outside the data mask.
        if (mark.options)
          value.elements = axisMaskElements(value.elements,
            axisMaskPolygons(mark.options, camera, logicalWidth, logicalHeight), `axis-mask-${mark.uuid ?? record.index}`);
        remainingBudget -= value.count;
        record.value = value;
        if (value.layer === "background") backgroundVectors.push(...value.elements);
        document.report.vectorPrimitives += value.count;
      }
    }
  }
  document.report.markOutcomes = records
    .filter(({ kind }) => kind !== "empty")
    .map(({ mark, kind }) => ({ mark: label(mark), kind: mark.exportKind ?? componentName(mark), rendering: mode === "raster" ? "raster" : kind }));

  if (mode === "raster") {
    const raster = await renderRaster(exportImage, logicalWidth, logicalHeight, document.rasterDpi);
    document.elements.push({ type: "image", attrs: { x: 0, y: 0, width: logicalWidth, height: logicalHeight, href: raster.href, preserveAspectRatio: "none" } });
    document.report.rasterLayers.push({ kind: "plot", dpi: raster.dpi, marks: records.filter(({ kind }) => kind !== "empty").map(({ mark }) => label(mark)) });
  } else {
    document.elements.push(...backgroundVectors);
    if (view3D) document.elements.push(...view3D.elements);
    const ordered = records
      .filter(({ kind, value }) => kind !== "empty" && value?.layer !== "background")
      .sort((a, b) => (a.mark.renderOrder ?? 0) - (b.mark.renderOrder ?? 0) || a.index - b.index);
    let rasterRun = [];
    const flushRaster = async () => {
      if (!rasterRun.length) return;
      const restore = isolate(marks, new Set(rasterRun.map(({ mark }) => mark))), oldBackground = scene.background;
      scene.background = null;
      try {
        const raster = await renderRaster(exportImage, logicalWidth, logicalHeight, document.rasterDpi);
        document.elements.push({ type: "image", attrs: { x: 0, y: 0, width: logicalWidth, height: logicalHeight, href: raster.href, preserveAspectRatio: "none" } });
        document.report.rasterLayers.push({ kind: "unsupported marks", dpi: raster.dpi, marks: rasterRun.map(({ mark }) => label(mark)) });
      } finally { scene.background = oldBackground; restore(); }
      rasterRun = [];
    };
    for (const record of ordered) {
      if (view3D && record.mark.isPlotObject) continue;
      if (record.kind === "raster") rasterRun.push(record);
      else {
        await flushRaster();
        if (record.value) document.elements.push(...record.value.elements);
      }
    }
    await flushRaster();
  }
  for (const overlay of overlays?.() ?? []) document.elements.push(cloneSVG(overlay));
  return document;
}

export async function documentPDF(document) {
  return svgToPDF(serializeSVG(document), document.width, document.height, document.report);
}

export async function exportDocument(format, context, options) {
  const document = await buildPlotDocument({ ...context, options });
  const blob = format === "svg" ? svgBlob(document) : await documentPDF(document);
  return { blob, report: document.report };
}

/**
 * The scale of an exportPNG call (R2.0): exportPNG takes options, as exportSVG and exportPDF
 * do. `scale` is output pixels per CSS pixel (default 1).
 */
export function pngScale(options = {}) {
  if (typeof options === "number") throw Error("exportPNG takes options: exportPNG({ scale }).");
  const scale = options?.scale ?? 1;
  if (!Number.isFinite(scale) || scale <= 0) throw Error("Export scale must be finite and positive.");
  return scale;
}
