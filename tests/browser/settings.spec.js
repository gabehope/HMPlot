import { test, expect } from "./fixtures.js";
const panelFor = (page, name = "Inspector A") =>
  page.getByRole("dialog", { name: `Settings · ${name}`, exact: true });
const row = (panel, path) => panel.locator(`[data-setting="${path}"]`);
async function open(page, name = "Inspector A") {
  await page
    .getByRole("region", { name, exact: true })
    .locator("canvas")
    .hover();
  await page
    .getByRole("button", { name: `Settings for ${name}`, exact: true })
    .click();
  return panelFor(page, name);
}
async function target(panel, name) {
  await panel.getByRole("treeitem", { name, exact: false }).click();
}
async function expand(panel, name) {
  const section = panel.locator("summary").filter({ hasText: new RegExp(`^${name}`) });
  if ((await section.getAttribute("aria-expanded")) !== "true") await section.click();
}
async function searchSettings(panel, value) {
  const input = panel.getByRole("searchbox");
  if (!(await input.isVisible()))
    await panel.getByRole("button", { name: "Search settings", exact: true }).click();
  await input.fill(value);
}
async function read(page, name, key) {
  return page.evaluate(
    ([name, key]) => window.__settingsFixture.read(name, key),
    [name, key],
  );
}
function monitor(page) {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error" && !message.text().includes("favicon"))
      errors.push(message.text());
  });
  return errors;
}
test("plot controls switch cameras, synchronize the host and preserve marks", async ({
  page,
}) => {
  const errors = monitor(page);
  await page.goto("/settings-fixture");
  const panel = await open(page);
  await expand(panel, "View");
  await expect(panel.getByLabel("View mode", { exact: true })).toHaveValue(
    "2d",
  );
  await expect(
    panel.getByLabel("Constrain 2D panning", { exact: true }),
  ).toBeEnabled();
  await page.evaluate(() => window.__settingsFixture.settled());
  const before = await page.evaluate(() =>
    window.__settingsFixture.diagnostics(),
  );
  await panel.getByLabel("View mode", { exact: true }).selectOption("3d");
  await expect(page.getByLabel("Bound view", { exact: true })).toHaveText("3d");
  await expect(
    panel.getByLabel("Constrain 2D panning", { exact: true }),
  ).toBeDisabled();
  await page.evaluate(() => window.__settingsFixture.settled());
  const after = await page.evaluate(() =>
    window.__settingsFixture.diagnostics(),
  );
  expect(after.managers).toBe(before.managers);
  await page.keyboard.press("Escape");
  await page
    .getByRole("button", { name: "Change bound view", exact: true })
    .click();
  await open(page);
  await expect(panel.getByLabel("View mode", { exact: true })).toHaveValue(
    "2d",
  );
  await page.keyboard.press("Escape");
  await page
    .getByRole("button", { name: "Change host view", exact: true })
    .click();
  const other = await open(page, "Inspector B");
  await expand(other, "View");
  await expect(other.getByLabel("View mode", { exact: true })).toHaveValue(
    "3d",
  );
  await other.getByLabel("View mode", { exact: true }).selectOption("2d");
  await page.keyboard.press("Escape");
  await open(page, "Inspector B");
  await expect(other.getByLabel("View mode", { exact: true })).toHaveValue(
    "2d",
  );
  expect(errors).toEqual([]);
});
test("levels, quantization and nested grid edits preserve layout and inheritance", async ({
  page,
}) => {
  const errors = monitor(page);
  await page.goto("/settings-fixture");
  const panel = await open(page);
  await target(panel, "Mark defaults");
  await searchSettings(panel, "Color mapping");
  const order = await panel
    .locator("[data-control-id]")
    .evaluateAll((nodes) => nodes.map((node) => node.dataset.controlId));
  const box = await panel.boundingBox();
  const content = panel.locator(".content");
  await row(panel, "quantize").getByRole("checkbox").check();
  const levels = row(panel, "levels").getByLabel("Levels value", {
    exact: true,
  });
  await expect(levels).toBeEnabled();
  await levels.fill("256");
  await levels.press("Enter");
  expect(await read(page, "Nested heatmap", "levels")).toBe(256);
  expect(await read(page, "Other heatmap", "levels")).toBe(10);
  await levels.fill("");
  await levels.press("Enter");
  await expect(levels).toHaveAttribute("aria-invalid", "true");
  expect(await read(page, "Nested heatmap", "levels")).toBe(256);
  await levels.press("Escape");
  await expect(panel).toBeVisible();
  await expect(levels).toHaveValue("256");
  const scroll = await content.evaluate((el) => el.scrollTop);
  await levels.fill("20");
  await levels.press("Enter");
  await expect(levels).toBeFocused();
  expect(await content.evaluate((el) => el.scrollTop)).toBe(scroll);
  expect(await panel.boundingBox()).toEqual(box);
  expect(
    await panel
      .locator("[data-control-id]")
      .evaluateAll((nodes) => nodes.map((node) => node.dataset.controlId)),
  ).toEqual(order);
  await target(panel, "Layer group defaults");
  await searchSettings(panel, "grid");
  const grid = row(panel, "grid.enabled").getByRole("checkbox");
  const gridOrder = await panel
    .locator("[data-control-id]")
    .evaluateAll((nodes) => nodes.map((node) => node.dataset.controlId));
  await grid.check();
  expect(await read(page, "Nested heatmap", "grid-enabled")).toBe(true);
  expect(await read(page, "Other heatmap", "grid-enabled")).toBe(false);
  await grid.uncheck();
  expect(await read(page, "Nested heatmap", "grid-enabled")).toBe(false);
  await expect(
    row(panel, "grid.cells").getByLabel("Cell count X", { exact: true }),
  ).toBeDisabled();
  expect(
    await panel
      .locator("[data-control-id]")
      .evaluateAll((nodes) => nodes.map((node) => node.dataset.controlId)),
  ).toEqual(gridOrder);
  await target(panel, "Nested heatmap");
  await row(panel, "grid.enabled").getByRole("checkbox").check();
  await target(panel, "Mark defaults");
  await row(panel, "grid.enabled").getByRole("checkbox").check();
  expect(await read(page, "Nested heatmap", "grid-enabled")).toBe(true);
  await target(panel, "Nested heatmap");
  await row(panel, "grid.enabled")
    .getByRole("button", { name: "Reset Show grid to inherited" })
    .click();
  expect(await read(page, "Nested heatmap", "grid-enabled")).toBe(false);
  await expect(row(panel, "grid.enabled")).toContainText("Layer group");
  await target(panel, "Layer group defaults");
  await row(panel, "grid.enabled")
    .getByRole("button", { name: "Reset Show grid to inherited" })
    .click();
  expect(await read(page, "Nested heatmap", "grid-enabled")).toBe(true);
  expect(errors).toEqual([]);
});

