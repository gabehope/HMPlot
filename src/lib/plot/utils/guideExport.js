import { embedDefaultFont, fontReady } from "./defaultFont.js";
import { drawTextLines, ownElements, ownTexts, textBottom, textLines } from "./textExport.js";
import { limitError } from "./limits.js";

// Explicit PNG export is the only path that reads guide image pixels.
export async function exportGuides(blob, canvasHost, plotHost, deviceLimits) {
  const guides = ownElements(plotHost, "[data-plot-guide]"), texts = ownTexts(plotHost);
  if (!guides.length && !texts.length) return blob;
  const root = plotHost.getBoundingClientRect(),
    plot = canvasHost.getBoundingClientRect();
  const bitmap = await createImageBitmap(blob),
    scale = bitmap.width / plot.width;
  const bottom = Math.max(
    plot.bottom,
    ...guides.map((g) => g.getBoundingClientRect().bottom),
    root.top + textBottom(texts, root),
  );
  const width = Math.ceil(root.width * scale),
    height = Math.ceil((bottom - root.top) * scale);
  try {
    if (Math.max(width, height) > deviceLimits.maxTextureDimension2D)
      throw limitError("texture", {
        what: "a PNG export's side with its legends",
        count: Math.max(width, height),
        limit: deviceLimits.maxTextureDimension2D,
        hint: "Reduce the export scale.",
      });
    if (width * height * 4 > deviceLimits.maxBufferSize)
      throw limitError("exportPixels", {
        component: "Plot",
        what: "a PNG export with its legends",
        count: width * height,
        limit: Math.floor(deviceLimits.maxBufferSize / 4),
      });
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    // The plot's background under its legends and titles too, not only under the canvas.
    const background = getComputedStyle(plotHost).backgroundColor;
    if (background && background !== "rgba(0, 0, 0, 0)" && background !== "transparent") {
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, width, height);
    }
    ctx.drawImage(
      bitmap,
      (plot.left - root.left) * scale,
      (plot.top - root.top) * scale,
    );
    for (const guide of guides) {
      for (const el of guide.querySelectorAll("canvas, svg, span, small")) {
        const r = el.getBoundingClientRect();
        if (!r.width || !r.height) continue;
        const x = (r.left - root.left) * scale,
          y = (r.top - root.top) * scale;
        const parent = el.closest("button");
        ctx.globalAlpha =
          parent?.getAttribute("aria-pressed") === "false" ? 0.4 : 1;
        if (el.tagName.toLowerCase() === "canvas") {
          const url = await el.guidePNG?.();
          if (!url) continue;
          const image = new Image();
          image.src = url;
          await image.decode();
          ctx.drawImage(image, x, y, r.width * scale, r.height * scale);
        } else if (el.tagName.toLowerCase() === "svg") {
          const clone = el.cloneNode(true),
            src = [el, ...el.querySelectorAll("*")],
            dst = [clone, ...clone.querySelectorAll("*")];
          for (let i = 0; i < src.length; i++) {
            const style = getComputedStyle(src[i]);
            for (const key of [
              "fill",
              "stroke",
              "stroke-width",
              "font",
              "opacity",
              "color",
            ])
              dst[i].style.setProperty(key, style.getPropertyValue(key));
          }
          clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
          clone.setAttribute("width", r.width);
          clone.setAttribute("height", r.height);
          await embedDefaultFont(clone);
          const url = URL.createObjectURL(
            new Blob([new XMLSerializer().serializeToString(clone)], {
              type: "image/svg+xml",
            }),
          );
          try {
            const image = new Image();
            image.src = url;
            await image.decode();
            ctx.drawImage(image, x, y, r.width * scale, r.height * scale);
          } finally {
            URL.revokeObjectURL(url);
          }
        } else {
          const style = getComputedStyle(el);
          ctx.fillStyle = style.color;
          ctx.font = `${style.fontWeight} ${parseFloat(style.fontSize) * scale}px ${style.fontFamily}`;
          ctx.textBaseline = "middle";
          ctx.fillText(el.textContent, x, y + (r.height * scale) / 2);
        }
      }
    }
    // Titles and captions (TODO 46), in the faces they use on screen (a bold title's too).
    const lines = texts.flatMap((element) => textLines(element, root));
    await Promise.all([...new Set(lines.map((line) => `${line.fontStyle} ${line.fontWeight} ${line.fontSize}px ${line.fontFamily}`))].map((font) => fontReady(font)));
    drawTextLines(ctx, lines, scale);
    return await new Promise((resolve, reject) =>
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(Error("Legend PNG encoding failed."))),
        "image/png",
      ),
    );
  } finally {
    bitmap.close();
  }
}
