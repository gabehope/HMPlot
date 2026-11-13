import { execFileSync, spawn } from "node:child_process";
import { cp, mkdtemp, mkdir, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import path from "node:path";
import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import { swiftShaderArgs } from "../../playwright.swiftshader.config.js";

const root = fileURLToPath(new URL("../../", import.meta.url));
const artifactDir = path.join(root, "artifacts");
await mkdir(artifactDir, { recursive: true });
const run = (args, cwd = root) =>
  execFileSync("npm", args, { cwd, stdio: "inherit" });
run(["pack", "--pack-destination", artifactDir]);
const { name, version } = JSON.parse(
  execFileSync("node", ["-p", "JSON.stringify(require('./package.json'))"], {
    cwd: root,
  }),
);
const tarball = path.join(
  artifactDir,
  `${name.replace("@", "").replace("/", "-")}-${version}.tgz`,
);
const contents = execFileSync("tar", ["-tzf", tarball], { encoding: "utf8" });
assert.match(contents, /package\/dist\/index.js/);
assert.match(contents, /package\/dist\/index.d.ts/);
assert.match(contents, /package\/dist\/compound\/index.js/);
assert.match(contents, /package\/dist\/compound\/index.d.ts/);
assert.match(contents, /package\/LICENSE/);
// The notices (R1.5), and the public docs only (R1.2): the internal ones stay out.
assert.match(contents, /package\/THIRD_PARTY_NOTICES\.md/);
assert.match(contents, /package\/docs\/DATA\.md/);
assert.doesNotMatch(contents, /package\/docs\/(?:STAGE14-CONTRACT\.md|INTEGRATION\.md|integration-manifest\.json|stabilization\/)/);
assert.match(contents, /package\/dist\/jax.js/);
assert.match(contents, /package\/dist\/vite.js/);
assert.match(contents, /package\/dist\/tiles.js/);
assert.match(contents, /package\/dist\/video.js/);
assert.match(contents, /package\/dist\/check.js/);
assert.match(contents, /package\/dist\/check.d.ts/);
// The default font (TODO 52): the four styles and the OFL beside them.
for (const file of ["SourceSans3-Regular.ttf", "SourceSans3-It.ttf", "SourceSans3-Bold.ttf", "SourceSans3-BoldIt.ttf", "LICENSE.md"])
  assert.ok(contents.includes(`package/dist/fonts/source-sans-3/${file}`), file);
// jax-js is bundled (TODO Stage 23): the fork, and nothing else, under node_modules.
assert.match(contents, /package\/node_modules\/@hmplot\/jax\/dist\/index.js/);
assert.match(contents, /package\/node_modules\/@hmplot\/jax\/LICENSE/);
assert.doesNotMatch(contents, /package\/(?:src|tests|build|vendor)\//);
assert.doesNotMatch(contents, /package\/node_modules\/(?!@hmplot\/jax\/)/);
console.log(`Tarball: ${((await stat(tarball)).size / 1024 / 1024).toFixed(2)} MB`);
const consumer = await mkdtemp(path.join(tmpdir(), "heatmap-consumer-"));
await cp(path.join(root, "tests/package/consumer"), consumer, {
  recursive: true,
});
run(
  ["install", "--no-audit", "--no-fund", "--package-lock=false", tarball],
  consumer,
);
run(["run", "check"], consumer);
run(["run", "test:ssr"], consumer);
run(["run", "build"], consumer);

const preview = spawn(
  "npm",
  [
    "exec",
    "vite",
    "--",
    "preview",
    "--host",
    "127.0.0.1",
    "--port",
    "4175",
    "--strictPort",
  ],
  { cwd: consumer, stdio: "pipe", detached: true },
);
let browser;
try {
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("Consumer preview did not start")),
      15000,
    );
    preview.stdout.on("data", (chunk) => {
      // Vite prints the port in bold where it colors its output, which it does in CI (CI is
      // set): "127.0.0.1:\x1b[1m4175". Matched without the color codes.
      if (chunk.toString().replace(/\x1b\[[\d;]*m/g, "").includes("127.0.0.1:4175")) {
        clearTimeout(timeout);
        resolve();
      }
    });
    preview.on("exit", (code) => {
      clearTimeout(timeout);
      reject(new Error(`Preview exited: ${code}`));
    });
  });
  browser = await chromium.launch({
    channel: "chrome",
    // CI's runners have no GPU: Chrome's software WebGPU, set up as the daily browser suite's.
    args: ["--enable-unsafe-webgpu", ...(process.env.CI ? swiftShaderArgs : [])],
  });
  const page = await browser.newPage({
    viewport: { width: 1100, height: 900 },
    deviceScaleFactor: 2,
  });
  const errors = [];
  page.on("response", (response) => {
    if (response.status() >= 400)
      errors.push(`${response.status()} ${response.url()}`);
  });
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error" && !message.text().includes("favicon"))
      errors.push(message.text());
    // hmplot/vite makes the app's @jax-js/jax hmplot's: nothing is copied.
    if (message.type() === "warning" && /another jax-js copy/.test(message.text()))
      errors.push(message.text());
  });
  await page.goto("http://127.0.0.1:4175");
  await page.getByRole("img", { name: "2D coordinate axes" }).waitFor();
  await page.waitForFunction(() => {
    const canvases = [...document.querySelectorAll(".canvas")];
    return canvases.length && canvases.every(canvas => canvas.getAttribute("aria-busy") === "false");
  });
  await page.waitForTimeout(1500);
  await page.getByRole("button", { name: "Inspect packaged plots" }).click();
  await page.getByText("Inspection ready", { exact: true }).waitFor();
  await page.getByRole("button", { name: "External settings" }).click();
  const panel = page.getByRole("dialog", { name: "Settings · Packaged plot" });
  await panel.locator("summary").filter({ hasText: /^View/ }).click();
  await panel.getByLabel("View mode", { exact: true }).selectOption("3d");
  await page.getByText("Mode: 3d", { exact: true }).waitFor();
  await panel.getByLabel("View mode", { exact: true }).selectOption("2d");
  await panel.getByRole("treeitem", { name: /Title/ }).click();
  await panel
    .getByRole("button", { name: "Search settings", exact: true })
    .click();
  await panel.getByRole("searchbox").fill("Text layout");
  await panel.getByLabel("Font", { exact: true }).selectOption("gentilis");
  await page.keyboard.press("Escape");
  await page.screenshot({
    path: path.join(artifactDir, "installed-package.png"),
  });
  for (let i = 0; i < 2; i++) {
    await page.getByRole("button", { name: "Toggle plot" }).click();
    await page.getByRole("button", { name: "Toggle plot" }).click();
    await page.getByRole("img", { name: "2D coordinate axes" }).waitFor();
  }
  await page.waitForTimeout(500);
  await page
    .getByRole("button", { name: "Facet examples", exact: true })
    .click();
  await page.locator(".facet-cell canvas").first().waitFor();
  await page.waitForTimeout(1000);
  assert.equal(await page.locator(".facet-cell").count(), 2);
  await page
    .getByRole("button", { name: "Facet examples", exact: true })
    .click();
  await page.getByRole("button",{name:"Transform examples",exact:true}).click();
  await page.getByRole("button",{name:"Step",exact:true}).waitFor();
  await page.getByRole("button",{name:"Step",exact:true}).click();
  await page.getByText("Step 1",{exact:true}).waitFor();
  await page.getByRole("button",{name:"Transform examples",exact:true}).click();
  await page.waitForTimeout(100);
  await page.getByRole('button',{name:'Coordinate frames',exact:true}).click();
  await page.getByText('Packaged right',{exact:true}).waitFor();
  await page.waitForTimeout(500);
  assert.equal(await page.getByRole('region',{name:'Packaged frames'}).locator('canvas').count(),2);
  // hmplot/compound renders the same components through the subpath export.
  assert.equal(await page.getByRole('region',{name:'Compound subpath'}).locator('canvas').count(),1);
  // The app's own jax-js code (@jax-js/jax through hmplot/vite) is hmplot's jax-js,
  // and its arrays draw.
  await page.getByRole("button", { name: "JAX inputs", exact: true }).click();
  await page.getByRole("region", { name: "JAX inputs" }).locator("canvas").first().waitFor();
  await page.waitForTimeout(500);
  assert.equal(await page.evaluate(() => window.jaxInputs?.sameJax), true);
  assert.deepEqual(await page.evaluate(() => window.tileAt), [1, 1, 1]);
  assert.deepEqual(errors, []);
  console.log(
    `Installed package passed types, SSR, production rendering, settings, fonts, remounts, and JAX inputs through hmplot/vite.\nPackage: ${tarball}\nConsumer: ${consumer}`,
  );
} finally {
  await browser?.close();
  try {
    process.kill(-preview.pid, "SIGTERM");
  } catch {}
}
