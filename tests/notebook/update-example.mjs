import assert from "node:assert/strict";
import { chromium } from "@playwright/test";

const browser = await chromium.launch({ channel: "chrome", args: ["--enable-unsafe-webgpu"] });
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  const base = process.env.NOTEBOOK_URL ?? "http://127.0.0.1:8896";
  const token = process.env.NOTEBOOK_TOKEN ?? "hmplot-check";
  await page.goto(`${base}/lab/tree/python/examples/04_updates.ipynb?token=${token}`);
  const cells = page.locator(".jp-CodeCell:visible .cm-content");
  await cells.first().waitFor({ timeout: 30000 });
  await page.waitForTimeout(2500);
  await cells.nth(0).click();
  await page.keyboard.press("Control+Enter");
  try {
  await page.locator("canvas").first().waitFor({ timeout: 30000 });
  } catch (error) {
    console.error(await page.locator("body").innerText());
    throw error;
  }
  await page.waitForTimeout(1500);
  const canvas = page.locator("canvas").first();
  const box = await canvas.boundingBox();
  assert.ok(box);
  await page.mouse.move(box.x + 6, box.y + 6);
  await page.waitForTimeout(500);
  const idle = await canvas.screenshot();
  // First seeded point is approximately (0.305, -1.040). Probe around its
  // projected location to tolerate automatic axis margins.
  let hoverChanged = false;
  const targetX = box.x + 42 + ((0.3047 + 3) / 6) * (box.width - 58);
  const targetY = box.y + 18 + ((3 + 1.0400) / 6) * (box.height - 54);
  for (const dx of [-8, -4, 0, 4, 8]) {
    for (const dy of [-8, -4, 0, 4, 8]) {
      await page.mouse.move(targetX + dx, targetY + dy);
      await page.waitForTimeout(200);
      if (!idle.equals(await canvas.screenshot())) {
        hoverChanged = true;
        break;
      }
    }
    if (hoverChanged) break;
  }
  assert.ok(hoverChanged, "Direct-array hover did not update responsive styling");

  const updateCell = cells.nth(1);
  await updateCell.click();
  await page.keyboard.press("Control+Enter");
  const cellRoot = updateCell.locator("xpath=ancestor::*[contains(@class,'jp-CodeCell')]");
  await cellRoot.getByText("Update complete", { exact: true }).waitFor({ timeout: 35000 });
  const text = await cellRoot.innerText();
  assert.doesNotMatch(text, /Traceback|SceneError|TimeoutError/);
  const exportCell = cells.nth(2);
  await exportCell.click();
  await page.keyboard.press("Control+Enter");
  const exportRoot = exportCell.locator("xpath=ancestor::*[contains(@class,'jp-CodeCell')]");
  await exportRoot.getByText("Saved live-updates.png", { exact: true }).waitFor({ timeout: 35000 });
  assert.doesNotMatch(await exportRoot.innerText(), /Traceback|SceneError|TimeoutError/);
  console.log("Notebook 4 initial render, animated update, and PNG save passed");
} finally {
  await browser.close();
}