test("grid, quantized levels and contours change rendered pixels and grid restores cleanly", async ({
  page,
}) => {
  const errors = monitor(page);
  await page.goto("/settings-fixture");
  const canvas = page
    .getByRole("region", { name: "Inspector A", exact: true })
    .locator("canvas");
  await expect(canvas).toBeVisible();
  await page.evaluate(() => window.__settingsFixture.settled());
  async function pixels() {
    await page.mouse.move(10, 10);
    await page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    );
    const b = await canvas.boundingBox();
    return page.screenshot({
      clip: { x: b.x + 12, y: b.y + 40, width: 128, height: 200 },
    });
  }
  async function edit(search, action) {
    const panel = await open(page);
    await target(panel, "Nested heatmap");
    await searchSettings(panel, search);
    await action(panel);
    await page.evaluate(() => window.__settingsFixture.settled());
    await panel.getByRole("button", { name: "Close settings", exact: true }).click();
  }
  const baseline = await pixels();
  await edit("grid", async (panel) => {
    await row(panel, "grid.enabled").getByRole("checkbox").check();
  });
  const grid = await pixels();
  expect(grid.equals(baseline)).toBe(false);
  await edit("grid", async (panel) => {
    const input = row(panel, "grid.cellsWidth").getByLabel(
      "Cell line width value",
      { exact: true },
    );
    await input.fill("4");
    await input.press("Enter");
  });
  const wide = await pixels();
  expect(wide.equals(grid)).toBe(false);
  await edit("grid", async (panel) => {
    await row(panel, "grid.enabled").getByRole("checkbox").uncheck();
  });
  expect((await pixels()).equals(baseline)).toBe(true);
  await edit("grid", async (panel) => {
    await row(panel, "grid.enabled").getByRole("checkbox").check();
  });
  expect((await pixels()).equals(wide)).toBe(true);
  await edit("grid", async (panel) => {
    await row(panel, "grid.enabled").getByRole("checkbox").uncheck();
  });
  await edit("Color mapping", async (panel) => {
    await row(panel, "quantize").getByRole("checkbox").check();
    const input = row(panel, "levels").getByLabel("Levels value", {
      exact: true,
    });
    await input.fill("4");
    await input.press("Enter");
  });
  const four = await pixels();
  expect(four.equals(baseline)).toBe(false);
  await edit("Color mapping", async (panel) => {
    const input = row(panel, "levels").getByLabel("Levels value", {
      exact: true,
    });
    await input.fill("8");
    await input.press("Enter");
  });
  const eight = await pixels();
  expect(eight.equals(four)).toBe(false);
  await edit("Color mapping", async (panel) => {
    await row(panel, "quantize").getByRole("checkbox").uncheck();
  });
  await edit("Contours", async (panel) => {
    await row(panel, "contour.enabled").getByRole("checkbox").check();
  });
  expect((await pixels()).equals(baseline)).toBe(false);
  expect(errors).toEqual([]);
});

