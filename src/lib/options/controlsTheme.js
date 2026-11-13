/**
 * A plot's theme for its settings drawer, export panel and buttons (TODO 60): custom properties
 * set on the plot from its background and text color, so a dark theme gets dark controls. The
 * controls read them under the page's own --hm-controls-background, --hm-controls-color,
 * --hm-controls-accent and --hm-controls-font, which an application sets to restyle them.
 */
let context;

/** [r, g, b, alpha] of a CSS color (0-255, alpha 0-1), or null outside a browser. */
function rgba(color) {
  if (typeof OffscreenCanvas === "undefined" || typeof color !== "string") return null;
  context ??= new OffscreenCanvas(1, 1).getContext("2d");
  if (!context) return null;
  context.fillStyle = "#000000";
  context.fillStyle = color;
  const value = String(context.fillStyle);
  if (value.startsWith("#"))
    return [1, 3, 5].map((i) => parseInt(value.slice(i, i + 2), 16)).concat(1);
  const parts = value.match(/[\d.]+/g)?.map(Number) ?? [0, 0, 0, 0];
  return [parts[0], parts[1], parts[2], parts[3] ?? 1];
}

const luminance = ([r, g, b]) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;

/**
 * The custom properties for a plot whose background and text color are these: none when the
 * background is not opaque (a transparent plot shows the page, so its controls keep their own
 * light colors).
 */
export function controlsTheme(background, color) {
  const back = rgba(background);
  if (!back || back[3] < 1) return {};
  return {
    "--hm-theme-background": background,
    "--hm-theme-color": typeof color === "string" ? color : undefined,
    "--hm-theme-scheme": luminance(back) < 0.45 ? "dark" : "light",
  };
}
