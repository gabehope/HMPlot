// TODO 20.2: a Provider in a Python scene (the notebook route) and in exported HTML. The
// exported page runs the built standalone bundle: run `npm run build:python` after changing the
// scene runtime or the Provider.
import { test, expect } from "./fixtures.js";
import fs from "node:fs";

const ROWS = [{ x: 2, y: 3 }, { x: 5, y: 6 }, { x: 8, y: 2 }];
const scene = (providerProps, events = []) => ({
  protocol: 1, library: "test", scene: "provider-scene", revision: 1,
  root: {
    id: "scene", kind: "Scene", props: {}, events: [], children: [{
      id: "provider", kind: "Provider", events,
      props: { url: "/provider-data/{species}.json", params: { species: "Adelie" }, path: "rows", ...providerProps },
      children: [{
        // As hm.Plot sends it (autoBounds: an export does not turn browser bounds into props).
        id: "plot", kind: "Plot", props: { height: 240, responsive: true, autoBounds: true, x: { domain: [0, 10] }, y: { domain: [0, 10] } }, events: [],
        children: [{ id: "points", kind: "Points", props: { x: "x", y: "y", size: 12 }, events: [], children: [] }],
      }],
    }],
  },
  tables: {}, scales: {}, columns: {},
});

async function mount(page, state, { delay = 0 } = {}) {
  const requests = [];
  await page.context().route("**/provider-data/*.json", async (route) => {
    requests.push(new URL(route.request().url()).pathname);
    if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ rows: ROWS }) });
  });
  await page.route("**/test/notebook-provider.json", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ state, buffers: {}, metadata: {} }) }));
  await page.goto("/test/notebook?fixture=provider");
  await page.waitForFunction(() => window.notebookReady);
  return requests;
}

async function exportAndOpen(page, state) {
  const bundle = fs.readFileSync("python/hmplot/static/standalone.js", "utf8");
  // The page embeds the runtime its host gives, as the notebook widget and the export browser do.
  await page.context().route("**/__standalone__.js", (route) => route.fulfill({ contentType: "text/javascript", body: bundle }));
  const exported = await page.evaluate(async (state) => {
    const runtime = window.notebookRuntime;
    runtime.setSerializable(state, () => { throw Error("This scene has no columns."); }, () => fetch("/__standalone__.js").then((response) => response.text()));
    const { blob, warnings } = await runtime.command({ command: "export_html", target: "scene", args: {} });
    return { html: await blob.text(), warnings };
  }, state);
  const embedded = JSON.parse(exported.html.match(/<script id="hmplot-state" type="application\/json">([\s\S]*?)<\/script>/)[1]).state;
  await page.context().route("**/__exported__.html", (route) => route.fulfill({ contentType: "text/html", body: exported.html }));
  const opened = await page.context().newPage();
  const errors = [];
  opened.on("pageerror", (error) => errors.push(error.message));
  await opened.goto("/__exported__.html");
  await opened.waitForFunction(() => typeof window.hmplotExport === "function");
  // The standalone runtime settles (loads included) before a command runs.
  await expect.poll(() => opened.evaluate(() => window.hmplotExport("settled").then(() => true, (error) => error.message)), { timeout: 60000 }).toBe(true);
  return { exported, embedded, opened, errors };
}

test("a scene update does not wait for the load it starts, and a command does", async ({ page }) => {
  const state = scene({});
  const requests = await mount(page, state, { delay: 1500 });
  // apply() returned (notebookReady) before the load finished; the Plot mounts with the result.
  expect(await page.evaluate(() => document.querySelector("canvas") !== null)).toBe(false);
  const started = Date.now();
  await page.evaluate(() => window.notebookRuntime.command({ command: "settled", target: "scene", args: {} }));
  expect(Date.now() - started).toBeGreaterThan(500);
  await page.waitForFunction(() => document.querySelector("canvas"));
  expect(requests).toEqual(["/provider-data/Adelie.json"]);
  const ready = await page.evaluate(() => window.notebookMessages.filter((message) => message.type === "status" && message.phase === "ready").length);
  expect(ready).toBe(1);
});

test("load events reach the scene even while an update is being applied; a load error does not fail commands", async ({ page }) => {
  const state = scene({}, ["load", "error"]);
  await mount(page, state);
  await expect.poll(() => page.evaluate(() => window.notebookMessages.filter((message) => message.type === "event").map((message) => [message.event, message.payload.load_revision, message.payload.rows, message.revision]))).toEqual([["load", 1, 3, 1]]);
  // A params change to a missing file: the previous result stays and commands still succeed.
  await page.context().unrouteAll({ behavior: "ignoreErrors" });
  await page.context().route("**/provider-data/*.json", (route) => route.fulfill({ status: 404, contentType: "text/plain", body: "missing" }));
  const next = structuredClone(state);
  next.revision = 2;
  next.root.children[0].props.params = { species: "Emperor" };
  await page.evaluate((next) => window.notebookRuntime.apply(next, () => { throw Error("no columns"); }), next);
  await page.evaluate(() => window.notebookRuntime.command({ command: "settled", target: "scene", args: {} }));
  await expect.poll(() => page.evaluate(() => window.notebookMessages.filter((message) => message.event === "error").map((message) => message.payload.message)))
    .toEqual(["HTTP 404 Not Found: /provider-data/Emperor.json"]);
  const refresh = await page.evaluate(() => window.notebookRuntime.command({ command: "action", target: "provider", args: { action: "refresh" } }).then(() => "ok", (error) => error.message));
  expect(refresh).toBe("HTTP 404 Not Found: /provider-data/Emperor.json");
  expect(await page.evaluate(() => document.querySelector("canvas") !== null)).toBe(true);
});

test("exported HTML embeds a Provider's result, and the page never fetches it", async ({ page }) => {
  const state = scene({ refreshInterval: 60000 });
  const requests = await mount(page, state);
  await page.evaluate(() => window.notebookRuntime.command({ command: "settled", target: "scene", args: {} }));
  const { exported, embedded, opened, errors } = await exportAndOpen(page, state);
  const provider = embedded.root.children[0];
  expect(provider.kind).toBe("Provider");
  expect(provider.props).toEqual({ path: "rows", initial: ROWS });
  expect(exported.warnings).toEqual([]);
  // The Plot mounted from the embedded result, with no request.
  await opened.waitForFunction(() => document.querySelector("#hmplot-root canvas"));
  expect(requests).toEqual(["/provider-data/Adelie.json"]);
  expect(errors).toEqual([]);
  expect(await opened.locator("#hmplot-error").textContent()).toBe("");
});

test("snapshot=false exports the Provider as it is: the page loads when it opens", async ({ page }) => {
  const state = scene({ snapshot: false });
  const requests = await mount(page, state);
  await page.evaluate(() => window.notebookRuntime.command({ command: "settled", target: "scene", args: {} }));
  const { embedded, opened, errors } = await exportAndOpen(page, state);
  expect(embedded.root.children[0].props).toMatchObject({ url: "/provider-data/{species}.json", params: { species: "Adelie" }, snapshot: false });
  await opened.waitForFunction(() => document.querySelector("#hmplot-root canvas"));
  expect(requests).toEqual(["/provider-data/Adelie.json", "/provider-data/Adelie.json"]);
  expect(errors).toEqual([]);
});
