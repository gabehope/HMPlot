import assert from "node:assert/strict";
import { _electron } from "@playwright/test";

const env = { ...process.env, VSCODE_CLI: "1" };
delete env.ELECTRON_RUN_AS_NODE;
const root = process.env.NOTEBOOK_ROOT ?? "/tmp/heatmap-notebook-validation";
const file = `${root}/reliable-bridge.ipynb`;
const app = await _electron.launch({
  env,
  executablePath: process.env.VSCODE_EXECUTABLE ?? "/Applications/Visual Studio Code.app/Contents/MacOS/Code",
  args: [
    "--user-data-dir=/tmp/heatmap-vscode-bridge-profile",
    `--extensions-dir=${process.env.HOME}/.vscode/extensions`,
    "--disable-workspace-trust", "--skip-welcome", "--skip-release-notes",
    "--enable-unsafe-webgpu", root, file,
  ],
  timeout: 60000,
});

try {
  const page = await app.firstWindow();
  await page.waitForTimeout(10000);
  await page.keyboard.press("Escape");
  if ((await page.locator("body").innerText()).includes('"cell_type"')) {
    await page.keyboard.press("Meta+Shift+P");
    await page.keyboard.type("Reopen Editor With...");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(800);
    const notebookEditor = page.getByText(/Jupyter Notebook/, { exact: false });
    await notebookEditor.first().click();
    await page.waitForTimeout(5000);
  }
  if (await page.getByText("Select Kernel", { exact: true }).isVisible()) {
    await page.getByText("Select Kernel", { exact: true }).click();
    await page.waitForTimeout(800);
    const local = page.getByText(/hmplot-074|\.venv.*Python 3\.14|Python 3\.14.*\.venv/, { exact: false });
    if (await local.count()) await local.first().click();
    else {
      const another = page.getByText("Select Another Kernel...", { exact: false });
      if (await another.count()) await another.first().click();
      const environments = page.getByText("Python Environments...", { exact: true });
      if (await environments.count()) await environments.click();
      const kernels = page.getByText(/hmplot-074|\.venv.*Python 3\.14|Python 3\.14.*\.venv/, { exact: false });
      await kernels.first().click();
    }
    await page.waitForTimeout(2500);
  }

  const runCell = async (text, idle = 4000) => {
    const content = page.getByText(text, { exact: false }).first();
    await content.waitFor({ timeout: 30000 });
    await content.click();
    await page.keyboard.press("Shift+Enter");
    await page.waitForTimeout(idle);
  };
  await runCell("import hmplot as hm", 7000);
  await runCell("display(scene)", 5000);
  await runCell("table.update_columns", 500);

  await page.waitForFunction(() => document.body.innerText.includes("BRIDGE_OK"), {}, { timeout: 120000 });
  const text = await page.locator("body").innerText();
  assert.match(text, /BRIDGE_OK/);
  console.log("VS Code bridge: updates, settlement, PNG, SVG, PDF, and two views passed");
} catch (error) {
  const page = await app.firstWindow();
  console.error((await page.locator("body").innerText()).slice(-8000));
  throw error;
} finally {
  await app.close();
}
