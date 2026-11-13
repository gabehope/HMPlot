// Axis guide colors that follow the plot's theme: grid rules are the axis text color blended
// into the plot background, so a dark theme gets dark rules and a light one the light grays
// the library always drew (#dce1e8 major, #eceef2 minor on white).

/** [r, g, b, a] (0-255, alpha 0-1) of a CSS color: hex, rgb()/rgba(), or (in a browser) any CSS color. */
export function cssRgba(color) {
  if (typeof color !== "string" || !color) return null;
  const text = color.trim();
  if (text === "transparent") return [0, 0, 0, 0];
  let match = /^#([0-9a-f]{3,8})$/i.exec(text);
  if (match) {
    let hex = match[1];
    if (hex.length === 3 || hex.length === 4) hex = [...hex].map((digit) => digit + digit).join("");
    if (hex.length !== 6 && hex.length !== 8) return null;
    return [...[0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16)), hex.length === 8 ? parseInt(hex.slice(6), 16) / 255 : 1];
  }
  match = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+)(%?))?\s*\)$/i.exec(text);
  if (match) return [...match.slice(1, 4).map(Number), match[4] === undefined ? 1 : Number(match[4]) / (match[5] ? 100 : 1)];
  // Named and other colors (oklch, color()): the browser draws a pixel of it.
  if (typeof document === "undefined") return null;
  const context = (cssRgba.context ??= document.createElement("canvas").getContext("2d", { willReadFrequently: true }));
  if (!context || typeof CSS !== "undefined" && !CSS.supports?.("color", text)) return null;
  context.clearRect(0, 0, 1, 1);
  context.fillStyle = text;
  context.fillRect(0, 0, 1, 1);
  const [r, g, b, a] = context.getImageData(0, 0, 1, 1).data;
  // Pixels are premultiplied when read back: undo it.
  return a ? [r * 255 / a, g * 255 / a, b * 255 / a, a / 255] : [0, 0, 0, 0];
}

/** [r, g, b] (0-255) of a CSS color, or null for none (transparent) or an invalid one. */
export function cssRgb(color) {
  const rgba = color === "transparent" ? null : cssRgba(color);
  return rgba ? rgba.slice(0, 3) : null;
}

/**
 * A halo's color for a plot background (TODO 134.29; Callout's text, axis labels): the background
 * as an opaque hex color, or null when it is transparent (alpha 0) or not a color.
 */
export function haloColor(background) {
  const rgba = cssRgba(background);
  return rgba && rgba[3] > 0 ? hex(rgba.slice(0, 3)) : null;
}

const hex = (rgb) => `#${rgb.map((value) => Math.round(Math.max(0, Math.min(255, value))).toString(16).padStart(2, "0")).join("")}`;

const luminance = ([r, g, b]) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;

/**
 * Grid rule colors for a plot background and axis text color: { major, minor }. A dark
 * background takes a larger share of the text color, so its rules read as clearly as light ones.
 */
export function gridColors(background, text) {
  const back = cssRgb(background) ?? [255, 255, 255], front = cssRgb(text) ?? [57, 68, 88];
  const mix = (t) => hex(back.map((value, i) => value + (front[i] - value) * t));
  const dark = luminance(back) < 0.4;
  return { major: mix(dark ? 0.26 : 0.17), minor: mix(dark ? 0.15 : 0.09) };
}
