import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { componentOptions, optionsTable } from "../../src/lib/scene/options.js";
import { apiMetadata } from "../../scripts/python-api-metadata.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const check = (...args) => spawnSync(process.execPath, [path.join(root, "scripts/generate-python-signatures.mjs"), "--check", ...args], { cwd: root, encoding: "utf8" });

test("scene imports load only used kinds, share pending imports and retry failures", async () => {
  const { createComponentLoader } = await import("../../src/lib/scene/componentLoading.js");
  const calls = [], loaders = { Points: async () => { calls.push("Points"); return {default:"points"}; },
    Force: async () => { throw Error("unused Force imported"); },
    Text: async () => { calls.push("Text"); if (calls.filter(kind => kind === "Text").length === 1) throw Error("download failed"); return {default:"text"}; } };
  const load = createComponentLoader(loaders), scene = {kind:"Scene",children:[{kind:"Points"},{kind:"Points"}]};
  assert.deepEqual(await Promise.all([load(scene),load(scene)]),[{Points:"points"},{Points:"points"}]);
  assert.deepEqual(calls,["Points"]);
  await assert.rejects(load({kind:"Text"}),/download failed/);
  assert.deepEqual(await load({kind:"Text"}),{Text:"text"});
  assert.deepEqual(calls,["Points","Text","Text"]);
});

test("an exported component must declare its metadata", () => {
  const table = structuredClone(optionsTable);
  table.components.Points.module = "./internal-implementation.svelte";
  assert.equal(apiMetadata(root, table).components.Points.module, "./plot/bound/scatterPoints.svelte",
    "root exports, not metadata overrides, define public module paths");
  delete table.components.Points;
  assert.throws(() => apiMetadata(root, table), /Points is exported.*Add Points to src\/lib\/scene\/options\.json/);
});

test("generated properties contain declared props and settings, never implementation identifiers", () => {
  const registry = JSON.parse(readFileSync(path.join(root, "python/hmplot/registry.json"), "utf8"));
  const declared = new Set(Object.keys(optionsTable.components).flatMap((kind) => componentOptions(kind).map((o) => o.name)));
  for (const name of registry.properties) assert.ok(declared.has(name), name);
  assert.deepEqual(registry.properties, [...new Set(Object.values(registry.components).flatMap(component =>
    [...component.properties, ...(component.runtimeOptions ?? [])]))].sort());
  for (const name of ["pending", "mounted", "requestKey", "plotScene", "inputOwner", "onplayingchange"])
    assert.ok(!registry.properties.includes(name), name);
  for (const name of ["axisFontFamily", "axisLineWidth", "xInvert", "missingColor"])
    assert.ok(registry.properties.includes(name), name);
  assert.deepEqual(registry.components.Template.properties, []);
  assert.deepEqual(registry.components.Slot.properties, []);
});

test("check:python-signatures passes on the tracked files", () => {
  const result = check();
  assert.equal(result.status, 0, result.stderr);
});

test("the JavaScript API report is current (R2.2)", () => {
  const result = spawnSync(process.execPath, [path.join(root, "scripts/api-report.mjs"), "--check"], { cwd: root, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
});

test("API generation starts from maintained inputs and checks the scene component module", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "hmplot-generated-api-"));
  const generate = (...args) => spawnSync(process.execPath,
    [path.join(root, "scripts/generate-python-signatures.mjs"), "--output-dir", dir, ...args],
    { cwd: root, encoding: "utf8" });
  try {
    assert.equal(generate().status, 0);
    const stub = path.join(dir, "python/hmplot/__init__.pyi"), components = path.join(dir, "src/lib/scene/components.js");
    const wrapper = path.join(dir, "src/lib/plot/density.svelte");
    const originalWrapper = readFileSync(wrapper, "utf8");
    assert.match(originalWrapper, /bandwidth = \$bindable\("auto"\)/);
    const original = readFileSync(stub, "utf8");
    assert.equal(original, readFileSync(path.join(root, "python/hmplot/__init__.pyi"), "utf8"));
    assert.match(original, /def load_theme\(/);
    assert.match(original, /def visualize_tree\(/);
    writeFileSync(stub, original + "\nclass RetiredComponent(Node): pass\n");
    writeFileSync(components, "export const components = {};\n");
    writeFileSync(wrapper, "<div>stale wrapper</div>\n");
    const stale = generate("--check");
    assert.equal(stale.status, 1);
    assert.match(stale.stderr, /components\.js/);
    assert.match(stale.stderr, /density\.svelte/);
    assert.match(stale.stderr, /__init__\.pyi/);
    assert.equal(generate().status, 0);
    assert.equal(readFileSync(stub, "utf8"), original, "outputs do not feed back into generation");
    assert.equal(readFileSync(wrapper, "utf8"), originalWrapper);
    assert.equal(generate("--check").status, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a tampered registry copy fails the check, both ways", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "hmplot-registry-"));
  try {
    const registry = JSON.parse(readFileSync(path.join(root, "python/hmplot/registry.json"), "utf8"));
    // A name the source no longer produces, in the flat list and on one component...
    registry.properties = [...registry.properties, "removedLongAgo"].sort();
    const points = registry.components.Points;
    points.properties = [...points.properties, "removedLongAgo"].sort();
    // ...and an advertised keyword the registry has lost.
    points.properties = points.properties.filter((name) => name !== "size");
    const tampered = path.join(dir, "registry.json");
    writeFileSync(tampered, JSON.stringify(registry, null, 2) + "\n");
    const result = check("--registry", tampered);
    assert.equal(result.status, 1, result.stdout);
    for (const line of ["*.removedLongAgo: registry-only", "Points.removedLongAgo: registry-only", "Points.size: stub-only"])
      assert.ok(result.stderr.includes(line), `${line}\n${result.stderr}`);
    assert.match(result.stderr, /python3 scripts\/generate-python-api\.py.*node scripts\/generate-python-signatures\.mjs/);

    // Only the flat list tampered: the pass that used to union the file on disk missed this.
    const flatOnly = JSON.parse(readFileSync(path.join(root, "python/hmplot/registry.json"), "utf8"));
    flatOnly.properties = [...flatOnly.properties, "removedLongAgo"].sort();
    writeFileSync(tampered, JSON.stringify(flatOnly, null, 2) + "\n");
    const flat = check("--registry", tampered);
    assert.equal(flat.status, 1, flat.stdout);
    assert.ok(flat.stderr.includes("*.removedLongAgo: registry-only"), flat.stderr);

    // An untouched copy passes.
    writeFileSync(tampered, readFileSync(path.join(root, "python/hmplot/registry.json")));
    assert.equal(check("--registry", tampered).status, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
