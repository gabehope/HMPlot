import { test, expect } from "./fixtures.js";

// TODO 145.7: writes made from the input: root = input("root", { default: "root" }); a mark's
// select={root.set("id")} drills, select={root.set(literal("a"))} writes a constant from another
// mark, and Buttons with set={root.reset()} or set={root.set(literal("b"))} write it on a press.
// No widget declares root: its writers do, with the handle's default.
const PLOTS = ["drill", "points"];

async function open(page) {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/test/input-handles");
  await page.waitForFunction(() => window.inputHandles?.level && window.inputHandles?.context);
  await expect(page.locator(".canvas[aria-busy='false']")).toHaveCount(2);
  await page.evaluate(() => Promise.all(["drill", "points"].map((key) => window.inputHandles[key].whenSettled())));
  return errors;
}
const root = async (page) => (await page.evaluate(() => window.inputHandles.context.getValues())).root;
async function at(page, key, x, y) {
  const local = await page.evaluate(({ key, x, y }) => window.inputHandles[key].getScreenMapping()?.project({ x, y }), { key, x, y });
  const box = await page.locator(".canvas").nth(PLOTS.indexOf(key)).boundingBox();
  return [box.x + local.x, box.y + local.y];
}
async function nodeCenter(page, id) {
  const { rows } = await page.evaluate(() => window.inputHandles.level.read({ rows: true, columns: ["id", "x0", "x1", "y0", "y1"] }));
  const node = rows.find((row) => row.id === id);
  return at(page, "drill", (node.x0 + node.x1) / 2, (node.y0 + node.y1) / 2);
}
const shownIds = async (page) => (await page.evaluate(() => window.inputHandles.level.read({ columns: ["id"] }))).columns.id.slice().sort();

test("a mark's root.set(column) drills, a Button's root.reset() goes back to the handle's default", async ({ page }) => {
  const errors = await open(page);
  expect(await root(page)).toBe("root");
  expect(await shownIds(page)).toEqual(["a", "b"]);
  await page.mouse.click(...(await nodeCenter(page, "a")));
  await expect.poll(() => root(page)).toBe("a");
  await expect.poll(() => shownIds(page)).toEqual(["a1", "a2", "a3"]);
  await page.getByRole("button", { name: "Top", exact: true }).click();
  await expect.poll(() => root(page)).toBe("root");
  await expect.poll(() => shownIds(page)).toEqual(["a", "b"]);
  expect(errors).toEqual([]);
});

test("a Button's root.set(literal(v)) and another mark's constant write the same input", async ({ page }) => {
  const errors = await open(page);
  await page.getByRole("button", { name: "Go to b" }).click();
  await expect.poll(() => root(page)).toBe("b");
  await expect.poll(() => shownIds(page)).toEqual(["b1", "b2"]);
  // A click on the point writes its constant; a click on nothing there restores the default.
  await page.mouse.click(...(await at(page, "points", 0.5, 0.5)));
  await expect.poll(() => root(page)).toBe("a");
  await expect.poll(() => shownIds(page)).toEqual(["a1", "a2", "a3"]);
  await page.mouse.click(...(await at(page, "points", 0.05, 0.05)));
  await expect.poll(() => root(page)).toBe("root");
  expect(errors).toEqual([]);
});

test("a named Button with set counts its presses and writes the others", async ({ page }) => {
  const errors = await open(page);
  await page.getByRole("button", { name: "Go to b" }).click();
  await expect.poll(() => root(page)).toBe("b");
  await page.getByRole("button", { name: "Count and top" }).click();
  await expect.poll(() => root(page)).toBe("root");
  expect((await page.evaluate(() => window.inputHandles.context.getValues())).presses).toBe(1);
  expect(errors).toEqual([]);
});
