import { test, expect } from "./fixtures.js";

test("Transform mounts late plugins, updates bucketed kernels and publishes graph layouts", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/test/plugin-transform");
  await page.waitForFunction(
    () =>
      window.pluginTransform &&
      document.querySelectorAll(".canvas").length === 2 &&
      [...document.querySelectorAll(".canvas")].every(
        (canvas) => canvas.getAttribute("aria-busy") === "false",
      ),
  );
  const geometry = () =>
    page.evaluate(async () => {
      const fixture = window.pluginTransform;
      await fixture.settle();
      const circles = async (plot) => {
        const result = await plot.exportSVG();
        return [
          ...new DOMParser()
            .parseFromString(await result.blob.text(), "image/svg+xml")
            .querySelectorAll("circle"),
        ].map((circle) => Number(circle.getAttribute("cx")));
      };
      return {
        rows: await circles(fixture.plots.rows),
        graph: await circles(fixture.plots.graph),
        traces: fixture.traces,
        frame: fixture.plots.rows.getDiagnostics().completedFrame,
      };
    });
  const before = await geometry();
  expect(before.rows).toHaveLength(3);
  expect(before.graph).toHaveLength(2);
  await page.evaluate(() => window.pluginTransform.register());
  const scaled = await geometry();
  expect(scaled.rows[1] - scaled.rows[0]).toBeCloseTo(
    2 * (before.rows[1] - before.rows[0]),
    1,
  );
  await page
    .getByRole("region", { name: "Plugin rows", exact: true })
    .locator("canvas")
    .hover();
  await page
    .getByRole("button", { name: "Settings for Plugin rows", exact: true })
    .click();
  const panel = page.getByRole("dialog", {
    name: "Settings · Plugin rows",
    exact: true,
  });
  await panel.getByRole("treeitem", { name: /test.scale/ }).click();
  const section = panel
    .locator("summary")
    .filter({ hasText: /^Other settings/ });
  if (
    (await section.count()) &&
    (await section.getAttribute("aria-expanded")) !== "true"
  )
    await section.click();
  const factor = panel.getByRole("textbox", { name: "factor", exact: true });
  await factor.fill("3");
  await factor.press("Enter");
  const edited = await geometry();
  expect(edited.rows[1] - edited.rows[0]).toBeCloseTo(
    3 * (before.rows[1] - before.rows[0]),
    1,
  );
  expect(edited.traces).toBe(scaled.traces);
  await expect
    .poll(() =>
      page.evaluate(() => window.pluginTransform.edits.at(-1)?.params.factor),
    )
    .toBe(3);
  await panel
    .getByRole("button", { name: "Close settings", exact: true })
    .click();
  await page.evaluate(() => window.pluginTransform.set({ factor: 1, gap: 4 }));
  const changed = await geometry();
  expect(changed.rows[1] - changed.rows[0]).toBeCloseTo(
    before.rows[1] - before.rows[0],
    1,
  );
  expect(changed.graph[1] - changed.graph[0]).toBeCloseTo(
    2 * (before.graph[1] - before.graph[0]),
    1,
  );
  expect(changed.traces).toBe(scaled.traces);
  expect(changed.frame).toBeGreaterThan(before.frame);
  await page.evaluate(() =>
    window.pluginTransform.set({
      data: { x: [1, 2, 3, 4, 5], y: [1, 1, 1, 1, 1] },
    }),
  );
  const grown = await geometry();
  expect(grown.rows).toHaveLength(5);
  expect(grown.traces).toBe(changed.traces + 1);
  await page.evaluate(() => window.pluginTransform.set({ factor: -1 }));
  expect(
    await page.evaluate(async () => {
      try {
        await window.pluginTransform.settle();
        return "";
      } catch (error) {
        return error.message;
      }
    }),
  ).toContain("factor");
  // A failed parameter update keeps the last drawn rows.
  const kept = await page.evaluate(async () => {
    const result = await window.pluginTransform.plots.rows.exportSVG();
    return new DOMParser()
      .parseFromString(await result.blob.text(), "image/svg+xml")
      .querySelectorAll("circle").length;
  });
  expect(kept).toBe(5);
  expect(errors).toEqual([]);
});

