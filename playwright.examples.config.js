import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/browser",
  testMatch: /(?:^|[\/])(?:examples|gallery-improvements|facets|geojson|force-performance)\.spec\.js$/,
  workers: 1,
  timeout: 60000,
  use: {
    channel: "chrome",
    headless: true,
    baseURL: "http://127.0.0.1:5190",
    viewport: { width: 1400, height: 1000 },
    launchOptions: { args: ["--enable-unsafe-webgpu"] },
    screenshot: "only-on-failure",
  },
  webServer: {
    command:
      "VITE_CACHE_DIR=/tmp/heatmap-examples-test-cache npm run dev -- --host 127.0.0.1 --port 5190 --strictPort",
    url: "http://127.0.0.1:5190",
    reuseExistingServer: false,
  },
  reporter: "list",
});
