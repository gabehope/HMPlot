import { test, expect } from "./fixtures.js";

// The closing export parity sweep (14.9): every nested-chain fixture's SVG
// export, rasterized, against its PNG export. Saturated pixels are binned by
// hue (30 degrees); each bin's bounding box and pixel count must agree.
// Residue the two renderers legitimately differ by: antialiasing where two
// colors meet (a few dozen pixels in a blended hue), and the GPU's tone
// mapping shifting a fill's lightness or a hue across a bin edge.
const SCENES = [
  ...["polar-log", "polar-on-globe", "orthographic-child", "embedded-map", "chart-in-polar", "path-family",
    "band-angular", "band-nested", "band-on-globe", "errorbars-polar", "errorbars-on-globe", "rects-in-polar",
    "sectors-in-log", "rects-on-globe", "turned-rect-log", "bars-in-polar"]
    .map((scene) => ["stage14-nested-paths", "stage14NestedPaths", scene]),
  ...["root-limb", "child", "inset-map"].map((scene) => ["stage14-geojson", "stage14GeoJSON", scene]),
  ["stage14-embedded-map", "stage14EmbeddedMap"], ["stage14-mixed-chain", "stage14MixedChain"],
  ["stage14-orthographic-curves", "stage14OrthographicCurves"],
  ["stage14-orthographic-default", "stage14OrthographicDefault"],
  ["stage14-orthographic-horizon", "stage14OrthographicHorizon"], ["stage14-polar-line", "stage14PolarLine"],
  ["stage14-spherical-root", "stage14Sphere"], ["stage14-placements", "stage14Placements", "nested-rotation"],
  // Connectors between endpoints in mixed polar, log and spherical frames.
  // (The bent GeoJSON scenes have their own edge tests: their Lines lie on a
  // fill's edge, where GPU antialiasing blends red into green but SVG's does not.)
  ["stage14-connections-mixed", "stage14ConnectionsMixed"],
];

for (const [route, global, scene] of SCENES) {
  test(`SVG and PNG exports agree: ${route}${scene ? ` ${scene}` : ""}`, async ({ page }) => {
    await page.goto(`/test/${route}${scene ? `?scene=${scene}` : ""}`);
    await page.waitForFunction((name) => window[name]?.plot?.whenSettled, global);
    await expect.poll(() => page.evaluate(() =>
      [...document.querySelectorAll(".canvas")].every((canvas) => canvas.getAttribute("aria-busy") === "false")))
      .toBe(true);
    const result = await page.evaluate(async (name) => {
      const plot = window[name].plot;
      await plot.whenSettled();
      const draw = (source, width, height) => {
        const canvas = document.createElement("canvas");
        canvas.width = width; canvas.height = height;
        const context = canvas.getContext("2d");
        context.fillStyle = "white"; context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(source, 0, 0, canvas.width, canvas.height);
        return { width: canvas.width, data: context.getImageData(0, 0, canvas.width, canvas.height).data };
      };
      const output = await plot.exportSVG({ mode: "auto" });
      // An SVG drawn as an image cannot reach the page's fonts: give it the default font the PNG
      // draws its text in (axis halos cover marks by their glyphs' shapes).
      const { embedDefaultFont } = await import("/src/lib/plot/utils/defaultFont.js");
      const svg = new DOMParser().parseFromString(await output.blob.text(), "image/svg+xml").documentElement;
      await embedDefaultFont(svg);
      const image = new Image();
      image.src = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svg)], { type: "image/svg+xml" }));
      await image.decode();
      const bins = ({ width, data }) => {
        const out = {};
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i], g = data[i + 1], b = data[i + 2], max = Math.max(r, g, b), min = Math.min(r, g, b);
          if (max - min < 90) continue;
          const hue = ((max === r ? (g - b) / (max - min) : max === g ? 2 + (b - r) / (max - min)
            : 4 + (r - g) / (max - min)) * 60 + 360) % 360;
          const x = (i / 4) % width, y = Math.floor(i / 4 / width);
          const bin = out[Math.floor(hue / 30) * 30] ??= { count: 0, x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity };
          bin.count++;
          bin.x0 = Math.min(bin.x0, x); bin.x1 = Math.max(bin.x1, x);
          bin.y0 = Math.min(bin.y0, y); bin.y1 = Math.max(bin.y1, y);
        }
        return out;
      };
      // SVG dimensions are CSS pixels; PNG dimensions include the browser's DPR.
      // Read both in the SVG's logical frame, preserving the existing pixel tolerances.
      const bitmap = await createImageBitmap(await plot.exportPNG());
      const result = { vector: bins(draw(image, image.width, image.height)),
        raster: bins(draw(bitmap, image.width, image.height)),
        outcomes: output.report.markOutcomes };
      bitmap.close();
      URL.revokeObjectURL(image.src);
      return result;
    }, global);
    for (const hue of new Set([...Object.keys(result.vector), ...Object.keys(result.raster)])) {
      const v = result.vector[hue], r = result.raster[hue];
      if (!v || !r) {
        expect((v ?? r).count, `hue ${hue} only in the ${v ? "vector" : "raster"} export`).toBeLessThan(40);
        continue;
      }
      if (Math.max(v.count, r.count) < 40) continue;
      for (const key of ["x0", "x1", "y0", "y1"])
        expect(Math.abs(v[key] - r[key]), `hue ${hue} ${key}`).toBeLessThanOrEqual(4);
      expect(Math.abs(v.count - r.count) / r.count, `hue ${hue} count ${v.count} vs ${r.count}`).toBeLessThan(0.25);
    }
  });
}
