import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { compile } from "svelte/compiler";
import registry from "../../src/lib/scene/registry.json" with { type: "json" };
import { apiEntries, apiGroups, referencePage } from "../../src/routes/examples/api.js";
import { guideSections } from "../../src/routes/examples/guide.js";
import { curatedExamples, curatedIds, homeExamples, homeIds } from "../../src/routes/examples/docsManifest.js";
import { examples } from "../../src/routes/examples/catalog.js";
import ts from "typescript";
import { componentOptions, componentTakes, optionGroups, optionsTable, takes } from "../../src/lib/scene/options.js";
import { SNAPSHOT_KINDS } from "../../src/lib/scene/htmlPage.js";
import { OptionsNode } from "../../src/lib/options/options.js";
import * as settingsRegistry from "../../src/lib/plot/objects/defaultOptions.js";

// The props types: publicTypes.ts, and those generated from the built-in templates' signatures
// (TODO 130.5) and the charts' definitions (130.4).
const propsFiles = ["../../src/lib/check.ts", "../../src/lib/plot/publicTypes.ts", "../../src/lib/compound/generated/types.ts", "../../src/lib/charts/generated/types.ts", "../../src/lib/plugins/generated/types.ts"];

test("each component has one reference page, which opens with its example as two programs (R2.0b.2)", () => {
  for (const component of Object.keys(registry.components)) {
    const pages = apiEntries.filter((entry) => entry.component === component && !entry.hidden);
    assert.equal(pages.length, 1, `${component} has ${pages.length} reference pages`);
    const id = `${pages[0].id}-basic`, file = (extension) => new URL(`../../src/examples/${id}/${id}.${extension}`, import.meta.url);
    // Python runs them (python/tests/test_api_consistency.py); the Svelte file must compile and
    // import from the package, as a user's would.
    if (componentTakes(component, "python")) assert.ok(existsSync(file("py")), `${id}.py`);
    else assert.ok(!existsSync(file("py")), `${component} is JavaScript only`);
    if (!componentTakes(component, "js")) assert.ok(!existsSync(file("svelte")), `${component} is Python's only`);
    else {
      const source = readFileSync(file("svelte"), "utf8");
      assert.match(source, /from "hmplot(?:\/charts|\/stats)?"/, id);
      compile(source, { filename: `${id}.svelte`, generate: "client" });
    }
  }
});

