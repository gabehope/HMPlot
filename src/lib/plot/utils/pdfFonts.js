// Fonts in PDF exports (TODO 52). svg2pdf prints text in a font jsPDF has: a standard font
// (Helvetica, Times, Courier; referenced by name, never embedded) or one added to the document.
// Before svg2pdf runs, one pass over the SVG decides each text's PDF font as svg2pdf would, with
// these changes: a sans-serif stack that only the generic alias resolves prints in the bundled
// Source Sans 3 (embedded, as a subset of the glyphs used) instead of Helvetica; a stack with no
// generic family counts as sans-serif instead of falling to Times; and a text a standard font
// cannot print (WinAnsi only: jsPDF writes such a string as UTF-16, garbling all of it) prints its
// minus signs as hyphens and, for any other such character, prints in Source Sans 3. It records
// the report's font warnings: substitutions, standard fonts left unembedded, those changes, and
// characters the bundled font lacks (jsPDF leaves them out).
import {
  DEFAULT_FONT_FAMILY,
  FONT_FACES,
  GENERIC_FAMILIES,
  fontFaceKey,
  fontFile,
  parseFontStack,
  defaultFontCSS,
} from "./defaultFont.js";

/** The name the bundled font has inside jsPDF and svg2pdf: a CSS identifier, so svg2pdf's text
 * measurement (a canvas font string built from it) parses. */
export const PDF_FAMILY = "SourceSans3";
const EMBEDDED = "Source Sans 3";
// Families jsPDF lists by name, and svg2pdf's aliases for named fonts.
const NAMED = new Map([
  ["helvetica", "helvetica"], ["arial", "helvetica"], ["verdana", "helvetica"],
  ["times", "times"], ["courier", "courier"], ["fixed", "courier"], ["terminal", "courier"],
]);
const BY_KIND = { sans: EMBEDDED, serif: "times", mono: "courier" };
const DISPLAY = { helvetica: "Helvetica", times: "Times", courier: "Courier", [EMBEDDED]: EMBEDDED };
// The generic keywords themselves: asking for "serif" and getting Times is no substitution.
const KEYWORDS = new Set(["sans-serif", "serif", "monospace", "cursive", "fantasy"]);

/**
 * The PDF font a CSS font-family stack prints in: the first family that is Source Sans 3, a
 * font jsPDF has by name (helvetica, times, courier) or an svg2pdf alias for one (arial,
 * verdana; fixed, terminal), or a generic family (sans-serif and system-ui: Source Sans 3;
 * serif: Times; monospace: Courier). A stack with none of these is sans-serif.
 * @returns {{ font: string, name: string, embedded: boolean, requested: string, substituted: boolean }}
 */
export function resolvePdfFont(stack) {
  const names = parseFontStack(stack), requested = names[0] ?? "";
  let font = EMBEDDED;
  for (const name of names) {
    const lower = name.toLowerCase();
    if (lower === DEFAULT_FONT_FAMILY.toLowerCase()) { font = EMBEDDED; break; }
    if (NAMED.has(lower)) { font = NAMED.get(lower); break; }
    const kind = GENERIC_FAMILIES.get(lower);
    if (BY_KIND[kind]) { font = BY_KIND[kind]; break; }
  }
  const name = DISPLAY[font];
  return {
    font, name, embedded: font === EMBEDDED, requested,
    substituted: !!requested && !KEYWORDS.has(requested.toLowerCase()) && requested.toLowerCase() !== name.toLowerCase(),
  };
}

/** jsPDF's style key for a CSS weight and style (the bundled faces': fontFaceKey). */
export const pdfFontStyle = fontFaceKey;

