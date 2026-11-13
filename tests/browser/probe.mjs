import { chromium } from "@playwright/test";
const browser = await chromium.launch({
  channel: "chrome",
  headless: true,
  args: ["--enable-unsafe-webgpu"],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on("response", (r) => {
  if (r.status() >= 400) console.log("HTTP", r.status(), r.url());
});
page.on("pageerror", (e) => errors.push(e.stack));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});
await page.goto("http://127.0.0.1:5173/gallery");
await page.waitForTimeout(4000);
console.log("BODY", (await page.locator("body").innerText()).slice(0, 1200));
console.log(
  "GPU",
  await page.evaluate(async () => ({
    gpu: !!navigator.gpu,
    adapter: !!(await navigator.gpu?.requestAdapter()),
  })),
);
console.log("ERRORS", errors.slice(0, 8));
const canvas = page
  .getByRole("region", { name: "Picking", exact: true })
  .locator("canvas");
const box = await canvas.boundingBox();
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
await page.waitForTimeout(1000);
console.log("PICK", await page.evaluate(() => window.__galleryTest.pick()));
console.log("ALL ERRORS", errors);
await page.screenshot({ path: "/tmp/heatmap-current.png" });
await browser.close();
