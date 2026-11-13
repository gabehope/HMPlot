import {LIMITS} from "./limits.js";
import {bytesToBase64} from "../../encoding/base64.js";
// Shared logical export document. Rendering backends consume this structure;
// it deliberately contains no Three.js or Svelte objects.
export const SVG_NS = "http://www.w3.org/2000/svg";

export function parseLength(value, fallback, dpi = 96) {
  if (value == null) return fallback;
  if (typeof value === "number") return value;
  const match = /^\s*([0-9]*\.?[0-9]+)\s*(px|pt|mm|cm|in)?\s*$/i.exec(String(value));
  if (!match) throw Error(`Invalid export length: ${value}`);
  const n = Number(match[1]), unit = (match[2] || "px").toLowerCase();
  return n * ({ px: 1, pt: dpi / 72, mm: dpi / 25.4, cm: dpi / 2.54, in: dpi }[unit]);
}

export function exportDimensions(options, fallbackWidth, fallbackHeight) {
  const width = parseLength(options.width, options.height == null ? fallbackWidth : undefined),
    height = parseLength(options.height, options.width == null ? fallbackHeight : undefined);
  const resolvedWidth = width ?? height * fallbackWidth / fallbackHeight,
    resolvedHeight = height ?? width * fallbackHeight / fallbackWidth;
  if (![resolvedWidth, resolvedHeight].every(Number.isFinite) || resolvedWidth <= 0 || resolvedHeight <= 0)
    throw Error("Export width and height must be positive finite lengths.");
  return { width: resolvedWidth, height: resolvedHeight };
}

export function createExportDocument(width, height, options = {}) {
  return {
    version: 1,
    width,
    height,
    viewBoxWidth: options.viewBoxWidth ?? width,
    viewBoxHeight: options.viewBoxHeight ?? height,
    mode: options.mode ?? "auto",
    rasterDpi: options.rasterDpi ?? 300,
    text: options.text ?? "embedded",
    primitiveBudget: options.primitiveBudget ?? LIMITS.vectorPrimitives.value,
    elements: [],
    report: { mode: options.mode ?? "auto", vectorPrimitives: 0, rasterLayers: [], markOutcomes: [], warnings: [] },
  };
}

const escape = (value) => String(value).replace(/[&<>"']/g, (c) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;",
}[c]));

function attrs(values) {
  return Object.entries(values)
    .filter(([, value]) => value !== undefined && value !== null && value !== false)
    .map(([key, value]) => `${key}="${escape(value)}"`).join(" ");
}

function serializeElement(element) {
  if (element.type === "raw") return element.svg;
  const children = element.children?.map(serializeElement).join("") ?? "";
  const content = element.text == null ? children : escape(element.text);
  return `<${element.type}${Object.keys(element.attrs ?? {}).length ? ` ${attrs(element.attrs)}` : ""}>${content}</${element.type}>`;
}

export function serializeSVG(document) {
  return `<svg xmlns="${SVG_NS}" width="${document.width}" height="${document.height}" viewBox="0 0 ${document.viewBoxWidth} ${document.viewBoxHeight}" preserveAspectRatio="none">${document.elements.map(serializeElement).join("")}</svg>`;
}

/**
 * An SVG document with a <title> and <desc> first (TODO 49): a plot's or scene's name and
 * description, which screen readers and search read. `metadata` is { title, description }.
 */
export function svgMetadata(svg, metadata = {}) {
  const parts = [metadata.title ? `<title>${escape(metadata.title)}</title>` : "", metadata.description ? `<desc>${escape(metadata.description)}</desc>` : ""].join("");
  if (!parts) return svg;
  const open = /<svg\b[^>]*>/.exec(svg);
  return open ? svg.slice(0, open.index + open[0].length) + parts + svg.slice(open.index + open[0].length) : svg;
}

export function svgBlob(document) {
  return new Blob([serializeSVG(document)], { type: "image/svg+xml;charset=utf-8" });
}

export async function blobDataURL(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  return `data:${blob.type || "application/octet-stream"};base64,${bytesToBase64(bytes)}`;
}
