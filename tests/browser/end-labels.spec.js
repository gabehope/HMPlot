import { test, expect } from "./fixtures.js";

test.use({ deviceScaleFactor: 2 });

test("wide end labels converge with camera-fitted insets and become idle", async ({ page }) => {
  await page.goto("/test/end-labels");
  await page.waitForFunction(() => window.endLabels?.wide?.whenSettled);
  await expect(page.locator(".canvas[aria-busy='false']")).toHaveCount(5);
  const result = await page.evaluate(async () => {
    const plot = window.endLabels.wide;
    await plot.whenSettled();
    const svg = await (await plot.exportSVG({ mode: "vector" })).blob.text();
    const labels = [...new DOMParser().parseFromString(svg, "image/svg+xml").querySelectorAll("text")]
      .map(node => node.textContent.trim());
    return { labels, frame: plot.getDiagnostics().completedFrame };
  });
  for (const label of ["Growth", "Value", "Bonds"]) expect(result.labels).toContain(label);
  expect(result.frame).toBeGreaterThan(0);
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => window.endLabels.wide.getDiagnostics().completedFrame)).toBe(result.frame);
});

// TODO 136.16 slice 7: one label per series at its last finite point, right of it, in its line's
// color; the axes are the lines' (the labels' room is an inset); at="first" with a value.
test("EndLabels name each line at its end without changing the axes", async ({ page }) => {
  const problems = [];
  page.on("pageerror", (error) => problems.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") problems.push(message.text()); });
  await page.goto("/test/end-labels");
  await page.waitForFunction(() => window.endLabels?.first?.whenSettled);
  const read = (name) => page.evaluate(async (name) => {
    const plot = window.endLabels[name];
    await plot.whenSettled();
    const svg = await (await plot.exportSVG({ mode: "vector" })).blob.text();
    const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
    const texts = [...doc.querySelectorAll("text")].map((t) => ({ text: t.textContent.trim(), fill: t.getAttribute("fill"), x: +t.getAttribute("x") }));
    return { texts, ticks: texts.filter((t) => /^\d/.test(t.text)).map((t) => t.text), viewport: plot.getViewport() };
  }, name);
  const labelled = await read("labelled"), bare = await read("bare");
  const names = labelled.texts.filter((t) => ["Growth", "Value", "Bonds"].includes(t.text));
  expect(names.map((t) => t.text).sort()).toEqual(["Bonds", "Growth", "Value"]);
  expect(names.find((t) => t.text === "Growth").fill?.toLowerCase()).toBe("#3477b4");
  // Value's last finite year is 2021: its label sits left of the others (at 2022).
  const at = (name) => names.find((t) => t.text === name).x;
  expect(at("Value")).toBeLessThan(at("Growth") - 20);
  expect(Math.abs(at("Bonds") - at("Growth"))).toBeLessThan(2);
  // The axes are the lines' alone.
  expect(JSON.stringify(labelled.viewport)).toBe(JSON.stringify(bare.viewport));
  const first = await read("first");
  expect(first.texts.filter((t) => t.text === "100.0").length).toBe(3);
  // Labels of lines ending together are spread apart: at least a line apart on the page.
  const close = await read("close");
  const ys = await page.evaluate(async () => {
    const svg = await (await window.endLabels.close.exportSVG({ mode: "vector" })).blob.text();
    return [...new DOMParser().parseFromString(svg, "image/svg+xml").querySelectorAll("text")]
      .filter((t) => ["a", "b", "c"].includes(t.textContent.trim())).map((t) => +t.getAttribute("y")).sort((p, q) => p - q);
  });
  expect(close.texts.filter((t) => ["a", "b", "c"].includes(t.text)).length).toBe(3);
  expect(ys[1] - ys[0]).toBeGreaterThan(10);
  expect(ys[2] - ys[1]).toBeGreaterThan(10);
  // Placing the labels converges: an idle plot draws no more frames.
  const frames = () => page.evaluate(() => window.endLabels.close.getDiagnostics().completedFrame);
  const before = await frames();
  await page.waitForTimeout(600);
  expect(await frames()).toBe(before);
  expect(problems).toEqual([]);
});
