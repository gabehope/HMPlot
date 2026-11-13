import os from "node:os";
import base from "./playwright.config.js";

// The daily CI browser job (R2.3): Chrome's software WebGPU, SwiftShader, on runners without a
// GPU. One browser per pair of cores: software rendering saturates them, and waits of a few
// seconds would run out. Specs tagged @gpu need a real GPU (TESTING.md says why) and are skipped.
// Without a GPU, Chrome composites in software, where a WebGPU canvas loses its device on its
// first frame (Linux) or WebGPU has no adapter (Windows). It composites on SwiftShader's Vulkan
// on Linux, and on Microsoft's software Direct3D (WARP) on Windows: hmplot/chrome.py's
// LINUX_SWIFTSHADER_FLAGS and WINDOWS_SWIFTSHADER_FLAGS (TESTING.md, "CI fixes (2026-10-02)").
const compositing = {
  linux: ["--enable-features=Vulkan", "--use-vulkan=swiftshader", "--use-angle=swiftshader"],
  win32: ["--use-angle=d3d11-warp"],
}[process.platform] ?? [];
// Chrome's arguments for SwiftShader's WebGPU, also the package test's in CI (tests/package).
export const swiftShaderArgs = ["--use-webgpu-adapter=swiftshader", "--enable-unsafe-swiftshader", ...compositing];
export default {
  ...base,
  workers: Math.max(1, Math.floor(os.cpus().length / 2)),
  timeout: 180000,
  // Checks that poll the screen get 30s, not 5: SwiftShader draws the same pixels, slower.
  expect: { timeout: 30000 },
  grepInvert: /@gpu/,
  use: {
    ...base.use,
    launchOptions: { args: [...base.use.launchOptions.args, ...swiftShaderArgs] },
  },
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
};
