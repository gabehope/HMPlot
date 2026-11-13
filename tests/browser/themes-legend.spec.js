import { test, expect } from "./fixtures.js";

// The themes example (a program pair since TODO 69.10): its "Theme preset" select sets the
// Theme's value through an input, in the live scene.
const presets = (page) => page.locator(".live.ready").getByRole("combobox", { name: "Theme preset" });

// A Theme relabels its options scope on every preset change; legend entries must not
// depend on it (6.11 A1). The Plot's automatic legend explains the points' groups, then lists
// the labeled marks (TODO 73.5).
test("the themes example keeps its legend entries through every preset", async ({ page }, testInfo) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/examples/themes");
  const buttons = page.locator(".live [data-guide-position] button");
  const entries = ["North", "Central", "South", "Trend", "Observations"];
  await expect(presets(page)).toBeVisible({ timeout: 60000 });
  await expect(buttons).toHaveText(entries);
  await page.waitForFunction(() => [...document.querySelectorAll(".live .canvas")].every(e => e.getAttribute("aria-busy") === "false"));
  await page.locator(".live section.plot").first().screenshot({ path: testInfo.outputPath("hmplot-default-theme.png") });
  const names = await presets(page).locator("option").allTextContents();
  expect(names.length).toBe(32);
  for (const name of names) {
    await presets(page).selectOption({ label: name });
    await expect(buttons).toHaveText(entries);
  }
  expect(errors).toEqual([]);
});

// Axis text follows the plot's theme, not the page or the OS: the theme's text color over a halo
// of the plot's own background, lines in the theme's axes.color, and a legend on that background.
test("dark themes draw axis text in their text color over their own background", async ({ page }) => {
  await page.goto("/examples/themes");
  const read = () => page.evaluate(() => {
    const text = document.querySelector(".live .canvas svg.axes .x-tick text"), line = document.querySelector(".live .canvas svg.axes .axis-lines");
    // null until the axes have drawn (under load they come after the page), so the poll retries.
    if (!text || !line) return null;
    const style = (element, key) => getComputedStyle(element)[key];
    return { fill: style(text, "fill"), halo: style(text, "stroke"), line: style(line, "stroke"),
      section: style(document.querySelector(".live section.plot"), "backgroundColor") };
  });
  await presets(page).selectOption({ label: "Dark" });
  await expect.poll(read).toEqual({ fill: "rgb(229, 231, 235)", halo: "rgb(17, 24, 39)", line: "rgb(148, 163, 184)", section: "rgb(17, 24, 39)" });
  // The settings pane takes the theme too (TODO 60), and a PNG export paints the theme's
  // background under the legend, not only under the canvas.
  const plot = page.locator(".live section.plot").first();
  await plot.locator(".canvas").hover();
  await plot.getByRole("button", { name: /^Settings for / }).click();
  const pane = page.getByRole("dialog", { name: /^Settings · / });
  await expect(pane).toHaveCSS("background-color", "rgb(17, 24, 39)");
  await pane.getByRole("button", { name: "Close settings", exact: true }).click();
  await plot.locator(".canvas").hover();
  await plot.getByRole("button", { name: /^Export / }).click();
  const pending = page.waitForEvent("download");
  await page.getByRole("dialog", { name: /^Export · / }).getByRole("button", { name: "Download", exact: true }).click();
  const chunks = [];
  for await (const chunk of await (await pending).createReadStream()) chunks.push(chunk);
  const corner = await page.evaluate(async (base64) => {
    const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${base64}`)).blob());
    const context = Object.assign(document.createElement("canvas"), { width: bitmap.width, height: bitmap.height }).getContext("2d");
    context.drawImage(bitmap, 0, 0);
    return [...context.getImageData(2, bitmap.height - 3, 1, 1).data];
  }, Buffer.concat(chunks).toString("base64"));
  expect(corner).toEqual([17, 24, 39, 255]);
  await presets(page).selectOption({ label: "HMPlot" });
  await expect.poll(read).toEqual({ fill: "rgb(37, 37, 37)", halo: "rgb(255, 255, 255)", line: "rgb(114, 114, 114)", section: "rgb(255, 255, 255)" });
});

// three's screenDPR made one uniform per material and set the pixel ratio on the newest only
// (threeExtensions/screenDPR.js): at a ratio of 2, points built before another material drew at
// half size after a load or theme change, until an interaction rebuilt them.
test.describe("at a device pixel ratio of 2", () => {
  test.use({ deviceScaleFactor: 2 });
  test("points draw at full size before any interaction", async ({ page }) => {
    await page.goto("/examples/themes");
    await presets(page).selectOption({ label: "Blueprint" });
    const canvas = page.locator(".live .canvas canvas").first();
    const settled = () => page.waitForFunction(() =>
      [...document.querySelectorAll(".canvas")].every((element) => element.getAttribute("aria-busy") === "false"));
    // Pixels of the South group's yellow (#ffe066) in the presented frame.
    const yellow = async () => page.evaluate(async (png) => {
      const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${png}`)).blob());
      const context = Object.assign(document.createElement("canvas"), { width: bitmap.width, height: bitmap.height }).getContext("2d");
      context.drawImage(bitmap, 0, 0);
      const { data } = context.getImageData(0, 0, bitmap.width, bitmap.height);
      let count = 0;
      for (let i = 0; i < data.length; i += 4) if (data[i] > 225 && data[i + 1] > 195 && data[i + 1] < 240 && data[i + 2] < 150) count++;
      return count;
    }, (await canvas.screenshot()).toString("base64"));
    await settled();
    await expect.poll(yellow).toBeGreaterThan(0);
    const first = await yellow();
    // Zoom in and back out: the frame after it draws with every material's current uniforms.
    const box = await canvas.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.wheel(0, -200);
    await page.mouse.wheel(0, 200);
    await settled();
    await expect.poll(yellow).toBeGreaterThan(0);
    expect(first / await yellow()).toBeGreaterThan(0.8);
  });
});
