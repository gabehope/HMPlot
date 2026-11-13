import { test, expect } from "./fixtures.js";

/** Each drawn 2D axis overlay's tick and title texts, by axis. */
async function overlays(page, scene) {
  await page.goto(`/test/stage14-guide-ownership?scene=${scene}`);
  await page.waitForFunction(() => window.stage14GuideOwnership?.plot?.whenSettled);
  await expect.poll(() => page.evaluate(() =>
    [...document.querySelectorAll(".canvas")].every((canvas) => canvas.getAttribute("aria-busy") === "false")))
    .toBe(true);
  await page.evaluate(() => window.stage14GuideOwnership.plot.whenSettled());
  return page.evaluate(() => ({
    error: window.stage14GuideOwnership.plot.getRenderError(),
    axes: [...document.querySelectorAll('svg.axes[aria-label="2D coordinate axes"]')].map((svg) => ({
      texts: [...svg.querySelectorAll("text")].map((text) => text.textContent),
      titles: [...svg.querySelectorAll(".x-title, .y-title")].map((text) => text.textContent),
    })).filter((svg) => svg.texts.length),
  }));
}

test("a ranged child that inherits Y adds only its own X axis", async ({ page }) => {
  const { error, axes } = await overlays(page, "inherited");
  expect(error).toBe("");
  // The root draws X and Y (0..10) once; the child draws its own X (0..1), not the Y again.
  expect(axes.length).toBe(2);
  const [root, child] = axes[0].texts.includes("10") ? axes : [axes[1], axes[0]];
  expect(root.texts).toEqual(expect.arrayContaining(["2", "10"]));
  expect(child.texts).not.toContain("10");
  // Its own 0..1 labels (which of them show depends on the room beside the root's).
  expect(child.texts.length).toBeGreaterThan(1);
  expect(child.texts.every((text) => Number(text) >= 0 && Number(text) <= 1)).toBe(true);
  // A raw position names no column, so no axis has a title (TODO 21).
  expect([...root.titles, ...child.titles]).toEqual([]);
});

test("a promoted root that inherits its dimensions keeps the Plot's axes and domain", async ({ page }) => {
  const { error, axes } = await overlays(page, "nested-inherited");
  expect(error).toBe("");
  // One overlay draws: the promoted Frame, with the Plot's [0, 10] domain,
  // not an auto-fit around its one point at (2, 8). The inner Frame adds none.
  expect(axes.length).toBe(1);
  expect(axes[0].texts).toContain("10");
  expect(axes[0].texts).not.toContain("2.5");
  expect(axes[0].texts).not.toContain("8.5");
});

test("embedded facet cells draw their own X and the shared Y once", async ({ page }) => {
  const { error, axes } = await overlays(page, "facets");
  expect(error).toBe("");
  // The shared Y (0..5) is drawn once, titled by the column the cells plot on it (TODO 21).
  const withY = axes.filter((svg) => svg.texts.includes("5"));
  expect(withY.length).toBe(1);
  expect(withY[0].texts).toEqual(expect.arrayContaining(["1", "5"]));
  expect(withY[0].titles).toEqual(["y"]);
  const cells = axes.filter((svg) => !svg.texts.includes("5"));
  expect(cells.length).toBe(2);
  for (const cell of cells) {
    expect(cell.texts).toEqual(expect.arrayContaining(["0.2", "0.8"]));
    expect(cell.titles).toEqual(["x"]);
  }
});
