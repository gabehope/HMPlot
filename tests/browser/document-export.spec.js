import fs from "node:fs";
import { test, expect } from "./fixtures.js";

async function openExample(page, id, url = `/examples/${id}`) {
  await page.goto(url);
  await page.waitForFunction(() => window.__examples?.plot);
  await page.evaluate(() => window.__examples.plot.whenSettled());
  await page.waitForTimeout(100);
}

async function svgSummary(page) {
  return page.evaluate(async () => {
    const result = await window.__examples.plot.exportSVG({ mode: "auto" });
    const text = await result.blob.text(), svgDocument = new DOMParser().parseFromString(text, "image/svg+xml");
    const fallback = svgDocument.querySelector("image")?.getAttribute("href");
    let transparentFallback = null;
    if (fallback) {
      const bitmap = await createImageBitmap(await (await fetch(fallback)).blob()), canvas = document.createElement("canvas");
      canvas.width = bitmap.width; canvas.height = bitmap.height;
      const context = canvas.getContext("2d"); context.drawImage(bitmap, 0, 0); bitmap.close();
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      transparentFallback = false;
      for (let index = 3; index < pixels.length; index += 4)
        if (pixels[index] === 0) { transparentFallback = true; break; }
    }
    return {
      report: result.report,
      transparentFallback,
      strokes: [...svgDocument.querySelectorAll("path")].map((element) => element.getAttribute("stroke")),
      outlined: [...svgDocument.querySelectorAll("circle,path")].filter((element) => element.getAttribute("stroke") && Number(element.getAttribute("stroke-width")) > 0).length,
      // The outer radius: an outlined circle is inset by half its stroke (the outline lies
      // inside the glyph, as the shader draws it).
      radii: [...svgDocument.querySelectorAll("circle")].map((element) =>
        Number(element.getAttribute("r")) + Number(element.getAttribute("stroke-width") ?? 0) / 2).filter(Number.isFinite),
    };
  });
}

test("hybrid SVG keeps force edges and transparent fallback layers; a BoxPlot is all vector", async ({ page }) => {
  // The force layout's gallery component, with its dev hooks (TODO 69.10).
  await openExample(page, "transform-force", "/test/gallery-example?id=transform-force");
  await page.evaluate(() => window.__transformExample.force.whenSettled());
  let summary = await svgSummary(page);
  expect(summary.strokes.filter((stroke) => stroke === "#8694a0")).toHaveLength(10);
  // Both marks export as vectors now (the node sprites included), so there is no raster
  // fallback layer to check here; the GeoJSON fills below still have one.
  // Outcome records describe both marks; async Nodes/Edges publication may collect them in
  // either order. Actual paint order is verified from the emitted SVG in the layer-order specs.
  expect(summary.report.markOutcomes.filter(entry => !entry.kind.startsWith("axis-")).map((entry) => [entry.kind, entry.rendering]).sort())
    .toEqual([["points", "vector"], ["segments", "vector"]]);
  expect(summary.report.rasterLayers).toEqual([]);
  expect(summary.transparentFallback).toBe(null);

  // Category fills export as vectors (TODO 70.2): every part of a BoxPlot.
  await openExample(page, "box-plot");
  summary = await svgSummary(page);
  expect(summary.report.markOutcomes.filter(entry => !entry.kind.startsWith("axis-")).map((entry) => entry.rendering)).toEqual(["vector", "vector", "vector", "vector"]);
  expect(summary.report.rasterLayers).toEqual([]);

  await openExample(page, "geojson-categories");
  summary = await svgSummary(page);
  expect(summary.report.markOutcomes.filter(entry => !entry.kind.startsWith("axis-")).map((entry) => [entry.kind, entry.rendering]))
    .toEqual([["geo-faces", "raster"], ["geo-segments", "vector"]]);
  expect(summary.transparentFallback).toBe(true);
});

test("SVG point symbols retain outlines and categorical pixel sizes", async ({ page }) => {
  await openExample(page, "symbols");
  let summary = await svgSummary(page);
  expect(summary.outlined).toBeGreaterThanOrEqual(240);

  await openExample(page, "categories");
  summary = await svgSummary(page);
  expect(summary.report.markOutcomes.some((entry) => entry.kind === "points" && entry.rendering === "vector")).toBe(true);
  expect(Math.max(...summary.radii)).toBeGreaterThanOrEqual(6);
  expect(summary.outlined).toBeGreaterThanOrEqual(6);
});

test("PDF wraps the same completed SVG composition", async ({ page }) => {
  await openExample(page, "categories");
  const result = await page.evaluate(async () => {
    const svg = await window.__examples.plot.exportSVG({ mode: "auto" });
    const pdf = await window.__examples.plot.exportPDF({ mode: "auto" });
    const signature = new TextDecoder().decode((await pdf.blob.arrayBuffer()).slice(0, 4));
    return { signature, svgPrimitives: svg.report.vectorPrimitives, pdfPrimitives: pdf.report.vectorPrimitives };
  });
  expect(result.signature).toBe("%PDF");
  expect(result.pdfPrimitives).toBe(result.svgPrimitives);
});

// TODO 52: the default font is embedded in PDFs as a subset; a theme font jsPDF lacks prints in it.
test("PDF embeds the default font as a subset and reports font substitutions", async ({ page }) => {
  await openExample(page, "themes");
  const exportFonts = () => page.evaluate(async () => {
    const plot = window.__examples.plot;
    await plot.whenSettled();
    const pdf = await plot.exportPDF({ mode: "auto" }), bytes = new Uint8Array(await pdf.blob.arrayBuffer());
    let raw = "";
    for (let i = 0; i < bytes.length; i += 0x8000) raw += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    // Text drawn in the exported SVG, measured in the page, against the same text on screen.
    const svg = new DOMParser().parseFromString(await (await plot.exportSVG()).blob.text(), "image/svg+xml").documentElement;
    document.body.append(svg);
    const label = document.querySelector(".canvas svg.axes .x-tick text"),
      exported = [...svg.querySelectorAll("text")].find((text) => text.textContent === label.textContent);
    const widths = [label.getComputedTextLength(), exported.getComputedTextLength()];
    svg.remove();
    return {
      baseFonts: [...new Set(raw.match(/\/BaseFont \/[^\s/>]+/g))].sort(),
      fontFiles: (raw.match(/\/FontFile2/g) ?? []).length,
      fonts: [...new Set(pdf.report.fonts.map(({ family, embedded }) => `${family}${embedded ? "" : " (not embedded)"}`))],
      warnings: pdf.report.warnings.filter((warning) => /font|embedded/i.test(warning)),
      widths,
    };
  });
  const minimal = await exportFonts();
  expect(minimal.baseFonts).toHaveLength(2);
  expect(minimal.baseFonts[0]).toMatch(/^\/BaseFont \/[A-Z]{6}\+SourceSans3-Bold$/);
  expect(minimal.baseFonts[1]).toMatch(/^\/BaseFont \/[A-Z]{6}\+SourceSans3-Regular$/);
  expect(minimal.fontFiles).toBe(2);
  expect(minimal.fonts).toEqual(["Source Sans 3"]);
  expect(minimal.warnings).toEqual([]);
  expect(minimal.widths[1]).toBeCloseTo(minimal.widths[0], 1);
  // The paired example's "Theme preset" select (TODO 69.10).
  const presets = page.getByRole("combobox", { name: "Theme preset" });
  await presets.selectOption({ label: "Yellow glow" });
  await expect.poll(async () => (await exportFonts()).warnings).toEqual(["Font substitution: Inter → Source Sans 3 (embedded)."]);
  await presets.selectOption({ label: "538" });
  const arial = await exportFonts();
  expect(arial.baseFonts).toEqual(["/BaseFont /Helvetica", "/BaseFont /Helvetica-Bold"]);
  expect(arial.warnings).toEqual([
    "Font substitution: Arial → Helvetica (not embedded).",
    "Helvetica is not embedded; some journals require embedded fonts. The default font (Source Sans 3) is embedded.",
  ]);
});