// Windows-1252's characters at bytes 0x80-0x9F (the rest is Latin-1's), written out: Node 20's
// TextDecoder("windows-1252") decodes as Latin-1, which has only control codes there.
const WINDOWS_1252_HIGH = "€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ";
let winAnsi;
/** Code points the standard fonts print (WinAnsiEncoding, Windows-1252's printable set). */
export function winAnsiCharacters() {
  if (!winAnsi) {
    winAnsi = new Set();
    for (let code = 0x20; code <= 0xff; code++) if (code < 0x7f || code >= 0xa0) winAnsi.add(code);
    for (const character of WINDOWS_1252_HIGH) winAnsi.add(character.codePointAt(0));
  }
  return winAnsi;
}

/** Characters of `text` a font lacks, given whether it has a code point; whitespace is ignored. */
export function missingCharacters(text, has) {
  const missing = new Set();
  for (const character of String(text))
    if (!/\s/.test(character) && !has(character.codePointAt(0))) missing.add(character);
  return [...missing];
}

const codePoint = (character) => `U+${character.codePointAt(0).toString(16).toUpperCase().padStart(4, "0")}`;

const listed = (characters) => characters.map((character) => `"${character}" (${codePoint(character)})`).join(", ");
/** The report's font warnings from the fonts a document prints in. */
export function fontWarnings({ substitutions = [], fonts = [], minus = [], fallbacks = [], missing = [] }) {
  const warnings = [];
  for (const { requested, name, embedded } of substitutions)
    warnings.push(`Font substitution: ${requested} → ${name} (${embedded ? "embedded" : "not embedded"}).`);
  for (const name of new Set(fonts.filter((font) => !font.embedded).map((font) => font.family)))
    warnings.push(`${name} is not embedded; some journals require embedded fonts. The default font (${EMBEDDED}) is embedded.`);
  for (const name of minus) warnings.push(`${name} has no minus sign; "−" (U+2212) prints as a hyphen.`);
  for (const { name, characters } of fallbacks)
    warnings.push(`${name} cannot print ${listed(characters)}; text with ${characters.length === 1 ? "it" : "them"} prints in ${EMBEDDED} (embedded).`);
  for (const { name, characters } of missing) {
    const list = listed(characters);
    warnings.push(characters.length === 1
      ? `${name} has no glyph for ${list}; the PDF leaves it out.`
      : `${name} has no glyphs for ${list}; the PDF leaves them out.`);
  }
  return warnings;
}

// A subset's tag: six capital letters from its style and glyphs (PDF 32000-1 9.6.4), so two
// different subsets in one file or across merged files have different names.
export function subsetTag(name, characters) {
  let hash = 0x811c9dc5;
  for (const character of `${name}:${[...characters].sort().join("")}`) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  let tag = "";
  for (let i = 0; i < 6; i++) { tag += String.fromCharCode(65 + (hash % 26)); hash = Math.floor(hash / 26) || (hash ^ 0x9e3779b9) >>> 0; }
  return tag;
}

const TEXT = new Set(["text", "tspan", "textPath"]);
const declared = (element, property) =>
  element.style?.getPropertyValue(property)?.trim() || element.getAttribute(property)?.trim() || undefined;

/**
 * Rewrite a parsed SVG's fonts for svg2pdf: every text element gets the font-family, weight and
 * style it prints in, and no other element keeps a font declaration (so svg2pdf never looks up
 * a face jsPDF lacks, such as weight 600). Returns what the document prints in.
 */
