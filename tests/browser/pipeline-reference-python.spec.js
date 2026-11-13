import { test, expect } from "./fixtures.js";

test.use({ deviceScaleFactor: 2 });

// TODO 142.6: a Python scene's references to one pipeline (data=totals, hm.Data(value=totals))
// resolve to its mounted output in the browser: both plots draw its four groups, and a click on
// one plot's group selects its rows, which the other plot's reference reads.
test("a Python scene's pipeline references draw one output in two plots", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/test/notebook?fixture=82_pipeline_reference");
  await page.waitForFunction(() => window.notebookReady, null, { timeout: 90000 });
  const circles = () => page.evaluate(async () => {
    const plots = [];
    const visit = (node) => { if (node.kind === "Plot") plots.push(node.id); (node.children ?? []).forEach(visit); };
    visit(window.notebookState.root);
    const out = [];
    for (const id of plots) {
      const plot = window.notebookRuntime.reference(id);
      await plot.whenSettled();
      const svg = await (await plot.exportSVG({ mode: "vector" })).blob.text();
      const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
      out.push([...doc.querySelectorAll("circle")].map((c) => ({ x: +c.getAttribute("cx"), y: +c.getAttribute("cy"), opacity: c.getAttribute("opacity") ?? c.getAttribute("fill-opacity") ?? "1" })));
    }
    return out;
  });
  await expect.poll(async () => (await circles()).map((list) => list.length)).toEqual([4, 4]);
  // Click the first plot's leftmost group: the second plot fades the other groups.
  const [first] = await circles();
  const box = await page.locator('[aria-label="Plot canvas"]').first().boundingBox();
  const left = first.sort((a, b) => a.x - b.x)[0];
  await page.mouse.click(box.x + left.x, box.y + left.y);
  await expect.poll(async () => new Set((await circles())[1].map((c) => c.opacity)).size).toBeGreaterThan(1);
  expect(errors).toEqual([]);
});

// TODO 140.5: the live route-statistics recipe (src/recipes/33_live_route_statistics.py) draws
// every route from the Join of the brushed Group's statistics, with no brush all flights.
test("the live route statistics recipe draws each route from the joined statistics", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/test/notebook?fixture=83_live_route_statistics");
  await page.waitForFunction(() => window.notebookReady, null, { timeout: 90000 });
  const routes = await page.evaluate(async () => {
    const plots = [];
    const visit = (node) => { if (node.kind === "Plot") plots.push(node.id); (node.children ?? []).forEach(visit); };
    visit(window.notebookState.root);
    const plot = window.notebookRuntime.reference(plots[1]);
    await plot.whenSettled();
    const svg = await (await plot.exportSVG({ mode: "vector" })).blob.text();
    return new DOMParser().parseFromString(svg, "image/svg+xml").querySelectorAll("circle").length;
  });
  expect(routes).toBe(5);
  await expect(page.getByRole("alert")).toHaveCount(0);
  expect(errors).toEqual([]);
});