// TODO 46: a plot's title, subtitle and caption in its exports; a band under the points; a callout's
// leader from near its point to its text. TODO 134.29: the callout has a halo and no box, its
// leader is its text's color, and a band's label is the callout's size.
test("titles, bands and callouts draw and export", async ({ page }) => {
  await openExample(page, "annotations");
  const result = await page.evaluate(async () => {
    const plot = window.__examples.plot;
    const svg = await (await plot.exportSVG()).blob.text(), doc = new DOMParser().parseFromString(svg, "image/svg+xml");
    const texts = [...doc.querySelectorAll("text")].map((text) => text.textContent);
    const note = [...doc.querySelectorAll("text")].find((text) => text.textContent === "Warmest month"),
      band = [...doc.querySelectorAll("text")].find((text) => text.textContent === "Warm spell");
    const leaders = [...doc.querySelectorAll("path")].filter((path) => path.getAttribute("stroke") === note.getAttribute("fill"));
    return {
      heading: document.querySelector(".plot-title")?.textContent, caption: document.querySelector(".plot-caption")?.textContent,
      texts: ["Monthly temperature anomaly", "Relative to the 1991–2020 mean, °C", "Source: a made-up series for this example.", "Warm spell", "Warmest month"].map((t) => texts.includes(t)),
      bands: [...doc.querySelectorAll("rect[fill-opacity]")].map((rect) => rect.getAttribute("fill")),
      boxes: [...doc.querySelectorAll("rect[rx]")].length, leaders: leaders.map((path) => path.getAttribute("stroke-width")),
      halo: note.getAttribute("paint-order"), sizes: [note, band].map((text) => Number(text.getAttribute("font-size"))),
    };
  });
  expect(result.heading).toBe("Monthly temperature anomaly");
  expect(result.caption).toBe("Source: a made-up series for this example.");
  expect(result.texts).toEqual([true, true, true, true, true]);
  expect(result.bands).toEqual(["#d9824b", "#4f86c6"]);
  expect(result.boxes).toBe(0);
  expect(result.leaders).toEqual(["1.5", "1.5"]);
  expect(result.halo).toBe("stroke");
  expect(result.sizes[0]).toBe(14);
  expect(result.sizes[1]).toBe(result.sizes[0]);
  // The warm band tints the canvas between the points, and the points draw over it.
  const pixels = await page.evaluate(async () => {
    const plot = window.__examples.plot, png = await plot.exportPNG(), bitmap = await createImageBitmap(png);
    const canvas = Object.assign(document.createElement("canvas"), { width: bitmap.width, height: bitmap.height }), ctx = canvas.getContext("2d");
    ctx.drawImage(bitmap, 0, 0);
    const host = document.querySelector(".canvas").getBoundingClientRect(), section = document.querySelector("section.plot").getBoundingClientRect(),
      [f0, f1] = plot.getAxisLayout().x.bands[0].fractions, x = (fraction) => host.left - section.left + fraction * host.width;
    const scale = canvas.width / section.width;
    const at = (px, py) => [...ctx.getImageData(Math.round(px*scale), Math.round(py*scale), 1, 1).data].slice(0, 3);
    return { inBand: at(x((f0 + f1) / 2), host.top - section.top + host.height * 0.6), outside: at(x(0.25), host.top - section.top + host.height * 0.6) };
  });
  expect(pixels.inBand[0]).toBeGreaterThan(pixels.inBand[2] + 8); // warm: redder than blue
  expect(Math.abs(pixels.outside[0] - pixels.outside[2])).toBeLessThan(8); // neutral outside
});

// TODO 49: a plot is named by its title and described by a summary of its marks, axes and rows;
// its exports carry both (an SVG's <title> and <desc>, a PDF's title and subject).
test("a plot describes itself, and its exports carry its title and description", async ({ page }) => {
  await openExample(page, "annotations");
  const region = page.getByRole("region", { name: "Monthly temperature anomaly" });
  await expect(region).toHaveCount(1);
  // The description follows the settled plot (debounced), and the region points at it once it
  // exists: read both each time, generous on a cold server.
  await expect.poll(async () => {
    const describedBy = await region.getAttribute("aria-describedby");
    return describedBy ? page.locator(`#${describedBy}`).textContent() : null;
  }, { timeout: 20000 })
    .toMatch(/^Line chart of anomaly \(°C\) against month, with scatter plot of anomaly \(°C\) against month and callouts\. x from -?\d+ to \d+, y from -?[\d.]+ to [\d.]+\. 96 rows\.$/);
  const result = await page.evaluate(async () => {
    const plot = window.__examples.plot, description = plot.getDescription();
    const svg = new DOMParser().parseFromString(await (await plot.exportSVG()).blob.text(), "image/svg+xml").documentElement;
    const pdf = new Uint8Array(await (await plot.exportPDF()).blob.arrayBuffer());
    let raw = "";
    for (let i = 0; i < pdf.length; i += 0x8000) raw += String.fromCharCode(...pdf.subarray(i, i + 0x8000));
    return { description, title: svg.querySelector(":scope > title")?.textContent, desc: svg.querySelector(":scope > desc")?.textContent,
      pdfTitle: /\/Title \(([^)]*)\)/.exec(raw)?.[1], pdfSubject: /\/Subject \(/.test(raw) };
  });
  expect(result.title).toBe("Monthly temperature anomaly");
  expect(result.desc).toBe(result.description);
  expect(result.pdfTitle).toBe("Monthly temperature anomaly");
  expect(result.pdfSubject).toBe(true);
});

