import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { apiEntries } from "../../src/routes/examples/api.js";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const COMPOUND = ["Histogram", "Violin", "BoxPlot", "Swarm", "Bar", "Lollipop", "Pie", "RuleX", "RuleY", "Crosshair", "Callout", "Smooth", "Ecdf", "DensityContour", "DensityBands", "ErrorBars", "Arrows"];
// The whole authoring surface, spelled out: adding to composition.js means adding here (and to
// the table in docs/USAGE.md).
const SURFACE = [
  "Transform", "DataBoundary", "ThemeDefaults", "Undescribed", "getOptionsContext", "setOptionsContext",
  "DATA_CONTEXT", "axisCategory", "categoryColumn", "categoryField", "IntegerType", "SelectType", "FieldType",
  "minimum", "maximum", "greater", "isAnimate", "ENDPOINT_COMPOUND_CONTEXT", "endpointDescriptor", "AXIS_NAMES_CONTEXT", "channelTitle",
  "Rect", "Area", "Points", "Anchor", "Prism", "ErrorBars", "Segments", "Line", "Text", "Frame", "VIEW_CONTEXT",
  "Density", "Dodge", "DODGE_AXIS_CONTEXT",
  // TODO 47: the statistics transforms Smooth wraps (Ecdf runs the internal ECDF kind, TODO 137.3).
  "Regression", "Contour", "Polygon", "Filter",
  // TODO 41.5: a compound mark resolves input reads in the props it reads itself.
  "INPUT_CONTEXT", "InputPending", "resolveInput",
  // TODO 45: rules and the pointer in the enclosing frame.
  "framePointer", "planeRule",
  // TODO 130.3: ErrorBars' wrapper reads a Mapping's positions for its composed ends.
  "MAPPING_CONTEXT",
];

test("compound marks live in src/lib/compound and the registry points there", () => {
  const registry = JSON.parse(read("../../src/lib/scene/registry.json"));
  for (const name of COMPOUND)
    assert.equal(registry.components[name].module, `./compound/${name[0].toLowerCase()}${name.slice(1)}.svelte`, name);
  // Public compound props come from the declared API, not internal settings names.
  for (const key of ["bins", "normalization"]) assert.ok(registry.components.Histogram.properties.includes(key), key);
  for (const key of ["histogramBins", "histogramNormalization"]) assert.ok(!registry.properties.includes(key), key);
  // The mark set the signature generator writes is what Python's mark lists read (10.9 A5).
  for (const name of COMPOUND) assert.ok(registry.marks.includes(name), `${name} in registry.marks`);
});

test("the charts barrel exports compound components and the compatibility subpath keeps its legacy names", () => {
  const index = read("../../src/lib/charts/index.ts"), root = read("../../src/lib/index.ts"), barrel = read("../../src/lib/compound/index.ts");
  const files = readdirSync(new URL("../../src/lib/compound/", import.meta.url)).filter((file) => file.endsWith(".svelte"));
  assert.deepEqual(files.sort(), COMPOUND.map((name) => `${name[0].toLowerCase()}${name.slice(1)}.svelte`).sort());
  for (const name of COMPOUND) {
    const file = `${name[0].toLowerCase()}${name.slice(1)}.svelte`;
    assert.ok(index.includes(`export { default as ${name} } from "../compound/${file}";`), `charts ${name}`);
    assert.ok(!root.includes(`export { default as ${name} }`), `${name} stays out of the core barrel`);
    // Arrows joined charts after the compatibility entry was frozen; do not grow that alias API.
    if (name !== "Arrows")
      assert.ok(barrel.includes(`export { default as ${name} } from "./${file}";`), `subpath ${name}`);
  }
  assert.ok(barrel.includes('export * as composition from "../plot/composition.js";'));
});

test("compound marks only use the documented composition surface", () => {
  const exported = [...read("../../src/lib/plot/composition.js").matchAll(/export\s+\{([^}]+)\}\s+from/g)]
    .flatMap((match) => match[1].split(",").map((part) => part.trim().split(/\s+as\s+/).pop()).filter(Boolean));
  assert.deepEqual([...exported].sort(), [...SURFACE].sort());
  const surface = new Set(exported);
  // Every .svelte file in the directory, not a fixed list, so a new mark is checked too.
  const directory = new URL("../../src/lib/compound/", import.meta.url);
  for (const file of readdirSync(directory).filter((file) => file.endsWith(".svelte"))) {
    const source = readFileSync(new URL(file, directory), "utf8");
    // Static imports with either quote, and dynamic import() calls.
    const froms = [...source.matchAll(/\bfrom\s*(['"])([^'"]+)\1/g)].map((match) => match[2]);
    const dynamic = [...source.matchAll(/\bimport\s*\(\s*(['"])([^'"]+)\1/g)].map((match) => match[2]);
    for (const from of [...froms, ...dynamic]) {
      if (from === "svelte") continue;
      // A mark that is a template (TODO 130.2) imports its definition and the host.
      if (from === "../templates/TemplateHost.svelte" || from === `./${file.replace(".svelte", ".js")}`) continue;
      // DensityContour's deprecated mode="bands" draws a DensityBands (TODO 130.3).
      if (file === "densityContour.svelte" && from === "./densityBands.svelte") continue;
      assert.ok(from === "../plot/composition.js" || from === "../plot/publicTypes.js",
        `${file} imports ${from}; compound marks may only import the composition surface`);
    }
    for (const match of source.matchAll(/\bimport\s+(?:type\s+)?(?:(\w+)\s*,\s*)?(?:\{([^}]+)\})?\s*(\w+)?\s*from\s*(['"])\.\.\/plot\/composition\.js\4/g)) {
      const [, defaultBefore, named, defaultAfter] = match;
      assert.ok(!defaultBefore && !defaultAfter, `${file}: composition.js has no default export`);
      for (const item of (named ?? "").split(",").map((part) => part.trim()).filter(Boolean))
        assert.ok(surface.has(item.split(/\s+as\s+/)[0]), `${file}: ${item} is not exported by composition.js`);
    }
  }
});

test("the docs' compound mark example is the rendered fixture with the package import", () => {
  const fixture = read("../../src/routes/test/lollipop/CustomLollipop.svelte").replace('"$lib/compound"', '"hmplot/compound"').trim();
  const usage = read("../../docs/USAGE.md");
  assert.ok(usage.includes("```svelte\n" + fixture + "\n```"), "docs/USAGE.md shows CustomLollipop.svelte verbatim");
  for (const name of SURFACE) assert.ok(usage.includes(`\`${name}\``), `USAGE table lists ${name}`);
});

test("every chart's reference page points at hmplot/charts", () => {
  for (const name of COMPOUND) {
    const entry = apiEntries.find((entry) => entry.component === name && !entry.hidden);
    assert.ok(entry, `${name} has a page`);
    assert.ok(read(`../../src/routes/content/reference/${entry.id}.svx`).includes("hmplot/charts"), `${name}'s page mentions hmplot/charts`);
  }
});

test("package.json exports the compound subpath", () => {
  const pkg = JSON.parse(read("../../package.json"));
  assert.deepEqual(pkg.exports["./compound"], { types: "./dist/compound/index.d.ts", svelte: "./dist/compound/index.js" });
});
