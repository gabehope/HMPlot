import { SVG_NS, exportDimensions, svgMetadata } from "./exportDocument.js";
import { LIMITS, limitError } from "./limits.js";
import { svgToPDF } from "./pdfFonts.js";

// A part's own export at its on-screen rect (a Plot's title and caption are in it, TODO 46).
async function plotImage(entry, rect, left, top, options) {
  const result = await entry.handle.exportSVG({ ...options, width: rect.width, height: Math.max(1, rect.height) }),
    text = await result.blob.text(),
    body = text.replace(/^.*?<svg[^>]*>/s, "").replace(/<\/svg>\s*$/s, "");
  return {
    svg: `<g transform="translate(${rect.left - left} ${rect.top - top})">${body}</g>`,
    report: result.report,
  };
}

export async function composedDocument(fragments, logicalWidth, logicalHeight, format, options = {}) {
  const dimensions = exportDimensions(options, logicalWidth, logicalHeight),
    reports = fragments.map((item) => item.report),
    svg = `<svg xmlns="${SVG_NS}" width="${dimensions.width}" height="${dimensions.height}" viewBox="0 0 ${logicalWidth} ${logicalHeight}" preserveAspectRatio="none"><rect width="${logicalWidth}" height="${logicalHeight}" fill="white"/>${fragments.map((item) => item.svg).join("")}</svg>`,
    report = {
      mode: options.mode ?? "auto",
      vectorPrimitives: reports.reduce((sum, value) => sum + value.vectorPrimitives, 0),
      rasterLayers: reports.flatMap((value) => value.rasterLayers),
      markOutcomes: reports.flatMap((value) => value.markOutcomes ?? []),
      warnings: reports.flatMap((value) => value.warnings),
    };
  // A title and description (TODO 49): the SVG's <title> and <desc>, the PDF's title and subject.
  if (format === "svg") return { blob: new Blob([svgMetadata(svg, options.metadata)], { type: "image/svg+xml;charset=utf-8" }), report };
  return { blob: await svgToPDF(svg, dimensions.width, dimensions.height, report, options.metadata), report };
}

export async function exportSceneDocument(entries, format, options = {}) {
  if (!entries.length) throw Error("No exportable plots.");
  const bounds = entries.map((entry) => entry.element.getBoundingClientRect()),
    left = Math.min(...bounds.map((b) => b.left)), top = Math.min(...bounds.map((b) => b.top)),
    right = Math.max(...bounds.map((b) => b.right)), bottom = Math.max(...bounds.map((b) => b.bottom)),
    logicalWidth = right - left, logicalHeight = bottom - top,
    groups = [], reports = [];
  for (let i = 0; i < entries.length; i++) {
    const value = await plotImage(entries[i], bounds[i], left, top, options);
    groups.push(value.svg); reports.push(value.report);
  }
  return composedDocument(groups.map((svg, i) => ({ svg, report: reports[i] })), logicalWidth, logicalHeight, format, options);
}

/**
 * Parts ({element, handle}) composed as one PNG on white, each part's own PNG at its on-screen
 * box (a Plot's title and caption are in it, TODO 46): a scene's, or a template's views
 * (Marginals, TODO 136.16). `component` names the exporter in a limit's error.
 * @param {{ element: Element, handle: { exportPNG(options: { scale: number }): Promise<Blob> } }[]} entries
 * @param {number} scale
 * @param {string} [component]
 */
export async function exportScenePNG(entries, scale, component = "Scene") {
  if (!entries.length) throw Error("No exportable plots.");
  // Each plot's own box (its title, drawing area and caption), which its PNG draws: a fixed
  // width Plot's section spans the page, and its PNG was stretched across it (TODO 136.13).
  const bounds = entries.map((entry) =>
    (entry.element.querySelector?.("[data-export-host]") ?? entry.element).getBoundingClientRect());
  const left = Math.min(...bounds.map((b) => b.left)), top = Math.min(...bounds.map((b) => b.top)),
    right = Math.max(...bounds.map((b) => b.right)), bottom = Math.max(...bounds.map((b) => b.bottom));
  const width = Math.ceil((right - left) * scale), height = Math.ceil((bottom - top) * scale);
  if (Math.max(width, height) > 16384)
    throw limitError("texture", {
      component, what: "an export's side", count: Math.max(width, height), limit: 16384, hint: "Reduce the export scale.",
    });
  if (width * height > LIMITS.exportPixels.value) throw limitError("exportPixels", { count: width * height });
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext("2d"));
  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, width, height);
  for (let i = 0; i < entries.length; i++) {
    const bitmap = await createImageBitmap(await entries[i].handle.exportPNG({ scale })), rect = bounds[i];
    ctx.drawImage(bitmap, (rect.left - left) * scale, (rect.top - top) * scale, rect.width * scale, rect.height * scale);
    bitmap.close();
  }
  return await new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(Error("PNG encoding failed"))), "image/png"));
}