// TODO 132.5: a plot without a width fills its host (a notebook cell, an exported page) instead
// of stopping at 800px and leaving the rest empty; an image export, with no host, keeps 800px.
test("a scene's plot without a width fills its host; an image export keeps 800px", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const width = async (fill) => {
    await page.goto(`/test/notebook?fixture=18_curves${fill ? "" : "&fill=false"}`);
    await page.waitForFunction(() => window.notebookReady, {}, { timeout: 30000 });
    return page.locator(".plot").first().evaluate((plot) => plot.getBoundingClientRect().width);
  };
  expect(await width(true)).toBeGreaterThan(1200);
  expect(await width(false)).toBe(800);
});

// TODO 54: an exported page shows its snapshot first and swaps in the live view once it has drawn;
// without WebGPU the snapshot stays, with a note, and its text is text. The snapshot is labeled
// (page chrome beside its SVG) and fades out over the live view (user request 2026-10-02).
test("an exported page shows a snapshot, then the live view; without WebGPU the snapshot stays", async ({ page, context }) => {
  await page.goto("/test/notebook?fixture=79_titles_and_markdown");
  await page.waitForFunction(() => window.notebookReady, {}, { timeout: 30000 });
  await page.waitForFunction(() => [...document.querySelectorAll(".canvas")].every((canvas) => canvas.getAttribute("aria-busy") === "false"));
  const bundle = fs.readFileSync("python/hmplot/static/standalone.js", "utf8");
  // The page embeds the runtime its host gives, as the notebook widget and the export browser do
  // (test_animation.py opens a page exported from Python from disk).
  await context.route("**/__standalone__.js", (route) => route.fulfill({ contentType: "text/javascript", body: bundle }));
  const exported = await page.evaluate(async () => {
    const runtime = window.notebookRuntime, buffers = window.notebookBuffers;
    runtime.setSerializable(window.notebookState, async (id) => ({ payload: Uint8Array.from(atob(buffers[id]), (c) => c.charCodeAt(0)) }),
      () => fetch("/__standalone__.js").then((response) => response.text()));
    const { blob, report } = await runtime.command({ command: "export_html", target: window.notebookState.root.id, args: {} });
    return { html: await blob.text(), report };
  });
  expect(exported.report.snapshot.kind).toBe("svg");
  expect(exported.report.snapshot.bytes).toBeGreaterThan(1000);
  await context.route("**/__exported_page__.html", (route) => route.fulfill({ contentType: "text/html", body: exported.html }));
  const plain = await context.newPage();
  await plain.addInitScript(() => Object.defineProperty(Navigator.prototype, "gpu", { configurable: true, get: () => undefined }));
  await plain.goto("/__exported_page__.html");
  // The label says it (short; the status in full), with no note below the snapshot.
  await expect(plain.locator("#hmplot-snapshot > #hmplot-label")).toHaveText("Static · no WebGPU");
  await expect(plain.locator("#hmplot-status")).toHaveText("Static preview: this browser has no WebGPU");
  await expect(plain.locator("#hmplot-note")).toHaveCount(0);
  await expect(plain.locator("#hmplot-snapshot svg text", { hasText: "Temperature anomaly, window of 12 months" })).toHaveCount(1);
  await expect(plain.locator("#hmplot-snapshot svg text", { hasText: "Static preview" })).toHaveCount(0);
  await expect(plain.locator("#hmplot-root")).toHaveCount(0);
  await expect(plain).toHaveTitle("Temperature anomaly, window of 12 months");
  const live = await context.newPage();
  await live.addInitScript(() => new MutationObserver(() => { window.__faded ||= Boolean(document.querySelector("#hmplot-snapshot.hmplot-leaving")?.getAnimations().length); })
    .observe(document, { subtree: true, attributes: true, attributeFilter: ["class"] }));
  await live.goto("/__exported_page__.html", { waitUntil: "domcontentloaded" });
  await expect(live.locator("#hmplot-snapshot")).toHaveCount(1);
  await expect(live.locator("#hmplot-label")).toHaveText("Static preview");
  await expect(live.locator("#hmplot-status")).toHaveText("Static preview; loading the interactive plot");
  await expect(live.locator("#hmplot-snapshot")).toHaveCount(0, { timeout: 60000 });
  await expect(live.locator("#hmplot-label")).toHaveCount(0);
  await expect(live.locator("#hmplot-status")).toHaveText("Interactive plot");
  expect(await live.evaluate(() => window.__faded)).toBe(true);
  await expect(live.locator("#hmplot-root")).not.toHaveClass(/hmplot-loading/);
  await expect(live.locator("#hmplot-root .canvas")).toHaveCount(1);
});

test("an exported page carries the coordinate columns its grid tables reference", async ({ page }) => {
  await page.goto("/test/notebook?fixture=80_netcdf");
  await page.waitForFunction(() => window.notebookReady, {}, { timeout: 30000 });
  await page.waitForFunction(() => [...document.querySelectorAll(".canvas")].every((canvas) => canvas.getAttribute("aria-busy") === "false"));
  const { referenced, embedded } = await page.evaluate(async () => {
    const runtime = window.notebookRuntime, buffers = window.notebookBuffers, state = window.notebookState;
    runtime.setSerializable(state, async (id) => ({ payload: Uint8Array.from(atob(buffers[id]), (c) => c.charCodeAt(0)) }), async () => "/* runtime */");
    const { blob } = await runtime.command({ command: "export_html", target: state.root.id, args: { snapshot: false } });
    const page = new DOMParser().parseFromString(await blob.text(), "text/html");
    const embedded = Object.keys(JSON.parse(page.querySelector("#hmplot-state").textContent).columns);
    const referenced = Object.values(state.tables).filter((table) => table.grid).flatMap(({ grid }) => [
      ...grid.dims.flatMap((dim) => [dim.coords.$column, dim.edges?.$column]),
      ...Object.values(grid.positions?.columns ?? {}).map((column) => column.$column),
    ]).filter(Boolean);
    return { referenced, embedded };
  });
  expect(referenced.length).toBeGreaterThan(0);
  expect(referenced.filter((id) => !embedded.includes(id))).toEqual([]);
});

