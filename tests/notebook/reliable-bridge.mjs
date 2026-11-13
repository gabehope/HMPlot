import assert from "node:assert/strict";
import { chromium } from "@playwright/test";

const browser = await chromium.launch({ channel: "chrome", args: ["--enable-unsafe-webgpu"] });
try {
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const base = process.env.NOTEBOOK_URL ?? "http://127.0.0.1:8896";
  const token = process.env.NOTEBOOK_TOKEN ?? "hmplot-check";
  const notebook = process.env.NOTEBOOK_FILE ?? "tests/notebook/reliable-bridge.ipynb";
  const route = process.env.NOTEBOOK_ROUTE ?? "lab/tree";
  await page.goto(`${base}/${route}/${notebook}?token=${token}`);
  const cells = page.locator(".jp-CodeCell:visible .cm-content");
  await cells.first().waitFor({ timeout: 30000 });
  const count = await cells.count();
  console.log(`Executing ${count} notebook cells`);
  for (let index = 0; index < count; index++) {
    await cells.nth(index).click();
    await page.keyboard.press("Shift+Enter");
    // Model creation and view registration happen while the kernel is idle.
    // This mirrors a user running commands from a later notebook cell.
    await page.waitForTimeout(index < count - 1 ? 4000 : 250);
  }
  try {
    await page.waitForFunction(
      () => [...document.querySelectorAll(".jp-OutputArea-output")].some((element) => element.textContent.includes("BRIDGE_OK")),
      {}, { timeout: 120000 },
    );
  } catch (error) {
    console.error((await page.locator(".jp-OutputArea-output").allInnerTexts()).join("\n---\n"));
    throw error;
  }
  const output = (await page.locator(".jp-OutputArea-output").allInnerTexts()).join("\n");
  assert.match(output, /BRIDGE_OK/);
  const relevantErrors = errors.filter((message) =>
    !message.includes("filebrowser:open-path") &&
    !message.includes("reading 'schema'"));
  assert.equal(relevantErrors.length, 0, relevantErrors.join("\n"));
  console.log("JupyterLab bridge: updates, settlement, PNG, SVG, PDF, and two views passed");
} finally {
  await browser.close();
}
