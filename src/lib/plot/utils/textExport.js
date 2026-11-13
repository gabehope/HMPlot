// HTML text in exports (TODO 46): a Plot's or Facet's title, subtitle and caption are HTML on
// screen; exports write them line by line where the page laid them out, as SVG <text> (vector
// and searchable in SVG and PDF) or canvas text (PNG), in the same font.

const escape = (value) => String(value).replace(/[&<>"']/g, (c) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;",
}[c]));

/**
 * The elements matching `selector` that `host` draws itself: those whose nearest
 * `[data-export-host]` is `host` (a Facet's cells are Plots with titles and legends of their
 * own). A host without the attribute (an external Legend's element) owns every match.
 */
export function ownElements(host, selector) {
  const all = [...(host?.querySelectorAll(selector) ?? [])];
  return host?.hasAttribute?.("data-export-host") ? all.filter((element) => element.closest("[data-export-host]") === host) : all;
}

/** The title, subtitle and caption elements a host draws itself (`[data-plot-text]`). */
export const ownTexts = (host) => ownElements(host, "[data-plot-text]");

let measure;
// The font's ascent as a fraction of its content height (ascent + descent): an inline box's
// content area runs from the baseline minus the ascent to the baseline plus the descent.
function ascentFraction(font) {
  measure ??= document.createElement("canvas").getContext("2d");
  measure.font = font;
  const metrics = measure.measureText("Hg"),
    ascent = metrics.fontBoundingBoxAscent, descent = metrics.fontBoundingBoxDescent;
  return ascent + descent > 0 ? ascent / (ascent + descent) : 0.8;
}

/**
 * An element's text as the page lays it out, one entry per line: its text, its left edge and
 * baseline relative to `origin` (a DOMRect), and the element's font and color. Collapsed white
 * space is left out, as the page shows it.
 */
export function textLines(element, origin) {
  const style = getComputedStyle(element),
    font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`,
    fraction = ascentFraction(font), lines = [], range = document.createRange(),
    walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  let line = null;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node.data;
    for (let i = 0; i < text.length;) {
      const size = text.codePointAt(i) > 0xffff ? 2 : 1, character = text.slice(i, i + size);
      range.setStart(node, i);
      range.setEnd(node, i + size);
      i += size;
      const rect = [...range.getClientRects()].find((box) => box.width > 0 || box.height > 0);
      if (!rect || (!rect.width && /\s/.test(character))) continue;
      // A new line starts when the box sits below the current line's middle.
      if (!line || rect.top >= line.top + line.height / 2) {
        line = { text: "", left: rect.left, top: rect.top, height: rect.height };
        lines.push(line);
      } else if (/\s/.test(character) && line.text.endsWith(" ")) continue;
      line.text += /\s/.test(character) ? " " : character;
      line.left = Math.min(line.left, rect.left);
    }
  }
  return lines
    .map((entry) => ({ text: entry.text.trimEnd(), x: entry.left - origin.left, baseline: entry.top - origin.top + entry.height * fraction }))
    .filter((entry) => entry.text)
    .map((entry) => ({
      ...entry,
      fontFamily: style.fontFamily, fontSize: parseFloat(style.fontSize) || 12,
      fontWeight: style.fontWeight, fontStyle: style.fontStyle, color: style.color,
      opacity: Number(style.opacity) || 1,
    }));
}

/** Text lines as SVG <text> elements. */
export function textLinesSVG(lines) {
  return lines.map((line) => `<text x="${line.x}" y="${line.baseline}" fill="${escape(line.color)}" font-family="${escape(line.fontFamily)}" font-size="${line.fontSize}" font-weight="${escape(line.fontWeight)}"${line.fontStyle && line.fontStyle !== "normal" ? ` font-style="${escape(line.fontStyle)}"` : ""}${line.opacity < 1 ? ` opacity="${line.opacity}"` : ""}>${escape(line.text)}</text>`).join("");
}

/** Text lines drawn on a 2D canvas context at `scale` output pixels per CSS pixel. */
export function drawTextLines(context, lines, scale = 1) {
  context.save();
  context.textBaseline = "alphabetic";
  context.textAlign = "left";
  for (const line of lines) {
    context.font = `${line.fontStyle} ${line.fontWeight} ${line.fontSize * scale}px ${line.fontFamily}`;
    context.fillStyle = line.color;
    context.globalAlpha = line.opacity;
    context.fillText(line.text, line.x * scale, line.baseline * scale);
  }
  context.restore();
}

/** The lowest bottom edge of `elements`, relative to `origin` (for sizing an export). */
export const textBottom = (elements, origin) =>
  Math.max(0, ...elements.map((element) => element.getBoundingClientRect().bottom - origin.top));