// TODO 37.7: a plot with a sky, fog or glow exports as one raster with them (SVG and PDF in
// mode "auto"; "vector" names what it cannot draw); a plot without them exports as before.
// Fixture: scripts/generate-light-fixtures.py (a glowing globe in green fog on a transparent plot).
test("fog and glow on a transparent plot survive PNG and auto SVG and PDF exports; vector mode names them", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/test/notebook?fixture=lights");
  await page.waitForFunction(() => window.notebookReady, null, { timeout: 30000 });
  await expect.poll(() => page.evaluate(() =>
    [...document.querySelectorAll(".canvas")].every((canvas) => canvas.getAttribute("aria-busy") === "false"))).toBe(true);
  const result = await page.evaluate(async () => {
    const plots = {};
    const walk = (node) => { if (node.kind === "Plot") plots[node.props.name] = window.notebookRuntime.reference(node.id); (node.children ?? []).forEach(walk); };
    walk(window.notebookState.root);
    const plot = plots.transparent;
    await plot.whenSettled();
    /** Alpha and color at plot pixels (the plot is 320 x 320): the globe's center, its halo, a corner. */
    const read = async (blob) => {
      const bitmap = await createImageBitmap(blob), canvas = document.createElement("canvas");
      canvas.width = bitmap.width; canvas.height = bitmap.height;
      const context = canvas.getContext("2d"); context.drawImage(bitmap, 0, 0); bitmap.close();
      const scale = canvas.width / 320, at = (x, y) => [...context.getImageData(Math.round(x * scale), Math.round(y * scale), 1, 1).data];
      // The globe: radius 15 at distance 100 is 51 pixels.
      return { center: at(160, 160), halo: at(160 + 60, 160), corner: at(4, 4) };
    };
    const png = await read(await plot.exportPNG());
    const svg = await plot.exportSVG({ mode: "auto" });
    const text = await svg.blob.text(), image = new DOMParser().parseFromString(text, "image/svg+xml").querySelector("image");
    const raster = await read(await (await fetch(image.getAttribute("href"))).blob());
    const pdf = await plot.exportPDF({ mode: "auto" });
    let vector = "";
    try { await plot.exportSVG({ mode: "vector" }); } catch (error) { vector = error.message; }
    const plain = await plots.point.exportSVG({ mode: "auto" });
    return { png, raster, svgReport: svg.report, pdfSignature: new TextDecoder().decode((await pdf.blob.arrayBuffer()).slice(0, 4)),
      pdfLayers: pdf.report.rasterLayers.map((layer) => layer.kind), vector, plainWarnings: plain.report.warnings,
      plainLayers: plain.report.rasterLayers.map((layer) => layer.kind) };
  });
  for (const pixels of [result.png, result.raster]) {
    // Fog tints the globe toward green; the glow covers its halo partly; the corner is clear but
    // for the bloom's faint tail (fog alone keeps empty pixels clear).
    const [r, g, , a] = pixels.center;
    expect(a).toBe(255);
    expect(g).toBeGreaterThan(r * 0.5 + 40);
    expect(pixels.halo[3]).toBeGreaterThan(10);
    expect(pixels.halo[3]).toBeLessThan(255);
    expect(pixels.corner[3]).toBeLessThan(16);
  }
  expect(result.svgReport.rasterLayers.map((layer) => layer.kind)).toEqual(["plot"]);
  expect(result.svgReport.warnings).toContain("The plot was exported as one raster image because it shows fog and glow, which have no vector form.");
  expect(result.pdfSignature).toBe("%PDF");
  expect(result.pdfLayers).toEqual(["plot"]);
  expect(result.vector).toBe('Vector export cannot draw the plot\'s fog and glow. Use mode="auto" to export the plot as one raster image.');
  // A plot without effects exports as it did.
  expect(result.plainWarnings.some((warning) => warning.includes("exported as one raster image"))).toBe(false);
  expect(result.plainLayers).not.toContain("plot");
  expect(errors).toEqual([]);
});

// TODO 70: each case of the export guide's former list of what SVG and PDF drew as an image
// (/test/vector-export?case=..., one plot each) now exports as vectors, and its SVG, drawn as
// an image, agrees with its PNG as tests/browser/stage14-export-parity.spec.js measures it:
// saturated pixels binned by hue, each bin's bounds within 4 px and count within 25%. Where a
// case's fills are colors from a scale, each fill is also the PNG's color inside it.
const VECTOR_CASES = {
  // Numbers through a scale and colormap (70.1); `colors` probes fills against the PNG.
  "points-value": { colors: true }, "points-quantized": { colors: true }, "points-custom": { colors: true },
  "points-diverging": { colors: true }, "points-missing": { colors: true }, "rect-value": { colors: true }, "pie-value": { colors: true },
  "size-width-scales": {},
  "polar-rect-value": { colors: true }, "polygon-value": { colors: true }, "line-value": {}, "segments-value": {},
  "contour-bands": {}, "text-value": {}, "errorbars-value": {}, "arrows-value": {}, "arrows3d-value": {},
  // DensityContour's many short GPU segments draw speckled with alpha-to-coverage: outcomes only.
  "contour-lines": { parity: false },
  // Category colors (70.2); a Line's color runs meet at shared vertices.
  "line-category": {}, "line-color-change": {}, "segments-category": {}, "arrows-category": {}, "arrows3d-category": {},
  "area-category": {}, "ribbon-category": {}, "errorbars-category": {}, "text-category": {}, "rect-category": { colors: true },
  "bar-category": { colors: true }, "prism-category": {}, "violin": {}, "ecdf": {}, "rule-category": {}, "geojson-category": {},
  // A BoxPlot's 1 px whiskers antialias lighter on the GPU (unsaturated): outcomes only.
  "boxplot": { parity: false },
  // Dashes (70.3), curves (70.4), displaced endpoints and seams (70.5).
  "line-dash": {}, "line-dash-polar": {}, "segments-dash": {}, "rule-dash": {}, "routes-dash": {}, "line-basis": {}, "line-curve-map": {},
  "segments-curve-ortho": {}, "arrows-curve": {}, "arrows-geometry": {}, "arrows-width": {}, "segments-arrow-curve": {}, "segments-arrow-geometry": {}, "segments-arrow-width": {}, "segments-arrow-dash": {}, "arrows3d-curve": {}, "dodge-connectors": {}, "points-offset": {},
  "text-align-auto": {}, "segments-cap": {},
  "connector-curve": {}, "seam-band": {},
  // On screen a Rect across a nested map's seam draws a bar across the map, and a joint map
  // drops the far piece (TODO 70.5 note): the export's pieces are checked below instead.
  "seam-rect": { parity: false }, "seam-joint": { parity: false },
  // 2D marks in a 3D view (70.6): vectors drawn back to front. `depth` also compares the renders
  // pixel by pixel: of the pixels both draw saturated, under 1.5% may differ in hue (antialiasing;
  // drawn in the marks' order instead of by depth these cases differ in 2.6 to 23%), so a mark in
  // front of the wrong one fails: the knot's crossings, labels and points, points behind a Rect.
  "plot-3d": {}, "scatter-3d": { depth: true }, "line-3d": { depth: true }, "text-3d": { depth: true },
  "near-3d": { depth: true }, "dash-3d": {}, "fills-3d": { depth: true }, "arrows-3d": {}, "curve-3d": { depth: true },
  "bar-3d": {},
  // Still images: additive blending, a 3D view with a 3D mark (all its marks: a Points3D, a flat
  // Prism), a Heatmap.
  "blend-additive": { raster: true }, "mixed-3d": { raster: true }, "prism-3d": { raster: true }, "heatmap": { raster: true },
};

