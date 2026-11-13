import { test, expect } from "./fixtures.js";
function monitor(page) {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error" && !m.text().includes("favicon"))
      errors.push(m.text());
  });
  return errors;
}
async function open(page, name = "Main plot") {
  const trigger = page.getByRole("button", {
    name: `Settings for ${name}`,
    exact: true,
  });
  await trigger.focus();
  await page.keyboard.press("Enter");
  return page.getByRole("dialog", { name: `Settings · ${name}` });
}
async function search(panel, value) {
  const input = panel.locator("input.search");
  if (!(await input.isVisible()))
    await panel.getByRole("button", { name: "Search settings", exact: true }).click();
  await input.fill(value);
}
test("3D scatter shape and detail changes preserve GPU data and settled resources", async ({
  page,
}) => {
  const errors = monitor(page);
  await page.goto("/test/playground");
  await page.getByLabel("Mark", { exact: true }).selectOption("3d");
  await page.getByRole("button", { name: "Generate data" }).click();
  await page.getByLabel("Point count", { exact: true }).fill("100");
  const panel = await open(page);
  await search(panel, "View mode");
  await panel.getByLabel("View mode", { exact: true }).selectOption("3d");
  await panel.getByRole("treeitem", { name: /Points 3D/ }).click();
  await search(panel, "Shape");
  for (let i = 0; i < 3; i++)
    for (const shape of ["cube", "sphere"]) {
      await panel.getByLabel("Shape", { exact: true }).selectOption(shape);
      const detail = panel.getByLabel("Detail value", { exact: true });
      await detail.fill(String(i));
      await detail.press("Enter");
      await page.evaluate(() => window.__plotTest.whenSettled());
      await page.waitForTimeout(100);
    }
  await panel.getByRole("button", { name: "Close settings", exact: true }).click();
  await page.mouse.move(5, 5);
  await page.screenshot({ path: "test-results/scatter-geometry.png" });
  const canvas = page.locator("canvas");
  const before = await page.evaluate(() => window.__plotTest.getDiagnostics());
  await open(page);
  await panel.getByRole("treeitem", { name: /Points 3D/ }).click();
  await search(panel, "Shape");
  await panel.getByLabel("Shape", { exact: true }).selectOption("cube");
  await panel.getByLabel("Shape", { exact: true }).selectOption("sphere");
  await page.evaluate(() => window.__plotTest.whenSettled());
  await page.waitForTimeout(150);
  const after = await page.evaluate(() => window.__plotTest.getDiagnostics());
  expect(after.memory).toEqual(before.memory);
  expect(after.marks.map((mark) => mark.fields)).toEqual(before.marks.map((mark) => mark.fields));
  await panel.getByRole("button", { name: "Close settings", exact: true }).click();
  await page.mouse.move(5, 5);
  await page.getByLabel("Mark", { exact: true }).selectOption("2d");
  await page.waitForTimeout(200);
  expect(errors).toEqual([]);
});
test("2D axes follow Marks scale and navigation; 3D orientation is opt-in, hover-only and toggleable", async ({
  page,
}) => {
  const errors = monitor(page);
  await page.goto("/settings-fixture");
  const panel = await open(page, "Inspector A");
  await panel.getByRole("treeitem", { name: "Axes", exact: true }).click();
  await search(panel, "Show 2D axes");
  await panel.getByLabel("Show 2D axes", { exact: true }).check();
  await expect(
    page.getByRole("region", {name:"Inspector A", exact:true}).getByRole("img", { name: "2D coordinate axes", exact: true }),
  ).toBeVisible();
  await search(panel, "Domain");
  const bounds = panel.locator('[data-setting="xbounds"]');
  await bounds.getByLabel("Domain minimum", { exact: true }).fill("0");
  await bounds
    .getByLabel("Domain minimum", { exact: true })
    .press("Enter");
  await bounds.getByLabel("Domain maximum", { exact: true }).fill("100");
  await bounds
    .getByLabel("Domain maximum", { exact: true })
    .press("Enter");
  await panel.getByRole("button", { name: "Close settings", exact: true }).click();
  const axes = page.getByRole("region", {name:"Inspector A", exact:true}).getByRole("img", {
    name: "2D coordinate axes",
    exact: true,
  });
  await expect.poll(() => axes.locator(".x-tick").count()).toBeGreaterThan(2);
  const tickValues = await axes.locator(".x-tick").evaluateAll((elements) => elements.map((element) => Number(element.getAttribute("data-value"))));
  expect(Math.min(...tickValues)).toBeGreaterThanOrEqual(0);
  expect(Math.max(...tickValues)).toBeLessThanOrEqual(100);
  const before = await axes.innerHTML();
  const canvas = page
    .getByRole("region", { name: "Inspector A", exact: true })
    .locator("canvas");
  await canvas.hover();
  await page.mouse.wheel(0, -400);
  await expect.poll(() => axes.innerHTML()).not.toBe(before);
  await open(page, "Inspector A");
  await panel
    .getByRole("treeitem", { name: "Axes", exact: true })
    .click();
  await search(panel, "Show 2D axes");
  await panel.getByLabel("Show 2D axes", { exact: true }).uncheck();
  await expect(axes).toHaveCount(0);
  await panel.getByRole("treeitem", { name: "Plot", exact: true }).click();
  await search(panel, "View mode");
  await panel.getByLabel("View mode", { exact: true }).selectOption("3d");
  // Off by default (TODO 60): the lower right holds the settings and export buttons.
  await search(panel, "Show 3D orientation");
  await expect(panel.getByLabel("Show 3D orientation", { exact: true })).not.toBeChecked();
  await panel.getByLabel("Show 3D orientation", { exact: true }).check();
  await panel.getByRole("button", { name: "Close settings", exact: true }).click();
  await page.mouse.move(5, 5);
  const gadget = page.getByRole("img", {
    name: "3D orientation axes",
    exact: true,
  });
  await expect(gadget).toHaveCount(0);
  await canvas.hover();
  await expect(gadget).toBeVisible();
  const orientation = await gadget.innerHTML();
  const box = await canvas.boundingBox();
  // In the lower left.
  const placed = await gadget.boundingBox();
  expect(placed.x + placed.width).toBeLessThan(box.x + box.width / 2);
  expect(placed.y).toBeGreaterThan(box.y + box.height / 2);
  await page.mouse.move(box.x + 150, box.y + 130);
  await page.mouse.down();
  await page.mouse.move(box.x + 230, box.y + 170, { steps: 8 });
  await page.mouse.up();
  await expect.poll(() => gadget.innerHTML()).not.toBe(orientation);
  await open(page, "Inspector A");
  await panel.getByRole("treeitem", { name: "Plot", exact: true }).click();
  await search(panel, "Show 3D orientation");
  await panel.getByLabel("Show 3D orientation", { exact: true }).uncheck();
  await panel.getByRole("button", { name: "Close settings", exact: true }).click();
  await canvas.hover();
  await expect(gadget).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("settings remember local and shared context; axis appearance updates and resets", async ({
  page,
}) => {
  const errors = monitor(page);
  await page.goto("/settings-fixture");
  const panel = await open(page, "Inspector A");
  await panel.getByRole("treeitem", { name: "Axes", exact: true }).click();
  await search(panel, "Show 2D axes");
  await panel.getByLabel("Show 2D axes", { exact: true }).check();
  await search(panel, "Appearance");
  const font = panel.getByLabel("Font size value", { exact: true });
  await font.fill("18");
  await font.press("Enter");
  for (const [label, value] of [
    ["Line thickness", "3"],
    ["Left margin", "90"],
    ["Bottom margin", "40"],
  ]) {
    const input = panel.getByLabel(label + " value", { exact: true });
    await input.fill(value);
    await input.press("Enter");
  }
  await search(panel, "Label");
  await panel.locator('[data-setting="plot.axisLabelX"] input').fill("Time (s)");
  await panel.locator('[data-setting="plot.axisLabelY"] input').fill("Amplitude");
  const axes = page.getByRole("region", {name:"Inspector A", exact:true}).getByRole("img", {
    name: "2D coordinate axes",
    exact: true,
  });
  await expect(axes).toHaveCSS("font-size", "18px");
  await expect(axes.locator(".axis-lines")).toHaveCount(2);
  await expect(axes.locator(".axis-lines").nth(0)).toHaveAttribute("d", "M90 280 L473 280");
  await expect(axes.locator(".axis-lines").nth(1)).toHaveAttribute("d", "M90 280 L90 15");
  for (const line of await axes.locator(".axis-lines").all())
    await expect(line).toHaveCSS("stroke-width", "3px");
  await expect(axes.locator(".x-title")).toHaveText("Time (s)");
  await expect(axes.locator(".y-title")).toHaveText("Amplitude");
  await panel.locator('[data-setting="plot.axisTickLabels"] input').uncheck();
  await expect(axes.locator(".x-tick text")).toHaveCount(0);
  const scroll = await panel.locator(".content").evaluate((el) => el.scrollTop);
  await panel.getByRole("button", { name: "Close settings", exact: true }).click();
  await open(page, "Inspector A");
  await expect(panel.locator("input.search")).toHaveValue(
    "Label",
  );
  await expect
    .poll(() => panel.locator(".content").evaluate((el) => el.scrollTop))
    .toBe(scroll);
  await search(panel, "Appearance");
  await panel
    .getByRole("button", { name: "Reset Font size to inherited", exact: true })
    .click();
  // Reset restores the readable HMPlot default.
  await expect(axes).toHaveCSS("font-size", "14px");
  await panel.getByRole("treeitem", { name: /Nested heatmap/ }).click();
  await search(panel, "Color mapping");
  await panel.getByRole("button", { name: "Close settings", exact: true }).click();
  await open(page, "Inspector A");
  await expect(
    panel.getByRole("treeitem", { name: /Nested heatmap/ }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(panel.locator("input.search")).toHaveValue(
    "Color mapping",
  );
  await panel
    .getByRole("button", { name: "Shared defaults…", exact: true })
    .click();
  await search(panel, "Antialiasing");
  await panel.getByRole("button", { name: "Close settings", exact: true }).click();
  await open(page, "Inspector A");
  await expect(
    panel.getByText("Editing shared defaults", { exact: true }),
  ).toBeVisible();
  await expect(panel.locator("input.search")).toHaveValue("Antialiasing");
  expect(errors).toEqual([]);
});
