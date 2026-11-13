import { test, expect } from "./fixtures.js";

test.use({ deviceScaleFactor: 2 });
test.beforeEach(async ({ page }) => {
  await page.goto("/test/input-controls");
  await page.waitForFunction(() => window.inputControls?.plot && document.querySelectorAll('.canvas').length && [...document.querySelectorAll('.canvas')].every(c => c.getAttribute('aria-busy') === 'false'));
  await page.evaluate(() => window.inputControls.plot.whenSettled());
});

test("range handles stay ordered and update the plot's visible domain", async ({ page }) => {
  const lower = page.getByRole("slider", { name: "Window: lower" });
  const upper = page.getByRole("slider", { name: "Window: upper" });
  await lower.focus();
  await page.keyboard.press("ArrowRight");
  await expect(lower).toHaveValue("3");
  await upper.focus();
  await page.keyboard.press("Home");
  await expect(upper).toHaveValue("3");
  await page.evaluate(() => inputControls.range.setValue([7, 4]));
  await expect(page.getByRole("group", { name: "Window", exact: true }).locator("output")).toHaveText("4 – 7");
  await page.evaluate(() => inputControls.plot.whenSettled());
  // The x=3 point moves outside the plot when the selected domain starts at 4.
  let exported;
  await expect.poll(async () => {
    exported = await page.evaluate(async () => {
    const svg = await (await inputControls.plot.exportSVG()).blob.text();
    const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
    return { description: doc.querySelector("desc").textContent,
      positions: [...doc.querySelectorAll("circle")].map(c => Number(c.getAttribute("cx"))) };
  });
    return exported.description;
  }).toContain("x from 4 to 7");
  expect(exported.positions[0]).toBeLessThan(0);
  expect(exported.positions[1]).toBeGreaterThan(0);
  await page.evaluate(() => inputControls.bounds([5, 6]));
  await expect(page.getByRole("group", { name: "Window", exact: true }).locator("output")).toHaveText("5 – 6");
});

test("interval Slider shares calendar steps and data-derived bounds with scalar sliders", async ({ page }) => {
  const output = page.getByRole("group", { name: "Months", exact: true }).locator("output");
  await expect(output).toHaveText("Jan 2024 – Mar 2024");
  await page.getByRole("slider", { name: "Months: lower" }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(output).toHaveText("Feb 2024 – Mar 2024");
  expect(await page.evaluate(() => inputControls.months.getValue().map(v => v.toISOString())))
    .toEqual(["2024-02-01T00:00:00.000Z", "2024-03-01T00:00:00.000Z"]);
  await page.evaluate(() => inputControls.replaceDates());
  await expect(output).toHaveText("Mar 2024 – Mar 2024");
  await expect(page.getByRole("slider", { name: "Months: lower" })).toHaveValue("0");
  await expect(page.getByRole("slider", { name: "Months: upper" })).toHaveValue("0");
});

test("text and color edits reach the rendered title and exported marks", async ({ page }) => {
  await page.getByRole("textbox", { name: "Caption" }).fill("Edited observations");
  await expect(page.locator(".plot-title")).toHaveText("Edited observations");
  await page.getByLabel("Ink", { exact: true }).fill("#ff0000");
  await page.evaluate(() => inputControls.plot.whenSettled());
  const svg = await page.evaluate(async () => (await inputControls.plot.exportSVG()).blob.text());
  expect(svg).toMatch(/#ff0000|rgb\(255[, ]+0[, ]+0\)/i);
  await page.getByRole("textbox", { name: "Caption" }).fill("");
  await expect.poll(() => page.evaluate(() => inputControls.text.getValue())).toBe("");
});

test("datetime edits preserve the instant across zones, reject DST gaps, and clear", async ({ page }) => {
  const date = page.getByLabel("Date", { exact: true });
  await expect(date).toHaveValue("2024-06-01T12:30");
  await date.fill("2024-06-02T09:15");
  await expect.poll(() => page.evaluate(() => inputControls.date.getValue().toISOString())).toBe("2024-06-02T13:15:00.000Z");
  await date.fill("2024-03-10T02:30");
  await expect(page.getByRole("alert")).toContainText("unambiguous");
  expect(await page.evaluate(() => inputControls.date.getValue().toISOString())).toBe("2024-06-02T13:15:00.000Z");
  await page.evaluate(() => inputControls.zone("UTC"));
  await expect(date).toHaveValue("2024-06-02T13:15");
  await date.fill("");
  await expect.poll(() => page.evaluate(() => inputControls.date.getValue())).toBeNull();
});

test("a slider shows its value, themed, and a page's CSS variables restyle it (TODO 132.3)", async ({ page }) => {
  const speed = page.locator(".hm-slider");
  await expect(speed.locator(".hm-input-value")).toHaveText("12,346");
  const look = () => speed.evaluate((element) => {
    const style = getComputedStyle(element);
    return { accent: style.accentColor, font: style.fontFamily, size: style.fontSize };
  });
  expect(await look()).toEqual({ accent: "rgb(228, 87, 46)", font: expect.stringContaining("Source Sans 3"), size: "15px" });
  // The controls' em sizes follow the theme's text size (10em at 15px), and a Slider's
  // handles span its whole track.
  expect((await speed.locator('input[type="range"]').boundingBox()).width).toBeCloseTo(150, 0);
  const range = await page.getByRole("group", { name: "Window", exact: true }).evaluate((element) => ({
    track: element.querySelector(".hm-range").getBoundingClientRect().width,
    inputs: [...element.querySelectorAll("input")].map((input) => input.getBoundingClientRect().width),
  }));
  expect(range.inputs).toEqual([range.track, range.track]);
  await page.evaluate(() => {
    document.body.style.setProperty("--hm-controls-accent", "#0f766e");
    document.body.style.setProperty("--hm-controls-font", "Georgia, serif");
    inputControls.speed.setValue(0.5);
  });
  expect(await look()).toEqual({ accent: "rgb(15, 118, 110)", font: "Georgia, serif", size: "15px" });
  await expect(speed.locator(".hm-input-value")).toHaveText("0.5");
});


test("multiple Select filters drawn rows and drops choices removed from data", async ({ page }) => {
  const select = page.getByRole("listbox", { name: "Groups" });
  const points = async () => page.evaluate(async () => {
    await inputControls.groupPlot.whenSettled();
    const svg = await (await inputControls.groupPlot.exportSVG({ mode: "vector" })).blob.text();
    return new DOMParser().parseFromString(svg, "image/svg+xml").querySelectorAll("circle").length;
  });
  await expect(select).toHaveValues(["0", "1"]);
  expect(await points()).toBe(2);
  await select.selectOption(["1"]);
  await expect.poll(points).toBe(1);
  await select.selectOption(["0", "1"]);
  await expect.poll(points).toBe(2);
  await page.evaluate(() => inputControls.replaceGroups());
  await expect(select.locator("option")).toHaveCount(2);
  await expect.poll(() => page.evaluate(() => inputControls.groupSelect.getValue())).toEqual(["a"]);
  await expect.poll(points).toBe(1);
});