test.describe("vector export parity at DPR 2", () => {
  test.use({ deviceScaleFactor: 2 });
  for (const [name, { parity = true, colors = false, raster = false, depth = false }] of Object.entries(VECTOR_CASES)) {
    test(`${raster ? "still an image" : "vector, as drawn"}: ${name}`, async ({ page }) => {
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(`/test/vector-export?case=${name}`);
      await page.waitForFunction(() => window.vectorExport?.plot?.whenSettled);
      await expect.poll(() => page.evaluate(() => {
        const canvases = [...document.querySelectorAll(".canvas")];
        return canvases.length > 0 && canvases.every((canvas) => canvas.getAttribute("aria-busy") === "false");
      })).toBe(true);
      const result = await page.evaluate(async () => {
        const plot = window.vectorExport.plot;
        await plot.whenSettled();
        const output = await plot.exportSVG({ mode: "auto" }), text = await output.blob.text();
        const { embedDefaultFont } = await import("/src/lib/plot/utils/defaultFont.js");
        const svg = new DOMParser().parseFromString(text, "image/svg+xml").documentElement;
        const pixelArea = 1 / devicePixelRatio ** 2;
        const draw = (source) => {
          const canvas = Object.assign(document.createElement("canvas"), {
            width: Number(svg.getAttribute("width")) * devicePixelRatio, height: Number(svg.getAttribute("height")) * devicePixelRatio,
          });
          const context = canvas.getContext("2d");
          context.fillStyle = "white"; context.fillRect(0, 0, canvas.width, canvas.height);
          // PNG includes the device pixel ratio; SVG uses logical dimensions. Compare both
          // on the same device-pixel grid, retaining the renderer's DPR 2 detail.
          context.drawImage(source, 0, 0, canvas.width, canvas.height);
          return { width: canvas.width, data: context.getImageData(0, 0, canvas.width, canvas.height).data };
        };
        const bins = ({ width, data }) => {
          const out = {};
          for (let i = 0; i < data.length; i += 4) {
            const r = data[i], g = data[i + 1], b = data[i + 2], max = Math.max(r, g, b), min = Math.min(r, g, b);
            if (max - min < 90) continue;
            const hue = ((max === r ? (g - b) / (max - min) : max === g ? 2 + (b - r) / (max - min) : 4 + (r - g) / (max - min)) * 60 + 360) % 360;
            const x = ((i / 4) % width) / devicePixelRatio, y = Math.floor(i / 4 / width) / devicePixelRatio;
            const bin = out[Math.floor(hue / 30) * 30] ??= { count: 0, x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity };
            bin.count += pixelArea; // Counts and bounds stay in logical-pixel units at either DPR.
            bin.x0 = Math.min(bin.x0, x); bin.x1 = Math.max(bin.x1, x); bin.y0 = Math.min(bin.y0, y); bin.y1 = Math.max(bin.y1, y);
          }
          return out;
        };
        const png = draw(await createImageBitmap(await plot.exportPNG()));
        // Pixels both renders draw saturated, and those of them in different hue bins.
        const agreement = (vector) => {
          const hue = (data, i) => { const r = data[i], g = data[i + 1], b = data[i + 2], max = Math.max(r, g, b), min = Math.min(r, g, b);
            return max - min < 90 ? null : Math.floor((((max === r ? (g - b) / (max - min) : max === g ? 2 + (b - r) / (max - min) : 4 + (r - g) / (max - min)) * 60 + 360) % 360) / 30); };
          let both = 0, differ = 0;
          for (let i = 0; i < png.data.length; i += 4) {
            const a = hue(vector.data, i), b = hue(png.data, i);
            if (a !== null && b !== null) { both++; if (a !== b) differ++; }
          }
          return { both: both * pixelArea, differ: differ * pixelArea };
        };
        // Filled paths' colors against the PNG at a pixel well inside each (2 px from its edge) that
        // no later path covers; up to 60 paths, evenly spread.
        document.body.append(svg);
        const fills = [...svg.querySelectorAll("path[fill]:not([fill=none])")], boxes = fills.map((path) => path.getBBox()), probes = [];
        const inside = (path, x, y) => path.isPointInFill(new DOMPoint(x, y));
        for (let k = 0; k < fills.length; k += Math.max(1, Math.floor(fills.length / 60))) {
          const path = fills[k], box = boxes[k], candidates = [];
          for (let y = Math.ceil(box.y); y < box.y + box.height; y++)
            for (let x = Math.ceil(box.x); x < box.x + box.width; x++) candidates.push([x + 0.5, y + 0.5]);
          const center = [box.x + box.width / 2, box.y + box.height / 2];
          candidates.sort((a, b) => Math.hypot(a[0] - center[0], a[1] - center[1]) - Math.hypot(b[0] - center[0], b[1] - center[1]));
          const point = candidates.find(([x, y]) => [[0, 0], [2, 0], [-2, 0], [0, 2], [0, -2]].every(([dx, dy]) => inside(path, x + dx, y + dy)) &&
            !fills.slice(k + 1).some((later, j) => { const b = boxes[k + 1 + j]; return x >= b.x - 3 && x <= b.x + b.width + 3 && y >= b.y - 3 && y <= b.y + b.height + 3 &&
              [[0, 0], [2, 0], [-2, 0], [0, 2], [0, -2]].some(([dx, dy]) => inside(later, x + dx, y + dy)); }));
          if (!point) continue;
          const i = (Math.floor(point[1] * devicePixelRatio) * png.width + Math.floor(point[0] * devicePixelRatio)) * 4;
          probes.push({ fill: path.getAttribute("fill"), opacity: Number(path.getAttribute("opacity") ?? 1), png: [png.data[i], png.data[i + 1], png.data[i + 2]] });
        }
        svg.remove();
        await embedDefaultFont(svg);
        const image = new Image();
        image.src = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svg)], { type: "image/svg+xml" }));
        await image.decode();
        const paths = [...svg.querySelectorAll("path")], vector = draw(image);
        return {
          outcomes: output.report.markOutcomes.map((entry) => entry.rendering), layers: output.report.rasterLayers.length,
          warnings: output.report.warnings, vector: bins(vector), raster: bins(png), probes, agreement: agreement(vector),
          dashed: paths.filter((path) => path.getAttribute("stroke-dasharray")).length,
          subpaths: paths.map((path) => [path.getAttribute("fill"), (path.getAttribute("d").match(/M/g) ?? []).length,
            ...[0, 1].map((k) => Math[k ? "max" : "min"](...path.getAttribute("d").match(/-?[\d.]+(?:e-?\d+)?/g).map(Number).filter((_, i) => i % 2 === 0)))]),
          circles: [...svg.querySelectorAll("circle")].map((circle) => [circle.getAttribute("fill"), +circle.getAttribute("cx"), +circle.getAttribute("cy")]),
          // The marks' red paths' points, stroke width and cap (Arrows' shafts and heads).
          arrows: paths.filter((path) => [path.getAttribute("stroke"), path.getAttribute("fill")].includes("#e4572e")).map((path) => {
            const numbers = path.getAttribute("d").match(/-?[\d.]+(?:e-?\d+)?/g).map(Number);
            return { stroke: path.getAttribute("stroke") === "#e4572e", width: Number(path.getAttribute("stroke-width")),
              cap: path.getAttribute("stroke-linecap"), points: numbers.flatMap((_, i) => i % 2 ? [] : [[numbers[i], numbers[i + 1]]]) };
          }),
        };
      });
      expect(errors).toEqual([]);
      if (raster) {
        expect(result.outcomes).toContain("raster");
        return;
      }
      expect(result.outcomes.every((rendering) => rendering === "vector"), JSON.stringify(result.outcomes)).toBe(true);
      expect(result.layers).toBe(0);
      if (parity)
        for (const hue of new Set([...Object.keys(result.vector), ...Object.keys(result.raster)])) {
          const v = result.vector[hue], r = result.raster[hue];
          if (!v || !r) {
            expect((v ?? r).count, `hue ${hue} only in the ${v ? "vector" : "raster"} export`).toBeLessThan(40);
            continue;
          }
          if (Math.max(v.count, r.count) < 40) continue;
          for (const key of ["x0", "x1", "y0", "y1"]) expect(Math.abs(v[key] - r[key]), `hue ${hue} ${key}`).toBeLessThanOrEqual(4);
          expect(Math.abs(v.count - r.count) / r.count, `hue ${hue} count ${v.count} vs ${r.count}`).toBeLessThan(0.25);
        }
      if (colors) {
        expect(result.probes.length).toBeGreaterThanOrEqual(2);
        // Over the white background at the path's opacity.
        for (const { fill, opacity, png } of result.probes) {
          const expected = [1, 3, 5].map((k) => parseInt(fill.slice(k, k + 2), 16) * opacity + 255 * (1 - opacity));
          expect(Math.max(...expected.map((value, c) => Math.abs(value - png[c]))), `${fill} at ${opacity} vs rgb(${png})`).toBeLessThanOrEqual(3);
        }
      }
      if (depth) {
        expect(result.agreement.both).toBeGreaterThan(1000);
        expect(result.agreement.differ / result.agreement.both, JSON.stringify(result.agreement)).toBeLessThan(0.015);
      }
      if (name.endsWith("-3d"))
        // The report says the 3D view's order is approximate where marks intersect, naming the plot.
        expect(result.warnings).toContain("Plot 1's 3D view was exported as vectors drawn back to front by depth: " +
          "where marks intersect or cross closely, which one is in front is approximate.");
      if (name.endsWith("-dash") || name === "dash-3d") expect(result.dashed).toBeGreaterThan(0);
      if (name === "points-missing") {
        // TODO 73.3: the missing rows are the theme's missing color and the scale's, as drawn.
        const fills = new Set(result.probes.map((probe) => probe.fill));
        expect(fills.has("#92989f") && fills.has("#e4572e"), [...fills].join(" ")).toBe(true);
      }
      if (name === "points-offset") {
        // The red point sits 40 px right of and 30 px above the blue one, as the GPU offsets it.
        const [blue, red] = ["#2a6fdb", "#e4572e"].map((fill) => result.circles.find((circle) => circle[0] === fill));
        expect([red[1] - blue[1], red[2] - blue[2]]).toEqual([40, -30]);
      }
      if (name === "segments-cap") {
        // TODO 130.1: two bars per segment, 16 px long, across the stroke at its ends.
        const bars = result.arrows.filter((path) => path.cap === "butt");
        expect(bars.length).toBe(4);
        for (const { points: [a, b] } of bars) expect(Math.abs(Math.hypot(b[0] - a[0], b[1] - a[1]) - 16)).toBeLessThan(1e-6);
      }
      if (name === "arrows-width" || name === "segments-arrow-width") {
        const widths = result.arrows.filter((path) => path.stroke).map((path) => path.width).sort((a, b) => a - b);
        expect(widths).toEqual(name === "arrows-width" ? [2, 4, 6] : [10, 15, 20]);
      }
      if (name === "text-align-auto") {
        // TODO 130.1: from the bottom row up, offsets -30, 2 and 30 px from x = 160 px: the first
        // label ends 30 px left of its point, the second is centered on it, the third starts 30 px right.
        const [left, middle, right] = Object.values(result.raster).sort((a, b) => b.y0 - a.y0);
        expect([left.x1, (middle.x0 + middle.x1) / 2, right.x0].map((x, k) => Math.abs(x - [130, 162, 190][k]) <= 4),
          JSON.stringify(result.raster)).toEqual([true, true, true]);
      }
      if (name === "arrows-geometry" || name === "segments-arrow-geometry") {
        // TODO 67.2: one shaft and one head per row, apart: each shaft a flat-ended stroke of the
        // width (3 px) from the start to the head's base, the head 10 px long and 8 px wide at the
        // end. The short row is a head of its own length; the zero-length row draws nothing.
        const px = ([x, y]) => [x * 32, 240 - y * 24];
        const rows = [[[1, 1], [5, 1]], [[7, 1], [7, 5]], [[1, 4], [4, 7]], [[9, 9], [5, 9]], [[2, 8], [2.2, 8]]];
        const shafts = result.arrows.filter((path) => path.stroke), heads = result.arrows.filter((path) => !path.stroke);
        expect([shafts.length, heads.length]).toEqual([4, 5]);
        const near = (points, expected) => points.length === expected.length &&
          points.every((point, k) => Math.hypot(point[0] - expected[k][0], point[1] - expected[k][1]) < 1e-3);
        for (const [k, [start, end]] of rows.entries()) {
          const [a, b] = [px(start), px(end)], length = Math.hypot(b[0] - a[0], b[1] - a[1]);
          const u = [(b[0] - a[0]) / length, (b[1] - a[1]) / length], n = [-u[1], u[0]], h = Math.min(10, length);
          const base = [b[0] - u[0] * h, b[1] - u[1] * h];
          expect(heads.some((head) => near(head.points, [b, [base[0] + n[0] * 4, base[1] + n[1] * 4], [base[0] - n[0] * 4, base[1] - n[1] * 4]])), `head ${k}`).toBe(true);
          if (length > 10) expect(shafts.some((shaft) => near(shaft.points, [a, base]) && shaft.width === 3 && shaft.cap === "butt"), `shaft ${k}`).toBe(true);
        }
      }
      if (name === "seam-rect" || name === "seam-joint") {
        // The box from 150 to 210 degrees: one path, a piece at each edge of the map.
        const [, pieces, left, right] = result.subpaths.find(([fill]) => fill === "#e4572e");
        expect(pieces).toBe(2);
        expect(right - left).toBeGreaterThan(250);
      }
    });
  }

  test("Arrows head settings reach its template handle and change the drawing", async ({ page }) => {
    await page.goto("/test/vector-export?case=arrows-geometry");
    await page.waitForFunction(() => window.vectorExport?.compound?.getMark());
    await expect(page.locator(".canvas")).toHaveAttribute("aria-busy", "false");
    const before = await page.evaluate(async () => {
      const { plot, compound } = window.vectorExport;
      await plot.whenSettled();
      window.arrowSettings = [];
      compound.subscribeSettings((values) => window.arrowSettings.push(values));
      return (await plot.exportSVG({ mode: "vector" })).blob.text();
    });
    const beforePNG = await page.locator(".canvas").screenshot();
    await page.evaluate(() => {
      const options = window.vectorExport.compound.getMark().options;
      options.set("headLength", 22, { layer: "user" });
      options.set("headWidth", 18, { layer: "user" });
    });
    await expect.poll(() => page.evaluate(() => {
      const values = window.arrowSettings.at(-1);
      return [values?.headLength, values?.headWidth];
    })).toEqual([22, 18]);
    const after = await page.evaluate(async () => {
      const { plot, compound } = window.vectorExport;
      await plot.whenSettled();
      const svg = await (await plot.exportSVG({ mode: "vector" })).blob.text();
      return { svg, error: plot.getRenderError(), endpoint: compound.endpoint({ at: "end" }).kind };
    });
    expect(after.error).toBe("");
    expect(after.endpoint).toBe("Arrows");
    expect(after.svg).not.toBe(before);
    expect(await page.locator(".canvas").screenshot()).not.toEqual(beforePNG);
  });

  test("Segments changes mounted caps between arrows, bars and plain strokes", async ({ page }) => {
    await page.goto("/test/vector-export?case=segments-arrow-geometry");
    await page.waitForFunction(() => window.vectorExport?.compound?.getMark());
    await expect(page.locator(".canvas")).toHaveAttribute("aria-busy", "false");
    const drawings = [];
    for (const cap of ["arrow", "bar", "none", "arrow"]) {
      const result = await page.evaluate(async (cap) => {
        const { plot, compound } = window.vectorExport;
        compound.getMark().options.set("cap", cap);
        await plot.whenSettled();
        const output = await plot.exportSVG({ mode: "vector" });
        const text = await output.blob.text(), svg = new DOMParser().parseFromString(text, "image/svg+xml");
        return { text, heads: [...svg.querySelectorAll("path")].filter((path) => path.getAttribute("fill") === "#e4572e").length,
          error: plot.getRenderError() };
      }, cap);
      expect(result.error).toBe("");
      expect(result.heads).toBe(cap === "arrow" ? 5 : 0);
      drawings.push({ text: result.text, png: await page.locator(".canvas").screenshot() });
    }
    expect(drawings[0]).toEqual(drawings[3]);
    expect(drawings[0].png).not.toEqual(drawings[1].png);
    expect(drawings[1].png).not.toEqual(drawings[2].png);
  });
});