export function planPdfFonts(root) {
  const uses = new Map(), substitutions = new Map(), texts = [], minus = new Set(), fallbacks = new Map();
  const walk = (element, inherited) => {
    const state = {
      family: declared(element, "font-family") ?? inherited.family,
      weight: declared(element, "font-weight") ?? inherited.weight,
      style: declared(element, "font-style") ?? inherited.style,
    };
    if (element.style) {
      const size = element.style.getPropertyValue("font-size");
      for (const property of ["font", "font-family", "font-weight", "font-style"]) element.style.removeProperty(property);
      if (size && !element.style.getPropertyValue("font-size")) element.style.setProperty("font-size", size);
    }
    for (const property of ["font-family", "font-weight", "font-style"]) element.removeAttribute(property);
    if (TEXT.has(element.localName)) {
      let resolved = resolvePdfFont(state.family);
      const style = pdfFontStyle(state.weight, state.style),
        nodes = [...element.childNodes].filter((node) => node.nodeType === 3);
      if (!resolved.embedded) {
        const standard = winAnsiCharacters(),
          lacking = missingCharacters(nodes.map((node) => node.data).join(""), (code) => code === 0x2212 || standard.has(code));
        if (lacking.length) {
          fallbacks.set(resolved.name, [...new Set([...(fallbacks.get(resolved.name) ?? []), ...lacking])]);
          resolved = resolvePdfFont(DEFAULT_FONT_FAMILY);
        } else
          for (const node of nodes)
            if (node.data.includes("\u2212")) { node.data = node.data.replaceAll("\u2212", "-"); minus.add(resolved.name); }
      }
      const key = `${resolved.font}|${style}`;
      if (!uses.has(key)) uses.set(key, { font: resolved.font, family: resolved.name, style, embedded: resolved.embedded, characters: new Set() });
      const use = uses.get(key);
      for (const node of nodes) for (const character of node.data) use.characters.add(character);
      if (resolved.substituted) substitutions.set(`${resolved.requested}|${resolved.font}`, resolved);
      texts.push({ element, use });
    }
    for (const child of element.children) walk(child, state);
  };
  walk(root, { family: "", weight: "normal", style: "normal" });
  for (const { element, use } of texts) {
    const bold = use.style.startsWith("bold"), italic = use.style.endsWith("italic");
    element.setAttribute("font-family", use.embedded ? PDF_FAMILY : use.font);
    element.setAttribute("font-weight", bold ? "bold" : "normal");
    element.setAttribute("font-style", italic ? "italic" : "normal");
  }
  return {
    uses: [...uses.values()], substitutions: [...substitutions.values()], minus: [...minus],
    fallbacks: [...fallbacks].map(([name, characters]) => ({ name, characters })),
  };
}

const measured = new Map();
// svg2pdf measures anchored text in the browser by the family name it prints in: give the page
// that name for the bundled faces (from the bytes already loaded for jsPDF).
async function measurementFace(style, binary) {
  if (typeof FontFace === "undefined" || typeof document === "undefined") return;
  if (!measured.has(style)) {
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0)),
      face = new FontFace(PDF_FAMILY, bytes.buffer, { weight: FONT_FACES[style].weight, style: FONT_FACES[style].style });
    measured.set(style, face.load().then((loaded) => { document.fonts.add(loaded); }));
  }
  return measured.get(style);
}

/**
 * Prepare a jsPDF document for an SVG: plan its fonts, add the bundled styles its text uses
 * (jsPDF embeds each as a subset of the glyphs used) and return the report's font list and
 * warnings.
 */
export async function embedPdfFonts(pdf, root) {
  const { uses, substitutions, minus, fallbacks } = planPdfFonts(root), missing = [], fonts = [];
  for (const use of uses) {
    if (use.embedded) {
      const face = FONT_FACES[use.style], binary = await fontFile(use.style), name = `${subsetTag(face.postScriptName, use.characters)}+${face.postScriptName}`;
      pdf.addFileToVFS(face.file, binary);
      pdf.addFont(face.file, PDF_FAMILY, use.style);
      const entry = pdf.getFont(PDF_FAMILY, use.style);
      // The PDF names the font by its PostScript name with the subset's tag (jsPDF writes
      // fontName there; lookups go through the family and style it was added under).
      entry.fontName = name;
      await measurementFace(use.style, binary);
      fonts.push({ family: use.family, style: use.style, embedded: true, name });
      const characters = missingCharacters([...use.characters].join(""), (code) => !!entry.metadata.characterToGlyph(code));
      if (characters.length) missing.push({ name: use.family, characters });
    } else fonts.push({ family: use.family, style: use.style, embedded: false });
  }
  // One entry per family for missing characters (styles share a character set).
  const byFamily = new Map();
  for (const { name, characters } of missing) byFamily.set(name, [...new Set([...(byFamily.get(name) ?? []), ...characters])]);
  return {
    fonts,
    warnings: fontWarnings({ substitutions, fonts, minus, fallbacks, missing: [...byFamily].map(([name, characters]) => ({ name, characters })) }),
  };
}

