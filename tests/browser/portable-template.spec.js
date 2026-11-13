import { test, expect } from "./fixtures.js";

test.use({ deviceScaleFactor: 2 });

test("an exported Python template renders twice with Svelte slot children and live parameters", async ({ page }) => {
  await page.goto("/test/portable-template");
  await page.waitForFunction(() => window.portableTemplate?.plot);
  await page.locator(".canvas").waitFor();
  await expect(page.locator(".canvas")).toHaveAttribute("aria-busy", "false");
  const drawn = () => page.evaluate(async () => {
    const plot = window.portableTemplate.plot;
    await plot.whenSettled();
    const svg = new DOMParser().parseFromString(
      await (await plot.exportSVG({ mode: "vector" })).blob.text(), "image/svg+xml");
    return {
      green: svg.querySelectorAll('circle[fill="#13bd4e"]').length,
      purple: svg.querySelectorAll('circle[fill="#904fb3"]').length,
      blue: [...svg.querySelectorAll('path[stroke="#2468a0"]')].map((path) => path.getAttribute("d")),
      red: [...svg.querySelectorAll('path[stroke="#d34b37"]')].map((path) => path.getAttribute("d")),
    };
  });
  const before = await drawn();
  expect(before.green).toBe(3);
  expect(before.purple).toBe(3);
  expect(before.blue.length).toBeGreaterThan(0);
  expect(before.red.length).toBeGreaterThan(0);
  expect(before.red).not.toEqual(before.blue);
  await page.evaluate(() => window.portableTemplate.setSecondY("value"));
  await expect.poll(async () => (await drawn()).red).toEqual(before.blue);
});
