// The bundled default font (TODO 52): Source Sans 3 (Adobe, SIL Open Font License 1.1), its
// unmodified static TTFs in src/lib/fonts/source-sans-3 with the license. On screen it is
// registered through the FontFace API; PDF exports embed subsets of the styles their text uses
// (pdfFonts.js).

export const DEFAULT_FONT_FAMILY = "Source Sans 3";
/** The stack plot text uses when no theme or option names a font. */
export const DEFAULT_FONT = '"Source Sans 3", system-ui, sans-serif';

/** The four bundled styles, keyed as jsPDF names styles. */
export const FONT_FACES = {
  normal: { file: "SourceSans3-Regular.ttf", postScriptName: "SourceSans3-Regular", weight: "400", style: "normal" },
  italic: { file: "SourceSans3-It.ttf", postScriptName: "SourceSans3-It", weight: "400", style: "italic" },
  bold: { file: "SourceSans3-Bold.ttf", postScriptName: "SourceSans3-Bold", weight: "700", style: "normal" },
  bolditalic: { file: "SourceSans3-BoldIt.ttf", postScriptName: "SourceSans3-BoldIt", weight: "700", style: "italic" },
};
// Literal new URL(..., import.meta.url) calls, so bundlers see the assets: the Svelte package
// serves them as files, the notebook and standalone bundles inline them.
const FONT_URLS = {
  normal: () => new URL("../../fonts/source-sans-3/SourceSans3-Regular.ttf", import.meta.url).href,
  italic: () => new URL("../../fonts/source-sans-3/SourceSans3-It.ttf", import.meta.url).href,
  bold: () => new URL("../../fonts/source-sans-3/SourceSans3-Bold.ttf", import.meta.url).href,
  bolditalic: () => new URL("../../fonts/source-sans-3/SourceSans3-BoldIt.ttf", import.meta.url).href,
};

/** CSS generic families (and the system-font aliases), by the kind of face they stand for. */
export const GENERIC_FAMILIES = new Map([
  ...["sans-serif", "system-ui", "ui-sans-serif", "ui-rounded", "-apple-system", "blinkmacsystemfont"].map((name) => [name, "sans"]),
  ...["serif", "ui-serif", "cursive", "fantasy", "fangsong", "math"].map((name) => [name, "serif"]),
  ...["monospace", "ui-monospace"].map((name) => [name, "mono"]),
  ["emoji", "other"],
]);

/** A CSS font-family value as its family names, unquoted, in order. */
export function parseFontStack(value) {
  const names = [];
  let name = "", quote = null;
  for (const character of String(value ?? "")) {
    if (quote) {
      if (character === quote) quote = null;
      else name += character;
    } else if (character === '"' || character === "'") quote = character;
    else if (character === ",") { names.push(name); name = ""; }
    else name += character;
  }
  names.push(name);
  return names.map((entry) => entry.trim().replace(/\s+/g, " ")).filter(Boolean);
}

/** True when a family name is a CSS generic family (sans-serif, system-ui, monospace, ...). */
export const isGenericFamily = (name) => GENERIC_FAMILIES.has(String(name).toLowerCase());

/**
 * A font stack with a generic family: one that names none (fontFamily: "Roboto") gains
 * sans-serif, so a missing font falls back to a sans-serif face on screen and in exports rather
 * than the browser's or svg2pdf's serif default. Empty means the default font.
 */
export function withGenericFamily(value) {
  const stack = String(value ?? "").trim();
  if (!stack) return DEFAULT_FONT;
  return parseFontStack(stack).some(isGenericFamily) ? stack : `${stack}, sans-serif`;
}

let faces;
/** Add the bundled faces to the page's font set once; the browser loads a face when text uses it. */
export function registerDefaultFont() {
  if (faces || typeof document === "undefined" || typeof FontFace === "undefined" || !document.fonts) return faces;
  faces = Object.entries(FONT_FACES).map(([key, face]) => {
    const value = new FontFace(DEFAULT_FONT_FAMILY, `url("${FONT_URLS[key]()}") format("truetype")`,
      { weight: face.weight, style: face.style, display: "swap" });
    document.fonts.add(value);
    return value;
  });
  return faces;
}

// A font that never arrives (a blocked request, a stalled network) must not hold plots back.
const LOAD_LIMIT = 5000;
let warned = false;
/**
 * Resolves when the faces a CSS font string (as canvas contexts take it: "600 14px ...") needs
 * are loaded, so text measured afterwards is measured in them. Never rejects: a font that fails
 * or takes longer than 5 s leaves the text in its fallback, with one console warning.
 */
