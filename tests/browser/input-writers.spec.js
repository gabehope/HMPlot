import { test, expect } from "./fixtures.js";

// TODO 145.2: an input a click (select) or a hover writes: one value with a default, read by
// input("name") anywhere in the input context. Plots on the page, in order: the drillable
// treemap, the hover source, the plot reading the hover, the refused hover loop, the clash.
const PLOTS = ["drill", "hover", "echo", "map", "loop", "clash"];

async function open(page) {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/test/input-writers");
  await page.waitForFunction(() => window.inputWriters?.level && window.inputWriters?.context);
  await page.waitForFunction(() => [...document.querySelectorAll(".canvas")].length >= 3);
  await page.evaluate(() => Promise.all(["drill", "hover", "echo"].map((key) => window.inputWriters[key].whenSettled())));
  return errors;
}
const values = (page) => page.evaluate(() => window.inputWriters.context.getValues());
// Page coordinates of data point (x, y) in a plot.
async function at(page, key, x, y) {
  const local = await page.evaluate(({ key, x, y }) => window.inputWriters[key].getScreenMapping()?.project({ x, y }), { key, x, y });
  const box = await page.locator(".canvas").nth(PLOTS.indexOf(key)).boundingBox();
  return [box.x + local.x, box.y + local.y];
}
// The middle of a treemap node's rectangle, from the Nodes table read back.
async function nodeCenter(page, id) {
  const { rows } = await page.evaluate(() => window.inputWriters.level.read({ rows: true, columns: ["id", "x0", "x1", "y0", "y1"] }));
  const node = rows.find((row) => row.id === id);
  return at(page, "drill", (node.x0 + node.x1) / 2, (node.y0 + node.y1) / 2);
}
const shownIds = async (page) => (await page.evaluate(() => window.inputWriters.level.read({ columns: ["id"] }))).columns.id.slice().sort();

test("a click on a node drills into it, the Select of that name shows it, and a click on nothing goes back", async ({ page }) => {
  const errors = await open(page);
  expect(await shownIds(page)).toEqual(["a", "b"]);
  await page.mouse.click(...(await nodeCenter(page, "a")));
  await expect.poll(async () => (await values(page)).root).toBe("a");
  await expect.poll(() => shownIds(page)).toEqual(["a1", "a2", "a3"]);
  expect(await page.evaluate(() => window.inputWriters.select.getValue())).toBe("a");
  // The Select edits the same input.
  await page.evaluate(() => window.inputWriters.select.setValue("b"));
  await expect.poll(() => shownIds(page)).toEqual(["b1", "b2"]);
  // A click on nothing restores the default. (The padding between rectangles is nothing.)
  await page.mouse.click(...(await at(page, "drill", 0.005, 0.005)));
  await expect.poll(async () => (await values(page)).root).toBe("root");
  await expect.poll(() => shownIds(page)).toEqual(["a", "b"]);
  expect(errors).toEqual([]);
});

test("a hover shows the hovered row's value in another plot while the pointer is on it", async ({ page }) => {
  await open(page);
  expect((await values(page)).focus).toBe(null);
  await page.mouse.move(...(await at(page, "hover", 3, 1)));
  await expect.poll(async () => (await values(page)).focus).toBe("q");
  // The plot reading it fades the other series.
  const opacities = () => page.evaluate(async () => {
    const plot = window.inputWriters.echo;
    await plot.whenSettled();
    const svg = await (await plot.exportSVG({ mode: "vector" })).blob.text();
    return [...new DOMParser().parseFromString(svg, "image/svg+xml").querySelectorAll("circle")]
      .map((c) => Number(c.getAttribute("opacity") ?? c.getAttribute("fill-opacity") ?? 1));
  });
  await expect.poll(async () => (await opacities()).filter((o) => o > 0.9).length).toBe(2);
  await page.mouse.move(...(await at(page, "hover", 6.8, 2.9)));
  await expect.poll(async () => (await values(page)).focus).toBe(null);
});

test("a hover writing an input a transform above it reads is refused, and so are writers of different kinds", async ({ page }) => {
  await open(page);
  const text = () => page.evaluate(() => [...document.querySelectorAll('[role="alert"]')].map((e) => e.textContent).join("\n")
    + "\n" + ["loop", "clash"].map((key) => window.inputWriters[key]?.getRenderError?.() ?? "").join("\n"));
  await expect.poll(text).toMatch(/hover writes the input "chosen", which the Filter above this mark reads/);
  await expect.poll(text).toMatch(/writes the input "pick" from a (numeric|categorical) column and .* from a (categorical|numeric) one/);
});

test("a click on a GeoJSON feature writes its column's value", async ({ page }) => {
  const errors = await open(page);
  await page.evaluate(() => window.inputWriters.map.whenSettled());
  expect((await values(page)).district).toBe(null);
  await page.mouse.click(...(await at(page, "map", 2.5, 0.5)));
  await expect.poll(async () => (await values(page)).district).toBe("east");
  await page.mouse.click(...(await at(page, "map", 0.5, 0.5)));
  await expect.poll(async () => (await values(page)).district).toBe("west");
  await page.mouse.click(...(await at(page, "map", 1.5, 0.5)));
  await expect.poll(async () => (await values(page)).district).toBe(null);
  expect(errors).toEqual([]);
});

