import { test, expect } from "./fixtures.js";

// TODO 134.13: sibling Frames that share the Plot's x and plot categories on it.
test("sibling Frames share the Plot's inferred band scale, and the Plot's unused y draws nothing", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/test/twin-categories");
  await page.waitForFunction(() => window.twinCategories?.plot);
  await expect(page.locator(".canvas")).toHaveAttribute("aria-busy", "false");
  const state = await page.evaluate(async () => {
    const { plot, precipitation, temperature } = window.twinCategories;
    await plot.whenSettled();
    const frames = plot.getAxes().map((axis) => axis.getFrameOptions());
    const root = frames.find((options) => !options.frameDefinition?.parent);
    return {
      error: plot.getRenderError(),
      rootX: root.get("xbounds"),
      rootScale: root.categoryAxes?.x?.domain ?? null,
      childScales: [precipitation, temperature].map((frame) => frame.getFrameOptions().categoryAxes?.x?.domain ?? null),
      text: [...document.querySelectorAll(".canvas *")].map((node) => node.childElementCount ? "" : node.textContent.trim()).filter(Boolean),
    };
  });
  expect(state.error).toBe("");
  expect(state.rootScale).toEqual(["Jan", "Feb", "Mar", "Apr", "May", "Jun"]);
  expect(state.rootX).toEqual([-0.5, 5.5]);
  expect(state.childScales).toEqual([state.rootScale, state.rootScale]);
  for (const month of ["Jan", "Jun"]) expect(state.text).toContain(month);
  // Neither the Plot's [-1, 1] x nor its unused [-1, 1] y draws.
  expect(state.text).not.toContain("−0.5");
  expect(state.text).not.toContain("−1");
  expect(errors).toEqual([]);
});

test("sibling Frames reading their own data join their categories on the Plot's band scale", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/test/twin-categories?case=scopes");
  await page.waitForFunction(() => window.twinCategories?.plot);
  await expect(page.locator(".canvas")).toHaveAttribute("aria-busy", "false");
  const state = await page.evaluate(async () => {
    const { plot } = window.twinCategories;
    await plot.whenSettled();
    const root = plot.getAxes().map((axis) => axis.getFrameOptions()).find((options) => !options.frameDefinition?.parent);
    const text = [...document.querySelectorAll(".canvas *")].map((node) => node.childElementCount ? "" : node.textContent.trim()).filter(Boolean);
    return { error: plot.getRenderError(), domain: root.categoryAxes?.x?.domain ?? null, x: root.get("xbounds"), text };
  });
  expect(state.error).toBe("");
  expect([...state.domain].sort()).toEqual(["Apr", "Feb", "Jan", "Jun", "Mar", "May"]);
  expect(state.x).toEqual([-0.5, 5.5]);
  for (const month of ["Jan", "Jun"]) expect(state.text).toContain(month);
  expect(errors).toEqual([]);
});
