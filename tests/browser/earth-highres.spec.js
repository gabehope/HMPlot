import { test, expect } from "./fixtures.js";

test("high-resolution Earth relief renders and responds to height changes", async ({ page }) => {
  test.setTimeout(90_000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/examples/earth");
  await expect(page.getByRole("region", { name: "Earth" })).toBeVisible({ timeout: 60_000 });
  const canvas = page.getByRole("region", { name: "Earth" }).locator("canvas").first();
  const flat = await canvas.screenshot();
  const slider = page.getByRole("slider", { name: "Height scale" });
  await slider.fill("150");
  // The slider's own value (the paired program's Slider, TODO 69.10), its label's <output>: the
  // page has other statuses (the Example's preview status says "Interactive plot").
  await expect(page.locator("label", { has: slider }).getByRole("status")).toContainText("150");
  const raised = await canvas.screenshot();
  expect(raised.equals(flat)).toBe(false);
  expect(errors).toEqual([]);
});
