import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/browser",
  testMatch: "*.spec.js",
  // Spec files run in parallel, each file's tests in order. Four workers took the suite from
  // 26 to 10 minutes with no failures from the load; --workers=1 runs it serially.
  workers: 4,
  timeout: 90000,
  use: {
    channel: "chrome",
    headless: true,
    baseURL: "http://127.0.0.1:5173",
    viewport: { width: 1500, height: 1100 },
    launchOptions: { args: ["--enable-unsafe-webgpu"] },
    screenshot: "only-on-failure",
    // A failed test keeps its trace (test-results/<test>/trace.zip): its network log shows a
    // request that never got a response, for the gate's stalled navigations (TODO 136.1b).
    // No screencast (the network log needs the snapshots). The gate's @timing pass runs without
    // traces, which add work beside the frames its tests count.
    trace: { mode: "retain-on-failure", screenshots: false },
  },
  webServer: {
    command: "npm run dev -- --host 127.0.0.1",
    // The user guide is unpublished on the site (src/routes/examples/guide.js); the tests read it.
    env: { HMPLOT_DOCS_GUIDE: "1" },
    url: "http://127.0.0.1:5173",
    reuseExistingServer: true,
  },
  reporter: "list",
});
