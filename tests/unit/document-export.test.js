import test from "node:test";
import assert from "node:assert/strict";
import { numpy as np } from "@hmplot/jax";
import { OrthographicCamera, Vector3 } from "three";
import {
  createExportDocument,
  exportDimensions,
  parseLength,
  serializeSVG,
} from "../../src/lib/plot/utils/exportDocument.js";
import { vectorCandidate, vectorMark } from "../../src/lib/plot/utils/vectorExport.js";

test("document export resolves physical sizes and preserves aspect ratio", () => {
  assert.ok(Math.abs(parseLength("25.4mm", 0) - 96) < 1e-8);
  assert.deepEqual(exportDimensions({ width: 800 }, 400, 200), { width: 800, height: 400 });
  assert.deepEqual(exportDimensions({ height: "1in" }, 400, 200), { width: 192, height: 96 });
});

test("logical SVG serialization escapes text and retains vector primitives", () => {
  const document = createExportDocument(400, 200, { viewBoxWidth: 200, viewBoxHeight: 100 });
  document.elements.push(
    { type: "path", attrs: { d: "M0 0 L10 10", stroke: "#123456", fill: "none" } },
    { type: "text", attrs: { x: 4, y: 8 }, text: "a < b" },
  );
  const svg = serializeSVG(document);
  assert.match(svg, /viewBox="0 0 200 100"/);
  assert.match(svg, /<path[^>]*M0 0 L10 10/);
  assert.match(svg, />a &lt; b<\/text>/);
});

test("document export rejects malformed and nonpositive dimensions", () => {
  assert.throws(() => parseLength("wide", 10), /Invalid export length/);
  assert.throws(() => exportDimensions({ width: 0 }, 100, 100), /positive finite/);
});

test("SVG export borrows live JAX mark fields instead of consuming them", async () => {
  const position = np.array([
    [-0.5, -0.5, 0],
    [0.5, 0.5, 0],
  ]);
  const options = new Map([
    ["coordinates", "cartesian"],
    ["xbounds", [-1, 1]],
    ["ybounds", [-1, 1]],
    ["zbounds", [-1, 1]],
    ["xrange", [-1, 1]],
    ["yrange", [-1, 1]],
    ["zrange", [-1, 1]],
    ["shape", "circle"],
  ]);
  const mark = {
    exportKind: "points",
    visible: true,
    isPlotObject: true,
    count: 2,
    options,
    fields: new Map([
      ["position", { data: position }],
      ["size", { data: 8 }],
      ["fill", { data: "steelblue" }],
    ]),
  };
  const camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
  camera.position.z = 2;
  camera.updateMatrixWorld();
  camera.updateProjectionMatrix();

  const first = await vectorMark(mark, camera, 200, 100, 10);
  const second = await vectorMark(mark, camera, 200, 100, 10);

  assert.equal(first.elements.length, 2);
  assert.equal(second.elements.length, 2);
  assert.equal((await position.ref.data()).length, 6);
  position.dispose();
});

test("captured rows retain their styles without owning the live mark fields", async () => {
  const { captureMarkRows, element } = await import("../../src/lib/plot/utils/vectorExport/capture.js");
  const position = np.array([[0, 0, 0], [1, 1, 0]]), opacity = np.array([0.5, 0]);
  const options = new Map([["opacity", 0.4], ["widthBounds", [0, 10]], ["widthRange", [1, 5]], ["fillColor", "red"]]);
  const mark = { exportKind: "points", count: 2, options,
    fields: new Map([["position", { data: position }], ["size", { data: 5 }], ["interactionOpacity", { data: opacity }]]) };
  const references = [position.refCount, opacity.refCount];
  try {
    const rows = await captureMarkRows(mark);
    options.set("opacity", 1); options.set("widthRange", [10, 20]); options.set("fillColor", "blue");
    assert.deepEqual(element(rows.positions, 1, 3), [1, 1, 0]);
    assert.equal(rows.shownCount, 2);
    assert.equal(rows.colorAt(0), "red");
    assert.equal(rows.strokeWidthAt(0), 3);
    assert.deepEqual([rows.opacityAt(0), rows.opacityAt(1)], [0.2, 0]);
    assert.deepEqual([position.refCount, opacity.refCount], references);
    assert.deepEqual(await position.ref.js(), [[0, 0, 0], [1, 1, 0]], "the mark remains readable after capture");
  } finally { position.dispose(); opacity.dispose(); }
});

test("exported size and width use render scale arithmetic while literal units stay literal", async () => {
  const { captureMarkRows, sizeValue } = await import("../../src/lib/plot/utils/vectorExport/capture.js");
  const cases = [
    { value: 5, domain: [5, 5], expected: 4 },
    { value: 2.5, domain: [10, 0], expected: 16 },
    { value: 1.5, domain: [-1, 3], midpoint: 0, expected: 16 },
    { value: 1.5, domain: [3, -1], midpoint: 0, expected: 8 },
    { value: 10, domain: [1, 100], transform: "log", expected: 12 },
    { value: 2, domain: [-2, 6], transform: "symlog", constant: 2, midpoint: 0, expected: 16 },
    { value: 0, domain: [1, 100], transform: "log", expected: NaN },
    { value: -1, domain: [0, 4], transform: "sqrt", expected: NaN },
  ];
  for (const { value, domain, transform = "linear", constant = 1, midpoint, expected } of cases) {
    const options = new Map();
    for (const prefix of ["scale", "width"])
      for (const [suffix, setting] of Object.entries({ Bounds: domain, Range: [4, 20], Transform: transform, TransformConstant: constant, Midpoint: midpoint }))
        options.set(prefix + suffix, setting);
    const mark = { exportKind: "segments", count: 1, options, fields: new Map([["width", { data: [value] }]]) };
    const rows = await captureMarkRows(mark);
    for (const actual of [sizeValue(mark, value), rows.strokeWidthAt(0)])
      if (Number.isNaN(expected)) assert.ok(Number.isNaN(actual), "invalid values remain undrawn, not zero");
      else assert.ok(Math.abs(actual - expected) < 1e-10, `${transform} ${JSON.stringify(domain)}: ${actual} vs ${expected}`);
    options.set("sizeUnits", "data");
    assert.equal(sizeValue(mark, value), value);
    options.set("sizeUnits", "pixels");
    mark.pixelSizeNode = { value: 7 };
    assert.equal(sizeValue(mark, value), 7);
    mark.widthLiteral = true;
    assert.equal((await captureMarkRows(mark)).strokeWidthAt(0), value);
    mark.widthLiteral = false;
    mark.exportKind = "billboard-arrows";
    const scaled = (await captureMarkRows(mark)).strokeWidthAt(0);
    if (Number.isNaN(expected)) assert.ok(Number.isNaN(scaled));
    else assert.ok(Math.abs(scaled - expected) < 1e-10);
    // The Arrows template sets the same literal-width flag as a numeric Segments width.
    mark.widthLiteral = true;
    assert.equal((await captureMarkRows(mark)).strokeWidthAt(0), value);
  }
});

