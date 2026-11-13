import { composedDocument } from "./sceneDocumentExport.js";
import { ownElements, ownTexts, textBottom, textLines, textLinesSVG } from "./textExport.js";

// Page-unique gradient ids, so several exported documents can be inlined together.
let gradients = 0;

const escape = (value) => String(value).replace(/[&<>"']/g, (c) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;",
}[c]));

function body(svg) {
  return svg.replace(/^.*?<svg[^>]*>/s, "").replace(/<\/svg>\s*$/s, "");
}

function styledSVG(element) {
  const clone = element.cloneNode(true),
    source = [element, ...element.querySelectorAll("*")],
    target = [clone, ...clone.querySelectorAll("*")];
  for (let i = 0; i < source.length; i++) {
    const style = getComputedStyle(source[i]);
    for (const key of ["fill", "stroke", "stroke-width", "stroke-dasharray", "stroke-linecap", "stroke-linejoin", "font", "font-family", "font-size", "font-weight", "opacity", "color"])
      target[i].style.setProperty(key, style.getPropertyValue(key));
  }
  clone.removeAttribute("width");
  clone.removeAttribute("height");
  return new XMLSerializer().serializeToString(clone);
}

/** Add embedded HTML guides to an already completed plot SVG. */
export async function exportDocumentGuides(result, canvasHost, plotHost, format, options = {}) {
  const guides = ownElements(plotHost, "[data-plot-guide]"), texts = ownTexts(plotHost);
  if (!guides.length && !texts.length) {
    if (format === "svg") return result;
    const text = await result.blob.text();
    return composedDocument([{ svg: body(text), report: result.report }], canvasHost.clientWidth, canvasHost.clientHeight, format, options);
  }
  const root = plotHost.getBoundingClientRect(), plot = canvasHost.getBoundingClientRect(),
    logicalWidth = root.width,
    logicalHeight = Math.max(root.height, ...guides.map((guide) => guide.getBoundingClientRect().bottom - root.top), textBottom(texts, root));
  // The plot's background under its legends and titles too, not only under the canvas.
  const background = getComputedStyle(plotHost).backgroundColor,
    backdrop = background && background !== "rgba(0, 0, 0, 0)" && background !== "transparent"
      ? `<rect x="0" y="0" width="${logicalWidth}" height="${logicalHeight}" fill="${background}"/>` : "";
  const plotText = await result.blob.text(),
    fragments = [`${backdrop}<g transform="translate(${plot.left-root.left} ${plot.top-root.top})">${body(plotText)}</g>`],
    report = { ...result.report, rasterLayers: [...result.report.rasterLayers], warnings: [...result.report.warnings] };
  for (const guide of guides) {
    for (const element of guide.querySelectorAll("canvas, svg, span, small")) {
      const rect = element.getBoundingClientRect();
      if (!rect.width || !rect.height) continue;
      const x = rect.left - root.left, y = rect.top - root.top,
        parent = element.closest("button"), opacity = parent?.getAttribute("aria-pressed") === "false" ? 0.4 : 1,
        tag = element.tagName.toLowerCase();
      if (tag === "canvas") {
        const gradient = element.guideGradient?.();
        if (gradient?.stops?.length) {
          // Colorbars are vector gradients; vertical bars run from the bottom (low) up.
          const id = `heatmap-colorbar-${++gradients}`,
            direction = gradient.vertical ? `x1="0" y1="1" x2="0" y2="0"` : `x1="0" y1="0" x2="1" y2="0"`,
            stops = gradient.stops.map(({ offset, color }) => `<stop offset="${offset}" stop-color="${escape(color)}"/>`).join("");
          fragments.push(`<defs><linearGradient id="${id}" ${direction}>${stops}</linearGradient></defs><rect x="${x}" y="${y}" width="${rect.width}" height="${rect.height}" fill="url(#${id})" opacity="${opacity}"/>`);
          report.vectorPrimitives += 1;
          continue;
        }
        if (options.mode === "vector") throw Error("Strict vector export cannot represent GPU colorbars. Use mode=\"auto\".");
        const href = await element.guidePNG?.();
        if (!href) continue;
        fragments.push(`<image x="${x}" y="${y}" width="${rect.width}" height="${rect.height}" opacity="${opacity}" href="${href}"/>`);
        report.rasterLayers.push({ kind: "colorbar", dpi: 96, marks: [guide.getAttribute("aria-label") || "Legend"] });
      } else if (tag === "svg") {
        // A swatch drawn in a viewBox (a theme's swatchSize, TODO 132.2) keeps its scale.
        const view = element.viewBox?.baseVal, scale = view?.width ? rect.width / view.width : 1;
        fragments.push(`<g transform="translate(${x} ${y})${scale !== 1 ? ` scale(${scale})` : ""}" opacity="${opacity}">${body(styledSVG(element))}</g>`);
      } else {
        const style = getComputedStyle(element), baseline = y + rect.height * 0.76;
        fragments.push(`<text x="${x}" y="${baseline}" fill="${escape(style.color)}" font-family="${escape(style.fontFamily)}" font-size="${parseFloat(style.fontSize) || 12}" font-weight="${escape(style.fontWeight)}" opacity="${opacity}">${escape(element.textContent)}</text>`);
      }
    }
  }
  // Titles and captions (TODO 46): text, line by line where the page laid them out.
  fragments.push(textLinesSVG(texts.flatMap((element) => textLines(element, root))));
  return composedDocument([{ svg: fragments.join(""), report }], logicalWidth, logicalHeight, format, options);
}

/** Export an external Legend using the same vector/raster guide policy. */
export async function exportStandaloneGuide(host, format, options = {}) {
  if (!host) throw Error("Legend is not mounted.");
  const rect = host.getBoundingClientRect(), width = Math.max(1, rect.width), height = Math.max(1, rect.height),
    empty = new Blob([`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"></svg>`], { type: "image/svg+xml" }),
    report = { mode: options.mode ?? "auto", vectorPrimitives: 0, rasterLayers: [], markOutcomes: [], warnings: [] };
  return exportDocumentGuides({ blob: empty, report }, host, host, format, options);
}