test("Plot and Frame replace View across the public scene and Python surfaces", () => {
  assert.ok(registry.components.Plot && registry.components.Frame);
  assert.ok(!Object.hasOwn(registry.components, "View"));
  assert.ok(!apiEntries.some((entry) => entry.title === "View"));
  const stub = readFileSync(new URL("../../python/hmplot/__init__.pyi", import.meta.url), "utf8");
  assert.ok(!/^class View\(/m.test(stub));
});

test("guide Markdown owns navigation and complete paired examples (R2.0b.6)", async () => {
  const { parsePage, referenceLink, docsComponents, remarkDocs } = await import("../../scripts/docs-pages.mjs");
  const { compile: markdown } = await import("mdsvex");
  for (const section of guideSections) {
    const source = readFileSync(new URL(`../../${section.file}`,import.meta.url),"utf8");
    const page = await parsePage(source,section.file);
    assert.equal(page.title,section.title);
    assert.deepEqual(page.examples.map(e=>e.id),section.examples);
    const injected = docsComponents.markup({content:source,filename:section.file})?.code ?? source;
    const result = await markdown(injected,{filename:section.file,extensions:[".svx",".md"],remarkPlugins:[remarkDocs]});
    compile(result.code,{filename:section.file,generate:"client"});
    if (["introduction","tutorial"].includes(page.section)) assert.equal(page.examples.length,0);
    for (const example of page.examples) {
      for (const [ext,key] of [["py","python"],["svelte","svelte"]])
        assert.equal(readFileSync(new URL(`../../src/examples/${example.id}/${example.id}.${ext}`,import.meta.url),"utf8"),example[key]);
    }
  }
  const linked = await markdown("Use [Plot] and [hm.slot].", {filename:"src/routes/content/guide/test.svx",remarkPlugins:[remarkDocs]});
  assert.match(linked.code,/href="\/reference\/svelte\/plot"/);
  // Headings get ids from their text, which links' fragments name (the prerender checks them, TODO 68.1).
  const headed = await markdown("## Axis titles\n\n## Axis titles\n", {filename:"src/routes/content/reference/frame.svx",remarkPlugins:[remarkDocs]});
  assert.match(headed.code,/<h2 id="axis-titles">Axis titles<\/h2>[\s\S]*<h2 id="axis-titles-1">/);
  assert.match(linked.code,/href="\/reference\/python\/slot"/);
  assert.equal(referenceLink("Points"),"/reference/svelte/points");
  assert.equal(referenceLink("hm.visualize_tree"),"/reference/python/visualize-tree");
  const header = "---\ntitle: Test\nsection: guides\norder: 1\n---\n\n";
  await assert.rejects(parsePage(header+'```python example\nprint(1)\n```\n',"src/routes/content/guide/check.md"),/check.md:7:.*following svelte/);
  await assert.rejects(parsePage(header+'[NotAnAPI]\n',"src/routes/content/guide/check.md"),/check.md:7:.*Unknown API/);
  const ordinary = await parsePage(header+'```python\nprint(1)\n```\n',"src/routes/content/guide/check.md");
  assert.equal(ordinary.examples.length,0);
});

test("the reference is one page per public name, grouped by task; moved pages render their new one", () => {
  const page = (id) => new URL(`../../src/routes/content/reference/${id}.svx`, import.meta.url);
  const ids = apiEntries.map((entry) => entry.id);
  assert.deepEqual(ids.filter((id, index) => ids.indexOf(id) !== index), [], "reference ids are unique");
  const gallery = new Set(examples.map((example) => example.id));
  for (const entry of apiEntries) {
    assert.ok(apiGroups.includes(entry.group), `${entry.id}: ${entry.group}`);
    assert.ok(entry.summary, `${entry.id} has a summary`);
    assert.ok(existsSync(page(referencePage(entry.id))), `${entry.id} has no page`);
    // An old id's page is its new one; a file of its own would be a copy that drifts.
    if (entry.aliasOf) assert.ok(!existsSync(page(entry.id)), `${entry.id}.svx duplicates ${entry.aliasOf}.svx`);
    for (const id of entry.examples) assert.ok(gallery.has(id), `${entry.id}: no gallery example ${id}`);
  }
  const pages = readdirSync(new URL("../../src/routes/content/reference", import.meta.url)).filter((file) => file.endsWith(".svx"));
  for (const file of pages) assert.ok(apiEntries.some((entry) => !entry.aliasOf && `${entry.id}.svx` === file), `${file} is no page's`);
  const docsPage = readFileSync(new URL("../../src/lib/docs/DocsPage.svelte", import.meta.url), "utf8");
  assert.ok(!docsPage.includes("<iframe"));
  assert.equal(curatedExamples.length, curatedIds.length, "every curated id resolves to a catalog example");
  assert.equal(homeExamples.length, homeIds.length, "every home page gallery id resolves to a catalog example");
});

test("the options table lists every option a component accepts, and none it ignores (R2.0b.1)", () => {
  // What a component accepts (R2.0b.0):
  // - its props: the named members of its TypeScript props type (publicTypes.ts: <Name>Props, or
  //   the table's `props`), which is what svelte-check lets a Svelte caller pass;
  // - when its Svelte file destructures every prop it takes ($props() with no rest element),
  //   exactly the names it destructures;
  // - its settings (`setting: true`), which it passes on to its options node: each must be a name
  //   the settings registry defines (objects/defaultOptions.js, run here) or that the library
  //   names in a string. Settings are declared by the table alone: the settings pane shows other
  //   registered names too, and which of them a mark uses is in its own display list (TODO 40.4);
  // - Python-only options (languages: "python"): the layout components and the keywords the
  //   Python package takes itself (filename, a Table's schema); pytest checks the stubs against
  //   what Python accepts, and both come from this table.
  // A channel's scale options (fillScale, colormap, ...) need the channel: without it they do
  // nothing.
  const problems = [];
  const files = propsFiles.map((path) => fileURLToPath(new URL(path, import.meta.url)));
  const program = ts.createProgram(files, { skipLibCheck: true, target: ts.ScriptTarget.ESNext });
  const checker = program.getTypeChecker();
  const declarations = new Map(files.flatMap((file) => program.getSourceFile(file).statements.filter((s) => s.name).map((s) => [s.name.text, s])));
  const defined = new Set();
  for (const [name, ensure] of Object.entries(settingsRegistry)) {
    if (!/^ensure\w+Options$/.test(name)) continue;
    const node = new OptionsNode();
    for (const key of [...ensure(node), ...node.values.keys()]) defined.add(key);
  }
  const library = readdirSync(fileURLToPath(new URL("../../src/lib", import.meta.url)), { recursive: true })
    .filter((path) => /\.(js|ts|svelte)$/.test(path) && !propsFiles.some((file) => file.endsWith(`/${path}`)))
    .map((path) => readFileSync(new URL(`../../src/lib/${path}`, import.meta.url), "utf8")).join("\n");
  // The scene runtime passes these to inputs (SceneNode.svelte); callers never do.
  const passed = new Set(["inputOwner", "store", "onplayingchange"]);
  const named = (name) => defined.has(name) || library.includes(`"${name}"`) || library.includes(`'${name}'`);
  const scaled = { fill: /^fill(Scale|Domain|Range|Transform)$/, color: /^color(Scale|Domain|Range|Transform)$/,
    size: /^size(Scale|Domain|Range|Transform)$/, width: /^width(Scale|Domain|Range|Transform)$/,
    shape: /^shapeScale$/, opacity: /^opacityScale$/, outlineColor: /^outlineColorScale$/ };
  assert.deepEqual(Object.keys(optionsTable.components).sort(), Object.keys(registry.components).sort());
  for (const [kind, component] of Object.entries(optionsTable.components)) {
    const options = componentOptions(kind);
    if (!optionGroups.includes(component.group)) problems.push(`${kind}: group ${component.group} is not one of the groups`);
    for (const option of options)
      if (!option.type || !option.doc) problems.push(`${kind}.${option.name}: needs a type and a sentence`);
    const names = new Set(options.map((option) => option.name));
    for (const [channel, pattern] of Object.entries(scaled))
      for (const name of names) if (pattern.test(name) && !names.has(channel)) problems.push(`${kind}.${name}: ${kind} has no ${channel}`);
    for (const option of options)
      if (option.setting && !named(option.name)) problems.push(`${kind}.${option.name}: no settings registry or library code names it`);
    if (!componentTakes(kind, "js")) continue;
    const declaration = declarations.get(component.props ?? `${kind}Props`);
    // A prop typed never is one the component refuses; one tagged @internal is a composition's.
    const declared = new Set(declaration ? checker.getPropertiesOfType(checker.getTypeAtLocation(declaration))
      .filter((prop) => !(checker.getTypeOfSymbolAtLocation(prop, declaration).flags & (ts.TypeFlags.Never | ts.TypeFlags.Undefined)))
      .filter((prop) => !prop.declarations?.some((node) => ts.getJSDocTags(node).some((tag) => tag.tagName.text === "internal")))
      .map((prop) => prop.name).filter((name) => name !== "children") : []);
    const props = new Set(options.filter((option) => takes(option, "js") && !option.setting).map((option) => option.name));
    for (const name of declared) if (!names.has(name)) problems.push(`${kind}.${name}: its TypeScript props declare it; the table does not list it`);
    for (const name of props) if (!declared.has(name)) problems.push(`${kind}.${name}: listed, but its TypeScript props do not declare it`);
    const text = readFileSync(new URL(`../../src/lib/${registry.components[kind].module.slice(2)}`, import.meta.url), "utf8")
      .replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, "");
    const bodies = [...text.matchAll(/let\s*\{([\s\S]*?)\}\s*(?::[^=]*)?=\s*\$props\(\)/g)].map((match) => match[1]);
    if (!bodies.length || /let\s+\w+\s*(?::[^=]*)?=\s*\$props\(\)/.test(text) || bodies.some((body) => body.includes("..."))) continue;
    const destructured = new Set();
    for (let body of bodies) {
      while (/\{[^{}]*\}|\[[^\[\]]*\]|\([^()]*\)/.test(body)) body = body.replace(/\{[^{}]*\}|\[[^\[\]]*\]|\([^()]*\)/g, "");
      for (const [, name] of body.trim().matchAll(/(?:^|,)\s*([A-Za-z_]\w*)\s*(?=[=:,]|$)/g))
        if (name !== "children" && !name.startsWith("_") && !passed.has(name)) destructured.add(name);
    }
    for (const name of destructured) if (!props.has(name)) problems.push(`${kind}.${name}: its component reads it; the table does not list it`);
    // HTML export reads snapshot= from the node (scene/runtime.svelte.js), not the component.
    const exported = (name) => name === "snapshot" && SNAPSHOT_KINDS.includes(kind);
    for (const name of props) if (!destructured.has(name) && !exported(name)) problems.push(`${kind}.${name}: listed, but its component does not read it`);
  }
  assert.deepEqual(problems, []);
});