test("live connection capture reads drawn rows and releases only its temporary staging buffer", async (t) => {
  const { liveRows } = await import("../../src/lib/plot/utils/vectorExport/capture.js");
  for (const [name, value] of Object.entries({ GPUBufferUsage: { COPY_DST: 8, MAP_READ: 1 }, GPUMapMode: { READ: 1 } })) {
    const previous = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, { configurable: true, value });
    t.after(() => previous ? Object.defineProperty(globalThis, name, previous) : delete globalThis[name]);
  }
  let destroyed = 0, failed = false, copies = 0;
  const live = { destroy: () => assert.fail("capture cannot destroy a borrowed live buffer") },
    attribute = { itemSize: 4 }, host = np.array([[-1, -1, -1], [-2, -2, -2]]),
    device = {
      createBuffer: ({ size }) => {
        assert.equal(size, 32);
        return { mapAsync: async () => { if (failed) throw Error("readback failed"); },
          getMappedRange: () => new Float32Array([1, 2, 3, 0, 4, 5, 6, 0]).buffer,
          destroy: () => destroyed++ };
      },
      createCommandEncoder: () => ({ copyBufferToBuffer: (source) => { assert.equal(source, live); copies++; }, finish: () => ({}) }),
      queue: { submit() {} },
    },
    mark = { positionSpace: "world", renderer: { backend: { device, get: (key) => { assert.equal(key, attribute); return { buffer: live }; } } },
      fields: new Map([["start", { data: host, count: 2, isBufferNode: true, bufferNodeSource: attribute }]]) };
  try {
    const rows = await liveRows(mark, "start");
    assert.deepEqual([...rows.data], [1, 2, 3, 4, 5, 6]);
    assert.deepEqual(rows.shape, [2, 3]);
    failed = true;
    await assert.rejects(liveRows(mark, "start"), /readback failed/);
    assert.equal(copies, 2);
    assert.equal(destroyed, 2, "failure releases staging too");
    assert.deepEqual(await host.ref.js(), [[-1, -1, -1], [-2, -2, -2]]);
  } finally { host.dispose(); }
});

test("style capture reads interpolated GPU colors and alpha plus the bound uniform alpha", async (t) => {
  const { captureMarkRows } = await import("../../src/lib/plot/utils/vectorExport/capture.js");
  for (const [name, value] of Object.entries({ GPUBufferUsage: { COPY_DST: 8, MAP_READ: 1 }, GPUMapMode: { READ: 1 } })) {
    const previous = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, { configurable: true, value });
    t.after(() => previous ? Object.defineProperty(globalThis, name, previous) : delete globalThis[name]);
  }
  let destroyed = 0;
  const opacity = np.array([0]), color = np.array([[0, 0, 1]]);
  const buffers = new Map(), device = {
    createBuffer: () => ({ mapAsync: async () => {}, getMappedRange() { return this.values.buffer; }, destroy: () => destroyed++ }),
    createCommandEncoder: () => ({ copyBufferToBuffer: (source, _offset, target) => { target.values = source.values.slice(); }, finish: () => ({}) }),
    queue: { submit() {} },
  };
  const field = (data, values, itemSize) => {
    const attribute = { itemSize, transition: {} }; buffers.set(attribute, { values: new Float32Array(values) });
    return { data, count: 1, isBufferNode: true, bufferNodeSource: attribute };
  };
  const mark = { exportKind: "points", count: 1, categoryColorActive: true,
    options: new Map([["opacity", 1]]), renderer: { backend: { device, get: attribute => ({ buffer: buffers.get(attribute) }) } },
    fields: new Map([["interactionOpacity", field(opacity, [0.75], 1)],
      ["categoryColor", field(color, [0.5, 0, 0.5, 0], 4)],
      ["_channelOpacity", { data: 0.2, isBufferNode: false, uniformNode: { value: 0.8 } }]]) };
  try {
    const rows = await captureMarkRows(mark);
    assert.equal(rows.opacityAt(0), 0.6);
    assert.equal(rows.colorAt(0), "#bc00bc");
    assert.equal(destroyed, 2);
    assert.deepEqual(opacity.ref.js(), [0]); assert.deepEqual(color.ref.js(), [[0, 0, 1]]);
  } finally { opacity.dispose(); color.dispose(); }
});

