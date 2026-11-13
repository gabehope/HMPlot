import { test, expect } from "./fixtures.js";

// TODO 136.8: a transform whose output follows the view (a Hexbin radius from the visible span, a
// Filter to the visible window) gave its marks' extents to the axes, which moved the view, which
// re-ran the transform: an idle plot never settled (the taxi explorer re-binned while idle). Its
// marks now take their domains from the transform's input.
test("transforms that read the view settle while idle", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/test/view-derived");
  await page.waitForFunction(() => window.viewDerived?.hexbin && window.viewDerived?.filter);
  await page.waitForFunction(() => {
    const canvases = [...document.querySelectorAll(".canvas")];
    return canvases.length === 2 && canvases.every((canvas) => canvas.getAttribute("aria-busy") === "false");
  });
  await page.evaluate(() => Promise.all([window.viewDerived.binned.whenSettled(), window.viewDerived.windowed.whenSettled()]));
  await page.waitForTimeout(500);
  const runs = await page.evaluate(async () => {
    const count = { hexbin: 0, filter: 0 };
    const stops = ["hexbin", "filter"].map((name) =>
      window.viewDerived[name].subscribe((status) => { if (status.pending) count[name]++; }));
    await new Promise((resolve) => setTimeout(resolve, 2000));
    stops.forEach((stop) => stop());
    return count;
  });
  expect(runs).toEqual({ hexbin: 0, filter: 0 });
  // The axes span the data, not a view-following subset.
  const xbounds = await page.evaluate(() => window.viewDerived.binned.getAxisLayout()?.x?.domain ?? null);
  expect(errors).toEqual([]);
  expect(xbounds === null || (xbounds[0] < -10 && xbounds[1] > 10)).toBe(true);
});

// TODO 136.8: a column computed from the view sets the domain that moves the view, a cycle the
// input's domain cannot break. The loop guard stops it, names it on the plot, and input resumes it.
test("a cycle through the view stops and names itself", async ({ page }) => {
  await page.goto("/test/view-loop");
  await page.waitForFunction(() => window.viewLoop?.plot && window.viewLoop?.calculate);
  const cycle = () => window.viewLoop.plot.listDiagnostics().find((entry) => entry.code === "view.cycle");
  await page.waitForFunction(cycle);
  const stopped = await page.evaluate(async () => {
    let runs = 0;
    const stop = window.viewLoop.calculate.subscribe((status) => { if (status.pending) runs++; });
    await new Promise((resolve) => setTimeout(resolve, 1000));
    stop();
    return { runs, message: window.viewLoop.plot.listDiagnostics().find((entry) => entry.code === "view.cycle").message };
  });
  expect(stopped.runs).toBe(0);
  expect(stopped.message).toMatch(/^Calculate reads the view .* the Points \(x\) drawing its output sets the axes' domains, which move the view: a cycle, stopped after \d+ rounds without input/);
  await expect(page.locator("[role=alert]")).toContainText("a cycle");
  const box = await page.locator(".canvas").boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  // Input withdraws the error and resumes the readers, and the cycle stops again.
  expect(await page.evaluate(cycle)).toBeUndefined();
  await page.waitForFunction(cycle);
});