// TODO 69.15: the docs' snippets spell each option as its language does. DOCS_REVIEW's corrections
// wrote `<Legend target={pie}>` on the Pie page: Svelte's prop is `for`, Python's target=, and a
// props type that takes any name let it compile.
test("the docs' Svelte and Python snippets pass options their component takes, in that language's spelling", () => {
  const problems = [];
  const check = (where, svelte, python) => {
    for (const [, kind, attributes = ""] of (svelte ?? "").matchAll(/<([A-Z]\w*)(\s[^>]*?)?\/?>/g)) {
      if (!optionsTable.components[kind] || !componentTakes(kind, "js")) continue;
      const names = new Set(componentOptions(kind).filter((option) => takes(option, "js")).map((option) => option.name));
      for (const [, name] of attributes.matchAll(/(?:^|\s)([A-Za-z_][\w:]*)=/g))
        if (!names.has(name) && !name.startsWith("bind:")) problems.push(`${where}: <${kind} ${name}=`);
    }
    // Calculate names output columns; Transform takes schema-defined parameter keywords.
    for (const [, kind, args] of (python ?? "").matchAll(/hm\.([A-Z]\w*)\(([^()]*)\)/g)) {
      if (!optionsTable.components[kind] || !componentTakes(kind, "python") || kind === "Calculate") continue;
      const names = new Set(componentOptions(kind).filter((option) => takes(option, "python")).map((option) => option.python));
      for (const [, name] of args.matchAll(/(?:^|[\s,(])([a-z_]\w*)=/g)) if (!names.has(name) && !(kind === "Transform" && /^[a-z][a-z0-9_]*$/.test(name))) problems.push(`${where}: hm.${kind}(${name}=`);
    }
  };
  for (const folder of ["reference", "guide"]) {
    const dir = new URL(`../../src/routes/content/${folder}/`, import.meta.url);
    for (const file of readdirSync(dir).filter((name) => /\.(svx|md)$/.test(name))) {
      const code = [...readFileSync(new URL(file, dir), "utf8").matchAll(/```[\s\S]*?```|`[^`\n]+`/g)].map((m) => m[0]).join("\n");
      check(`${folder}/${file}`, code, code);
    }
  }
  for (const entry of apiEntries) check(`api.js ${entry.id}`, entry.svelte, entry.python);
  assert.deepEqual(problems, []);
});

test("reference pages mark what SVG and PDF exports draw as images or leave out, one way (2026-10-01)", () => {
  const dir = new URL("../../src/routes/content/reference/", import.meta.url);
  const guide = readFileSync(new URL("../../src/routes/content/guide/export.svx", import.meta.url), "utf8");
  // One note per page, in one form: its title, a lead (an image always, in part, under the
  // conditions it names, or left out), and the link to the export guide's list.
  const form = /<Note title="SVG and PDF export">\n\n\*\*(Image\.|Partly an image\.|Vector, except|Left out\.)\*\* [^\n]+ See \[what is not exported as vector\]\(\/docs\/export\)\.\n\n<\/Note>\n/;
  const leads = new Map();
  for (const file of readdirSync(dir).filter((name) => name.endsWith(".svx"))) {
    const text = readFileSync(new URL(file, dir), "utf8"), count = text.split('<Note title="SVG and PDF export">').length - 1;
    if (!count) continue;
    assert.equal(count, 1, `${file} has one export note`);
    const match = form.exec(text);
    assert.ok(match, `${file}: the export note's form`);
    leads.set(file.replace(/\.svx$/, ""), match[1]);
  }
  // What never exports as vector: objects vectorExport.js has no exporter for (Heatmap, Image,
  // Surface, Points3D, Text3D, GeoJSON and VectorTile fills), and parts that export themselves as
  // images (Markdown, Minimap).
  const always = { heatmap: "Image.", image: "Image.", surface: "Image.", "points-3d": "Image.", "text-3d": "Image.",
    markdown: "Image.", minimap: "Image.", geojson: "Partly an image.", "vector-tile": "Partly an image.",
    // A sky or fog makes its whole plot one image (documentExport.js, the plot's effects).
    effects: "Image." };
  for (const [id, lead] of Object.entries(always)) assert.equal(leads.get(id), lead, `${id}.svx says ${lead}`);
  // The guide's list names every component whose page has a note.
  for (const id of leads.keys()) {
    const entry = apiEntries.find((item) => item.id === id && !item.hidden);
    if (entry?.kind === "Component") assert.ok(guide.includes(`[${entry.title}]`), `the export guide's list names ${entry.title}`);
  }
});

// TODO 68.1: the docs' pages load their prose, previews and source without the plotting runtime.
// What the routes, DocsPage and the Example shell import statically never reaches the scene
// runtime, the renderer, the GPU set-up, three or jax-js (live.js has them, imported on demand),
// nor the manifests (the API entries, the options table and the gallery's catalog).
test("the docs shell imports no plotting runtime statically (TODO 68.1)", () => {
  const root = new URL("../../", import.meta.url);
  // The runtime, and the manifests, which the server reads (routes/examples/docsPages.js).
  const runtime = /^(three|@hmplot\/jax|@threlte\/)|src\/lib\/(scene\/(runtime\.svelte|SceneRenderer|SceneNode|components|options)|jaxExtensions\/|index\.ts)|src\/lib\/plot\/[^/]+\.svelte$|src\/routes\/examples\/(catalog|api|docsManifest|docsPages)\.js$/;
  const seen = new Set(), reached = [];
  const visit = (file) => {
    if (seen.has(file)) return;
    seen.add(file);
    let text = readFileSync(new URL(file, root), "utf8");
    if (file.endsWith(".svelte")) text = [...text.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join("\n");
    for (const [, specifier] of text.matchAll(/^\s*(?:import|export)\s+(?:[^'"()]*?\s+from\s+)?["']([^"']+)["']/gm)) {
      const target = specifier.startsWith("$lib/") ? `src/lib/${specifier.slice(5)}` : specifier.startsWith(".")
        ? fileURLToPath(new URL(specifier, new URL(file, root))).slice(fileURLToPath(root).length) : specifier;
      if (runtime.test(target)) reached.push(`${file} imports ${target}`);
      else if (target.startsWith("src/") && /\.(js|ts|svelte)$/.test(target) && existsSync(new URL(target, root))) visit(target);
    }
  };
  for (const file of ["src/routes/+page.svelte", "src/routes/docs/[lesson]/+page.svelte", "src/routes/docs/[lesson]/+page.js",
    "src/routes/reference/[language]/[entry]/+page.svelte", "src/routes/reference/[language]/[entry]/+page.js",
    "src/routes/examples/[example]/+page.svelte", "src/lib/docs/DocsPage.svelte", "src/lib/docs/Example.svelte"]) visit(file);
  assert.ok(seen.has("src/lib/docs/exampleLoading.js") && seen.has("src/lib/docs/OptionsList.svelte") && seen.has("src/lib/docs/ExampleCard.svelte"));
  assert.deepEqual(reached, []);
  assert.match(readFileSync(new URL("src/lib/docs/live.js", root), "utf8"), /from "\.\.\/scene\/runtime\.svelte\.js"/);
});

// TODO 68.2: live plots start a few at a time; one cancelled while it waits never starts.
test("the docs' live queue runs at most its limit at once and skips cancelled tasks", async () => {
  const { createQueue } = await import("../../src/lib/docs/exampleLoading.js");
  const queue = createQueue(2), started = [], releases = [];
  const task = (name) => () => { started.push(name); return new Promise((resolve) => releases.push(resolve)); };
  let cancelled = false;
  const runs = [queue.run(task("a")), queue.run(task("b")), queue.run(task("c"), () => cancelled), queue.run(task("d"))];
  await Promise.resolve();
  assert.deepEqual(started, ["a", "b"]);
  assert.equal(queue.waiting, 2);
  cancelled = true;
  releases[0]();
  await runs[0];
  await new Promise((resolve) => setTimeout(resolve));
  assert.deepEqual(started, ["a", "b", "d"]);
  assert.equal(await runs[2], undefined);
  releases[1](); releases[2]();
  await Promise.all(runs);
  assert.equal(queue.active, 0);
});

test("leaving an example releases active and waiting loads, even if their work never settles", async () => {
  const { createQueue } = await import("../../src/lib/docs/exampleLoading.js");
  const queue = createQueue(1), old = new AbortController(), waiting = new AbortController();
  let rejectOld, started = false;
  const first = queue.run(() => new Promise((_, reject) => { rejectOld = reject; }), () => false, { signal: old.signal });
  const dropped = queue.run(() => { throw Error("cancelled queued task started"); }, () => false, { signal: waiting.signal });
  const next = queue.run(() => { started = true; return "ready"; });
  await Promise.resolve();waiting.abort();assert.equal(queue.waiting, 1);
  old.abort();assert.equal(await next, "ready");assert.equal(started, true);
  assert.equal(await first, undefined);assert.equal(await dropped, undefined);assert.equal(queue.active, 0);
  rejectOld(Error("late failure from disposed page"));await new Promise(resolve => setTimeout(resolve));
  assert.equal(queue.active, 0);
});

// TODO 73.8: a lock left by a build that was killed is taken over at once (its owner has exited);
// one without an owner, at ten minutes; one held by a running build is waited for.
test("a build lock is waited for while its build runs and taken over when the build died", async () => {
  const { mkdtempSync, mkdirSync, rmSync, utimesSync, writeFileSync } = await import("node:fs");
  const { spawnSync } = await import("node:child_process");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { acquire, stale } = await import("../../scripts/build-lock.mjs");
  const folder = mkdtempSync(join(tmpdir(), "hmplot-lock-")), lock = join(folder, ".lock");
  try {
    mkdirSync(lock);
    writeFileSync(join(lock, "owner"), String(spawnSync(process.execPath, ["-e", ""]).pid));
    assert.equal(stale(lock), true);
    const release = await acquire(lock, { poll: 10 });
    assert.equal(readFileSync(join(lock, "owner"), "utf8"), String(process.pid));
    let taken = false;
    const next = acquire(lock, { poll: 10 }).then((release) => { taken = true; return release; });
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(taken, false);
    release();
    (await next)();
    assert.equal(existsSync(lock), false);
    mkdirSync(lock);
    assert.equal(stale(lock), false);
    const old = new Date(Date.now() - 11 * 60 * 1000);
    utimesSync(lock, old, old);
    assert.equal(stale(lock), true);
    (await acquire(lock, { poll: 10 }))();
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});

// TODO 73.8: the dev server's plugin (scripts/vite-examples.js) on a stand-in server, with builders
// that log their runs: a page waiting for an example that a build of every example did not start
// with gets it; one asked for after the package changed is rebuilt; an example folder added while it
// runs is built; the cards without a thumbnail that a page reports (exampleData.server.js) are made
// in the background, a program pair's by its build, a gallery program's by build-thumbnails.mjs, one
// run at a time, each id once until it is made.
test("the dev server builds examples added or outdated while it runs and makes missing thumbnails, one capture at a time", async () => {
  const { appendFileSync, mkdtempSync, mkdirSync, readFileSync: read, realpathSync, rmSync, writeFileSync } = await import("node:fs");
  const { EventEmitter } = await import("node:events");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { examples, THUMBNAILS } = await import("../../scripts/vite-examples.js");
  const { thumbnails, exampleData } = await import("../../src/routes/examples/exampleData.server.js");
  const root = realpathSync(mkdtempSync(join(tmpdir(), "hmplot-dev-")));
  const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const ids = 'process.argv.slice(2).filter((arg, i, all) => !arg.startsWith("--") && !["--base", "--vite-config"].includes(all[i - 1]))';
  mkdirSync(join(root, "scripts"));
  mkdirSync(join(root, "static", "example-builds"), { recursive: true });
  // A build of every example takes a moment and builds none here.
  writeFileSync(join(root, "scripts", "build-examples.mjs"), `import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
const ids = ${ids};
appendFileSync("runs.log", JSON.stringify(["examples", ...ids]) + "\\n");
if (!ids.length) await new Promise((resolve) => setTimeout(resolve, 300));
for (const id of ids) {
  mkdirSync("static/example-builds/" + id, { recursive: true });
  writeFileSync("static/example-builds/" + id + "/assets.json", "{}");
  console.log("Examples: built " + id);
}`);
  // A capture run that finds another's folder is a second one at once. It draws on the server
  // that asked (--base).
  writeFileSync(join(root, "scripts", "build-thumbnails.mjs"), `import { appendFileSync, existsSync, mkdirSync, rmSync } from "node:fs";
const ids = ${ids}, overlap = existsSync("capturing"), base = process.argv[process.argv.indexOf("--base") + 1];
mkdirSync("capturing", { recursive: true });
appendFileSync("runs.log", JSON.stringify(["thumbnails", ...ids, ...(overlap ? ["overlap"] : []), base]) + "\\n");
for (const id of ids) { await new Promise((resolve) => setTimeout(resolve, 150)); console.log("Thumbnails: captured " + id + " (1/1)"); }
rmSync("capturing", { recursive: true, force: true });`);
  const example = (id) => { mkdirSync(join(root, "src", "examples", id), { recursive: true }); writeFileSync(join(root, "src", "examples", id, `${id}.py`), ""); };
  const runs = () => { try { return read(join(root, "runs.log"), "utf8").trim().split("\n").filter(Boolean).map((line) => JSON.parse(line)); } catch { return []; } };
  const sent = [], watcher = new EventEmitter(), middleware = [];
  const events = (name) => sent.filter((message) => message.event === name).flatMap((message) => message.data.ids);
  const until = async (check) => { for (let i = 0; i < 200 && !check(); i++) await pause(25); assert.ok(check()); };
  const server = { config: { root, logger: { error: (message) => appendFileSync(join(root, "errors.log"), message), warn() {}, info() {} } },
    resolvedUrls: { local: ["http://127.0.0.1:5999/"] }, ws: { send: (message) => sent.push(message) }, watcher,
    middlewares: { use: (handler) => middleware.push(handler) } };
  const plugin = examples({ thumbnails: true });
  try {
    plugin.configureServer(server);
    await pause(50);
    // During the build of every example (started with the server), a page asks for one added since.
    example("late");
    const request = (id) => new Promise((resolve) => middleware[0]({ url: `/example-builds/${id}/assets.json` }, {}, resolve));
    await request("late");
    assert.deepEqual(runs(), [["examples"], ["examples", "late"]]);
    assert.ok(existsSync(join(root, "static", "example-builds", "late", "assets.json")));
    // After the package changes, an example's old build is served at once and it is built again,
    // once.
    await plugin.handleHotUpdate({ file: join(root, "python", "hmplot", "core.py") });
    await request("late");
    await request("late");
    await until(() => runs().length === 3);
    assert.deepEqual(runs().at(-1), ["examples", "late"]);
    // A folder added while the server runs (a merge) is built without being asked for.
    example("added");
    watcher.emit("add", join(root, "src", "examples", "added", "added.py"));
    await until(() => events("hmplot:examples-built").includes("added"));
    // The examples page reports its cards without a thumbnail; a second load, while the first
    // capture runs, reports one more. A program pair's ("paired") is built.
    example("paired");
    thumbnails(["gallery-a", "gallery-b", "paired"]);
    await pause(300);
    thumbnails(["gallery-b", "gallery-c"]);
    await until(() => events("hmplot:thumbnails-built").length === 3);
    const base = "http://127.0.0.1:5999/";
    assert.deepEqual(runs().slice(3), [["examples", "added"], ["examples", "paired"], ["thumbnails", "gallery-a", "gallery-b", base], ["thumbnails", "gallery-c", base]]);
    assert.deepEqual(events("hmplot:thumbnails-built"), ["gallery-a", "gallery-b", "gallery-c"]);
    // A direct example page also requests its missing full-column preview (the stand-in wrote none).
    await exampleData(["gallery-c"]);
    await until(() => events("hmplot:thumbnails-built").length === 4);
    assert.deepEqual(runs().at(-1), ["thumbnails", "gallery-c", base]);
    assert.ok(!existsSync(join(root, "errors.log")));
  } finally {
    delete globalThis[THUMBNAILS];
    await pause(200);
    rmSync(root, { recursive: true, force: true });
  }
});

test("every reference page compiles: its prose keeps braces in code (TODO 69.8)", async () => {
  const { docsComponents, remarkDocs } = await import("../../scripts/docs-pages.mjs");
  const { compile: markdown } = await import("mdsvex");
  const dir = new URL("../../src/routes/content/reference/", import.meta.url);
  for (const name of readdirSync(dir).filter((file) => file.endsWith(".svx"))) {
    const filename = `src/routes/content/reference/${name}`, content = readFileSync(new URL(name, dir), "utf8");
    const injected = docsComponents.markup({ content, filename })?.code ?? content;
    const result = await markdown(injected, { filename, extensions: [".svx", ".md"], remarkPlugins: [remarkDocs] });
    compile(result.code, { filename, generate: "client" });
  }
});

// The package's entry points (package.json "exports") and what each exports, read from the source
// that dist/ is built from: named exports and exported declarations (runtime or type),
// `export * from` (its module) and `export * as name from`.
const packageJSON = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8"));
function moduleExports(path) {
  const file = fileURLToPath(new URL(`../../${path}`, import.meta.url));
  const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.ESNext, true);
  const out = { runtime: [], types: [], stars: [], namespaces: [] };
  const exported = (node) => ts.canHaveModifiers(node) && ts.getModifiers(node)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
  for (const node of source.statements) {
    if (ts.isExportDeclaration(node)) {
      const from = node.moduleSpecifier?.text;
      // A relative `export *` (the generated charts, TODO 130.4) exports that module's names.
      if (!node.exportClause && from.startsWith(".")) {
        const inner = moduleExports(join(dirname(path), from).replace(/\.js$/, ".ts"));
        for (const key of Object.keys(out)) out[key].push(...inner[key]);
      } else if (!node.exportClause) out.stars.push(from);
      else if (ts.isNamespaceExport(node.exportClause)) out.namespaces.push({ name: node.exportClause.name.text, from });
      else for (const element of node.exportClause.elements) (node.isTypeOnly || element.isTypeOnly ? out.types : out.runtime).push(element.name.text);
    } else if (exported(node)) {
      if (ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)) out.types.push(node.name.text);
      else if (ts.isVariableStatement(node)) for (const declaration of node.declarationList.declarations) out.runtime.push(declaration.name.text);
      else if (node.name) out.runtime.push(node.name.text);
    }
  }
  return out;
}
// Each entry point's source: "./dist/scene/index.js" is built from src/lib/scene/index.ts.
const entryPoints = Object.entries(packageJSON.exports).map(([key, target]) => {
  const built = (target.svelte ?? target.default).replace(/^\.\/dist\//, "src/lib/");
  const path = [built, built.replace(/\.js$/, ".ts")].find((candidate) => existsSync(new URL(`../../${candidate}`, import.meta.url)));
  return { name: key === "." ? "hmplot" : `hmplot/${key.slice(2)}`, path };
});
// `export * from` a dependency: that package's own documentation is the reference, and the entry
// point's page links it (TODO 69.13: link, don't copy).
const STAR_EXPORTS = { "hmplot/jax": { from: "@hmplot/jax", docs: "https://github.com/ekzhang/jax-js" } };
const referenceText = (entry) => readFileSync(new URL(`../../src/routes/content/reference/${referencePage(entry.id)}.svx`, import.meta.url), "utf8");
// A table row documents the names it lists (commas outside brackets separate them): "add(a, b)"
// documents add, "Histogram, Violin" two components.
function rowNames(row) {
  const parts = [""];
  let depth = 0;
  for (const char of row) {
    depth += "([{".includes(char) ? 1 : ")]}".includes(char) ? -1 : 0;
    if (char === "," && depth === 0) parts.push("");
    else parts[parts.length - 1] += char;
  }
  return parts.map((part) => /^[A-Za-z_$][\w$]*/.exec(part.trim())?.[0]).filter(Boolean);
}

test("every runtime export of every entry point has a reference destination (TODO 69.8, 69.13)", () => {
  const pages = apiEntries.filter((entry) => !entry.hidden);
  const component = (name) => Object.hasOwn(registry.components, name) && pages.some((entry) => entry.component === name);
  const row = (entry, name) => (entry.props ?? []).some((prop) => prop.name === name || prop.name.startsWith(`${name}(`));
  const problems = [];
  for (const { name: entryPoint, path } of entryPoints) {
    assert.ok(path, `${entryPoint}: no source for its dist file`);
    const exports = moduleExports(path);
    const home = pages.filter((entry) => entry.package === entryPoint);
    if (home.length !== 1) problems.push(`${entryPoint}: ${home.length} package pages (one, with package: "${entryPoint}")`);
    for (const name of exports.runtime) {
      // The root's names have pages of their own or rows on a page that groups them; a
      // subpath's, a row on its page (a component, its own page).
      const found = component(name) || (entryPoint === "hmplot"
        ? pages.some((entry) => entry.title === name || entry.pythonTitle === name || row(entry, name))
        : home.some((entry) => row(entry, name)));
      if (!found) problems.push(`${entryPoint}: ${name} has no reference page or row`);
    }
    for (const { name } of exports.namespaces) if (!home.some((entry) => row(entry, name))) problems.push(`${entryPoint}: ${name} has no row`);
    for (const from of exports.stars) {
      const star = STAR_EXPORTS[entryPoint];
      if (star?.from !== from) problems.push(`${entryPoint}: export * from ${from} needs a page that links its documentation`);
      else if (!home.some((entry) => referenceText(entry).includes(star.docs))) problems.push(`${entryPoint}: its page does not link ${star.docs}`);
    }
    // A row on an entry point's page names what it exports: a rename leaves no stale row.
    if (!STAR_EXPORTS[entryPoint]) for (const entry of home) for (const prop of entry.props ?? [])
      for (const name of rowNames(prop.name)) if (!exports.runtime.includes(name) && !exports.namespaces.some((n) => n.name === name))
        problems.push(`${entry.id}: ${name} is not an export of ${entryPoint}`);
  }
  // So are the rows of the root's grouped pages.
  const root = moduleExports("src/lib/index.ts").runtime;
  for (const entry of pages.filter((item) => item.propsTitle === "Functions"))
    for (const prop of entry.props) for (const name of rowNames(prop.name))
      if (!root.includes(name)) problems.push(`${entry.id}: ${name} is not an export of hmplot`);
  for (const entry of pages.filter((item) => item.package))
    if (!entryPoints.some((point) => point.name === entry.package)) problems.push(`${entry.id}: no entry point ${entry.package}`);
  assert.deepEqual(problems, []);
  // composition (hmplot/compound) is experimental: its documentation is docs/USAGE.md's table of
  // what a compound mark may use, which names every part.
  const usage = readFileSync(new URL("../../docs/USAGE.md", import.meta.url), "utf8");
  const table = usage.slice(usage.indexOf("## Writing a pattern"), usage.indexOf("\n## ", usage.indexOf("## Writing a pattern") + 1));
  const composition = moduleExports("src/lib/plot/composition.js").runtime;
  assert.ok(composition.length > 20);
  assert.deepEqual(composition.filter((name) => !table.includes(`\`${name}\``)), [], "docs/USAGE.md's composition table names every part");
});

test("every exported type is documented where it is used (TODO 69.13)", () => {
  // A type is documented by its component's options (XProps), by a type page's members, or as
  // part of either: reachable from their declarations in publicTypes.ts. Handles a component
  // gives through bind:this are named on that component's page (TYPE_PAGES).
  const declarations = new Map(propsFiles.flatMap((path) => {
    const file = fileURLToPath(new URL(path, import.meta.url));
    const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.ESNext, true);
    return source.statements.filter((s) => s.name).map((s) => [s.name.text, s.getText(source)]);
  }));
  const pages = apiEntries.filter((entry) => !entry.hidden);
  const documented = new Set(pages.flatMap((entry) => [entry.type ?? []].flat()));
  for (const entry of pages.filter((item) => item.component)) documented.add(optionsTable.components[entry.component].props ?? `${entry.component}Props`);
  documented.add("MarkProps"); // the mark-options page: its options are the marks' shared props
  const reachable = new Set(), queue = [...documented].filter((name) => declarations.has(name));
  while (queue.length) {
    const name = queue.pop();
    if (reachable.has(name)) continue;
    reachable.add(name);
    for (const other of declarations.keys()) if (!reachable.has(other) && new RegExp(`\\b${other}\\b`).test(declarations.get(name))) queue.push(other);
  }
  const TYPE_PAGES = {
    ProviderHandle: "provider", ProviderResult: "provider", PartitionHandle: "partition", PartitionGroup: "partition",
    RegressionFit: "regression", GeoJSONHandle: "geojson", VectorTileHandle: "vector-tile", AnchorHandle: "anchor",
    EndpointHandle: "connect", DataHandle: "data", InputExpression: "input-context",
  };
  const problems = [];
  for (const { name: entryPoint, path } of entryPoints) for (const name of moduleExports(path).types) {
    if (reachable.has(name) || documented.has(name)) continue;
    const page = TYPE_PAGES[name] && pages.find((entry) => entry.id === TYPE_PAGES[name]);
    if (!page) problems.push(`${entryPoint}: type ${name} is documented nowhere`);
    else if (!referenceText(page).includes(name)) problems.push(`${page.id}.svx does not name ${name}`);
  }
  assert.deepEqual(problems, []);
});

test("the docs as Markdown: llms.txt lists each page's .md, llms-full.txt holds the guide and reference, api.md every component (R2.5)", async () => {
  const markdown = await import("../../src/routes/examples/docsMarkdown.server.js");
  const index = markdown.llmsIndex();
  // One line per page, each linking Markdown that is generated.
  const links = [...index.matchAll(/^- \[[^\]]+\]\(([^)]+)\)/gm)].map((match) => match[1]);
  const pages = markdown.referenceEntries();
  assert.equal(links.filter((url) => url.startsWith("/docs/")).length, guideSections.length);
  assert.equal(links.filter((url) => url.startsWith("/reference/python/")).length, pages.filter((entry) => entry.languages !== "js").length);
  assert.equal(links.filter((url) => url.startsWith("/reference/svelte/")).length, pages.filter((entry) => entry.languages !== "python").length);
  assert.equal(links.filter((url) => url.startsWith("/examples/")).length, examples.length);
  for (const url of links) {
    const [, kind, a, b] = /^\/(docs|reference|examples)\/([^/]+?)(?:\/(.+?))?\.md$/.exec(url) ?? [];
    const text = kind === "docs" ? markdown.guideMarkdown(a) : kind === "examples" ? markdown.exampleMarkdown(a)
      : kind === "reference" && b ? markdown.referenceMarkdown(b, a) : url === "/reference/api.md" || url === "/llms-full.txt" ? "found"
      : url === "/recipes.md" ? markdown.recipesMarkdown() : null;
    assert.ok(text, `${url} is generated`);
  }
  // A guide page: python and svelte fences without the docs' highlights, Notes as quotes, Math as
  // TeX, Columns' cells, API names linked to their Markdown (not inside code).
  const authoring = markdown.guideMarkdown("authoring");
  assert.match(authoring, /^# Write documentation\n/);
  const prose = authoring.replace(/^(`{3,})[^\n]*\n[\s\S]*?\n\1$/gm, "");
  assert.match(authoring, /Here is that pair, running:\n\n```python\nimport hmplot as hm\n[\s\S]*?\n```\n\n```svelte\n<script>/);
  assert.doesNotMatch(prose, /<\/?(Note|Columns|Math|div)\b|```/);
  assert.match(authoring, /^> \*\*Note\*\*\n>\n> Keep examples small/m);
  assert.match(authoring, /^\$y = mx \+ b\$$/m);
  assert.match(authoring, /Write `\[Points\]`, `\[Frame\]`/);
  assert.match(authoring, /use \[Plot\]\(\/reference\/svelte\/plot\.md\) for one chart and \[hm.Scene\]\(\/reference\/python\/scene\.md\)/);
  // A reference page in each language: its example, its options as the language spells them.
  const python = markdown.referenceMarkdown("points", "python"), svelte = markdown.referenceMarkdown("points", "svelte");
  assert.match(python, /```python\nimport hmplot as hm/);
  assert.match(python, /^- `outline_width` \(`channel`\): .* Default: `0`\.$/m);
  assert.match(svelte, /```svelte\n<script>/);
  assert.match(svelte, /^- `outlineWidth` \(`channel`\)/m);
  assert.match(python, /\[what is not exported as vector\]\(\/docs\/export\.md\)/);
  assert.match(markdown.referenceMarkdown("visualize-tree", "svelte"), /^Python only\./m);
  // llms-full.txt: every guide and reference page under its own heading, the marks' shared options
  // named (the Mark options page, also in it, describes them).
  const full = markdown.llmsFull();
  for (const page of guideSections) assert.ok(full.includes(`\nPage: /docs/${page.id}.md\n`), page.id);
  for (const entry of pages) assert.ok(full.includes(`/${entry.id}.md\n`), entry.id);
  assert.match(full, /Also these options the marks share \(described on Mark options\): `color`, `opacity`/);
  // The API on one page: every component of the registry.
  const api = markdown.apiMarkdown();
  for (const name of Object.keys(registry.components)) assert.match(api, new RegExp(`^### ${name}\\b`, "m"), name);
  assert.match(api, /^hm\.Points\(\*,\n(?: {4}\w+: .* = \.\.\.,\n)*? {4}x: Channel = \.\.\.,$/m);
});

test("the agent skill is a Claude Code plugin: its manifests, its frontmatter, its links and Svelte programs (R2.7)", () => {
  const root = new URL("../../", import.meta.url), read = (file) => readFileSync(new URL(file, root), "utf8");
  const plugin = JSON.parse(read(".claude-plugin/plugin.json")), market = JSON.parse(read(".claude-plugin/marketplace.json"));
  assert.match(plugin.name, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
  assert.ok(plugin.description && plugin.license === "MIT");
  // The repository is the marketplace and its one plugin: /plugin marketplace add, then install.
  assert.ok(market.name && market.owner?.name);
  assert.deepEqual(market.plugins.map(({ name, source }) => [name, source]), [[plugin.name, "./"]]);
  const skills = readdirSync(new URL("skills/", root));
  assert.deepEqual(skills, ["hmplot"]);
  for (const name of skills) {
    const text = read(`skills/${name}/SKILL.md`);
    const front = /^---\n([\s\S]*?)\n---\n/.exec(text);
    assert.ok(front, `${name}: SKILL.md opens with front matter`);
    const fields = Object.fromEntries(front[1].split("\n").map((line) => /^(\w[\w-]*): (.*)$/.exec(line)).filter(Boolean).map((m) => [m[1], m[2]]));
    assert.equal(fields.name, name);
    assert.ok(fields.description && fields.description.length <= 1024, `${name}: a description of at most 1,024 characters`);
    assert.ok(text.split("\n").length < 500, `${name}: SKILL.md stays under 500 lines`);
    // Relative links resolve; the skill's Svelte programs compile (its Python ones run in pytest).
    const files = [`skills/${name}/SKILL.md`, ...readdirSync(new URL(`skills/${name}/`, root)).filter((file) => file !== "SKILL.md").map((file) => `skills/${name}/${file}`)];
    for (const file of files) {
      const body = read(file);
      for (const [, target] of body.matchAll(/\]\(([^)#\s:]+)\)/g)) if (!target.startsWith("/"))
        assert.ok(existsSync(new URL(target, new URL(file, root))), `${file} links to ${target}`);
      for (const [, code] of body.matchAll(/```svelte\n([\s\S]*?)```/g)) compile(code, { filename: file, generate: false });
    }
    // Factual: no text that tells a model which library to prefer.
    assert.doesNotMatch(text, /\b(always (use|prefer)|prefer HMPlot|instead of (Plotly|Matplotlib|Altair)|you must use)\b/i);
  }
});

// TODO 136.5: an agent reads a component's Markdown page and writes what it lists, so every
// keyword the component takes, its own and the shared ones, is on that page in the page's
// language (Histogram's brush was once missing, and agents hand-built brushes).
test("each component's Markdown reference page lists every keyword it takes, in each language", async () => {
  const markdown = await import("../../src/routes/examples/docsMarkdown.server.js");
  const snake = (name) => name.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
  const problems = [];
  for (const entry of markdown.referenceEntries()) {
    if (!entry.component || entry.aliasOf) continue;
    for (const [language, lang] of [["python", "python"], ["svelte", "js"]]) {
      if (!componentTakes(entry.component, lang)) continue;
      const page = markdown.referenceMarkdown(entry.id, language);
      if (!page) continue;
      for (const option of componentOptions(entry.component)) {
        if (!takes(option, lang)) continue;
        const name = language === "python" ? snake(option.name) : option.name;
        if (!page.includes(`\`${name}\``) && !page.includes(`**${name}**`) && !new RegExp(`\\b${name}\\b`).test(page))
          problems.push(`${entry.id} (${language}): ${name}`);
      }
    }
  }
  assert.deepEqual(problems, []);
});

// TODO 136.5: an option an agent reads without a sentence is one it guesses at (73 were empty).
test("every option on a Markdown reference page says what it does", async () => {
  const markdown = await import("../../src/routes/examples/docsMarkdown.server.js");
  const empty = [];
  for (const entry of markdown.referenceEntries())
    for (const language of ["python", "svelte"]) {
      const page = markdown.referenceMarkdown(entry.id, language);
      for (const line of page?.split("\n") ?? [])
        if (/^- `[^`]+`( \(`.*`\))?:\s*$/.test(line)) empty.push(`${entry.id} (${language}): ${line}`);
    }
  assert.deepEqual(empty, []);
});

// TODO 136.5: the recipes are short, and the skill's patterns.md is generated from them.
test("each recipe is at most 25 lines with a title and caption, and the skill's patterns.md is current", async () => {
  const markdown = await import("../../src/routes/examples/docsMarkdown.server.js");
  const recipes = markdown.recipeList();
  assert.ok(recipes.length >= 20);
  for (const recipe of recipes) {
    assert.ok(recipe.title && recipe.caption, `${recipe.id} has a title and a caption`);
    assert.ok(recipe.code.split("\n").length <= 25, `${recipe.id} is at most 25 lines`);
    assert.match(recipe.code, /\nchart\s*$/, `${recipe.id} ends by displaying chart`);
  }
  assert.equal(readFileSync(new URL("../../skills/hmplot/patterns.md", import.meta.url), "utf8"), markdown.patternsMarkdown({ style: "standard" }),
    "skills/hmplot/patterns.md is generated from src/recipes: node scripts/generate-patterns.mjs");
  assert.match(markdown.llmsIndex(), /## Start here\n\n- \[Recipes\]\(\/recipes\.md\)/);
});

// TODO 144: the chained-pipeline doc set differs from the standard one only in its pipelines: the
// fluent recipes (and reference examples) chain where the standard ones nest, and its skill is
// current with the standard skill.
test("the fluent doc set chains its pipelines and its skill is current", async () => {
  const markdown = await import("../../src/routes/examples/docsMarkdown.server.js");
  const { fluentSkill, fluentTranslation } = await import("../../src/routes/examples/fluentDocs.js");
  const nested = /hm\.(Filter|Group|Calculate|Join|Sort)\(/;
  const standard = markdown.recipeList({ style: "standard" }), fluent = markdown.recipeList({ style: "fluent" });
  assert.deepEqual(fluent.map((recipe) => recipe.id), standard.map((recipe) => recipe.id));
  for (const recipe of fluent) {
    assert.doesNotMatch(recipe.code, nested, `${recipe.id} chains its pipeline in the fluent set`);
    assert.ok(recipe.code.split("\n").length <= 25, `${recipe.id} is at most 25 lines`);
  }
  assert.ok(standard.some((recipe) => nested.test(recipe.code)));
  const read = (file) => readFileSync(new URL(`../../${file}`, import.meta.url), "utf8");
  assert.equal(read("eval/agent-tasks/variants/fluent/skill/patterns.md"), markdown.patternsMarkdown({ style: "fluent" }),
    "the fluent skill is generated: node scripts/generate-patterns.mjs");
  assert.equal(read("eval/agent-tasks/variants/fluent/skill/SKILL.md"), fluentSkill(read("skills/hmplot/SKILL.md")),
    "the fluent skill is generated: node scripts/generate-patterns.mjs");
  assert.equal(read("eval/agent-tasks/variants/fluent/skill/translation.md"), fluentTranslation(read("skills/hmplot/translation.md")),
    "the fluent skill is generated: node scripts/generate-patterns.mjs");
  assert.match(markdown.recipesMarkdown({ style: "fluent" }), /## Data pipelines/);
  assert.doesNotMatch(markdown.recipesMarkdown({ style: "standard" }), /group_by|with_columns/);
});
