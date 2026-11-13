import { test, expect } from "./fixtures.js";

test.use({ deviceScaleFactor: 2 });

// TODO 136.16 slice 4: a Title with live values follows a brush, in the page and in its SVG export.
test("a Title readout shows the brushed count and mean as the brush moves", async ({ page }) => {
  const problems = [];
  page.on("pageerror", (error) => problems.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") problems.push(message.text()); });
  await page.goto("/test/title-readout");
  await page.waitForFunction(() => window.titleReadout?.plot?.whenSettled);
  await page.evaluate(() => window.titleReadout.plot.whenSettled());
  const shown = () => page.evaluate(() => window.titleReadout.title.getTitle());
  // Nothing brushed: no row matches, so no count... count() of no rows is 0; the mean has none.
  await expect.poll(shown).toBe("Selected trips: 0 · mean fare —");
  const box = await page.locator('[aria-label="Plot canvas"]').first().boundingBox();
  await page.keyboard.down("Shift");
  await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.1);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.9, { steps: 6 });
  await page.mouse.up();
  await page.keyboard.up("Shift");
  await expect.poll(shown).toMatch(/^Selected trips: [1-9]\d* · mean fare \$\d+\.\d\d$/);
  const svg = await page.evaluate(async () => (await (await window.titleReadout.title.exportSVG()).blob.text()));
  expect(svg).toContain(await shown());
  await page.evaluate(() => window.titleReadout.plot.getBrush().clear());
  await expect.poll(shown).toBe("Selected trips: 0 · mean fare —");
  expect(problems).toEqual([]);
});