test("the Svelte graph plugin regenerates 100,000 nodes above its Plot", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/test/example-svelte?id=large-graph");
  await page
    .getByRole("combobox", { name: "Nodes", exact: true })
    .selectOption({ label: "100,000" });
  const plot = page.locator(".canvas").first();
  await expect(plot).toHaveAttribute("aria-busy", "false");
  await expect(page.getByText(/100,000 points\./)).toHaveCount(1);
  const before = await plot.screenshot();
  await page
    .getByRole("button", { name: "Regenerate graph", exact: true })
    .click();
  await expect
    .poll(async () => {
      await expect(plot).toHaveAttribute("aria-busy", "false");
      return (await plot.screenshot()).equals(before);
    })
    .toBe(false);
  expect(errors).toEqual([]);
});

test("layout defaults react to inputs and stepped clock expressions without starving frames", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/test/plugin-layout-parameters");
  await page.waitForFunction(
    () =>
      window.layoutParameters &&
      [...document.querySelectorAll(".canvas")].some(
        (c) => c.getAttribute("aria-busy") === "false",
      ),
  );
  await page.evaluate(() => window.layoutParameters.time(0));
  const before = await page.evaluate(() => window.layoutParameters.geometry());
  expect(before).toHaveLength(2);
  const frame = await page.evaluate(
    () => window.layoutParameters.plot.getDiagnostics().completedFrame,
  );
  await page.evaluate(() => window.layoutParameters.offset(3));
  const changed = await page.evaluate(() => window.layoutParameters.geometry());
  expect(changed[1] - changed[0]).toBeCloseTo(2 * (before[1] - before[0]), 1);
  await page.evaluate(() => window.layoutParameters.time(2000));
  const timed = await page.evaluate(() => window.layoutParameters.geometry());
  expect(timed[1] - timed[0]).toBeCloseTo(3 * (before[1] - before[0]), 1);
  const runs = await page.evaluate(() => window.layoutParameters.runs);
  await page.evaluate(() => window.layoutParameters.time(2100));
  expect(await page.evaluate(() => window.layoutParameters.runs)).toBe(runs);
  expect(
    await page.evaluate(
      () => window.layoutParameters.plot.getDiagnostics().completedFrame,
    ),
  ).toBeGreaterThan(frame);
  expect(errors).toEqual([]);
});

test("recursive plugin settings edit a union inside an object array", async ({
  page,
}) => {
  await page.goto("/test/plugin-layout-parameters");
  await page.waitForFunction(
    () =>
      window.layoutParameters &&
      document.querySelector('.canvas[aria-busy="false"]'),
  );
  await page.evaluate(() => window.layoutParameters.time(0));
  const before = await page.evaluate(() => window.layoutParameters.geometry());
  await page
    .getByRole("region", { name: "Layout parameters", exact: true })
    .locator("canvas")
    .hover();
  await page
    .getByRole("button", {
      name: "Settings for Layout parameters",
      exact: true,
    })
    .click();
  const panel = page.getByRole("dialog", {
    name: "Settings · Layout parameters",
    exact: true,
  });
  await panel.getByRole("treeitem", { name: /test.parameters/ }).click();
  const section = panel
    .locator("summary")
    .filter({ hasText: /^Other settings/ });
  if (
    (await section.count()) &&
    (await section.getAttribute("aria-expanded")) !== "true"
  )
    await section.click();
  await panel
    .getByRole("combobox", { name: "extra offsets 1 type", exact: true })
    .selectOption("0");
  const value = panel.getByRole("textbox", {
    name: "extra offsets 1",
    exact: true,
  });
  await value.fill("2");
  await value.press("Enter");
  const after = await page.evaluate(() => window.layoutParameters.geometry());
  expect(after[1] - after[0]).toBeCloseTo(2 * (before[1] - before[0]), 1);
  await panel
    .getByRole("button", { name: "Add extra offsets", exact: true })
    .click();
  await expect(
    panel.getByRole("combobox", { name: "extra offsets 2 type", exact: true }),
  ).toBeVisible();
  await panel
    .getByRole("button", { name: "Remove extra offsets 2", exact: true })
    .click();
  await expect(
    panel.getByRole("combobox", { name: "extra offsets 2 type", exact: true }),
  ).toHaveCount(0);
});