// TODO 70.6: a 3D view with a 3D mark keeps all of its marks one image (auto, with a warning
// naming the mark), refuses mode="vector" naming it, and mode="raster" draws an eligible view as
// one image too.
test("a 3D view with a 3D mark stays one image; vector mode names the mark", async ({ page }) => {
  const open = async (name) => {
    await page.goto(`/test/vector-export?case=${name}`);
    await page.waitForFunction(() => window.vectorExport?.plot?.whenSettled);
    await expect.poll(() => page.evaluate(() =>
      [...document.querySelectorAll(".canvas")].every((canvas) => canvas.getAttribute("aria-busy") === "false"))).toBe(true);
  };
  const report = (mode) => page.evaluate(async (mode) => {
    const plot = window.vectorExport.plot;
    await plot.whenSettled();
    try {
      const output = await plot.exportSVG({ mode }), text = await output.blob.text();
      return { layers: output.report.rasterLayers.map((layer) => [layer.kind, layer.marks.length]), warnings: output.report.warnings,
        images: (text.match(/<image /g) ?? []).length, circles: (text.match(/<circle /g) ?? []).length };
    } catch (error) { return { error: error.message }; }
  }, mode);
  await open("mixed-3d");
  const auto = await report("auto");
  expect(auto.layers).toEqual([["unsupported marks", 2]]);
  expect([auto.images, auto.circles]).toEqual([1, 0]);
  expect(auto.warnings).toContain("Plot 1's 3D view was exported as one image because Points 3D 1 is a 3D mark; " +
    "in a 3D view only 2D marks export as vectors, and only when all of its marks do.");
  expect((await report("vector")).error).toBe("Vector export cannot draw this 3D view: Points 3D 1 is a 3D mark. " +
    'In a 3D view only 2D marks export as vectors, and only when all of its marks do. Use mode="auto" to export its marks as one image.');
  // A Prism written as such is a 3D mark, flat too.
  await open("prism-3d");
  expect((await report("auto")).warnings.join(" ")).toContain("because Prism 1 is a 3D mark;");
  expect((await report("vector")).error).toContain("Vector export cannot draw this 3D view: Prism 1 is a 3D mark.");
  await open("scatter-3d");
  expect(await report("raster")).toEqual({ layers: [["plot", 1]], warnings: [], images: 1, circles: 0 });
  expect((await report("vector")).circles).toBe(60);
});