/** An SVG document string as a PDF blob, its fonts planned and embedded; the report gains the
 * fonts it prints in and their warnings. */
export async function svgToPDF(svgText, width, height, report, metadata = {}) {
  // Keep the browser-only PDF stack out of SSR evaluation. The package's default entry is UMD;
  // its ESM implementation also avoids globals.
  const [{ jsPDF }, { svg2pdf }] = await Promise.all([
    import("jspdf"),
    import("svg2pdf.js/dist/svg2pdf.es.min.js"),
  ]);
  const root = new DOMParser().parseFromString(svgText, "image/svg+xml").documentElement,
    widthPt = width * 72 / 96, heightPt = height * 72 / 96,
    pdf = new jsPDF({ unit: "pt", format: [widthPt, heightPt], orientation: widthPt > heightPt ? "landscape" : "portrait", compress: true, putOnlyUsedFonts: true });
  // The document's title and subject: the plot's name and description (TODO 49).
  const properties = Object.fromEntries(Object.entries({ title: metadata?.title, subject: metadata?.description }).filter(([, value]) => value));
  if (Object.keys(properties).length) pdf.setProperties(properties);
  const { fonts, warnings } = await embedPdfFonts(pdf, root);
  report.fonts = fonts;
  report.warnings.push(...warnings);
  // svg2pdf reads stroke-dashoffset as an integer: a dashed path's phase (TODO 70.3) moves into
  // an equivalent pattern that starts at 0, so the PDF's dashes keep their places.
  for (const element of root.querySelectorAll("[stroke-dashoffset]")) {
    const offset = Number(element.getAttribute("stroke-dashoffset")),
      [dash, gap, ...rest] = (element.getAttribute("stroke-dasharray") ?? "").trim().split(/[\s,]+/).map(Number);
    if (!offset || rest.length || !(dash >= 0 && gap >= 0 && dash + gap > 0)) continue;
    const period = dash + gap, phase = ((offset % period) + period) % period;
    element.setAttribute("stroke-dasharray", (phase < dash ? [dash - phase, gap, phase, 0] : [0, period - phase, dash, phase - dash]).join(" "));
    element.removeAttribute("stroke-dashoffset");
  }
  await svg2pdf(root, pdf, { x: 0, y: 0, width: widthPt, height: heightPt });
  return pdf.output("blob");
}

/**
 * An SVG document planned for printing to PDF by Chromium (Python's export_pdf prints it in its
 * headless browser: exporter.py). The fonts are planned as for svg2pdf (planPdfFonts), so the
 * report and its substitutions are the same, but the bundled font keeps its CSS name, and
 * `css` has @font-face rules (data URLs) for the styles the text uses. Chromium embeds every
 * font it prints with, and falls back glyph by glyph where a font lacks one.
 * Returns { svg, css, fonts, warnings }.
 */
export async function printableSVG(svgText) {
  const root = new DOMParser().parseFromString(svgText, "image/svg+xml").documentElement;
  const { uses, substitutions, minus, fallbacks } = planPdfFonts(root);
  for (const element of root.querySelectorAll("text, tspan, textPath"))
    if (element.getAttribute("font-family") === PDF_FAMILY) element.setAttribute("font-family", `'${DEFAULT_FONT_FAMILY}'`);
  const fonts = uses.map((use) => ({ family: use.family, style: use.style, embedded: true }));
  return {
    svg: new XMLSerializer().serializeToString(root),
    css: await defaultFontCSS([...new Set(uses.filter((use) => use.embedded).map((use) => use.style))]),
    fonts,
    warnings: fontWarnings({ substitutions, fonts, minus, fallbacks }),
  };
}
