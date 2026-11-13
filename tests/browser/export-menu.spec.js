import { readFileSync } from "node:fs";
import { test, expect } from "./fixtures.js";

// The plot's export button (TODO 60): a keyboard-accessible, format-aware panel inside the plot,
// apart from settings, and the same panel from the context menu.
test("the export button opens a format-aware export panel inside the plot", async ({ page }) => {
  await page.goto("/settings-fixture");
  const plot = page.getByRole("region", { name: "Inspector A", exact: true });
  await plot.locator("canvas").hover();
  const button = plot.getByRole("button", { name: "Export Inspector A", exact: true });
  await button.click();
  const panel = page.getByRole("dialog", { name: "Export · Inspector A" }),
    format = panel.getByLabel("Format");
  await expect(format).toBeFocused();
  // PDF is Python's (printed by Chromium); the browser's panel does not offer it.
  await expect(format.locator("option")).toHaveText(["PNG", "SVG"]);
  await expect(button).toHaveAttribute("aria-expanded", "true");
  const inside = async () => {
    const [p, s] = await Promise.all([panel.boundingBox(), plot.boundingBox()]);
    return p.x >= s.x && p.y >= s.y && p.x + p.width <= s.x + s.width + 0.5 && p.y + p.height <= s.y + s.height + 0.5;
  };
  expect(await inside()).toBe(true);
  await expect(panel.getByLabel("PNG export scale")).toBeVisible();
  await format.selectOption("svg");
  await expect(panel.getByLabel("Document raster DPI")).toBeVisible();
  await expect(panel.getByLabel("Document export width")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(panel).toHaveCount(0);
  await expect(button).toBeFocused();
  await button.click();
  await expect(panel).toBeVisible();
  // Opening settings closes it; the button toggles it.
  await plot.getByRole("button", { name: "Settings for Inspector A", exact: true }).click();
  await expect(panel).toHaveCount(0);
  await page.getByRole("button", { name: "Close settings", exact: true }).click();
  await plot.locator("canvas").hover();
  await button.click();
  await button.click();
  await expect(panel).toHaveCount(0);
  // The context menu offers the same panel, at the pointer.
  await plot.locator("canvas").click({ button: "right" });
  await page.getByRole("menuitem", { name: "Export…" }).click();
  await expect(panel).toBeVisible();
  expect(await inside()).toBe(true);
  await page.keyboard.press("Escape");
  await expect(panel).toHaveCount(0);
});

// TODO 69: a plot that hides its buttons (settings showTrigger: false) exports from its context
// menu: the panel, closed with the buttons it opens above, stayed closed without them.
test("the context menu exports a plot that hides its buttons; the button's panel closes with the buttons", async ({ page }) => {
  await page.goto("/settings-fixture");
  const plot = page.getByRole("region", { name: "Inspector A", exact: true }), canvas = plot.locator(".canvas");
  const panel = page.getByRole("dialog", { name: "Export · Inspector A" });
  await page.getByLabel("Built-in trigger", { exact: true }).uncheck();
  await canvas.hover();
  await expect(plot.getByRole("button", { name: "Export Inspector A", exact: true })).toHaveCount(0);
  await plot.locator("canvas").click({ button: "right" });
  await page.getByRole("menuitem", { name: "Export…" }).click();
  await expect(panel).toBeVisible();
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await expect(panel).toBeVisible();
  const download = page.waitForEvent("download");
  await panel.getByRole("button", { name: "Download" }).click();
  // The panel's default scale, 2, multiplies the actual drawing buffer density.
  const png = readFileSync(await (await download).path());
  const size = await canvas.locator("canvas").evaluate(el => [el.width, el.height]);
  expect(png.subarray(1, 4).toString()).toBe("PNG");
  expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual(size.map(value => Math.round(value * 2)));
  await page.keyboard.press("Escape");
  await expect(panel).toHaveCount(0);
  // Opened from its button, the panel closes when the plot gets too small for the buttons (TODO 60).
  await page.getByLabel("Built-in trigger", { exact: true }).check();
  await canvas.hover();
  await plot.getByRole("button", { name: "Export Inspector A", exact: true }).click();
  await expect(panel).toBeVisible();
  await page.getByLabel("Fixture width", { exact: true }).evaluate((el) => {
    el.value = "239";
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await expect(panel).toHaveCount(0);
});

// TODO 128: settings.showExport and settings.menu, on a Plot and a Facet. Host code keeps
// exportPNG() and openSettings() whatever they say.
test("showExport and menu hide the export button and the plot menu; host exports still work", async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 1800 });
  await page.goto("/settings-fixture");
  const plot = page.getByRole("region", { name: "Inspector A", exact: true }), canvas = plot.locator(".canvas");
  const settingsButton = plot.getByRole("button", { name: "Settings for Inspector A", exact: true });
  const exportButton = plot.getByRole("button", { name: "Export Inspector A", exact: true });
  const menu = page.getByRole("menu", { name: "Plot actions" });
  // No export: the settings button stays, the menu offers settings alone.
  await page.getByLabel("Export button").uncheck();
  await canvas.hover();
  await expect(settingsButton).toHaveCount(1);
  await expect(exportButton).toHaveCount(0);
  await canvas.click({ button: "right" });
  await expect(menu.getByRole("menuitem", { name: "Open settings" })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "Export…" })).toHaveCount(0);
  await page.keyboard.press("Escape");
  // No menu: neither right-click nor the keyboard opens it (the browser's own menu would).
  await page.getByLabel("Plot menu").uncheck();
  const prevented = await canvas.evaluate((el) => {
    const event = new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 50, clientY: 50 });
    el.dispatchEvent(event);
    return event.defaultPrevented;
  });
  expect(prevented).toBe(false);
  await canvas.focus();
  await page.keyboard.press("Shift+F10");
  await page.keyboard.press("ContextMenu");
  await expect(menu).toBeHidden();
  // Everything off: no buttons to reach by keyboard, and the host's own calls still work.
  await page.getByLabel("Built-in trigger", { exact: true }).uncheck();
  await canvas.hover();
  await expect(plot.locator("[data-plot-controls] button")).toHaveCount(0);
  const png = await page.evaluate(async () => {
    const blob = await window.__settingsFixture.exportPNG(1);
    return [...new Uint8Array(await blob.arrayBuffer()).subarray(1, 4)].map((c) => String.fromCharCode(c)).join("");
  });
  expect(png).toBe("PNG");
  await page.evaluate(() => window.__settingsFixture.openWithoutAnchor());
  await expect(page.getByRole("dialog", { name: /Settings/ }).first()).toBeVisible();
  await page.keyboard.press("Escape");
  // A Facet: its export button goes, and its cells' menus follow its flags.
  const cell = page.getByRole("region", { name: "a", exact: true }).locator(".canvas");
  const facetExport = page.getByRole("button", { name: "Export Facet fixture", exact: true });
  await cell.scrollIntoViewIfNeeded();
  await cell.hover();
  await expect(facetExport).toHaveCount(1);
  await page.getByLabel("Facet export").uncheck();
  await cell.hover();
  await expect(page.getByRole("button", { name: "Settings for Facet fixture", exact: true })).toHaveCount(1);
  await expect(facetExport).toHaveCount(0);
  await cell.click({ button: "right" });
  await expect(menu.getByRole("menuitem", { name: "Open settings" })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "Export…" })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await page.getByLabel("Facet menu").uncheck();
  await cell.click({ button: "right" });
  await expect(menu).toBeHidden();
});