// TODO 64.10: a rule spanning the visible domain follows new automatic bounds: the Line's x domain
// doubles and the RuleY still spans the plot (it kept the view it had read, the standalone
// exports' stale rule when the marks' domain arrived after the rule prepared).
test("a rule spanning the visible domain follows new automatic bounds", async ({ page }) => {
  await page.goto("/test/vector-export?case=rule-bounds");
  await page.waitForFunction(() => window.vectorExport?.plot?.whenSettled);
  // The rule's x extent in the SVG, and the x axis line's.
  const extents = () => page.evaluate(async () => {
    const plot = window.vectorExport.plot;
    await plot.whenSettled();
    const svg = new DOMParser().parseFromString(await (await plot.exportSVG({ mode: "vector" })).blob.text(), "image/svg+xml");
    const xs = (d) => d.match(/-?[\d.]+(?:e-?\d+)?/g).map(Number).filter((_, i) => i % 2 === 0);
    const rule = xs(svg.querySelector('path[stroke="#e4572e"]').getAttribute("d")),
      layout = plot.getAxisLayout();
    return { rule: [Math.min(...rule), Math.max(...rule)].map(Math.round), axis: [layout.left, layout.right].map(Math.round) };
  });
  await expect.poll(async () => { const { rule, axis } = await extents(); return rule.join() === axis.join(); }).toBe(true);
  await page.evaluate(() => window.vectorExport.widen());
  const { rule, axis } = await extents();
  expect(rule).toEqual(axis);
});

