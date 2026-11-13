import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
export default defineConfig({
  testDir: fileURLToPath(new URL('../../browser/', import.meta.url)),
  testMatch: 'scale-summary.spec.js', workers: 1, timeout: 90000,
  outputDir: process.env.BENCH_OUT??join(tmpdir(),'hmplot-stages100-105','browser-results'),
  use: { channel: 'chrome', headless: true,
    baseURL: process.env.BENCH_URL??'http://127.0.0.1:5484',
    viewport: { width: 1300, height: 1100 }, deviceScaleFactor: 2,
    launchOptions: { args: ['--enable-unsafe-webgpu'] }, screenshot: 'only-on-failure' },
  reporter: 'list',
});
