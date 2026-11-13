import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { test, expect } from "./fixtures.js";
import { examples as catalog } from "../../src/routes/examples/catalog.js";
import { pixelReader } from "./png.js";

test.use({ deviceScaleFactor: 2 });

test("leaving a rendered scene releases an unfinished preparation barrier", async ({ page }) => {
  const errors = []; page.on("pageerror", error => errors.push(error.message));
  await page.goto("/test/notebook?fixture=01_dataframe");
  await page.waitForFunction(() => window.notebookReady);
  await expect(page.locator(".canvas")).toHaveAttribute("aria-busy", "false");
  const circles = await page.evaluate(async () => {
    const runtime = window.notebookRuntime;
    await runtime.settle();
    const plot = [...runtime.handles.values()].find(entry => entry.handle?.exportSVG);
    const svg = await (await plot.handle.exportSVG()).blob.text();
    // Stand in for a component waiting on data that will never finish downloading.
    plot.handle = { ...plot.handle, whenSettled: () => new Promise(() => {}) };
    window.__unfinishedScene = runtime.settle().then(() => { window.__sceneReleased = true; });
    return (svg.match(/<circle /g) ?? []).length;
  });
  expect(circles).toBeGreaterThan(0);
  await page.evaluate(() => { const a = document.createElement("a"); a.href = "/examples/data-shortcut"; document.body.append(a); a.click(); });
  await expect(page).toHaveURL(/\/examples\/data-shortcut$/);
  await page.waitForFunction(() => window.__sceneReleased === true, {}, { timeout: 3000 });
  await expect(page.locator('[data-example="data-shortcut"] .live.ready')).toBeVisible();
  expect(errors).toEqual([]);
});

test("navigating away from stalled example downloads releases the next page's live plot", async ({ page }) => {
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(() => {
    const fetchOriginal=window.fetch.bind(window);window.__abortedExamples=[];window.__pendingExamples=[];
    window.fetch=(input,options)=>{
      const url=String(input);
      if (/\/example-builds\/(lorenz-attractor|themes)\/payload/.test(url))
        return new Promise((_,reject)=>{
          window.__pendingExamples.push(url);
          options?.signal?.addEventListener('abort',()=>{window.__abortedExamples.push(url);reject(new DOMException('Aborted','AbortError'));},{once:true});
        });
      return fetchOriginal(input,options);
    };
  });
  await page.goto('/examples/lorenz-attractor');
  await expect(page.locator('[data-example="lorenz-attractor"] .snapshot img')).toBeVisible();
  await page.waitForFunction(()=>window.__pendingExamples.length===1);
  const go=async url=>{await page.evaluate(url=>{const a=document.createElement('a');a.href=url;document.querySelector('article').append(a);a.click();},url);await expect(page).toHaveURL(new RegExp(url+'$'));};
  await go('/examples/themes');await expect(page.locator('[data-example="themes"]')).toBeVisible();
  await page.waitForFunction(()=>window.__pendingExamples.length===2);
  await go('/examples/layered-signal');await expect(page.locator('[data-example="layered-signal"] .live.ready')).toBeVisible({timeout:15000});
  expect(await page.evaluate(()=>window.__abortedExamples.length)).toBe(2);
  const svg=await page.evaluate(async()=>{await window.__examples.plot.whenSettled();return (await (await window.__examples.plot.exportSVG()).blob.text());});
  expect((svg.match(/<circle /g)||[]).length).toBeGreaterThanOrEqual(32);expect(svg).toContain('<path ');expect(errors).toEqual([]);
});

test("older gallery examples share previews, source language controls and cancellation", async ({ page }) => {
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  let release, continued, started=false;const delayed=new Promise(resolve=>release=resolve), completed=new Promise(resolve=>continued=resolve);
  await page.route('**/src/routes/examples/composition/Pie.svelte',async route=>{started=true;await delayed;await route.continue();continued();});
  await page.goto('/examples/pie');
  const example=page.locator('[data-example="pie"]');
  await expect(example.locator('.snapshot img')).toBeVisible();
  await expect(example.getByRole('group',{name:'Code language'}).getByRole('button',{name:'Python',exact:true})).toBeVisible();
  await expect.poll(()=>started).toBe(true);
  await page.getByRole('link',{name:'All examples',exact:true}).click();await expect(page).toHaveURL(/\/examples$/);
  release();await completed;await page.unroute('**/src/routes/examples/composition/Pie.svelte');
  await page.locator('.cards a[href="/examples/pie"]').first().click();
  await expect(page.locator('.program .canvas').first()).toHaveAttribute('aria-busy','false');
  await expect(page.locator('.snapshot')).toHaveCount(0);
  const svg=await page.evaluate(async()=>{await window.__examples.plot.whenSettled();return await (await window.__examples.plot.exportSVG()).blob.text();});
  expect((svg.match(/<path /g)||[]).length).toBeGreaterThan(4);expect(errors).toEqual([]);
  await page.goto('/gallery');await expect(page).toHaveURL(/\/examples$/);
});

test("guide, reference, and curated examples have permanent visual routes", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", {name:"HMPlot", exact:true})).toBeVisible();
  await page.goto("/docs/start");
  await expect(page.getByRole("heading", { name: "Installation and first plot" })).toBeVisible();
  await expect(page.getByRole("region", {name:"Example",exact:true})).toBeVisible();
  // Each page is also Markdown, which it links (R2.5); llms.txt lists the pages.
  await expect(page.locator('link[rel="alternate"][type="text/markdown"]')).toHaveAttribute("href", "/docs/start.md");
  const markdown = await page.request.get("/docs/start.md");
  expect(markdown.headers()["content-type"]).toMatch(/^text\/markdown/);
  expect(await markdown.text()).toMatch(/^# Installation and first plot\n[\s\S]*```python\nimport hmplot as hm\n/);
  expect(await (await page.request.get("/llms.txt")).text()).toContain("- [Points](/reference/python/points.md): ");
  await expect(page.locator("iframe")).toHaveCount(0);
  await page.getByRole("link", { name: "Next →" }).click();
  await expect(page).toHaveURL(/\/docs\/composition$/);
  await page.goto("/reference/python/plot");
  await expect(page.getByRole("heading", { name: "Plot", exact: true })).toBeVisible();
  await expect(page.getByRole("region", {name:"Example",exact:true})).toBeVisible();
  // The options come from the options table, spelled as the page's language spells them.
  const options = page.getByRole("region", { name: "Options" });
  await expect(options.locator("#option-cameraPosition dt code")).toHaveText("camera_position");
  await page.goto("/reference/svelte/points");
  await expect(page.locator("#option-sizeUnits dt code")).toHaveText("sizeUnits");
  // Its "SVG and PDF export" note links to the export guide's list of what is not vector.
  await expect(page.locator("aside.note", { hasText: "SVG and PDF export" })
    .getByRole("link", { name: "what is not exported as vector" })).toHaveAttribute("href", "/docs/export");
  await expect(page.locator(".example canvas").first()).toBeVisible();
  await page.goto("/examples");
  await expect(page.getByRole("heading", { name: "Examples", exact: true })).toBeVisible();
  await expect(page.getByText("Additional examples")).toBeVisible();
});

