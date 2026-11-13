// TODO 130.4: a chart is one file over public components. It imports only the definition helpers,
// mounts only registry components, and nothing in the library reaches into the charts but the
// package's exports and the component loaders.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import registry from "../../src/lib/scene/registry.json" with { type: "json" };
import core from "../../src/lib/scene/options.json" with { type: "json" };
import { optionsTable } from "../../src/lib/scene/options.js";
import { defineChart, node, option, rest } from "../../src/lib/templates/define.js";
import { definitionKinds } from "../../src/lib/templates/instantiate.js";
import { chartEntries, chartTypes, loadCharts } from "../../scripts/charts.mjs";

const root = fileURLToPath(new URL("../..", import.meta.url));
// Every module a file names: static imports and re-exports, side-effect imports, dynamic imports.
const imports = (text) =>
  [...text.matchAll(/(?:^|\n)\s*(?:import|export)[^;'"]*?from\s*["']([^"']+)["']|(?:^|\n)\s*import\s*["']([^"']+)["']|\bimport\(\s*["']([^"']+)["']/g)]
    .map((match) => match[1] ?? match[2] ?? match[3]);
// What breaks the boundary in one chart file.
function boundaryProblems(file, text, definition) {
  const problems = imports(text).filter((from) => from !== "../templates/define.js").map((from) => `${file} imports ${from}`);
  for (const kind of definitionKinds(definition))
    if (!registry.components[kind]?.module || ["Scene", "Template", "Slot"].includes(kind)) problems.push(`${file}: ${kind} is not a public component`);
  return problems;
}
const charts = await loadCharts(root);
const demo = { kind: "Demo", summary: "A demo.", params: { y: option("channel", "The y.") }, root: node("Points", { ...rest() }) };

test("each chart imports only the definition helpers and mounts only public components", () => {
  assert.ok(charts.length > 0);
  for (const { file, definition } of charts)
    assert.deepEqual(boundaryProblems(file, readFileSync(`${root}/src/lib/charts/${file}`, "utf8"), definition), []);
  // The check fails on a core import, of any form, and on an internal kind.
  const text = 'import { defineChart } from "../templates/define.js";\nimport "../plot/utils/data.js";\nexport { a } from "../scene/runtime.svelte.js";\nconst b = import("../plot/x.js");';
  const definition = defineChart({ ...demo, root: node("Mapping", {}, [node("Scene"), node("TooltipOverlay"), node("Points", { ...rest() })]) });
  assert.deepEqual(boundaryProblems("demo.js", text, definition), ["demo.js imports ../plot/utils/data.js", "demo.js imports ../scene/runtime.svelte.js",
    "demo.js imports ../plot/x.js", "demo.js: Scene is not a public component", "demo.js: TooltipOverlay is not a public component"]);
});

test("only the package's exports and the component loaders import the charts", () => {
  const library = `${root}/src/lib`;
  const reaching = readdirSync(library, { recursive: true })
    .filter((path) => /\.(js|ts|svelte)$/.test(path) && !path.startsWith("charts/"))
    .filter((path) => imports(readFileSync(`${library}/${path}`, "utf8")).some((from) => /(^|\/)charts\//.test(from)));
  assert.deepEqual(reaching.sort(), ["scene/components.js"]);
});

test("defineChart and the generator name what a chart gets wrong", () => {
  assert.equal(defineChart(demo).chart.options.y.type, "channel");
  const needed = defineChart({ ...demo, params: { y: option("channel", "The categories.", { required: true }) } });
  assert.deepEqual(needed.required, { y: "Demo needs y: the categories." });
  assert.equal(needed.chart.options.y.required, undefined);
  assert.throws(() => defineChart({ ...demo, summary: "" }), /Demo: a chart needs a summary/);
  assert.throws(() => defineChart({ ...demo, theme: {} }), /Demo: a chart takes .*, not theme/);
  assert.throws(() => defineChart({ ...demo, params: { _y: option("channel", "The y.") } }), /Demo: .*_y is private/);
  assert.throws(() => defineChart({ ...demo, params: { y: "a" } }), /Demo: params\.y needs option\(type, doc\)/);
  const chart = (definition) => [{ file: "demo.js", definition }];
  assert.throws(() => chartEntries(chart(defineChart({ ...demo, kind: "Points" })), core), /demo\.js: Points is already a component/);
  assert.throws(() => chartEntries(chart(defineChart({ ...demo, kind: "Bar" })), optionsTable), /demo\.js: Bar is already a component .*built-in template/);
  assert.throws(() => chartTypes(chart(defineChart({ ...demo, params: { y: option("Date", "The y.") } })), () => []),
    /demo\.js: Demo\.y: option type "Date" has no TypeScript form/);
});
