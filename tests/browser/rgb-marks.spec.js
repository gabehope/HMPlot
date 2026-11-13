import { test, expect } from "./fixtures.js";

// 7C C1: each mark that accepts RGB colors draws red, green, and blue rows (fixture
// /test/rgb-marks: one plot per mark, three rows each, tone mapping off).
const MARKS = ["Points", "Segments", "Arrows3D", "Arrows", "Text", "Rect", "Area", "ErrorBars", "Line"];

async function colorCounts(page, key) {
  return page.evaluate(async (key) => {
    const plot = window.rgbMarks.plots[key];
    await plot.whenSettled();
    let png;
    try { png = await plot.exportPNG(); } catch (error) { if (/not ready/.test(error.message)) return null; throw error; }
    const bitmap = await createImageBitmap(png);
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width; canvas.height = bitmap.height;
    const context = canvas.getContext("2d"); context.drawImage(bitmap, 0, 0); bitmap.close();
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
    const counts = { red: 0, green: 0, blue: 0 };
    for (let i = 0; i < data.length; i += 4) {
      const [r, g, b] = [data[i], data[i + 1], data[i + 2]];
      if (r > 200 && g < 60 && b < 60) counts.red++;
      if (g > 200 && r < 60 && b < 60) counts.green++;
      if (b > 200 && r < 60 && g < 60) counts.blue++;
    }
    return { counts, error: plot.getRenderError?.() ?? "" };
  }, key);
}

test("every RGB-capable mark draws its per-row colors", async ({ page }) => {
  const errors = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await page.goto("/test/rgb-marks");
  await page.waitForFunction((marks) => marks.every((key) => window.rgbMarks?.plots?.[key]), MARKS);
  const results = {};
  for (const key of MARKS) {
    // Nine small plots start their renderers one after another.
    await expect.poll(async () => (results[key] = await colorCounts(page, key)) !== null, { timeout: 20000 }).toBe(true);
  }
  for (const key of MARKS) {
    const { counts, error } = results[key];
    expect(error, key).toBe("");
    for (const [color, count] of Object.entries(counts)) expect(count, `${key} ${color}`).toBeGreaterThan(40);
  }
  expect(errors).toEqual([]);
});