test("authoring page links API names and highlights complete inline programs", async ({ page }) => {
  await page.goto("/docs/authoring");
  await expect(page.locator('article a[href="/reference/svelte/plot"]')).toBeVisible();
  const section = page.getByRole("region",{name:"Example",exact:true});
  await expect(section.locator("canvas").first()).toBeVisible();
  await expect(section.locator(".highlighted")).toHaveCount(1);
  await section.getByRole("button",{name:"Python",exact:true}).click();
  await expect(section.locator(".highlighted")).toContainText("hm.Points");
  await page.goto("/docs/introduction");
  await expect(page.getByRole("heading",{name:"Introduction",exact:true})).toBeVisible();
  await expect(page.getByRole("region",{name:"Example",exact:true})).toHaveCount(0);
});

// TODO 67.4: a page shows the source language it has, whatever the route's: a JavaScript-only
// page opened from Python shows its Svelte (it showed an empty snippet), a Python-only one opened
// from Svelte its Python, each with its language note; a remembered Python choice too.
test("single-language pages show the source they have, with the language note", async ({ page }) => {
  const usage = page.getByRole("region", { name: "Usage example" });
  await page.goto("/reference/python/initialize-plot");
  await expect(usage.locator("pre code")).toContainText("await initializePlot();");
  await expect(usage.getByRole("button", { name: "Svelte", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".language-note")).toHaveText("JavaScript only.");
  await page.goto("/reference/svelte/visualize-tree");
  await expect(usage.locator("pre code")).toContainText("hm.visualize_tree(plot)");
  await expect(usage.getByRole("button", { name: "Python", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".language-note")).toContainText("Python only.");
  // A Python-only component's Example shows its Python, and leaves the page's language alone.
  await page.goto("/reference/svelte/scene");
  const example = page.getByRole("region", { name: "Example", exact: true });
  await expect(example.locator("section[aria-label='Example source'] pre code")).toContainText("hm.Scene()");
  await expect(example.getByRole("button", { name: "Python", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("link", { name: "API reference" })).toHaveAttribute("href", "/reference/svelte/plot");
  // Python chosen on one page, then a JavaScript-only page through the navigation.
  await page.goto("/reference/python/plot");
  await page.getByRole("region", { name: "Example", exact: true }).getByRole("button", { name: "Python", exact: true }).click();
  await page.getByRole("complementary", { name: "Section navigation" }).getByRole("link", { name: "initializePlot", exact: true }).click();
  await expect(page).toHaveURL(/\/reference\/python\/initialize-plot$/);
  await expect(usage.locator("pre code")).toContainText("await initializePlot();");
});

// TODO 69.8, 69.9, 69.13: helpers grouped on a page are each a searchable row; a type page lists
// its own rows after the type's members; Python handle pages have Python's member table; the
// package's entry points have an index.
test("the reference finds each helper, Python's handle members and the package entry points", async ({ page }) => {
  await page.goto("/reference/svelte/plot");
  const navigation = page.getByRole("complementary", { name: "Section navigation" });
  await navigation.getByRole("searchbox", { name: "Search reference" }).fill("less_equal");
  await expect(navigation.getByRole("link")).toHaveText(["Expression functions"]);
  await navigation.getByRole("link", { name: "Expression functions" }).click();
  const options = page.getByRole("region", { name: "Options" });
  await expect(options.getByRole("heading", { level: 2 })).toHaveText("Functions");
  await expect(options.getByRole("heading", { level: 3 })).toHaveCount(0);
  await expect(options.locator("dt code", { hasText: "less_equal(a, b)" })).toBeVisible();
  await page.goto("/reference/python/expressions");
  await expect(options.locator("dt code", { hasText: "hm.less_equal(a, b)" })).toBeVisible();
  await page.goto("/reference/svelte/themes");
  await expect(options.getByRole("heading", { level: 3 })).toHaveText(["Members", "Presets"]);
  await page.goto("/reference/python/plot-handle");
  await expect(options).toContainText("listed under “Python members” below");
  const members = page.locator(".markdown table").first();
  await expect(members.locator("tr", { hasText: "when_settled(*, view=None, timeout=60)" })).toContainText("await");
  await expect(page.locator(".markdown table").nth(1).locator("tr", { hasText: "hm.export_png(" })).toContainText("sync");
  await page.goto("/reference/svelte/package-entries");
  await expect(page.locator(".markdown table a")).toHaveText(["hmplot/charts", "hmplot/stats", "hmplot/jax", "hmplot/vite", "hmplot/tiles", "hmplot/video", "hmplot/scene", "hmplot/templates", "hmplot/types", "hmplot/compound"]);
  await page.locator(".markdown table a", { hasText: "hmplot/tiles" }).click();
  await expect(page).toHaveURL(/\/reference\/svelte\/package-tiles$/);
  await expect(options.locator("dt code", { hasText: "tileAt([longitude, latitude], z)" })).toBeVisible();
});

// The docs' Example component (R2.0b.4), on src/examples/scatter-brush. Its build
// (static/example-builds/) comes from the dev server (scripts/vite-examples.js).
function example(page) {
  const section = page.getByRole("region", { name: "Example", exact: true });
  const description = (layer) => section.locator(`.layer:nth-child(${layer === "tree" ? 2 : 1}) .hm-visually-hidden`).first();
  return { section, description };
}

// The snapshot is labeled "Static preview" (a status says so to screen readers) and fades out over
// the live plot once it has drawn; with reduced motion it goes at once (user request 2026-10-02).
test("an Example shows its snapshot, then the live plot; Show tree swaps in its component tree", async ({ page }) => {
  // The scene is held back until the snapshot has been seen.
  let release;
  const held = new Promise((resolve) => (release = resolve));
  await page.route("**/example-builds/scatter-brush/payload.*.json", async (route) => { await held; await route.continue(); });
  // Each snapshot that fades out (the class `leaving`, while its opacity animates).
  await page.addInitScript(() => {
    const seen = new WeakSet();
    window.__fades = 0;
    new MutationObserver(() => { for (const node of document.querySelectorAll(".snapshot.leaving")) if (!seen.has(node)) { seen.add(node); window.__fades += node.getAnimations().length > 0; } })
      .observe(document, { subtree: true, attributes: true, attributeFilter: ["class"] });
  });
  await page.goto("/test/example?id=scatter-brush");
  const { section, description } = example(page);
  await expect(section.getByLabel("Snapshot")).toBeVisible();
  await expect(section.locator(".snapshot .preview-label.loading")).toHaveText("Static preview");
  const status = section.locator(".layer").nth(0).locator(".preview-status");
  await expect(status).toHaveText("Static preview; loading the interactive plot");
  await expect(section.locator(".live")).toHaveCount(0);
  release();
  await expect(section.locator(".live.ready")).toBeVisible();
  await expect(section.getByLabel("Snapshot")).toHaveCount(0);
  await expect(section.locator(".preview-label")).toHaveCount(0);
  await expect(status).toHaveText("Interactive plot");
  expect(await page.evaluate(() => window.__fades)).toBe(1);
  await expect(description("plot")).toContainText("2,000 points");
  await section.getByRole("button", { name: "Python", exact: true }).click();
  await expect(section.locator("pre code")).toContainText('hm.Points(x="x", y="y"');
  await page.emulateMedia({ reducedMotion: "reduce" });
  await section.getByRole("button", { name: "Show tree" }).click();
  await expect(section.locator(".layer").nth(0)).toBeHidden();
  await expect(section.locator(".layer").nth(1).locator(".live.ready")).toBeVisible();
  await expect(section.locator(".layer").nth(1).getByLabel("Snapshot")).toHaveCount(0);
  expect(await page.evaluate(() => window.__fades)).toBe(1);
  await expect(description("tree")).toContainText("colored by group");
  await section.getByRole("button", { name: "Show plot" }).click();
  await expect(section.locator(".layer").nth(0)).toBeVisible();
});

// TODO 68: docs pages arrive readable, with the example's preview; live plots load only where they
// can draw, when they come near the viewport, and never for a page left before they did.
const runtimeRequest = (url) => /\/src\/lib\/(docs\/live\.js|scene\/(runtime\.svelte|SceneRenderer)|jaxExtensions\/)|\/three|@hmplot_jax/.test(url);

test("docs pages arrive readable without scripts: prose, options, source and a sized preview; text pages load no runtime", async ({ page }) => {
  await page.route(/./, (route) => route.request().resourceType() === "script" ? route.abort() : route.continue());
  await page.goto("/reference/svelte/points");
  await expect(page.getByRole("heading", { name: "Points", exact: true, level: 1 })).toBeVisible();
  await expect(page.locator("#option-sizeUnits dt code")).toHaveText("sizeUnits");
  const example = page.getByRole("region", { name: "Example", exact: true });
  await expect(example.locator("section[aria-label='Example source'] pre")).toContainText('from "hmplot"');
  // The page's first example loads first; its preview is the build's SVG, sized, with the plot's description.
  const preview = example.locator(".snapshot img");
  await expect(preview).toHaveAttribute("src", /^\/example-builds\/points-basic\/preview\.[0-9a-f]{10}\.svg$/);
  await expect(preview).toHaveAttribute("fetchpriority", "high");
  await expect(preview).toHaveAttribute("width", "800");
  await expect(preview).toHaveAttribute("alt", /^Scatter plot of y against x/);
  await expect.poll(() => preview.evaluate((image) => image.naturalWidth)).toBe(800);
  // A guide page's examples load lazily.
  await page.goto("/docs/export");
  await expect(page.locator(".example .snapshot img")).toHaveAttribute("loading", "lazy");
  await page.unrouteAll();
  const requests = [];
  page.on("request", (request) => requests.push(request.url()));
  await page.goto("/docs/introduction");
  await expect(page.getByRole("heading", { name: "Introduction", exact: true })).toBeVisible();
  await page.waitForLoadState("networkidle");
  expect(requests.filter((url) => runtimeRequest(url) || url.includes("/example-builds/"))).toEqual([]);
});

test("an example's preview comes with its page; sources, data files and the manifest are not fetched for it", async ({ page }) => {
  const requests = [];
  page.on("request", (request) => requests.push(request.url()));
  await page.goto("/reference/svelte/points");
  await expect(page.locator(".example .live.ready")).toBeVisible();
  const index = (pattern) => requests.findIndex((url) => pattern.test(url));
  expect(index(/\/points-basic\/preview\./)).toBeGreaterThanOrEqual(0);
  expect(index(/\/points-basic\/preview\./)).toBeLessThan(index(/\/src\/lib\/docs\/live\.js/));
  expect(requests.filter((url) => /files\.json|manifest\.json|assets\.json|\/src\/examples\/.*\?raw/.test(url))).toEqual([]);
});

// A Facet example's preview is in the page's first HTML and still shows when the first live frame
// draws: on a dev server a guide example draws its Svelte program, which hid the preview at once
// and showed its plots' loading spinners until they drew (TODO 68, reported 2026-10-02).
test("a Facet example's preview is in the first HTML and shows until the live plot has drawn", async ({ page }) => {
  const html = await (await page.request.get("/docs/facets")).text();
  expect(html).toMatch(/<img[^>]+src="\/example-builds\/docs--facets--1\/preview\.[0-9a-f]{10}\.svg"/);
  await page.addInitScript(() => {
    const texture = GPUCanvasContext.prototype.getCurrentTexture;
    GPUCanvasContext.prototype.getCurrentTexture = function () {
      window.__previewAtFirstFrame ??= Boolean(document.querySelector(".example .snapshot img")?.checkVisibility({ visibilityProperty: true }));
      return texture.call(this);
    };
  });
  await page.goto("/docs/facets");
  await expect(page.locator(".example canvas").first()).toBeVisible();
  expect(await page.evaluate(() => window.__previewAtFirstFrame)).toBe(true);
  await expect(page.locator(".example .snapshot img")).toBeHidden();
});

test("an example below the fold fetches its scene and goes live only when it comes near the viewport", async ({ page }) => {
  const requests = [];
  page.on("request", (request) => requests.push(request.url()));
  await page.goto("/test/example?id=points-basic,area-basic");
  const [first, second] = [0, 1].map((i) => page.getByRole("region", { name: "Example", exact: true }).nth(i));
  await expect(first.locator(".live.ready")).toBeVisible();
  await page.waitForTimeout(500);
  expect(requests.filter((url) => url.includes("/area-basic/"))).toEqual([]);
  await expect(second.locator(".live")).toHaveCount(0);
  await second.scrollIntoViewIfNeeded();
  await expect(second.locator(".live.ready")).toBeVisible();
  await expect(second.getByLabel("Snapshot")).toHaveCount(0);
});

test("without WebGPU an example keeps its preview, source and tree, and loads no runtime", async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, "gpu", { value: undefined, configurable: true }));
  const requests = [], errors = [];
  page.on("request", (request) => requests.push(request.url()));
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/reference/svelte/points");
  const example = page.getByRole("region", { name: "Example", exact: true });
  await expect.poll(() => example.locator(".snapshot img").evaluate((image) => image.naturalWidth)).toBe(800);
  // The label is short; the status says it in full.
  await expect(example.locator(".preview-label")).toHaveText("Static · no WebGPU");
  await expect(example.locator(".preview-status").first()).toHaveText("Static preview: this browser has no WebGPU");
  await expect(example.locator(".preview-label")).not.toHaveClass(/loading/);
  // The preview shows before the page's scripts have run; the buttons work once they have.
  await page.waitForLoadState("networkidle");
  await example.getByRole("button", { name: "Python", exact: true }).click();
  await expect(example.locator("section[aria-label='Example source'] pre")).toContainText("hm.Points");
  await example.getByRole("button", { name: "Show tree" }).click();
  const tree = example.locator(".layer").nth(1).locator(".snapshot img");
  await expect.poll(() => tree.evaluate((image) => image.naturalWidth)).toBeGreaterThan(0);
  await page.waitForTimeout(500);
  expect(requests.filter((url) => runtimeRequest(url) || /\/(payload|tree)\.[0-9a-f]+\.json/.test(url))).toEqual([]);
  await expect(example.locator(".live")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("leaving a page while its example loads cancels it: the next page's example goes live alone", async ({ page }) => {
  let release;
  const held = new Promise((resolve) => (release = resolve));
  await page.route("**/example-builds/points-basic/payload.*.json", async (route) => { await held; await route.continue(); });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const requested = page.waitForRequest(/points-basic\/payload\./);
  await page.goto("/reference/svelte/points");
  await requested;
  await page.getByRole("complementary", { name: "Section navigation" }).getByRole("link", { name: "Line", exact: true }).click();
  await expect(page).toHaveURL(/\/reference\/svelte\/line$/);
  release();
  await expect(page.locator(".example .live.ready")).toBeVisible();
  await page.waitForTimeout(500);
  await expect(page.locator(".example")).toHaveCount(1);
  await expect(page.locator(".example .live")).toHaveCount(1);
  await expect(page.locator(".example")).toHaveAttribute("data-example", "line-basic");
  // One scene applied (live.js measures each): the Line's; the Points' payload arrived to nothing.
  expect(await page.evaluate(() => performance.getEntriesByName("hmplot:apply").length)).toBe(1);
  expect(errors).toEqual([]);
});

// TODO 68.3: large scenes preview as WebP at 1x and 2x, not megabytes of SVG; no preview sends more
// than 500 KB (an SVG gzipped, as hosts send it).
test("web previews are small: large scenes are WebP images, each under 500 KB on the wire", async ({ page }) => {
  const manifest = await (await page.request.get("/example-builds/manifest.json")).json();
  const lorenz = manifest["lorenz-attractor"].views.plot.previews.web;
  expect([lorenz.type, lorenz.srcset.map(([, width]) => width)]).toEqual(["image/webp", [818, 1636]]);
  expect(manifest["points-basic"].views.plot.previews.web.type).toBe("image/svg+xml");
  const sizes = [];
  for (const [id, { views }] of Object.entries(manifest)) for (const [view, { previews }] of Object.entries(views)) {
    const { src, type } = previews.web, body = await (await page.request.get(`/example-builds/${src}`)).body();
    sizes.push([`${id} ${view}`, type === "image/svg+xml" ? gzipSync(body).length : body.length]);
  }
  expect(sizes.length).toBeGreaterThan(200);
  expect(sizes.filter(([, bytes]) => bytes > 500 * 1024)).toEqual([]);
});

// TODO 69.18, 69.19: the home page's first plot is the Palmer penguins; the home page's gallery and
// the examples page are cards with thumbnails made when the site is built, never live plots.
test("the home page shows the penguins first, then a gallery of thumbnail cards", async ({ page }) => {
  await page.goto("/");
  const example = page.getByRole("region", { name: "Example", exact: true });
  await expect(example).toHaveAttribute("data-example", "penguins");
  const preview = example.locator(".snapshot img");
  await expect(preview).toHaveAttribute("fetchpriority", "high");
  await expect(preview).toHaveAttribute("alt", /Bill depth \(mm\) against Bill length \(mm\), colored by species \(Adelie, Gentoo, Chinstrap\).* 342 points/);
  // Eight cards, each one link named by its title, with a sized image that loads lazily.
  const cards = page.locator("main.home a.card");
  await expect(cards).toHaveCount(8);
  await expect(page.getByRole("link", { name: /^Lorenz attractor/ })).toHaveAttribute("href", "/examples/lorenz-attractor");
  for (const image of await cards.locator("img").all()) {
    await expect(image).toHaveAttribute("loading", "lazy");
    await expect(image).toHaveAttribute("alt", "");
    expect(Number(await image.getAttribute("width")) * Number(await image.getAttribute("height"))).toBeGreaterThan(0);
  }
  await expect(cards.locator("img")).toHaveCount(8);
  await cards.last().scrollIntoViewIfNeeded();
  await expect.poll(() => cards.locator("img").evaluateAll((images) => images.filter((image) => image.naturalWidth > 0).length)).toBe(8);
  await expect(page.getByRole("link", { name: "All examples →" })).toHaveAttribute("href", "/examples");
});

test("the examples page: a thumbnail on every card, the first row first, search, groups, a text fallback and no live plots", async ({ page }) => {
  const requests = [];
  page.on("request", (request) => requests.push(request.url()));
  // The violin's thumbnail fails: its card shows the example's tags instead. (A program pair's
  // thumbnail is under example-builds/<id>/, a gallery program's under example-builds/gallery/.)
  await page.route("**/example-builds/**/violin/thumbnail-*", (route) => route.abort());
  await page.goto("/examples");
  const cards = page.locator("main.gallery a.card");
  await expect(cards).toHaveCount(catalog.length);
  // The first row loads at once, the rest as it comes near the viewport.
  expect(await cards.locator("img").evaluateAll((images) => images.slice(0, 6).map((image) => image.loading))).toEqual(["eager", "eager", "eager", "eager", "eager", "lazy"]);
  await expect(page.getByRole("heading", { name: "Maps", level: 3 })).toBeVisible();
  // Scrolled through, every thumbnail loads, but the violin's, whose card shows its tags instead;
  // a card has none only where gallery.json says why (a program that fails on a known bug).
  for (let y = 0; y < await page.evaluate(() => document.body.scrollHeight); y += 800) {
    await page.evaluate((top) => window.scrollTo(0, top), y);
    await page.waitForTimeout(50);
  }
  const violin = page.locator('a.card[href="/examples/violin"]');
  await expect(violin.locator("img")).toHaveCount(0);
  await expect(violin).toContainText("Statistics · Density");
  await expect.poll(() => cards.locator("img").evaluateAll((images) => images.filter((image) => !image.naturalWidth).length), { timeout: 20000 }).toBe(0);
  const gallery = await (await page.request.get("/example-builds/gallery.json")).json();
  const skipped = Object.keys(gallery).filter((id) => gallery[id].skipped);
  expect((await cards.evaluateAll((list) => list.filter((card) => !card.querySelector("img")).map((card) => card.getAttribute("href").split("/").pop()))).sort())
    .toEqual([...skipped, "violin"].sort());
  // The cards fetch no runtime, scene or example program, hovered either.
  await cards.first().scrollIntoViewIfNeeded();
  await cards.first().hover();
  await page.waitForTimeout(500);
  expect(requests.filter((url) => runtimeRequest(url) || /\/(payload|tree)\.[0-9a-f]+\.json|\/src\/routes\/examples\/.*\/[A-Z]\w*\.svelte/.test(url))).toEqual([]);
  // Search keeps the matching cards.
  await page.getByRole("searchbox", { name: "Find an example" }).fill("penguins");
  const matching = catalog.filter((e) => `${e.title} ${e.description} ${e.tags}`.toLowerCase().includes("penguins")).map((e) => `/examples/${e.id}`);
  await expect(cards).toHaveCount(matching.length);
  expect((await cards.evaluateAll((list) => list.map((card) => card.getAttribute("href")))).sort()).toEqual(matching.sort());
});

test("Edit in Python runs the edited code and its tree in Pyodide, marks an error's line, and Stop ends a loop", async ({ page }) => {
  // Pyodide and its packages come from its CDN.
  test.setTimeout(240000);
  await page.goto("/test/example?id=scatter-brush");
  const { section, description } = example(page);
  await expect(section.locator(".live.ready")).toBeVisible();
  await section.getByRole("button", { name: "Edit in Python" }).click();
  const editor = section.getByRole("textbox", { name: "Python source" }), status = section.locator(".status");
  const replace = async (source) => {
    await editor.click();
    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.insertText(source);
  };
  await replace('import hmplot as hm\n\nprint("rows", 3)\nwith hm.Plot(data={"x": [1, 2, 3], "y": [3, 4, 2]}) as plot:\n'
    + '    hm.Points(x="x", y="y")\n    hm.Line(x="x", y="y")\n');
  await page.keyboard.press("ControlOrMeta+Enter");
  await expect(status).toHaveText("ready", { timeout: 200000 });
  await expect(description("plot")).toContainText("3 points");
  await expect(section.locator(".stdout")).toHaveText("rows 3");
  // The tree is the edited code's: Plot, Points and Line.
  await expect(description("tree")).toContainText("3 points");
  await replace("import hmplot as hm\n\nhm.Nope()\n");
  await section.getByRole("button", { name: "Run" }).click();
  await expect(section.getByRole("alert")).toContainText('File "<example>", line 3');
  await expect(section.locator(".cm-lintRange-error")).toHaveCount(1);
  await replace("while True:\n    pass\n");
  await section.getByRole("button", { name: "Run" }).click();
  await expect(status).toHaveText("Running Python…");
  await section.getByRole("button", { name: "Stop", exact: true }).click();
  await expect(status).toHaveText("stopped");
  await section.getByRole("button", { name: "Reset" }).click();
  await section.getByRole("button", { name: "Run" }).click();
  await expect(status).toHaveText("ready", { timeout: 200000 });
  await expect(description("plot")).toContainText("2,000 points");
});

test("Galaxy uses the full paired Example with compact GPU data, source, tree and Python editing", { tag: "@gpu" }, async ({ page }, testInfo) => {
  test.setTimeout(240000);
  const errors = [], payloads = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("response", response => {
    if (/\/example-builds\/ten-million-stars\/payload\./.test(response.url()))
      payloads.push(response.body().then(body => body.length));
  });
  await page.goto("/examples/ten-million-stars");
  const { section } = example(page);
  await expect(section.locator('.layer').first().locator('.live.ready')).toBeVisible({ timeout: 120000 });
  await page.waitForFunction(() => [...document.querySelectorAll('.canvas')].every(canvas => canvas.getAttribute('aria-busy') === 'false'));
  await page.evaluate(() => window.__examples.settle());
  const count = () => page.evaluate(() => window.__examples.plot.getDiagnostics().marks.find(mark => mark.fields.position)?.fields.position.count);
  expect(await count()).toBe(10_000_000);
  const png = await section.locator('.layer').first().locator('.live canvas').first().screenshot({ path: testInfo.outputPath('galaxy-python.png') });
  const visible = (png, predicate) => {
    const pixel = pixelReader(png), width = png.readUInt32BE(16), height = png.readUInt32BE(20);
    let pixels = 0;
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (predicate(...pixel(x, y))) pixels++;
    return pixels;
  };
  const stars = visible(png, (r, g, b) => Math.max(r, g, b) > 90);
  expect(stars).toBeGreaterThan(1000);
  expect(payloads.length).toBe(1);
  expect((await Promise.all(payloads))[0]).toBeLessThan(60000);
  await section.getByRole('button', { name: 'Python', exact: true }).click();
  await expect(section.locator('pre code')).toContainText('hm.random(seed=7)');
  await expect(section.locator('pre code')).toContainText('hm.Data(rows=STARS)');
  await section.getByRole('button', { name: 'Svelte', exact: true }).click();
  await expect(section.locator('pre code')).toContainText('shape="square"');
  await expect(section.getByRole('link', { name: 'Download galaxy.js', exact: true })).toBeVisible();
  const oldest = section.getByRole('slider', { name: 'Oldest (billion years)' });
  await oldest.fill('1');
  // Padded GPU fields retain their physical capacity. Check the filtered beauty draw.
  await expect.poll(async () => {
    await page.evaluate(() => window.__examples.settle());
    const filtered = await section.locator('.layer').first().locator('.live canvas').first().screenshot();
    return visible(filtered, (r, g, b) => Math.max(r, g, b) > 90);
  }, { timeout: 30000 }).toBeLessThan(stars * 0.9);
  await section.getByRole('button', { name: 'Show tree' }).click();
  await expect(section.locator('.layer').nth(1).locator('.live.ready')).toBeVisible();
  const tree = await section.locator('.layer').nth(1).locator('canvas').screenshot({ path: testInfo.outputPath('galaxy-tree.png') });
  expect(visible(tree, (r, g, b) => Math.max(r, g, b) - Math.min(r, g, b) > 30)).toBeGreaterThan(100);
  await section.getByRole('button', { name: 'Show plot' }).click();
  await section.getByRole('button', { name: 'Edit in Python' }).click();
  const editor = section.getByRole('textbox', { name: 'Python source' });
  await editor.click(); await page.keyboard.press('ControlOrMeta+a');
  const original = readFileSync(new URL('../../src/examples/ten-million-stars/ten-million-stars.py', import.meta.url), 'utf8');
  await page.keyboard.insertText(original.replace('STARS = 10_000_000', 'STARS = 512'));
  await page.keyboard.press('ControlOrMeta+Enter');
  await expect(section.locator('.status')).toHaveText('ready', { timeout: 180000 });
  await page.waitForFunction(() => [...document.querySelectorAll('.canvas')].every(canvas => canvas.getAttribute('aria-busy') === 'false'));
  await page.evaluate(() => window.__examples.settle());
  expect(await count()).toBe(512);
  await expect(section.locator('.layer').first().locator('canvas')).toHaveCount(2);
  await section.getByRole('button', { name: 'Close editor' }).click();
  await expect(section.getByRole('button', { name: 'Python', exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

// TODO 64 (67.4, 69.11): the Interaction example names its selection @focus, which its Filter
// reads: a clicked point joins it and is drawn highlighted, by the Svelte program and by the
// Python build's scene.
test("the Interaction example: a clicked point joins @focus and its Filter draws it", async ({ page }) => {
  // Colored pixels of the canvas: the points (#3478c7), one entry a point, and the highlight (#e0245e).
  const drawn = async () => page.evaluate(async (b64) => {
    const image = new Image();
    image.src = "data:image/png;base64," + b64;
    await image.decode();
    const canvas = new OffscreenCanvas(image.width, image.height), context = canvas.getContext("2d");
    context.drawImage(image, 0, 0);
    const data = context.getImageData(0, 0, image.width, image.height).data, points = [];
    let red = 0;
    for (let i = 0; i < data.length; i += 4) {
      const [r, g, b] = [data[i], data[i + 1], data[i + 2]], x = (i / 4) % image.width, y = Math.floor(i / 4 / image.width);
      if (Math.abs(r - 52) < 30 && Math.abs(g - 120) < 30 && Math.abs(b - 199) < 30 && !points.some(([px, py]) => Math.hypot(px - x, py - y) < 20))
        points.push([x, y]);
      if (Math.abs(r - 224) < 30 && Math.abs(g - 36) < 30 && Math.abs(b - 94) < 30) red++;
    }
    return { points, red, width: image.width, height: image.height };
  }, (await page.locator("canvas").first().screenshot()).toString("base64"));
  for (const url of ["/test/example-svelte?id=interaction-basic", "/test/example?id=interaction-basic"]) {
    await page.goto(url);
    if (url.includes("example?")) await expect(example(page).section.locator(".live.ready")).toBeVisible();
    await page.waitForFunction(() => document.querySelector(".canvas") &&
      [...document.querySelectorAll(".canvas")].every((canvas) => canvas.getAttribute("aria-busy") === "false"));
    // Four points, and no highlight while @focus is empty (inactive="none").
    await expect.poll(async () => (await drawn()).points.length).toBe(4);
    const before = await drawn();
    expect(before.red).toBe(0);
    const box = await page.locator("canvas").first().boundingBox(), [x, y] = before.points[0];
    await page.mouse.click(box.x + ((x + 4) / before.width) * box.width, box.y + ((y + 4) / before.height) * box.height);
    await expect.poll(async () => (await drawn()).red, { message: url }).toBeGreaterThan(50);
  }
});

// TODO 67: the reported reference examples draw what they should, on every path on its own: the
// Svelte program's SVG export and canvas, and the Python build's SVG and live scene. Agreeing with
// each other is not enough (both drew the same bugs). Geometry is read from the SVGs in CSS pixels;
// canvases at the spec's device pixel ratio of 2.
async function exampleViews(page, id) {
  await page.goto(`/test/example-svelte?id=${id}`);
  await expect(page.locator("section.plot")).toHaveCount(1, { timeout: 30000 });
  const busy = () => page.waitForFunction(() => document.querySelector(".canvas") &&
    [...document.querySelectorAll(".canvas")].every((canvas) => canvas.getAttribute("aria-busy") === "false"), undefined, { timeout: 30000 });
  await busy();
  const plot = page.locator("section.plot").first();
  await plot.locator(".canvas").first().hover();
  await plot.getByRole("button", { name: /^Export / }).first().click();
  const panel = page.getByRole("dialog", { name: /^Export · / });
  await panel.getByLabel("Format").selectOption("svg");
  const [download] = await Promise.all([page.waitForEvent("download"), panel.getByRole("button", { name: "Download" }).click()]);
  const svelteSVG = readFileSync(await download.path(), "utf8");
  const svelteCanvas = (await plot.locator("canvas").first().screenshot()).toString("base64");
  await page.keyboard.press("Escape");
  const pythonSVG = await (await page.request.get(`/example-builds/${id}/compare/0.svg`)).text();
  await page.goto(`/test/example?id=${id}`);
  await expect(example(page).section.locator(".live.ready")).toBeVisible({ timeout: 30000 });
  await busy();
  const pythonCanvas = (await example(page).section.locator(".live canvas").first().screenshot()).toString("base64");
  return { svgs: { svelte: svelteSVG, python: pythonSVG }, canvases: { svelte: svelteCanvas, python: pythonCanvas } };
}
/** An SVG's marks and axes: circles, paths (points, fill, stroke), the x axis line and tick positions. */
function svgGeometry(page, text) {
  return page.evaluate((text) => {
    const doc = new DOMParser().parseFromString(text, "image/svg+xml"), axes = doc.querySelector("[data-export-axes]");
    const points = (d) => { const n = d.match(/-?[\d.]+(?:e-?\d+)?/g)?.map(Number) ?? []; return n.flatMap((_, i) => i % 2 ? [] : [[n[i], n[i + 1]]]); };
    const marks = [...doc.querySelectorAll("path, circle")].filter((e) => !axes?.contains(e) && !e.closest("defs"));
    const ticks = (axis) => Object.fromEntries([...(axes?.querySelectorAll(`.${axis}-tick`) ?? [])].map((g) => {
      const [x, y] = g.getAttribute("transform").match(/-?[\d.]+/g).map(Number);
      return [g.dataset.value, axis === "x" ? x : y];
    }));
    const xAxis = [...(axes?.querySelectorAll(".axis-lines") ?? [])].map((p) => p.getAttribute("d")).find((d) => d.includes("H"));
    return {
      circles: marks.filter((e) => e.tagName === "circle").map((c) => ({ cx: +c.getAttribute("cx"), cy: +c.getAttribute("cy"), r: +c.getAttribute("r"), fill: c.getAttribute("fill") })),
      paths: marks.filter((e) => e.tagName === "path").map((p) => ({ points: points(p.getAttribute("d")), fill: p.getAttribute("fill"), stroke: p.getAttribute("stroke"),
        width: Number(p.getAttribute("stroke-width")), cap: p.getAttribute("stroke-linecap") })),
      xTicks: ticks("x"), yTicks: ticks("y"), axisY: xAxis ? Number(xAxis.match(/M[\d.]+ ([\d.]+)/)[1]) : null,
      size: [Number(doc.documentElement.getAttribute("width")), Number(doc.documentElement.getAttribute("height"))],
    };
  }, text);
}
/** A canvas screenshot's connected regions of pixels near `color` (within `tolerance`), largest first. */
function canvasBlobs(page, b64, color, tolerance = 40) {
  return page.evaluate(async ([b64, color, tolerance]) => {
    const image = new Image();
    image.src = "data:image/png;base64," + b64;
    await image.decode();
    const canvas = new OffscreenCanvas(image.width, image.height), context = canvas.getContext("2d");
    context.drawImage(image, 0, 0);
    const { data, width, height } = context.getImageData(0, 0, image.width, image.height);
    const target = ["any", "colored"].includes(color) ? null : [1, 3, 5].map((k) => parseInt(color.slice(k, k + 2), 16));
    const match = (i) => target ? target.every((v, c) => Math.abs(data[i * 4 + c] - v) <= tolerance)
      : color === "colored" ? Math.max(...data.subarray(i * 4, i * 4 + 3)) - Math.min(...data.subarray(i * 4, i * 4 + 3)) > 35
        : Math.min(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]) < 245;
    const seen = new Uint8Array(width * height), blobs = [];
    for (let i = 0; i < width * height; i++) {
      if (seen[i] || !match(i)) continue;
      const stack = [i], blob = { n: 0, x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity, colors: new Set() };
      seen[i] = 1;
      while (stack.length) {
        const j = stack.pop(), x = j % width, y = (j / width) | 0;
        blob.n++; blob.x0 = Math.min(blob.x0, x); blob.x1 = Math.max(blob.x1, x); blob.y0 = Math.min(blob.y0, y); blob.y1 = Math.max(blob.y1, y);
        for (const q of [j - 1, j + 1, j - width, j + width])
          if (q >= 0 && q < width * height && !seen[q] && Math.abs((q % width) - x) <= 1 && match(q)) { seen[q] = 1; stack.push(q); }
      }
      blobs.push({ ...blob, w: blob.x1 - blob.x0 + 1, h: blob.y1 - blob.y0 + 1, colors: undefined });
    }
    return { width, height, blobs: blobs.sort((a, b) => b.n - a.n) };
  }, [b64, color, tolerance]);
}

test("the reported reference examples draw their geometry correctly on every path", async ({ page }) => {
  test.setTimeout(240000);
  const close = (a, b, tolerance = 0.5) => Math.abs(a - b) <= tolerance;
  // Area (67.1): its baseline 0 is on the axis, and the fill stays between it and the top.
  let views = await exampleViews(page, "area-basic");
  for (const [path, text] of Object.entries(views.svgs)) {
    const g = await svgGeometry(page, text), zero = g.yTicks["0"], fill = g.paths.filter((p) => p.fill === "#3478c7");
    expect(zero, path).toBeDefined();
    expect(fill.length, path).toBe(4);
    for (const p of fill) for (const [, y] of p.points) expect(y >= 0 && y <= zero + 0.5, `${path} ${y} against ${zero}`).toBe(true);
    expect(Math.max(...fill.flatMap((p) => p.points.map(([, y]) => y))), path).toBeCloseTo(zero, 1);
  }
  const zero = (await svgGeometry(page, views.svgs.svelte)).yTicks["0"];
  for (const [path, b64] of Object.entries(views.canvases)) {
    // The fill (the mark's blue, drawn exactly: TODO 133.3): one region down to y = 0, and none
    // of it below.
    const { blobs, height } = await canvasBlobs(page, b64, "#3478c7", 8), fill = blobs.filter((b) => b.n > 50);
    expect(fill.length, path).toBeGreaterThan(0);
    expect(Math.abs(Math.max(...fill.map(b=>b.y1)) / height * 300 - zero), `${path} ${fill[0].y1}`).toBeLessThanOrEqual(1.5);
  }
  // Lollipop (67.1): stems from 0 to each value, 1.5 px wide, heads at the values; a head of the
  // default size, 5, is 5 px across (a literal Points size is its diameter, TODO 73.1).
  views = await exampleViews(page, "lollipop-basic");
  for (const [path, text] of Object.entries(views.svgs)) {
    const g = await svgGeometry(page, text), zero = g.yTicks["0"];
    const heads = g.circles.filter((c) => c.fill === "#3478c7"), stems = g.paths.filter((p) => p.stroke === "#8a949e" && p.points.length === 2 && p.points[0][1] !== p.points[1][1]);
    expect([heads.length, stems.length], path).toEqual([5, 5]);
    for (const head of heads) {
      expect(head.r, path).toBe(2.5);
      const stem = stems.find((p) => close(p.points[0][0], head.cx));
      expect(stem.width, path).toBe(1.5);
      expect(close(Math.max(...stem.points.map(([, y]) => y)), zero) && close(Math.min(...stem.points.map(([, y]) => y)), head.cy), path).toBe(true);
    }
  }
  for (const [path, b64] of Object.entries(views.canvases)) {
    const heads = (await canvasBlobs(page, b64, "#3478c7", 50)).blobs.filter((b) => b.n > 20);
    expect(heads.length, path).toBe(5);
    for (const head of heads) expect(Math.abs(head.w - 10) <= 2 && Math.abs(head.h - 10) <= 2, `${path} ${head.w}x${head.h}`).toBe(true);
  }
  // Hexbin (67.1): equal aspect draws regular, pointy hexagons: √3/2 as wide as they are tall.
  views = await exampleViews(page, "hexbin-basic");
  for (const [path, text] of Object.entries(views.svgs)) {
    const cells = (await svgGeometry(page, text)).paths.filter((p) => p.fill?.startsWith("#") && p.points.length === 6);
    expect(cells.length, path).toBe(8);
    for (const { points } of cells) {
      const xs = points.map(([x]) => x), ys = points.map(([, y]) => y);
      expect((Math.max(...xs) - Math.min(...xs)) / (Math.max(...ys) - Math.min(...ys)), path).toBeCloseTo(Math.sqrt(3) / 2, 2);
    }
  }
  // Arrows (67.2): three separate arrows, each a 2 px flat-ended shaft to a 10 x 8 px head.
  views = await exampleViews(page, "arrows-basic");
  for (const [path, text] of Object.entries(views.svgs)) {
    const g = await svgGeometry(page, text), shafts = g.paths.filter((p) => p.stroke === "#3478c7"), heads = g.paths.filter((p) => p.fill === "#3478c7");
    expect([shafts.length, heads.length], path).toEqual([3, 3]);
    for (const [k, head] of heads.entries()) {
      const [tip, b1, b2] = head.points, base = [(b1[0] + b2[0]) / 2, (b1[1] + b2[1]) / 2], shaft = shafts[k].points;
      expect([Math.hypot(tip[0] - base[0], tip[1] - base[1]), Math.hypot(b1[0] - b2[0], b1[1] - b2[1])].map((v) => +v.toFixed(3)), path).toEqual([10, 8]);
      expect(close(shaft[1][0], base[0], 1e-3) && close(shaft[1][1], base[1], 1e-3) && shafts[k].width === 2 && shafts[k].cap === "butt", path).toBe(true);
    }
  }
  for (const [path, b64] of Object.entries(views.canvases))
    expect((await canvasBlobs(page, b64, "#3478c7", 60)).blobs.filter((b) => b.n > 100).length, path).toBe(3);
  // Pack (67.3): every circle inside its parent (rows root, a, b, a1-a3, b1-b2), the root inside
  // the plot; the canvas paints the root's disk and nothing past it.
  views = await exampleViews(page, "pack-basic");
  const parents = [-1, 0, 0, 1, 1, 1, 2, 2];
  for (const [path, text] of Object.entries(views.svgs)) {
    const { circles, size } = await svgGeometry(page, text);
    expect(circles.length, path).toBe(8);
    for (const [i, p] of parents.entries()) {
      if (p < 0) continue;
      const [c, q] = [circles[i], circles[p]];
      expect(Math.hypot(c.cx - q.cx, c.cy - q.cy) + c.r, `${path} circle ${i} in ${p}`).toBeLessThanOrEqual(q.r + 0.5);
    }
    const root = circles[0];
    expect(root.cx - root.r >= -0.5 && root.cy - root.r >= -0.5 && root.cx + root.r <= size[0] + 0.5 && root.cy + root.r <= size[1] + 0.5, path).toBe(true);
  }
  const root = (await svgGeometry(page, views.svgs.svelte)).circles[0];
  for (const [path, b64] of Object.entries(views.canvases)) {
    const { blobs } = await canvasBlobs(page, b64, "colored");
    expect(blobs.length, path).toBe(1);
    for (const [key, value] of Object.entries({ x0: root.cx - root.r, x1: root.cx + root.r, y0: root.cy - root.r, y1: root.cy + root.r }))
      expect(Math.abs(blobs[0][key] / 2 - value), `${path} ${key}`).toBeLessThanOrEqual(2);
  }
  // GeoJSON (64.9): the three regions, valued 1 to 3, in three colors of the colormap.
  views = await exampleViews(page, "geojson-basic");
  for (const [path, b64] of Object.entries(views.canvases)) {
    const colors = await page.evaluate(async (b64) => {
      const image = new Image();
      image.src = "data:image/png;base64," + b64;
      await image.decode();
      const canvas = new OffscreenCanvas(image.width, image.height), context = canvas.getContext("2d");
      context.drawImage(image, 0, 0);
      const { data } = context.getImageData(0, 0, image.width, image.height), counts = new Map();
      for (let i = 0; i < data.length; i += 4) {
        if (Math.min(data[i], data[i + 1], data[i + 2]) > 235) continue;
        const key = [0, 1, 2].map((c) => Math.round(data[i + c] / 24) * 24).join(",");
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
      return [...counts.values()].filter((n) => n > 200).length;
    }, b64);
    expect(colors, path).toBeGreaterThanOrEqual(3);
  }
});

// The differences between two SVG exports that matter (R2.0b.3), in the page: elements, their
// attributes and text in order, with numbers within 0.05, ids and references by position,
// titles and descriptions left out (they carry the plot's name), classes without Svelte's
// scoped-style hashes (a dev build's differ from the bundle's); embedded images by their
// pixels (at most 1% more than 16 apart in some channel).
async function svgDifferences(page, a, b) {
  return page.evaluate(async ([a, b]) => {
    const differences = [];
    const read = (text) => {
      const root = new DOMParser().parseFromString(text, "image/svg+xml").documentElement, ids = new Map();
      const elements = [...root.querySelectorAll("*")].filter((e) => !e.closest("title, desc, metadata"));
      elements.forEach((e) => { if (e.id) ids.set(e.id, `#${ids.size}`); });
      // A zero-width outline draws no ink. Its unused color may come from a different
      // option registration order; compare visible paint, while retaining the width check.
      for (const e of elements) if (parseFloat(e.style?.strokeWidth || e.getAttribute("stroke-width")) === 0) {
        e.removeAttribute("stroke");
        e.style?.removeProperty("stroke");
      }
      const tokens = (value) => value.replace(/#([\w-]+)/g, (m, id) => ids.get(id) ?? m).match(/-?\d*\.?\d+(?:e[-+]?\d+)?|[^\d\s.,-]+/gi) ?? [];
      return [root, ...elements].map((e) => ({ tag: e.tagName, text: e.children.length ? "" : e.textContent.trim(),
        attributes: Object.fromEntries([...e.attributes].filter((x) => x.name !== "id" && x.name !== "href" && x.name !== "xlink:href")
          .map((x) => [x.name, x.name === "class" ? x.value.split(/\s+/).filter((c) => c && !/^(svelte|s)-/.test(c)).sort() : tokens(x.value)])), href: e.getAttribute("href") ?? e.getAttribute("xlink:href") }));
    };
    const same = (x, y) => x.length === y.length && x.every((t, i) => {
      const [p, q] = [Number(t), Number(y[i])];
      return Number.isFinite(p) && Number.isFinite(q) ? Math.abs(p - q) <= 0.05 : t === y[i];
    });
    const pixels = async (href) => {
      const image = new Image();
      image.src = href;
      await image.decode();
      const canvas = new OffscreenCanvas(image.width, image.height), context = canvas.getContext("2d");
      context.drawImage(image, 0, 0);
      return context.getImageData(0, 0, image.width, image.height).data;
    };
    const [x, y] = [read(a), read(b)];
    if (x.length !== y.length) differences.push(`${x.length} elements against ${y.length}: ${x.map((e) => e.tag).join(" ").slice(0, 300)} | ${y.map((e) => e.tag).join(" ").slice(0, 300)}`);
    for (let i = 0; i < Math.min(x.length, y.length) && differences.length < 8; i++) {
      const [e, f] = [x[i], y[i]], where = `element ${i} <${e.tag}>`;
      if (e.tag !== f.tag) { differences.push(`${where} against <${f.tag}>`); continue; }
      if (e.text !== f.text) differences.push(`${where} text "${e.text}" against "${f.text}"`);
      for (const name of new Set([...Object.keys(e.attributes), ...Object.keys(f.attributes)]))
        if (!same(e.attributes[name] ?? [], f.attributes[name] ?? []))
          differences.push(`${where} ${name}="${(e.attributes[name] ?? []).join(" ").slice(0, 80)}" against "${(f.attributes[name] ?? []).join(" ").slice(0, 80)}"`);
      if (e.href?.startsWith("data:image") && f.href?.startsWith("data:image")) {
        const [p, q] = await Promise.all([pixels(e.href), pixels(f.href)]);
        if (p.length !== q.length) { differences.push(`${where} image sizes differ`); continue; }
        let off = 0;
        for (let k = 0; k < p.length; k += 4)
          if (Math.max(...[0, 1, 2, 3].map((c) => Math.abs(p[k + c] - q[k + c]))) > 16) off++;
        if (off > p.length / 4 / 100) differences.push(`${where} image: ${off} of ${p.length / 4} pixels differ`);
      } else if (e.href !== f.href && !(e.href?.startsWith("#") && f.href?.startsWith("#")))
        differences.push(`${where} href differs`);
    }
    return differences;
  }, [a, b]);
}

// Each pair has a fresh browser context and a bounded timeout: one failed module load
// cannot strand every remaining example in the same document or hide its failure name.
// The gate builds this index before collecting the browser suite.
const onlyExamples = process.env.HM_EXAMPLES?.split(",").filter(Boolean);
let builtExamples;
try {
  builtExamples = JSON.parse(readFileSync(new URL("../../static/example-builds/index.json", import.meta.url), "utf8"));
} catch (cause) {
  throw new Error("Build examples with npm run build:examples before collecting docs-site parity tests.", { cause });
}
const pairedExamples = builtExamples.filter(example => example.svelte && (!onlyExamples || onlyExamples.includes(example.id)));
if (!pairedExamples.length) throw new Error("No built Python/Svelte example pairs match HM_EXAMPLES.");
for (const { id, plots, origin } of pairedExamples) {
  test(`Python/Svelte example parity: ${id}`, async ({ page, stallTimeout }) => {
    test.setTimeout(60000 + 20000 * plots);
    // Compare one frozen moment, including animated examples.
    await page.emulateMedia({ reducedMotion: "reduce" });
    const messages = [];
    page.on("console", message => { if (["error", "warning"].includes(message.type())) messages.push(message.text()); });
    page.on("pageerror", error => messages.push(error.message));
    // Startup is reproducible without the live tile service; navigation still streams.
    const externalTiles = [];
    const offlineTiles = async (route) => { externalTiles.push(route.request().url()); await route.abort(); };
    if (id === "manhattan-flyover") await page.route("https://tiles.versatiles.org/**", offlineTiles);
    await page.goto(`/test/example-svelte?id=${id}`);
    // What exports on its own: each Facet, and each Plot outside one (the build's order).
    const sections = page.locator(".facet-shell, section.plot:not(.facet-shell section.plot)");
    // Allow the diagnosed one-load recovery to finish before checking the mounted plots.
    // The DOM assertion still requires every expected plot; SVG comparisons stay unchanged.
    await expect(sections).toHaveCount(plots, { timeout: stallTimeout + 30000 });
    await page.waitForFunction(() => [...document.querySelectorAll(".canvas")].every((canvas) => canvas.getAttribute("aria-busy") === "false"), undefined, { timeout: 30000 });
    for (let i = 0; i < plots; i++) {
      const plot = sections.nth(i);
      // Hovering a canvas shows its controls (a Facet's come first).
      const canvas = plot.locator(".canvas").first();
      await canvas.hover();
      const button = plot.getByRole("button", { name: /^Export / }).first();
      if (await button.count()) await button.click({ timeout: 10000 });
      else {
        // Small plots omit toolbar buttons; their context menu still exports.
        await canvas.click({ button: "right", position: { x: 8, y: 8 } });
        await page.getByRole("menuitem", { name: "Export…", exact: true }).click({ timeout: 10000 });
      }
      const panel = page.getByRole("dialog", { name: /^Export · / });
      await panel.getByLabel("Format").selectOption("svg");
      const [download] = await Promise.all([page.waitForEvent("download", { timeout: 30000 }), panel.getByRole("button", { name: "Download" }).click()]);
      const svelte = readFileSync(await download.path(), "utf8");
      await page.keyboard.press("Escape");
      const python = await (await page.request.get(`/example-builds/${id}/compare/${i}.svg`)).text();
      // Compare every plot in this example even when an earlier plot differs.
      expect.soft(await svgDifferences(page, svelte, python), `${origin ? `${origin.file}:${origin.svelteLine}` : id}, plot ${i + 1}`).toEqual([]);
    }
    expect.soft(messages, id).toEqual([]);
    if (id === "manhattan-flyover") {
      expect.soft(externalTiles, "initial view uses embedded tile bytes offline").toEqual([]);
      await page.unroute("https://tiles.versatiles.org/**", offlineTiles);
    }
  });
}