// TODO 130.1: rows="auto" draws one item when no channel reads a column; domains={false} keeps a
// mark out of the automatic domains.
test('rows="auto" draws one point over many rows; domains={false} leaves the axes to the others', async ({ page }) => {
  await page.goto("/test/vector-export?case=rows-auto");
  await page.waitForFunction(() => window.vectorExport?.plot?.whenSettled);
  const result = await page.evaluate(async () => {
    const plot = window.vectorExport.plot;
    await plot.whenSettled();
    const svg = new DOMParser().parseFromString(await (await plot.exportSVG({ mode: "vector" })).blob.text(), "image/svg+xml");
    const ticks = [...svg.querySelectorAll("text")].map((t) => Number(t.textContent)).filter(Number.isFinite);
    return { blue: svg.querySelectorAll('circle[fill="#2a6fdb"]').length, red: svg.querySelectorAll('circle[fill="#e4572e"]').length, largestTick: Math.max(...ticks) };
  });
  expect(result).toEqual({ blue: 10, red: 1, largestTick: expect.any(Number) });
  expect(result.largestTick).toBeLessThan(20);
});

// TODO 70.3: a dashed line's pattern reaches the PDF (svg2pdf; Python prints the same SVG in
// Chromium) as a dash operator in its content stream. TODO 73.2: one pattern along the whole Line,
// in CSS pixels however the view scales x and y.
test("a dashed line keeps its dashes in the PDF", async ({ page }) => {
  await page.goto("/test/vector-export?case=line-dash");
  await page.waitForFunction(() => window.vectorExport?.plot?.whenSettled);
  await expect.poll(() => page.evaluate(() =>
    [...document.querySelectorAll(".canvas")].every((canvas) => canvas.getAttribute("aria-busy") === "false"))).toBe(true);
  const result = await page.evaluate(async () => {
    const plot = window.vectorExport.plot;
    await plot.whenSettled();
    const pdf = await plot.exportPDF({ mode: "auto" }), bytes = new Uint8Array(await pdf.blob.arrayBuffer());
    let raw = "";
    for (let i = 0; i < bytes.length; i += 0x8000) raw += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    const streams = [];
    for (const match of raw.matchAll(/stream\r?\n/g)) {
      let end = raw.indexOf("endstream", match.index);
      while (bytes[end - 1] === 10 || bytes[end - 1] === 13) end--;
      try {
        streams.push(await new Response(new Blob([bytes.slice(match.index + match[0].length, end)]).stream()
          .pipeThrough(new DecompressionStream("deflate"))).text());
      } catch { /* not a content stream */ }
    }
    return { layers: pdf.report.rasterLayers.length, dashes: streams.join("\n").match(/\[[\d. ]+\] [\d.]+ d/g) ?? [] };
  });
  expect(result.layers).toBe(0);
  expect(result.dashes.length).toBe(1);
  // dash={[10, 5]}: the page's units may scale it, not its proportions.
  const [dash, gap] = result.dashes[0].match(/\[([\d. ]+)\]/)[1].trim().split(/\s+/).map(Number);
  expect(dash / gap).toBeCloseTo(2, 3);
});

// TODO 69.7 (CODEX_REVIEW #8): hiding a BoxPlot or a Smooth hides every part (box, whiskers,
// median and outlier; line and band), whether by its visible prop, its legend entry or its mark's
// options, and showing it draws them all again. Counted in the vector SVG: the marks' elements
// (the background is the only other one, axes are off) and the report's marks.
for (const [name, parts] of [["boxplot-visibility", 4], ["smooth-visibility", 2]]) {
  test(`hiding a compound hides all its parts: ${name}`, async ({ page }) => {
    await page.goto(`/test/vector-export?case=${name}`);
    await page.waitForFunction(() => window.vectorExport?.compound?.getMark?.());
    const drawn = () => page.evaluate(async () => {
      const plot = window.vectorExport.plot;
      for (let frame = 0; frame < 3; frame++) await new Promise((resolve) => requestAnimationFrame(resolve));
      await plot.whenSettled();
      const result = await plot.exportSVG({ mode: "vector" });
      const svg = new DOMParser().parseFromString(await result.blob.text(), "image/svg+xml");
      return { elements: svg.querySelectorAll("path, circle, rect, line, polyline, polygon, ellipse").length - 1,
        marks: result.report.markOutcomes.length };
    });
    await expect.poll(async () => (await drawn()).marks).toBe(parts);
    const all = await drawn();
    expect(all.elements).toBeGreaterThanOrEqual(parts);
    const hidden = { elements: 0, marks: 0 };
    // The prop.
    await page.evaluate(() => window.vectorExport.show(false));
    expect(await drawn()).toEqual(hidden);
    await page.evaluate(() => window.vectorExport.show(true));
    expect(await drawn()).toEqual(all);
    // The legend entry of the compound's mark.
    const legend = (visible) => page.evaluate((visible) => {
      const { plot, compound } = window.vectorExport;
      plot.getLegendSource().entries().find((entry) => entry.guideMark?.() === compound.getMark()).setVisible(visible);
    }, visible);
    await legend(false);
    expect(await drawn()).toEqual(hidden);
    await legend(true);
    expect(await drawn()).toEqual(all);
    // The mark's own options (getMark()).
    await page.evaluate(() => window.vectorExport.compound.getMark().options.set("visible", false));
    expect(await drawn()).toEqual(hidden);
    await page.evaluate(() => window.vectorExport.compound.getMark().options.set("visible", true));
    expect(await drawn()).toEqual(all);
  });
}