export function fontReady(font = `12px ${DEFAULT_FONT}`) {
  registerDefaultFont();
  if (typeof document === "undefined" || !document.fonts?.load) return Promise.resolve();
  let timer;
  return Promise.race([
    document.fonts.load(font).then(() => undefined),
    new Promise((resolve) => { timer = setTimeout(() => resolve("timeout"), LOAD_LIMIT); }),
  ]).then((outcome) => {
    if (outcome === "timeout") throw Error(`loading ${font} took longer than ${LOAD_LIMIT / 1000} s`);
  }).catch((error) => {
    if (!warned) {
      warned = true;
      console.warn(`HMPlot: the default font (${DEFAULT_FONT_FAMILY}) did not load; text uses a fallback font. ${error?.message ?? error}`);
    }
  }).finally(() => clearTimeout(timer));
}

/** The bundled face for a CSS weight and style, keyed as jsPDF names styles: weights of 600 and
 * above are bold (as CSS picks the 700 face for 600 when only 400 and 700 exist), oblique is
 * italic. */
export function fontFaceKey(weight = "normal", style = "normal") {
  const w = String(weight).trim().toLowerCase(), numeric = Number(w);
  const bold = w === "bold" || w === "bolder" || (Number.isFinite(numeric) && numeric >= 600);
  const italic = /^(italic|oblique)/.test(String(style).trim().toLowerCase());
  return bold ? (italic ? "bolditalic" : "bold") : italic ? "italic" : "normal";
}

const dataURLs = new Map();
// A font property as an SVG element (or the nearest ancestor declaring it) sets it: its style
// first, then its presentation attribute.
function inheritedFont(element, property) {
  for (let node = element; node?.nodeType === 1; node = node.parentNode) {
    const value = node.style?.getPropertyValue(property)?.trim() || node.getAttribute(property)?.trim();
    if (value) return value;
  }
}

/**
 * An SVG drawn as an image (the PNG exports rasterize axes, ramps and minimap text so) cannot
 * reach the page's fonts: give it @font-face rules, as data URLs, for the bundled faces its text
 * uses, so the PNG's text is the screen's. Reads each text's font from its style or attributes
 * (inherited), as exported SVG carries them.
 */
export async function embedDefaultFont(svg) {
  const keys = new Set();
  for (const element of svg.querySelectorAll("text, tspan, textPath"))
    if (element.textContent && parseFontStack(inheritedFont(element, "font-family")).some((name) => name.toLowerCase() === DEFAULT_FONT_FAMILY.toLowerCase()))
      keys.add(fontFaceKey(inheritedFont(element, "font-weight") ?? "normal", inheritedFont(element, "font-style") ?? "normal"));
  if (!keys.size) return svg;
  const style = svg.ownerDocument.createElementNS("http://www.w3.org/2000/svg", "style");
  style.textContent = await defaultFontCSS(keys);
  svg.insertBefore(style, svg.firstChild);
  return svg;
}

/**
 * @font-face rules for the bundled faces `keys` names (all four by default) with their files as
 * data URLs: for captures that cannot reach the page's fonts (an SVG drawn as an image, a DOM
 * snapshot). A face that fails to load is left out, so its text keeps the stack's fallback.
 */
export async function defaultFontCSS(keys = Object.keys(FONT_FACES)) {
  const rules = [];
  for (const key of keys) {
    if (!dataURLs.has(key)) {
      const url = fontFile(key).then((binary) => `data:font/ttf;base64,${btoa(binary)}`);
      url.catch(() => dataURLs.delete(key));
      dataURLs.set(key, url);
    }
    const face = FONT_FACES[key];
    try {
      rules.push(`@font-face{font-family:"${DEFAULT_FONT_FAMILY}";src:url(${await dataURLs.get(key)}) format("truetype");font-weight:${face.weight};font-style:${face.style}}`);
    } catch { /* the text keeps the stack's fallback */ }
  }
  return rules.join("");
}

const files = new Map();
/** A bundled style's TTF as a binary string (jsPDF's virtual file system takes them so). */
export function fontFile(key) {
  if (!FONT_FACES[key]) throw Error(`Unknown font style "${key}".`);
  if (!files.has(key)) {
    const load = fetch(FONT_URLS[key]())
      .then((response) => {
        if (!response.ok) throw Error(`${FONT_FACES[key].file}: HTTP ${response.status}`);
        return response.arrayBuffer();
      })
      .then((buffer) => {
        const bytes = new Uint8Array(buffer);
        let binary = "";
        for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
        return binary;
      });
    load.catch(() => files.delete(key));
    files.set(key, load);
  }
  return files.get(key);
}
