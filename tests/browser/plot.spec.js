import { test, expect } from "./fixtures.js";
async function openPlot(page, name) {
  await page
    .getByRole("region", { name, exact: true })
    .locator("canvas")
    .hover();
  await page
    .getByRole("button", { name: `Settings for ${name}`, exact: true })
    .click();
}
async function search(panel, value) {
  const input = panel.locator("input.search");
  if (!(await input.isVisible()))
    await panel.getByRole("button", { name: "Search settings", exact: true }).click();
  await input.fill(value);
}
function monitor(page) {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error" && !m.text().includes("favicon"))
      errors.push(m.text());
  });
  return errors;
}
test("every demo mark renders before and after data, including empty inputs", async ({
  page,
}) => {
  const errors = monitor(page);
  await page.goto("/test/playground");
  await expect(
    page.getByRole("button", { name: "Generate data" }),
  ).toBeEnabled();
  for (const mark of ["segments", "line", "2d"]) {
    await page.getByLabel("Mark", { exact: true }).selectOption(mark);
    await page.waitForTimeout(200);
  }
  await page.getByRole("button", { name: "Generate data" }).click();
  await page.getByLabel("Point count", { exact: true }).fill("100");
  for (const scene of ["2d", "3d"]) {
    await openPlot(page, "Main plot");
    const panel = page.getByRole("dialog", { name: "Settings · Main plot" });
    await panel.getByRole("treeitem", { name: /View|Plot/, exact: true }).click();
    await search(panel, "View mode");
    await panel.getByLabel("View mode", { exact: true }).selectOption(scene);
    await panel.getByRole("button", { name: "Close settings", exact: true }).click();
    for (const mark of [
      "2d",
      "3d",
      "sprite",
      "segments",
      "line",
      "links",
      "surface",
      "arrows",
      "text",
      "tex",
    ]) {
      await page.getByLabel("Mark", { exact: true }).selectOption(mark);
      await page.waitForTimeout(mark === "tex" ? 2500 : 500);
    }
  }
  await page.getByLabel("Point count", { exact: true }).fill("0");
  await page.getByLabel("Mark", { exact: true }).selectOption("line");
  await page.waitForTimeout(300);
  await page.screenshot({ path: "test-results/demo.png" });
  expect(errors).toEqual([]);
});
test("settings stay attached to the correct plot and work beside a host sidebar", async ({
  page,
}) => {
  const errors = monitor(page);
  await page.goto("/test/feature-gallery");
  await expect(
    page.getByRole("button", { name: "Settings for Geometry" }),
  ).toBeVisible();
  await page.waitForTimeout(3000);
  await openPlot(page, "Geometry");
  await expect(
    page.getByRole("dialog", { name: "Settings · Geometry" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Shared defaults…" }).click();
  await expect(page.getByText("Applies to:", { exact: false })).toContainText(
    "Lines and labels",
  );
  await page.keyboard.press("Escape");
  await openPlot(page, "Lines and labels");
  await expect(
    page.getByRole("dialog", { name: "Settings · Geometry" }),
  ).not.toBeVisible();
  await expect(
    page.getByRole("dialog", { name: "Settings · Lines and labels" }),
  ).toBeVisible();
  await page
    .getByRole("dialog", { name: "Settings · Lines and labels" })
    .getByRole("treeitem", { name: /Dashed line/ })
    .click();
  await page
    .getByRole("dialog", { name: "Settings · Lines and labels" })
    .getByRole("button", { name: "Search settings", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "Settings · Lines and labels" })
    .locator("input.search")
    .fill("dash");
  await page.screenshot({ path: "test-results/settings.png" });
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Open geometry settings" }).click();
  await expect(
    page.getByRole("dialog", { name: "Settings · Geometry" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "Open geometry settings" }),
  ).toBeFocused();
  await page.setViewportSize({ width: 390, height: 800 });
  await page.getByRole("button", { name: "Open geometry settings" }).click();
  const box = await page
    .getByRole("dialog", { name: "Settings · Geometry" })
    .boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(390);
  await page.keyboard.press("Escape");
  for (let i = 0; i < 3; i++) {
    await page.getByRole("button", { name: "Toggle plots" }).click();
    await page.waitForTimeout(150);
    await page.getByRole("button", { name: "Toggle plots" }).click();
    await page.waitForTimeout(500);
  }
  expect(errors).toEqual([]);
});
test("250,000 points and repeated updates retain bounded GPU resources", async ({
  page,
}) => {
  const errors = monitor(page);
  await page.goto("/test/playground");
  await expect(
    page.getByRole("button", { name: "Generate data" }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Generate data" }).click();
  const start = Date.now();
  await page.getByLabel("Point count", { exact: true }).fill("250000");
  await page.waitForTimeout(2500);
  const metrics = () =>
    page.evaluate(async () => {
      await window.__plotTest.whenSettled();
      return window.__plotTest.getDiagnostics();
    });
  const before = await metrics();
  expect(before.managers).toBeGreaterThan(0);
  for (let i = 0; i < 5; i++) {
    await page.getByLabel("Size", { exact: true }).fill(String(10 + i));
    await page.waitForTimeout(150);
  }
  await page.waitForTimeout(500);
  const after = await metrics();
  console.log(
    "250k points: settle window ms",
    Date.now() - start,
    "resources",
    JSON.stringify({ before, after }),
  );
  expect(after.managers).toBe(before.managers);
  expect(after.fields).toBe(before.fields);
  expect(after.memory).toEqual(before.memory);
  expect(after.marks.map((mark) => ({ capacity: mark.capacity, fields: mark.fields })))
    .toEqual(before.marks.map((mark) => ({ capacity: mark.capacity, fields: mark.fields })));
  expect(errors).toEqual([]);
});
test("picking preserves object IDs with transparency and antialiasing", { tag: "@gpu" }, async ({
  page,
}) => {
  const errors = monitor(page);
  await page.goto("/test/feature-gallery");
  const plot = page.getByRole("region", { name: "Picking", exact: true });
  await expect(plot.locator("canvas")).toBeVisible();
  await page.waitForTimeout(1500);
  let clicks = 0;
  for (const mode of ["off", "msaa", "ssaa8", "ssaa16", "smaa"]) {
    await openPlot(page, "Picking");
    const panel = page.getByRole("dialog", { name: "Settings · Picking" });
    await panel.getByRole("treeitem", { name: /View|Plot/, exact: true }).click();
    await search(panel, "Antialiasing");
    await panel
      .getByRole("combobox", { name: /Antialiasing/ })
      .selectOption(mode);
    await panel.getByRole("button", { name: "Close settings", exact: true }).click();
    await page.waitForTimeout(250);
    const box = await plot.locator("canvas").boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await expect(page.getByLabel("Picking result")).toContainText(
      "Hover: point",
    );
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    // The GPU pick finishes before the next antialiasing mode replaces its pass.
    await expect(page.getByLabel("Picking result")).toContainText(`Clicks: ${++clicks}`);
    await page.mouse.move(10, 10);
    await expect(page.getByLabel("Picking result")).toContainText(
      "Hover: none",
    );
  }
  await expect(page.getByLabel("Picking result")).toContainText("Clicks: 5");
  expect(errors).toEqual([]);
});
test("unsupported WebGPU has an explicit loading failure state", async ({
  page,
}) => {
  await page.addInitScript(() =>
    Object.defineProperty(navigator, "gpu", {
      value: undefined,
      configurable: true,
    }),
  );
  await page.goto("/test/playground");
  await expect(
    page.getByText(/Error initializing device:.*WebGPU/),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Generate data" })).toHaveCount(
    0,
  );
});