test("categorical point symbols retain SVG size, shape, color, and outlines", async () => {
  const options = new Map([
    ["coordinates", "cartesian"],
    ["xbounds", [-1, 1]], ["ybounds", [-1, 1]], ["zbounds", [-1, 1]],
    ["xrange", [-1, 1]], ["yrange", [-1, 1]], ["zrange", [-1, 1]],
    ["scaleBounds", [0, 1]], ["scaleRange", [0, 1]],
    ["shape", "circle"], ["outlineColor", "white"], ["outlineWidth", 0.72],
  ]);
  const position = np.array([[0, 0, 0]]), categoryColor = np.array([[0.2, 0.4, 0.6]]), symbolCode = np.array([2]);
  const mark = {
    exportKind: "points", visible: true, isPlotObject: true, count: 1,
    categoryColorActive: true, symbolCodeActive: true, options,
    fields: new Map([
      ["position", { data: position }], ["size", { data: 12 }],
      ["fill", { data: 0 }], ["categoryColor", { data: categoryColor }],
      ["symbolCode", { data: symbolCode }],
    ]),
  };
  const camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
  camera.position.z = 2; camera.updateMatrixWorld(); camera.updateProjectionMatrix();
  assert.equal(vectorCandidate(mark), "vector");
  const result = await vectorMark(mark, camera, 200, 100, 10);
  assert.equal(result.elements.length, 1);
  assert.equal(result.elements[0].attrs.stroke, "white");
  // As the shader: a band inside the glyph, outlineWidth CSS pixels wide (TODO 133.5), with the
  // stroke's outer edge on the glyph's edge (the path inset by half the band).
  assert.equal(result.elements[0].attrs["stroke-width"], 0.72);
  const xs = result.elements[0].attrs.d.match(/-?[\d.]+/g).map(Number).filter((_, i) => i % 2 === 0);
  assert.ok(Math.abs(Math.max(...xs) - Math.min(...xs) + 0.72 - 12) < 1e-6, "the stroked glyph spans the point's size");
  assert.match(result.elements[0].attrs.fill, /^#[0-9a-f]{6}$/);
  for (const value of [position, categoryColor, symbolCode]) value.dispose();
});

// TODO 70.1: a value's color on the host is the GPU's: the scale's arithmetic, then the nearest of
// the colormap texture's samples (the texture holds sampleColormap's row; quantized levels read
// their midpoints).
test("export colors match the GPU's colormap sampling: scale, space, stops, quantize", async () => {
  const { sampleColormap, colormapTexel, COLORMAP_SAMPLES } = await import("../../src/lib/plot/utils/colormap.js");
  const { colormapPosition, exportColors } = await import("../../src/lib/plot/utils/vectorExport.js");
  const hex = (value) => Math.round(value * 255).toString(16).padStart(2, "0");
  const texel = (spec, u) => {
    const row = sampleColormap(spec), i = Math.min(COLORMAP_SAMPLES - 1, Math.floor(Math.min(Math.max(u, 0), 1 - 1e-3) * COLORMAP_SAMPLES));
    return `#${[0, 1, 2].map((c) => hex(row[i * 4 + c])).join("")}`;
  };
  const custom = { colors: ["#ff0000", "#00ff00", "#0000ff"], space: "hsl", positions: [0, 0.8, 1] };
  for (const spec of ["Viridis", "Turbo", custom])
    for (const u of [-0.5, 0, 0.1234, 0.5, 0.79, 0.9, 1, 2]) assert.equal(colormapTexel(spec, u), texel(spec, u), `${JSON.stringify(spec)} at ${u}`);
  // A NaN reads as the map's end, as the shader's clamp gives it on an Apple GPU.
  assert.equal(colormapTexel("Viridis", NaN), texel("Viridis", 1));
  // Four levels: 0.3 reads level 1's midpoint.
  assert.equal(colormapTexel("Plasma", 0.3, { quantize: true, levels: 4 }), texel("Plasma", 0.375));
  // The scale as materials.js applyScale computes it.
  assert.equal(colormapPosition(5, { domain: [0, 10], range: [0.2, 0.8] }), 0.5);
  assert.equal(colormapPosition(0, { domain: [1, 100], transform: "log" }), null, "outside log's domain: not drawn");
  assert.ok(Math.abs(colormapPosition(10, { domain: [1, 100], transform: "log" }) - 0.5) < 1e-12);
  assert.deepEqual([-1, 0, 1.5, 3].map((v) => colormapPosition(v, { domain: [-1, 3], midpoint: 0 })), [0, 0.5, 0.75, 1]);
  assert.equal(colormapPosition(2, { domain: [2, 2] }), 0, "a zero span is kept off zero, as the shader keeps it");
  const options = new Map([["cmapIndex", custom], ["valueBounds", [0, 10]], ["valueRange", [0, 1]], ["valueTransform", "linear"],
    ["quantize", false], ["levels", 10]]);
  const values = np.array([0, 2.5, 10, NaN]), categories = np.array([[1, 0, 0], [0, 0, 1]]);
  const numeric = await exportColors({ options, fields: new Map([["fill", { data: values, type: { name: "fill" }, isBufferNode: true }]]) }, "fill");
  assert.deepEqual([0, 1, 2].map(numeric), [0, 0.25, 1].map((u) => texel(custom, u)));
  // TODO 73.3: a missing value is the missing color (the theme's default, else its scale's), not
  // the map's end.
  assert.equal(numeric(3), "#92989f");
  const own = await exportColors({ options: new Map([...options, ["valueMissing", "#ff00ff"]]), fields: new Map([["fill", { data: values, type: { name: "fill" }, isBufferNode: true }]]) }, "fill");
  assert.equal(own(3), "#ff00ff");
  const category = await exportColors({ options, categoryColorActive: true, fields: new Map([["categoryColor", { data: categories }]]) }, "fill");
  assert.deepEqual([0, 1].map(category), ["#ff0000", "#0000ff"]);
  values.dispose(); categories.dispose();
});

test("literal fill exports its current option binding without overriding mapped colors", async () => {
  const { exportColors } = await import("../../src/lib/plot/utils/vectorExport.js");
  const { colormapTexel } = await import("../../src/lib/plot/utils/colormap.js");
  const { channelScalar } = await import("../../src/lib/plot/utils/data.js");
  const field = { type: { name: "fill" }, data: "#4c78a8", isBufferNode: false },
    mark = { fields: new Map([["fill", field]]), options: new Map([["fillColor", "#ff0000"]]) },
    rows = np.array([0.5]), scalar = np.array(0.5), category = np.array([[0, 0, 1]]);
  try {
    assert.equal((await exportColors(mark, "fill"))(0), "#ff0000", "settings changed the drawn literal, not its last upload");
    field.data = "transparent";
    // FillType binds a color-only uniform; its black placeholder does not encode the hollow flag.
    field.uniformNode = { value: new Vector3(0, 0, 0) };
    assert.equal((await exportColors(mark, "fill"))(0), "transparent", "a hollow point keeps its transparent interior");
    field.data = "#4c78a8";
    mark.animatedOptionNodes = new Map([["fillColor", { value: [0, 1, 0] }]]);
    assert.equal((await exportColors(mark, "fill"))(0), "#00ff00", "capture the animated value being drawn");
    for (const mapped of [{ data: rows }, { data: scalar, deviceScalar: true }, { data: channelScalar(0.5), isChannelScalar: true }]) {
      mark.fields.set("fill", { ...field, ...mapped, isBufferNode: true });
      assert.equal((await exportColors(mark, "fill"))(0), colormapTexel("Viridis", 0.5));
    }
    mark.categoryColorActive = true;
    mark.fields.set("categoryColor", { data: category });
    assert.equal((await exportColors(mark, "fill"))(0), "#0000ff");
  } finally { rows.dispose(); scalar.dispose(); category.dispose(); }
});

// TODO 73.2 (70.3): a dash is measured in CSS pixels along the drawn path, as the GPU measures it
// (utils/dashDistances.js), whatever pixels a world unit is in x and y: a run is one path with one
// dash array, its phase in stroke-dashoffset; a row that does not continue the previous one starts
// its pattern over.
test("dashed strokes keep pixel patterns along paths and solid arrowheads", async () => {
  const options = new Map([
    ["coordinates", "cartesian"], ["curve", "linear"],
    ["xbounds", [0, 10]], ["xrange", [0, 100]], ["ybounds", [0, 10]], ["yrange", [0, 50]], ["zbounds", [-1, 1]], ["zrange", [-1, 1]],
    ["dashed", true], ["dashSize", 10], ["gapSize", 5],
  ]);
  // (0, 0) to (5, 0) is 50 world units and 100 px (2 px per world unit in x), to (5, 5) 25 world
  // units and 100 px (4 in y); the third row starts elsewhere.
  const start = np.array([[0, 0, 0], [5, 0, 0], [8, 8, 0]]), end = np.array([[5, 0, 0], [5, 5, 0], [9, 8, 0]]);
  const mark = { exportKind: "line", visible: true, isPlotObject: true, count: 3, widthLiteral: true, options,
    fields: new Map([["start", { data: start }], ["end", { data: end }], ["width", { data: 3 }], ["color", { data: "#123456" }]]) };
  const camera = new OrthographicCamera(0, 100, 50, 0, 0.1, 10);
  camera.position.z = 2; camera.updateMatrixWorld(); camera.updateProjectionMatrix();
  assert.equal(vectorCandidate(mark), "vector");
  const { elements } = await vectorMark(mark, camera, 200, 200, 100);
  const paths = elements.filter((element) => element.attrs["stroke-dasharray"]);
  assert.deepEqual(paths.map((path) => [path.attrs["stroke-dasharray"], path.attrs["stroke-dashoffset"], path.attrs["stroke-linecap"],
    path.attrs.d.match(/[ML]/g).length]), [["10 5", 0, "butt", 3], ["10 5", 0, "butt", 2]]);
  mark.exportKind = "billboard-arrows";
  const arrows = (await vectorMark(mark, camera, 200, 200, 100)).elements;
  assert.deepEqual(arrows.filter((element) => element.attrs.stroke).map((element) =>
    [element.attrs["stroke-dasharray"], element.attrs["stroke-dashoffset"], element.attrs["stroke-linecap"]]),
    Array(3).fill(["10 5", 0, "butt"]));
  const heads = arrows.filter((element) => element.attrs.fill === "#123456");
  assert.equal(heads.length, 3);
  assert.ok(heads.every((head) => !head.attrs["stroke-dasharray"]));
  for (const value of [start, end]) value.dispose();
});

test("root Cartesian Rects and ErrorBars stay vector although they carry curved-path refinement", () => {
  // Both refine through CurvedPaths in nested frames but have no curve option.
  const options = new Map([["coordinates", "cartesian"]]);
  for (const [exportKind, field] of [["prism", "fill"], ["errorbars", "color"]]) {
    const mark = { exportKind, visible: true, isPlotObject: true, count: 1, options,
      curvedPaths: {}, fields: new Map([[field, { data: "steelblue" }]]) };
    assert.equal(vectorCandidate(mark), "vector", exportKind);
    // A mark that does curve, without a vector form for it, still rasterizes.
    const curved = { ...mark, options: new Map([...options, ["curve", "natural"]]) };
    assert.equal(vectorCandidate(curved), "raster", exportKind);
  }
});

test("PDF fonts: every built-in theme's stacks resolve as svg2pdf would, sans-serif to the embedded default", async () => {
  const { themes } = await import("../../src/lib/plot/utils/themePresets.js");
  const { resolvePdfFont } = await import("../../src/lib/plot/utils/pdfFonts.js");
  const expected = { "Source Sans 3": [], Helvetica: [], Times: [], Courier: [] };
  for (const [name, theme] of Object.entries(themes))
    for (const stack of new Set([theme.typography?.fontFamily, theme.axes?.fontFamily, theme.guides?.fontFamily].filter(Boolean)))
      expected[resolvePdfFont(stack).name].push(name);
  // The default look (the themes that started with system-ui) embeds; Arial and Helvetica print as
  // Helvetica, serif stacks as Times, monospace as Courier; sans stacks of fonts jsPDF lacks embed.
  assert.deepEqual(Object.fromEntries(Object.entries(expected).map(([font, names]) => [font, names.sort()])), {
    "Source Sans 3": ["bauhaus", "colorblind", "dark", "ghibli", "graph", "hmplot", "ink", "minimal", "notebook", "observable", "pastel", "presentation", "sea", "sunset", "vaporwave", "yellowGlow"],
    Helvetica: ["538", "bureau", "ggplot", "graphingCalculator", "journal", "seabornDark"],
    Times: ["bubblegum", "paper", "spooky", "treasureMap", "tufte", "wesAnderson"],
    Courier: ["8bit", "blueprint", "financeTerminal", "risograph"],
  });
  assert.deepEqual(resolvePdfFont('"Source Sans 3", system-ui, sans-serif'),
    { font: "Source Sans 3", name: "Source Sans 3", embedded: true, requested: "Source Sans 3", substituted: false });
  assert.deepEqual(resolvePdfFont("Inter, system-ui, sans-serif"),
    { font: "Source Sans 3", name: "Source Sans 3", embedded: true, requested: "Inter", substituted: true });
  assert.deepEqual(resolvePdfFont("Arial, Helvetica, sans-serif"),
    { font: "helvetica", name: "Helvetica", embedded: false, requested: "Arial", substituted: true });
  // Asking for a generic family and getting a face of that kind is no substitution.
  assert.equal(resolvePdfFont("serif").substituted, false);
  assert.equal(resolvePdfFont("Helvetica").substituted, false);
});

test("PDF fonts: a stack without a generic family is sans-serif; weights and styles map to four faces", async () => {
  const { DEFAULT_FONT, parseFontStack, withGenericFamily } = await import("../../src/lib/plot/utils/defaultFont.js");
  const { resolvePdfFont, pdfFontStyle, subsetTag } = await import("../../src/lib/plot/utils/pdfFonts.js");
  assert.deepEqual(parseFontStack(`"Source Sans 3", 'Helvetica Neue',  Arial ,sans-serif`), ["Source Sans 3", "Helvetica Neue", "Arial", "sans-serif"]);
  assert.deepEqual(parseFontStack(""), []);
  assert.equal(withGenericFamily("Roboto"), "Roboto, sans-serif");
  assert.equal(withGenericFamily("Roboto, monospace"), "Roboto, monospace");
  assert.equal(withGenericFamily(""), DEFAULT_FONT);
  assert.equal(withGenericFamily(undefined), DEFAULT_FONT);
  // svg2pdf would print "Roboto" in Times; it prints in the embedded default font.
  assert.deepEqual(resolvePdfFont("Roboto"), { font: "Source Sans 3", name: "Source Sans 3", embedded: true, requested: "Roboto", substituted: true });
  assert.equal(resolvePdfFont("").font, "Source Sans 3");
  assert.equal(resolvePdfFont("").substituted, false);
  assert.deepEqual(
    [["400", "normal"], ["500", "normal"], ["600", "normal"], ["bold", "italic"], ["normal", "oblique 10deg"], ["lighter", "normal"], [undefined, undefined]].map(([w, s]) => pdfFontStyle(w, s)),
    ["normal", "normal", "bold", "bolditalic", "italic", "normal", "normal"]);
  const tag = subsetTag("SourceSans3-Regular", new Set("0123"));
  assert.match(tag, /^[A-Z]{6}$/);
  assert.equal(subsetTag("SourceSans3-Regular", new Set("3210")), tag);
  assert.notEqual(subsetTag("SourceSans3-Regular", new Set("01234")), tag);
  assert.notEqual(subsetTag("SourceSans3-Bold", new Set("0123")), tag);
});

test("PDF fonts: characters the font lacks are reported; the bundled font covers plot symbols", async () => {
  const { readFileSync } = await import("node:fs");
  const { jsPDF } = await import("jspdf");
  const { FONT_FACES } = await import("../../src/lib/plot/utils/defaultFont.js");
  const { missingCharacters, winAnsiCharacters, fontWarnings } = await import("../../src/lib/plot/utils/pdfFonts.js");
  const symbols = "°±×−µ·÷≤≥≈≠∞√′″→←↑↓…–—‰αβγδθλμπσφωΔΣΩ²³€";
  for (const face of Object.values(FONT_FACES)) {
    const font = jsPDF.API.TTFFont.open(new Uint8Array(readFileSync(new URL(`../../src/lib/fonts/source-sans-3/${face.file}`, import.meta.url))));
    const has = (code) => !!font.characterToGlyph(code);
    assert.deepEqual(missingCharacters(`${symbols} x`, has), [], face.file);
    assert.deepEqual(missingCharacters("25 ℃ ★", has), ["℃", "★"], face.file);
  }
  // The standard fonts print WinAnsi only: no minus sign (d3's negative ticks), no Greek.
  const winAnsi = winAnsiCharacters(), standard = (code) => winAnsi.has(code);
  assert.deepEqual(missingCharacters("−5 °C ± µ × € α", standard), ["−", "α"]);
  assert.equal(winAnsi.has(0x80), false);
  // jsPDF writes a string with such a character as UTF-16, garbling all of it: the pass prints
  // minus signs as hyphens and other such text in the embedded font (browser spec: the content).
  assert.deepEqual(fontWarnings({
    substitutions: [{ requested: "Inter", name: "Source Sans 3", embedded: true }, { requested: "Georgia", name: "Times", embedded: false }],
    fonts: [{ family: "Source Sans 3", style: "normal", embedded: true }, { family: "Times", style: "normal", embedded: false }, { family: "Times", style: "bold", embedded: false }],
    minus: ["Times"],
    fallbacks: [{ name: "Times", characters: ["α", "β"] }, { name: "Courier", characters: ["→"] }],
    missing: [{ name: "Source Sans 3", characters: ["★"] }, { name: "Source Sans 3", characters: ["℃", "★"] }],
  }), [
    "Font substitution: Inter → Source Sans 3 (embedded).",
    "Font substitution: Georgia → Times (not embedded).",
    "Times is not embedded; some journals require embedded fonts. The default font (Source Sans 3) is embedded.",
    'Times has no minus sign; "−" (U+2212) prints as a hyphen.',
    'Times cannot print "α" (U+03B1), "β" (U+03B2); text with them prints in Source Sans 3 (embedded).',
    'Courier cannot print "→" (U+2192); text with it prints in Source Sans 3 (embedded).',
    'Source Sans 3 has no glyph for "★" (U+2605); the PDF leaves it out.',
    'Source Sans 3 has no glyphs for "℃" (U+2103), "★" (U+2605); the PDF leaves them out.',
  ]);
  assert.deepEqual(fontWarnings({}), []);
});

test("an HTML page shows its snapshot first and keeps it without WebGPU", async () => {
  const { htmlPage, pageLayout, pageRuntime, snapshotMarkup } = await import("../../src/lib/scene/htmlPage.js");
  const json = '{"state":1}', bundle = 'globalThis.x = "</script>";';
  const svgPage = htmlPage({ title: 'A & "B"', json, bundle, snapshot: { kind: "svg", svg: '<?xml version="1.0"?>\n<svg viewBox="0 0 10 10"><text>t</text></svg>' } });
  assert.match(svgPage, /^<!doctype html><html lang="en">/);
  assert.match(svgPage, /<title>A &amp; &quot;B&quot;<\/title>/);
  // The label is the page's, beside the snapshot's SVG (user request 2026-10-02); a status says it.
  assert.match(svgPage, /<div id="hmplot-snapshot" role="img" aria-label="A &amp; &quot;B&quot;"><svg viewBox="0 0 10 10"><text>t<\/text><\/svg><span id="hmplot-label" aria-hidden="true"><i><\/i>Static preview<\/span><\/div><p id="hmplot-status" role="status">Static preview; loading the interactive plot<\/p>/);
  // Without WebGPU the label says so, short, and the status in full; there is no note below.
  assert.ok(svgPage.includes('label.lastChild.data="Static · no WebGPU";status.textContent="Static preview: this browser has no WebGPU";'));
  assert.ok(!svgPage.includes("hmplot-note"));
  // It takes the snapshot's colors: muted dark text on a light corner (white without one), light on a dark one.
  assert.ok(svgPage.includes("color:rgba(15, 23, 42, 0.6);background:rgb(255, 255, 255)"));
  const dark = htmlPage({ json, bundle, snapshot: { kind: "svg", svg: "<svg></svg>", corner: [17, 24, 39] } });
  assert.ok(dark.includes("color:rgba(255, 255, 255, 0.6);background:rgb(17, 24, 39)"));
  assert.match(svgPage, /<div id="hmplot-root" class="hmplot-loading"><\/div>/);
  assert.ok(svgPage.includes('globalThis.x = "<\\/script>";'), "the bundle cannot close its script");
  // The runtime's script is marked, so the runtime in the page reads its own source back (to
  // export the page again) without the page's code after it.
  const script = svgPage.match(/<script type="module" id="hmplot-runtime">([\s\S]*?)<\/script><\/body>/)[1];
  assert.equal(pageRuntime(script), 'globalThis.x = "<\\/script>";');
  assert.ok(svgPage.includes("if(!navigator.gpu)keep();"));
  assert.ok(!svgPage.includes("<?xml"));
  const pngPage = htmlPage({ title: "P", json, bundle, snapshot: { kind: "png", href: "data:image/png;base64,AAAA" } });
  assert.match(pngPage, /<div id="hmplot-snapshot" role="img" aria-label="P"><img src="data:image\/png;base64,AAAA" alt="P"><span id="hmplot-label"/);
  const bare = htmlPage({ json, bundle, snapshot: null });
  assert.ok(!bare.includes('<div id="hmplot-snapshot"') && !bare.includes('class="hmplot-loading"') && !bare.includes("hmplot-label"));
  assert.match(bare, /<title>HMPlot<\/title>/);
  assert.ok(bare.includes("A WebGPU-capable browser is required."));
  assert.equal(snapshotMarkup(null), "");
  // TODO 132.6: a margin and the content at most 960 px wide by default; page false is bare.
  assert.ok(bare.includes("body{--hmplot-margin:24px;position:relative;max-width:calc(960px + 2 * var(--hmplot-margin));margin:0 auto;"));
  const unbounded = htmlPage({ json, bundle, page: false });
  assert.ok(unbounded.includes("body{--hmplot-margin:0px;position:relative;padding:") && !unbounded.includes("max-width:calc"));
  assert.throws(() => pageLayout({ width: 800 }), /HTML export page must be true, false or \{ maxWidth, margin \}/);
  assert.throws(() => pageLayout({ constructor: 1 }), /HTML export page must be/);
  // A fixed-width plot wider than the maximum widens the page rather than being clipped.
  const wide = { kind: "Row", props: {}, children: [{ kind: "Plot", props: { width: 1200 }, children: [] }] };
  assert.deepEqual(pageLayout(true, wide), { maxWidth: 1200, margin: 24 });
  assert.deepEqual(pageLayout(false, wide), { maxWidth: null, margin: 0 });
});

// TODO 67.6: an export names marks by their component, never by their class, which a build
// minifies ("hdA was rasterized"); an internal object by its three.js type.
test("export messages and outcomes name marks by their component, not their minified class", async () => {
  const { buildPlotDocument, componentName } = await import("../../src/lib/plot/utils/documentExport.js");
  class hdA { static componentName = "Heatmap"; constructor() { this.material = {}; this.visible = true; this.type = "Mesh"; } }
  class M3e { constructor() { this.material = {}; this.visible = true; this.type = "Mesh"; } }
  const area = Object.assign(new M3e(), { componentName: "Area", exportKind: "band" });
  assert.deepEqual([new hdA(), new M3e(), area].map(componentName), ["Heatmap", "Mesh", "Area"]);
  const scene = { traverse: (visit) => [new hdA(), new M3e()].forEach(visit) };
  await assert.rejects(buildPlotDocument({ scene, camera: {}, exportImage: async () => null, logicalWidth: 10, logicalHeight: 10,
    options: { mode: "vector" } }), { message: 'Vector export does not yet support: Heatmap, Mesh. Use mode="auto".' });
});

// TODO 70.6: 2D marks in a 3D view. The export camera projects as the GPU does, perspective or
// orthographic, and cuts at the near and far planes.
test("a 3D view's export camera projects and cuts at the near and far planes, perspective or orthographic", async () => {
  const { PerspectiveCamera } = await import("three");
  const { viewCamera, clipDepth, clipPolygonDepth, depthRuns } = await import("../../src/lib/plot/utils/vectorExport.js");
  const perspective = new PerspectiveCamera(90, 2, 1, 100);
  perspective.position.set(0, 0, 10); perspective.lookAt(0, 0, 0); perspective.updateMatrixWorld(); perspective.updateProjectionMatrix();
  const cam = viewCamera(perspective, 400, 200), close = (a, b) => a.every((v, k) => Math.abs(v - b[k]) < 1e-9);
  // A 90 degree field of view: at a depth of 10, y = 10 is the top edge, x = 20 the right edge.
  assert.ok(close(cam.toScreen(cam.toView([20, 10, 0])), [400, 0]));
  assert.ok(close(cam.toScreen(cam.toView([0, 0, 0])), [200, 100]));
  assert.ok(close(cam.toView([1, 2, 3]), [1, 2, -7]));
  // A world unit spans 10 pixels at a depth of 10 (height 200 over 2 tan 45 x 10), more nearer.
  assert.ok(Math.abs(cam.pixelsPerWorld(10) - 10) < 1e-9 && Math.abs(cam.pixelsPerWorld(5) - 20) < 1e-9);
  // From behind the camera (z = 20) to in front (z = 0): cut where the depth is the near plane's.
  assert.deepEqual(clipDepth([0, 0, 10], [0, 0, -10], 1, 100), [0.55, 1]);
  assert.deepEqual(clipDepth([0, 0, -50], [0, 0, -150], 1, 100), [0, 0.5]);
  assert.equal(clipDepth([0, 0, 5], [0, 0, 1], 1, 100), null);
  const [run] = depthRuns([[2, 0, 20], [2, 0, 0], [4, 0, 0]], cam);
  assert.deepEqual(run.cut, [true, false]);
  assert.ok(close(run.vertices[0].world, [2, 0, 9]) && Math.abs(run.vertices[0].depth - 1) < 1e-9);
  assert.ok(close(run.vertices[0].pixel, [400, 100]), "x 2 at a depth of 1 is the right edge");
  // A triangle across the near plane keeps its part in front.
  const cut = clipPolygonDepth([[0, 0, 5], [1, 0, -5], [-1, 0, -5]], 1, 100);
  assert.equal(cut.length, 4);
  assert.ok(cut.every((point) => -point[2] >= 1 - 1e-12));
  // Orthographic: no perspective division; a world unit spans the same pixels at any depth.
  const orthographic = new OrthographicCamera(-20, 20, 10, -10, 1, 100);
  orthographic.position.set(0, 0, 10); orthographic.updateMatrixWorld(); orthographic.updateProjectionMatrix();
  const flat = viewCamera(orthographic, 400, 200);
  assert.ok(close(flat.toScreen(flat.toView([20, 10, -50])), [400, 0]) && close(flat.toScreen(flat.toView([20, 10, 5])), [400, 0]));
  assert.equal(flat.pixelsPerWorld(5), flat.pixelsPerWorld(80));
  assert.ok(close(depthRuns([[0, 0, 20], [0, 0, 0]], flat)[0].vertices[0].world, [0, 0, 9]));
});

// TODO 70.6: which marks a 3D view can draw as vectors; any other keeps the whole view one image.
test("a 3D view exports as vectors only 2D marks, unlit, in a Cartesian frame", async () => {
  const { view3DIssue, view3DKind } = await import("../../src/lib/plot/utils/vectorExport.js");
  const { createViewMarks, emptyBinding } = await import("../../src/lib/plot/utils/markBinding.js");
  const marks = createViewMarks();
  const mark = (exportKind, { compoundKind, ...extra } = {}, options = {}) => {
    const object = { exportKind, isPlotObject: true, visible: true, count: 1, view: { marks },
      options: Object.assign(new Map(Object.entries({ coordinates: "cartesian", ...options })),
        { viewContext: { mode: "3d" } }), ...extra };
    // A compound's primitive (a Bar's Prism) says so in its accepted binding.
    if (compoundKind) marks.publish(object, emptyBinding({ compound: compoundKind }));
    return object;
  };
  for (const kind of ["points", "labels", "line", "segments", "billboard-arrows", "errorbars", "band", "triangles"])
    assert.equal(view3DKind(mark(kind)), "vector", kind);
  assert.equal(view3DIssue(mark("prism", { componentName: "Rect" }, { flat: true })), null);
  assert.equal(view3DIssue(mark("prism", { componentName: "Rect" }, { flat: false })), "is a 3D mark");
  // A Prism written as such is a 3D mark, flat or not; a Bar's or a BoxPlot's flat box is not.
  assert.equal(view3DIssue(mark("prism", { componentName: "Prism" }, { flat: true })), "is a 3D mark");
  assert.equal(view3DIssue(mark("prism", { componentName: "Prism", compoundKind: "Bar" }, { flat: true })), null);
  assert.equal(view3DIssue(mark("prism", { componentName: "Prism", compoundKind: "BoxPlot" }, { flat: true })), null);
  assert.equal(view3DIssue(mark("prism", { componentName: "Prism" }, { flat: false })), "is a 3D mark");
  assert.equal(view3DIssue(mark("raster", { componentName: "Points3D" })), "is a 3D mark");
  assert.equal(view3DIssue(mark("solid-arrows", { componentName: "Arrows3D" })), "is a 3D mark");
  assert.equal(view3DIssue(mark("raster", { componentName: "Heatmap" })), "has no vector form");
  assert.equal(view3DIssue({ ...mark("raster"), isPlotObject: false, isGuideText: true }), "is a 3D mark", "Text3D");
  assert.equal(view3DIssue(mark("points", {}, { lit: true })), "is lit");
  assert.equal(view3DIssue(mark("points", {}, { depthWrite: false })), "disables depth writes, requiring the rendered draw order");
  assert.equal(view3DIssue(mark("points", {}, { depthWrite: true })), null);
  assert.equal(view3DIssue(mark("points", { surface: {} })), "lies on a surface");
  assert.equal(view3DIssue(mark("points", {}, { blend: "additive" })), "uses additive blending, which has no vector form");
  assert.equal(view3DIssue(mark("line", {}, { coordinates: "spherical" })), "is in a polar or spherical frame");
  assert.equal(view3DKind(mark("raster", { componentName: "Points3D", count: 0 })), "empty");
  assert.equal(view3DKind(mark("raster", { componentName: "Points3D" }, { visible: false })), "empty");
});

// TODO 70.6: every primitive of a 3D view's marks in one painter's order. Seen obliquely from
// (0, -8, 8), so depths vary across the plane z = 0: a Polygon on it, a Line on it (one plane:
// drawn after the Polygon where they overlap, as the GPU's drawing order has it), a point beyond
// the plane and one in front of it, a Segments row from beyond the plane through it (its far part
// before the Polygon, its near part after), and a row from behind the camera (cut at the near
// plane; its pieces outside the view left out).
test("2D marks in a 3D view sort back to front together; one plane keeps their drawing order", async () => {
  const { PerspectiveCamera } = await import("three");
  const { view3DVectors } = await import("../../src/lib/plot/utils/vectorExport.js");
  const camera = new PerspectiveCamera(90, 1, 1, 100);
  camera.position.set(0, -8, 8); camera.lookAt(0, 0, 0); camera.updateMatrixWorld(); camera.updateProjectionMatrix();
  const options = (extra = {}) => Object.assign(new Map(Object.entries({ coordinates: "cartesian",
    xbounds: [-1, 1], xrange: [-1, 1], ybounds: [-1, 1], yrange: [-1, 1], zbounds: [-1, 1], zrange: [-1, 1],
    scaleBounds: [0, 1], scaleRange: [0, 1], shape: "circle", ...extra })), { viewContext: { mode: "3d" } });
  const arrays = [], array = (value) => { const a = np.array(value); arrays.push(a); return a; };
  const polygon = { exportKind: "triangles", isPlotObject: true, visible: true, count: 1, options: options(),
    fields: new Map([["position", { data: array([[-6, -6, 0]]) }], ["cornerB", { data: array([[6, -6, 0]]) }],
      ["cornerC", { data: array([[0, 6, 0]]) }], ["edges", { data: array([0]) }], ["fill", { data: "#0000ff" }]]) };
  const stroke = (start, end, color) => ({ exportKind: "segments", isPlotObject: true, visible: true, count: start.length,
    widthLiteral: true, options: options({ curve: "linear" }),
    fields: new Map([["start", { data: array(start) }], ["end", { data: array(end) }], ["width", { data: 2 }], ["color", { data: color }]]) });
  const line = { ...stroke([[-3, 0, 0], [3, 0, 0]], [[3, 0, 0], [3, 3, 0]], "#ff0000"), exportKind: "line" };
  const points = { exportKind: "points", isPlotObject: true, visible: true, count: 2, options: options(),
    fields: new Map([["position", { data: array([[1, 1, -2], [-1, 1, 2]]) }], ["size", { data: 6 }], ["fill", { data: "#00ff00" }]]) };
  const through = stroke([[0, -3, -4]], [[0, -3, 4]], "#ff00ff"), behind = stroke([[5, 0, 20]], [[5, 0, 0]], "#00ffff");
  const { elements } = await view3DVectors([polygon, line, points, through, behind], camera, 200, 200, 1000);
  const colorOf = (element) => element.attrs.stroke && element.attrs.fill === "none" ? element.attrs.stroke : element.attrs.fill;
  // Each element's boxes: a fill's triangles, a stroke's segments (out to half its width), a circle.
  const boxesOf = (element) => {
    if (element.type === "circle") { const [x, y, r] = ["cx", "cy", "r"].map((key) => Number(element.attrs[key])); return [[x - r, y - r, x + r, y + r]]; }
    const pad = element.attrs.fill === "none" ? Number(element.attrs["stroke-width"]) / 2 : 0;
    return element.attrs.d.split("M").filter(Boolean).flatMap((part) => {
      const n = part.match(/-?[\d.]+(?:e-?\d+)?/g).map(Number), points = n.flatMap((_, k) => k % 2 ? [] : [[n[k], n[k + 1]]]);
      const box = (list) => [Math.min(...list.map((p) => p[0])) - pad, Math.min(...list.map((p) => p[1])) - pad,
        Math.max(...list.map((p) => p[0])) + pad, Math.max(...list.map((p) => p[1])) + pad];
      return pad ? points.slice(1).map((point, k) => box([points[k], point])) : [box(points)];
    });
  };
  const boxes = elements.map(boxesOf), hit = (a, b) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3],
    overlap = (i, j) => boxes[i].some((a) => boxes[j].some((b) => hit(a, b)));
  const indices = (color, test = () => true) => elements.flatMap((element, k) => colorOf(element) === color && test(element) ? [k] : []);
  // Each element of `front` that overlaps one of `back` comes after it; `count` pairs at least.
  const after = (front, back, count = 1) => {
    let pairs = 0;
    for (const i of front) for (const j of back) if (overlap(i, j)) { pairs++; assert.ok(i > j, `${elements[i].attrs.d ?? i} after ${j}`); }
    assert.ok(pairs >= count, `${pairs} overlapping pairs`);
  };
  const blue = indices("#0000ff"), red = indices("#ff0000");
  after(red, blue);
  const [far, near] = [(element) => element.type === "circle" && Number(element.attrs.cx) > 100, (element) => element.type === "circle" && Number(element.attrs.cx) < 100];
  after(blue, indices("#00ff00", far));
  after(indices("#00ff00", near), blue);
  // The row through the plane: some of it before the Polygon pieces it overlaps, some after.
  const magenta = indices("#ff00ff");
  assert.ok(magenta.some((i) => blue.some((j) => overlap(i, j) && i < j)) && magenta.some((i) => blue.some((j) => overlap(i, j) && i > j)));
  // The row from behind the camera stays in and near the view, and ends at (5, 0, 0): 5 right of
  // the view's axis at a depth of 16 / sqrt 2.
  const cyan = elements.filter((element) => colorOf(element) === "#00ffff").flatMap((element) => element.attrs.d.match(/-?[\d.]+(?:e-?\d+)?/g)).map(Number);
  assert.ok(cyan.length && cyan.every((value) => value > -20 && value < 220), JSON.stringify(cyan));
  assert.ok(cyan.some((value) => Math.abs(value - (100 + 100 * 5 / (16 / Math.SQRT2))) < 1e-6));
  for (const value of arrays) value.dispose();
});
