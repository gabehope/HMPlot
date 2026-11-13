// Title's line breaking (TODO 46): plain text laid out on the host, so its SVG and its exports
// are the same lines.

/**
 * `text` as lines: broken at "\n", and with `wrap` greedily at `width` pixels, words measured by
 * `measure(text)`. A word wider than the width is broken between characters. Runs of spaces
 * collapse to one, as HTML shows them.
 * @param {string} text
 * @param {number} width
 * @param {(text: string) => number} measure
 * @param {boolean} [wrap]
 * @returns {string[]}
 */
export function breakLines(text, width, measure, wrap = true) {
  const lines = [];
  for (const paragraph of String(text ?? "").split(/\r?\n/)) {
    const words = paragraph.split(/[ \t]+/).filter(Boolean);
    if (!wrap || !(width > 0)) {
      lines.push(words.join(" "));
      continue;
    }
    let line = "";
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (measure(candidate) <= width) {
        line = candidate;
        continue;
      }
      if (line) lines.push(line);
      line = "";
      if (measure(word) <= width) {
        line = word;
        continue;
      }
      // A word wider than the line: as many characters per line as fit (at least one).
      let piece = "";
      for (const character of word) {
        if (piece && measure(piece + character) > width) {
          lines.push(piece);
          piece = "";
        }
        piece += character;
      }
      line = piece;
    }
    lines.push(line);
  }
  return lines;
}

/** Title's size presets from the theme's text size: title, subtitle, caption, or pixels. */
export function titleSize(size, base = 12) {
  if (typeof size === "number" && Number.isFinite(size) && size > 0) return size;
  if (size === "subtitle") return base + 1;
  if (size === "caption") return Math.max(8, base - 1);
  if (size === undefined || size === null || size === "title") return Math.round(base * 1.35);
  throw Error(`Title size must be "title", "subtitle", "caption" or a number of pixels; received ${JSON.stringify(size)}.`);
}
