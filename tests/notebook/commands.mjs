import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';

const browser = await chromium.launch({ channel: 'chrome', args: ['--enable-unsafe-webgpu'] });
try {
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const base = process.env.NOTEBOOK_URL ?? 'http://127.0.0.1:8896';
  const token = process.env.NOTEBOOK_TOKEN ?? 'hmplot-check';
  const notebook = process.env.NOTEBOOK_FILE ?? 'tests/notebook/commands.ipynb';
  await page.goto(`${base}/lab/workspaces/hmplot-commands-${Date.now()}/tree/${notebook}?token=${token}`);
  const cells = page.locator('.jp-CodeCell:visible .cm-content');
  await cells.first().waitFor({ timeout: 30000 });
  await cells.first().click();
  await page.keyboard.press('Shift+Enter');
  await page.waitForFunction(() => document.querySelectorAll('canvas').length >= 2, {}, { timeout: 60000 });
  await cells.last().click();
  await page.keyboard.press('Shift+Enter');
  await page.waitForFunction(() => [...document.querySelectorAll('.jp-OutputArea-output')].some((element) => element.textContent.includes('COMMANDS_OK')), {}, { timeout: 90000 });
  const output = (await page.locator('.jp-OutputArea-output').allInnerTexts()).join('\n');
  assert.match(output, /COMMANDS_OK \d+ \d+ \d+/);
  assert.deepEqual(errors, []);
  console.log(output.split('\n').find((line) => line.startsWith('COMMANDS_OK')));
  await page.close();
} finally {
  await browser.close();
}
