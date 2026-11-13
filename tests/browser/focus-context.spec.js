import { test, expect } from "./fixtures.js";

test.use({ deviceScaleFactor: 2 });

// TODO 136.16 slice 2: a plain drag on the context strip brushes x; the focus shows the brushed
// interval and returns to the whole series when the brush clears.
test("a context strip's brush sets the focus's x domain", async ({ page }) => {
  const problems = [];
  page.on("pageerror", (error) => problems.push(error.message));
  await page.goto("/test/focus-context");
  await page.waitForFunction(() => window.focusContext?.context?.whenSettled);
  const domain = () => page.evaluate(async () => {
    const { focus } = window.focusContext;
    await focus.whenSettled();
    return focus.getFrames()[0].getFrameOptions().get("xbounds");
  });
  const whole = await domain();
  expect(whole[0]).toBeLessThanOrEqual(0);
  expect(whole[1]).toBeGreaterThanOrEqual(499);
  const box = await page.locator('[aria-label="Plot canvas"]').nth(1).boundingBox();
  await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.5, { steps: 6 });
  await page.mouse.up();
  await expect.poll(async () => (await domain())[1] - (await domain())[0]).toBeLessThan((whole[1] - whole[0]) * 0.6);
  const zoomed = await domain();
  expect(zoomed[0]).toBeGreaterThan(50);
  await page.evaluate(() => window.focusContext.context.getBrush().clear());
  await expect.poll(async () => JSON.stringify(await domain())).toBe(JSON.stringify(whole));
  expect(problems).toEqual([]);
});

test("FocusContext zooms its chart to the strip's brush and exports both views", async ({ page }) => {
  const problems = [];
  page.on("pageerror", (error) => problems.push(error.message));
  await page.goto("/test/focus-context");
  await page.waitForFunction(() => window.focusContext?.figure?.view?.("context")?.whenSettled);
  const domain = () => page.evaluate(async () => {
    const { figure } = window.focusContext;
    await figure.whenSettled();
    return figure.view("main").getFrames()[0].getFrameOptions().get("xbounds");
  });
  const whole = await domain();
  const strip = await page.locator(".hm-focus-context [data-view-area='context'] [aria-label='Plot canvas']").boundingBox();
  await page.mouse.move(strip.x + strip.width * 0.5, strip.y + strip.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(strip.x + strip.width * 0.7, strip.y + strip.height * 0.5, { steps: 6 });
  await page.mouse.up();
  await expect.poll(async () => (await domain())[0]).toBeGreaterThan(whole[0] + 150);
  const svg = await page.evaluate(async () => (await (await window.focusContext.figure.exportSVG()).blob.text()));
  expect((svg.match(/<path/g) ?? []).length).toBeGreaterThan(1);
  expect(problems).toEqual([]);
});
