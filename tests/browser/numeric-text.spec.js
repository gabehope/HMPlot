import { test, expect } from "./fixtures.js";

test.use({ deviceScaleFactor: 2 });

// TODO 143.6: numbers computed on the GPU reach Text with no as_category and no domain. A brushed
// Group's count is one label that follows the brush and the data (crossing a power of ten), a
// Calculate's values are written as tooltips write them, and format takes d3 and date patterns.
const labels = (page, name) => page.evaluate(async (name) => {
  const plot = window.numericText[name];
  await window.numericText.group?.whenSettled?.();
  await plot.whenSettled();
  const svg = await (await plot.exportSVG({ mode: "vector" })).blob.text();
  const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
  return [...doc.querySelectorAll("text")].map((t) => t.textContent.trim()).filter(Boolean);
}, name);
/** Dark pixels in a plot's PNG: the label is drawn, not only exported. */
const ink = (page, name) => page.evaluate(async (name) => {
  const bitmap = await createImageBitmap(await window.numericText[name].exportPNG());
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height), context = canvas.getContext("2d");
  context.drawImage(bitmap, 0, 0); bitmap.close();
  const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
  let dark = 0;
  for (let i = 0; i < data.length; i += 4) if (data[i] + data[i + 1] + data[i + 2] < 300 && data[i + 3] > 128) dark++;
  return dark;
}, name);

test("a GPU count, computed values and formats draw as numbers", async ({ page }) => {
  const problems = [];
  page.on("pageerror", (error) => problems.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") problems.push(message.text()); });
  await page.goto("/test/numeric-text");
  await page.waitForFunction(() => window.numericText?.times?.whenSettled);
  await expect(page.locator(".canvas[aria-busy='false']")).toHaveCount(4);

  expect(await labels(page, "readout")).toEqual(["1200"]);
  const whole = await ink(page, "readout");
  expect(whole).toBeGreaterThan(100);
  // Computed thirds (0.04167, 0.1667, 0.125) as tooltips write them; shares with format=".1%".
  expect(await labels(page, "values")).toEqual(expect.arrayContaining(["0.04167", "0.1667", "0.125", "12.5%", "50.0%", "37.5%"]));
  expect(await labels(page, "times")).toEqual(expect.arrayContaining(["Jan 15, 2024", "Jul 04, 2024"]));

  // A brush narrows the count: fewer digits drawn.
  const box = await page.locator('[aria-label="Plot canvas"]').first().boundingBox();
  await page.keyboard.down("Shift");
  await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.3);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.45, box.y + box.height * 0.5, { steps: 6 });
  await page.mouse.up();
  await page.keyboard.up("Shift");
  await expect.poll(async () => (await labels(page, "readout"))[0]).not.toBe("1200");
  const brushed = Number((await labels(page, "readout"))[0].replace(/,/g, ""));
  expect(brushed).toBeGreaterThan(0);
  expect(brushed).toBeLessThan(1200);
  expect(await ink(page, "readout")).toBeLessThan(whole);
  await page.evaluate(() => window.numericText.source.getBrush().clear());
  await expect.poll(async () => (await labels(page, "readout"))[0]).toBe("1200");

  // New data crosses powers of ten both ways: 999 rows, then 10,000.
  await page.evaluate(() => window.numericText.setRows(999));
  await expect.poll(async () => (await labels(page, "readout"))[0]).toBe("999");
  await page.evaluate(() => window.numericText.setRows(10000));
  await expect.poll(async () => (await labels(page, "readout"))[0]).toBe("10,000");
  expect(await ink(page, "readout")).toBeGreaterThan(whole);
  expect(await page.evaluate(() => [...document.querySelectorAll('[role="alert"]')].map((e) => e.textContent))).toEqual([]);
  expect(problems).toEqual([]);
});