test("trigger respects hover, focus, minimum dimensions and external anchors", async ({
  page,
}) => {
  const errors = monitor(page);
  await page.goto("/settings-fixture");
  const trigger = page.getByRole("button", {
    name: "Settings for Inspector A",
    exact: true,
  });
  const region = page.getByRole("region", { name: "Inspector A", exact: true });
  // Hidden until the plot is hovered, faint over the plot, full over the buttons (TODO 60), and
  // in the lower right, inside the default 32px bottom axis margin.
  const controls = region.locator("[data-plot-controls]");
  await expect(controls).toHaveCSS("opacity", "0");
  await region.locator("canvas").hover();
  await expect(controls).toHaveCSS("opacity", "0.45");
  await trigger.hover();
  await expect(controls).toHaveCSS("opacity", "1");
  const [placed, canvas] = await Promise.all([controls.boundingBox(), region.locator(".canvas").boundingBox()]);
  expect(canvas.y + canvas.height - placed.y).toBeLessThanOrEqual(32);
  expect(canvas.x + canvas.width - (placed.x + placed.width)).toBeLessThanOrEqual(8);
  await page.mouse.move(10, 10);
  await expect(controls).toHaveCSS("opacity", "0");
  // Tab from the final host control reaches the plot's canvas (a keyboard stop), then the
  // otherwise hidden trigger.
  await page.getByLabel("Facet menu", { exact: true }).focus();
  await page.keyboard.press("Tab");
  await expect(region.getByRole("application", { name: "Plot canvas" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(trigger).toBeFocused();
  await expect(controls).toHaveCSS("opacity", "1");
  await page.keyboard.press("Enter");
  const panel = panelFor(page);
  await expect(panel).toBeVisible();
  const box = await panel.boundingBox();
  await page.mouse.move(10, 10);
  await expect(panel).toBeVisible();
  expect(await panel.boundingBox()).toEqual(box);
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  for (const [width, height, present] of [
    [240, 160, true],
    [239, 160, false],
    [240, 159, false],
    [241, 161, true],
  ]) {
    await page.getByLabel("Fixture width", { exact: true }).fill(String(width));
    await page
      .getByLabel("Fixture height", { exact: true })
      .fill(String(height));
    await expect(trigger).toHaveCount(present ? 1 : 0);
    await page
      .getByRole("button", { name: "External settings", exact: true })
      .click();
    await expect(panel).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(
      page.getByRole("button", { name: "External settings", exact: true }),
    ).toBeFocused();
  }
  await page.getByLabel("Fixture width", { exact: true }).fill("480");
  await page.getByLabel("Fixture height", { exact: true }).fill("320");
  await open(page);
  // A plot at least 480 x 320 docks its pane inside itself (smaller ones float, as above).
  const [docked, host] = await Promise.all([panel.boundingBox(), region.boundingBox()]);
  expect(docked.x >= host.x && docked.y >= host.y && docked.x + docked.width <= host.x + host.width + 0.5 &&
    docked.y + docked.height <= host.y + host.height + 0.5).toBe(true);
  // Programmatic resize models a host changing layout without an outside click.
  await page.getByLabel("Fixture width", { exact: true }).evaluate((el) => {
    el.value = "239";
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await expect(panel).not.toBeVisible();
  await expect(region).toBeFocused();
  await expect(trigger).toHaveCount(0);
  await page
    .getByRole("button", { name: "External settings", exact: true })
    .click();
  await page.getByLabel("Fixture height", { exact: true }).evaluate((el) => {
    el.value = "100";
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await expect(panel).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByLabel("Fixture width", { exact: true }).fill("480");
  await page.getByLabel("Fixture height", { exact: true }).fill("320");
  await page.getByLabel("Built-in trigger", { exact: true }).uncheck();
  await region.locator("canvas").hover();
  await expect(trigger).toHaveCount(0);
  await page.evaluate(() => window.__settingsFixture.openWithoutAnchor());
  await expect(panel).toBeVisible();
  expect(errors).toEqual([]);
});

test("touch-only devices show the buttons faintly and retain external settings on narrow screens", async ({
  browser,
}) => {
  const context = await browser.newContext({
    hasTouch: true,
    isMobile: true,
    viewport: { width: 390, height: 800 },
  });
  const page = await context.newPage();
  const errors = monitor(page);
  try {
    await page.goto("/settings-fixture");
    await expect(
      page
        .getByRole("region", { name: "Inspector A", exact: true })
        .locator("canvas"),
    ).toBeVisible();
    // No hover to reveal them, so they stay faint (TODO 60).
    await expect(
      page.getByRole("region", { name: "Inspector A", exact: true }).locator("[data-plot-controls]"),
    ).toHaveCSS("opacity", "0.45");
    await page
      .getByRole("button", { name: "External settings", exact: true })
      .tap();
    const panel = panelFor(page);
    await expect(panel).toBeVisible();
    const box = await panel.boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(390);
    await expand(panel, "View");
    await panel.getByLabel("View mode", { exact: true }).selectOption("3d");
    await expect(page.getByLabel("Bound view", { exact: true })).toHaveText(
      "3d",
    );
    await panel
      .getByRole("button", { name: "Close settings", exact: true })
      .tap();
    await expect(panel).not.toBeVisible();
    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
});

test("shared edits, names, target recovery, search expansion and teardown remain explicit", async ({
  page,
}) => {
  const errors = monitor(page);
  await page.goto("/settings-fixture");
  let panel = await open(page);
  await target(panel, "Nested heatmap");
  await searchSettings(panel, "opacity");
  const input = row(panel, "opacity").getByLabel("Opacity value", {
    exact: true,
  });
  await input.fill("0.5");
  await input.press("Enter");
  await panel
    .getByRole("button", { name: "Shared defaults…", exact: true })
    .click();
  await expect(panel.locator(".banner")).toContainText(
    "Inspector A, Inspector B",
  );
  await searchSettings(panel, "opacity");
  const shared = row(panel, "opacity").getByLabel("Opacity value", {
    exact: true,
  });
  await shared.fill("0.7");
  await shared.press("Enter");
  expect(await read(page, "Nested heatmap", "opacity")).toBe(0.5);
  expect(await read(page, "Other heatmap", "opacity")).toBe(0.7);
  await panel
    .getByRole("button", { name: "Return to Inspector A", exact: true })
    .click();
  await expand(panel, "View");
  await expect(panel.getByLabel("View mode", { exact: true })).toBeVisible();
  await target(panel, "Nested heatmap");
  await searchSettings(panel, "");
  const mapping = panel.locator('[data-group="Color mapping"]');
  if (!(await mapping.isVisible())) await target(panel, "Nested heatmap");
  if (!(await mapping.getAttribute("open"))) await mapping.locator("summary").click();
  await mapping.locator("summary").click();
  await expect(mapping).not.toHaveAttribute("open", "");
  await searchSettings(panel, "levels");
  await expect(mapping).toHaveAttribute("open", "");
  await searchSettings(panel, "");
  await expect(mapping).not.toHaveAttribute("open", "");
  // Removing a mark while its panel is open recovers to its actual group.
  await page
    .getByRole("button", { name: "Toggle nested marks", exact: true })
    .evaluate((el) => el.click());
  await expect(
    panel.getByLabel("Selected settings target", { exact: true }),
  ).toContainText("Layer group defaults");
  await page.keyboard.press("Escape");
  await panel.getByRole("button", { name: "Close settings", exact: true }).click();
  await page.getByLabel("Fixture name", { exact: true }).fill("Inspector B");
  panel = await open(page, "Inspector B (2)");
  await expect(panel).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByLabel("Fixture name", { exact: true }).fill("");
  await page.getByLabel("Second fixture name", { exact: true }).fill("");
  await expect(
    page.getByRole("region", { name: "Plot 1", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Plot 2", exact: true }),
  ).toBeVisible();
  for (let i = 0; i < 3; i++) {
    await page
      .getByRole("button", { name: "Toggle mounted plots", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Toggle mounted plots", exact: true })
      .click();
  }
  // Inspector A, Inspector B and the Facet's two cells.
  await expect(page.locator("canvas")).toHaveCount(4);
  expect(errors).toEqual([]);
});

test("camera settings reach the pane: Fly speed follows the camera mode and the fov slider spans 10-120", async ({ page }) => {
  const errors = monitor(page);
  await page.goto("/test/camera");
  await page.waitForFunction(() => window.cameraFixture?.fly?.getCamera?.());
  await page.evaluate(() => window.cameraFixture.fly.openSettings());
  const panel = panelFor(page, "Fly");
  await expect(panel).toBeVisible();
  await expand(panel, "View");
  await expand(panel, "Navigation");
  const mode = panel.getByLabel("3D camera", { exact: true });
  await expect(mode).toHaveValue("flyover");
  const speed = row(panel, "plot.flySpeed"), momentum = row(panel, "plot.flyoverMomentum");
  await expect(speed.locator("input").first()).toBeEnabled();
  // Flyover momentum (TODO 66.6): on by default, a flyover setting.
  await expect(momentum.getByRole("checkbox")).toBeChecked();
  await expect(momentum.getByRole("checkbox")).toBeEnabled();
  const fov = row(panel, "plot.cameraFov").locator('input[type="range"]');
  await expect(fov).toHaveAttribute("min", "10");
  await expect(fov).toHaveAttribute("max", "120");
  await expect(row(panel, "plot.cameraNear")).toBeVisible();
  await expect(row(panel, "plot.cameraFar")).toBeVisible();
  await mode.selectOption("orbit");
  await expect(speed.locator("input").first()).toBeDisabled();
  await expect(momentum.getByRole("checkbox")).toBeDisabled();
  await expect.poll(() => page.evaluate(() => window.cameraFixture.fly.getCamera().mode)).toBe("orbit");
  await mode.selectOption("flyover");
  await expect(speed.locator("input").first()).toBeEnabled();
  expect(errors).toEqual([]);
});

test("antialiasing: the pane offers native and hybrid sampling, SMAA and off; transparent backgrounds and exports stay unchanged", async ({ page }) => {
  const errors = monitor(page);
  await page.goto("/settings-fixture");
  const canvas = page.getByRole("region", { name: "Inspector A", exact: true }).locator("canvas");
  await expect(canvas).toBeVisible();
  await page.evaluate(() => window.__settingsFixture.settled());
  // An export's pixels. The browser rasterizes the axes' SVG a few levels differently from one
  // export to the next (the markup is the same), so exports compare within a small tolerance.
  const exported = () => page.evaluate(async () => {
    const image = await createImageBitmap(await window.__settingsFixture.exportPNG());
    const c = document.createElement("canvas"); c.width = image.width; c.height = image.height;
    const context = c.getContext("2d"); context.drawImage(image, 0, 0);
    return Array.from(context.getImageData(0, 0, c.width, c.height).data);
  });
  const largestDifference = (a, b) => a.length === b.length ? a.reduce((m, v, i) => Math.max(m, Math.abs(v - b[i])), 0) : Infinity;
  // Pixels of the plot as shown that are near black: SMAA once cleared to opaque black (TODO 58).
  const black = async () => {
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const shot = (await canvas.screenshot()).toString("base64");
    return page.evaluate(async (b64) => {
      const image = await createImageBitmap(await (await fetch(`data:image/png;base64,${b64}`)).blob());
      const c = document.createElement("canvas"); c.width = image.width; c.height = image.height;
      const context = c.getContext("2d"); context.drawImage(image, 0, 0);
      const data = context.getImageData(0, 0, c.width, c.height).data;
      let n = 0; for (let i = 0; i < data.length; i += 4) if (data[i] + data[i + 1] + data[i + 2] < 30) n++;
      return n / (data.length / 4);
    }, shot);
  };
  const exportedWithMSAA = await exported();
  const panel = await open(page);
  await searchSettings(panel, "Antialiasing");
  const mode = panel.getByLabel("Antialiasing", { exact: true });
  await expect(mode.locator("option")).toHaveText(["4× MSAA", "8× hybrid (MSAA + SSAA)", "16× hybrid (MSAA + SSAA)", "SMAA", "Off"]);
  await expect(mode).toHaveValue("msaa");
  await mode.selectOption("smaa");
  await page.keyboard.press("Escape");
  await page.evaluate(() => window.__settingsFixture.settled());
  // Exports render with 4x MSAA whatever the screen uses.
  expect(largestDifference(await exported(), exportedWithMSAA)).toBeLessThanOrEqual(4);
  // Without its heatmap the plot is all background, which must show the page.
  await page.getByRole("button", { name: "Toggle nested marks" }).click();
  await page.evaluate(() => window.__settingsFixture.settled());
  expect(await black()).toBeLessThan(0.01);
  expect(errors).toEqual([]);
});


test("closed settings release controls and tree subscriptions, then reopen with current values", async ({ page }) => {
  const errors = monitor(page);
  await page.goto("/settings-fixture");
  await page.waitForFunction(() => document.querySelectorAll('.canvas').length &&
    [...document.querySelectorAll('.canvas')].every(c => c.getAttribute('aria-busy') === 'false'));
  await page.evaluate(() => __settingsFixture.settled());
  const subscriptions = () => page.evaluate(async () => {
    const { optionsRoot } = await import('/src/lib/options/options.js');
    return optionsRoot.structureListeners.size;
  });
  const controls = page.locator('[role="dialog"] [data-setting]');
  await expect(controls).toHaveCount(0);
  const baseline = await subscriptions();
  const panel = await open(page);
  await searchSettings(panel, "View mode");
  await expect(panel.getByLabel("View mode", { exact: true })).toHaveValue("2d");
  expect(await subscriptions()).toBeGreaterThan(baseline);
  await panel.getByRole("button", { name: "Close settings", exact: true }).click();
  await expect(controls).toHaveCount(0);
  await expect.poll(subscriptions).toBe(baseline);
  await page.getByRole("button", { name: "Change bound view", exact: true }).click();
  await open(page);
  await expect(panel.getByRole("searchbox")).toHaveValue("View mode");
  await expect(panel.getByLabel("View mode", { exact: true })).toHaveValue("3d");
  await panel.getByRole("button", { name: "Search settings", exact: true }).click();
  await target(panel, "Nested heatmap");
  await panel.getByRole("button", { name: "Close settings", exact: true }).click();
  await page.getByRole("button", { name: "Toggle nested marks", exact: true }).click();
  await open(page);
  await expect(panel.getByRole("treeitem", { name: /Nested heatmap/ })).toHaveCount(0);
  await expect(panel.locator('[role="treeitem"][aria-selected="true"]')).toHaveCount(1);
  await panel.getByRole("button", { name: "Close settings", exact: true }).click();
  await expect(controls).toHaveCount(0);
  await expect.poll(subscriptions).toBe(baseline);
  expect(errors).toEqual([]);
});