// TODO 145.1: Python's await totals.read() is the runtime's read command: the Group's rows as
// JSON (numbers, null where missing), all rows before a brush, the brushed rows' totals after.
test("a Python scene's read command returns a brushed Group's rows", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/test/notebook?fixture=83_read_back");
  await page.waitForFunction(() => window.notebookReady, null, { timeout: 90000 });
  await page.waitForFunction(() => [...document.querySelectorAll(".canvas")].every((c) => c.getAttribute("aria-busy") === "false"));
  const read = () => page.evaluate(async () => {
    let group;
    const visit = (node) => { if (node.kind === "Group") group = node.id; (node.children ?? []).forEach(visit); };
    visit(window.notebookState.root);
    const reply = await window.notebookRuntime.command({ command: "read", target: group, args: { maxBytes: 1 << 20 } });
    return JSON.parse(JSON.stringify(reply));
  });
  const totals = (rows) => {
    const by = {};
    for (const i of rows) {
      const region = ["north", "south", "east", "west"][i % 4];
      by[region] = (by[region] ?? 0) + ((i * 37) % 100);
    }
    return by;
  };
  const byRegion = ({ columns }) => Object.fromEntries(columns.region.map((r, i) => [r, columns.total[i]]));
  const all = await read();
  expect(all.length).toBe(4);
  expect(byRegion(all)).toEqual(totals(Array.from({ length: 100 }, (_, i) => i)));
  const box = await page.locator('[aria-label="Plot canvas"]').first().boundingBox();
  await page.keyboard.down("Shift");
  await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.8, { steps: 8 });
  await page.mouse.up();
  await page.keyboard.up("Shift");
  await expect.poll(async () => JSON.stringify(byRegion(await read()))).not.toBe(JSON.stringify(byRegion(all)));
  const constraints = await page.evaluate(() => {
    const [table] = window.notebookRuntime.resources.tables.values();
    return table.identity.brush.getConstraints(table.identity).map((c) => [c.name, c.bounds]);
  });
  const bounds = Object.fromEntries(constraints), value = { amount: (i) => (i * 37) % 100, units: (i) => i % 13 };
  const rows = Array.from({ length: 100 }, (_, i) => i).filter((i) =>
    Object.entries(bounds).every(([name, [lo, hi]]) => value[name](i) >= lo && value[name](i) <= hi));
  const brushed = byRegion(await read());
  const want = totals(rows);
  expect(Object.keys(brushed).sort()).toEqual(Object.keys(want).sort());
  for (const [region, total] of Object.entries(want)) expect(brushed[region]).toBeCloseTo(total, 3);
  // A reply past the kernel's message limit is refused by name.
  const refused = await page.evaluate(async () => {
    let group;
    const visit = (node) => { if (node.kind === "Group") group = node.id; (node.children ?? []).forEach(visit); };
    visit(window.notebookState.root);
    return window.notebookRuntime.command({ command: "read", target: group, args: { maxBytes: 10 } }).then(() => "", (e) => e.message);
  });
  expect(refused).toMatch(/^read\(\): a table sent to Python needs \d+ bytes; the limit is 10 bytes\./);
  expect(errors).toEqual([]);
});

// TODO 145.2-145.3: in a Python scene, a click on a Treemap rectangle writes the input "root"
// (select=root.set("id")); the Treemap drills into it, the Select of that name shows it, and a
// click on nothing restores the default.
test("a Python scene's click-written input drills a Treemap", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/test/notebook?fixture=84_drill_down");
  await page.waitForFunction(() => window.notebookReady, null, { timeout: 90000 });
  await page.waitForFunction(() => [...document.querySelectorAll(".canvas")].every((c) => c.getAttribute("aria-busy") === "false"));
  const node = (kind) => { let id; const visit = (n) => { if (n.kind === kind && !id) id = n.id; (n.children ?? []).forEach(visit); }; visit(window.notebookState.root); return id; };
  const nodesId = await page.evaluate(node, "Nodes");
  const shown = () => page.evaluate(async (id) => {
    const { columns } = await window.notebookRuntime.reference(id).read({ columns: ["id", "x0", "x1", "y0", "y1"] });
    return Array.from(columns.id, (v, i) => ({ id: v, x: (columns.x0[i] + columns.x1[i]) / 2, y: (columns.y0[i] + columns.y1[i]) / 2 }));
  }, nodesId);
  await expect.poll(async () => (await shown()).map((n) => n.id).sort()).toEqual(["a", "b"]);
  const plot = await page.evaluate(node, "Plot");
  const at = async (x, y) => {
    const local = await page.evaluate(({ plot, x, y }) => window.notebookRuntime.reference(plot).getScreenMapping().project({ x, y }), { plot, x, y });
    const box = await page.locator(".canvas").first().boundingBox();
    return [box.x + local.x, box.y + local.y];
  };
  const a = (await shown()).find((n) => n.id === "a");
  await page.mouse.click(...(await at(a.x, a.y)));
  await expect.poll(async () => (await shown()).map((n) => n.id).sort()).toEqual(["a1", "a2"]);
  await expect(page.locator("select").first()).toHaveValue(await page.evaluate(() => {
    const select = document.querySelector("select"); return [...select.options].find((o) => o.textContent.trim() === "a")?.value;
  }));
  await page.mouse.click(...(await at(0.005, 0.005)));
  await expect.poll(async () => (await shown()).map((n) => n.id).sort()).toEqual(["a", "b"]);
  // TODO 145.7: the Top button's set=root.reset() goes back to the default from a drill.
  await page.mouse.click(...(await at(a.x, a.y)));
  await expect.poll(async () => (await shown()).map((n) => n.id).sort()).toEqual(["a1", "a2"]);
  await page.getByRole("button", { name: "Top" }).click();
  await expect.poll(async () => (await shown()).map((n) => n.id).sort()).toEqual(["a", "b"]);
  expect(errors).toEqual([]);
});
