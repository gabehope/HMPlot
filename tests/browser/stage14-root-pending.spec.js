import { test, expect } from "./fixtures.js";

test("prepared wrappers and GeoJSON siblings keep the implicit Plot root", async ({ page }) => {
  await page.goto("/test/stage14-root-pending");
  await page.waitForFunction(() => window.stage14RootPending?.sortedFrame?.getFrameOptions());
  const state = await page.evaluate(async () => {
    const fixture = window.stage14RootPending;
    const result = {};
    for (const name of ["sorted", "geo", "line", "graph", "dag", "provider", "tile"]) {
      const plot = fixture[name + "Plot"], frame = fixture[name + "Frame"];
      await plot.whenSettled();
      const options = frame.getFrameOptions();
      result[name] = { promoted: options.frameDefinition.parent === null,
        revisions: options.get("_rootRevision"), error: plot.getRenderError(),
        pngBytes: (await plot.exportPNG()).size };
    }
    return result;
  });
  for (const item of Object.values(state)) {
    expect(item.promoted).toBe(false);
    expect(item.revisions).toBe(0);
    expect(item.error).toBe("");
    expect(item.pngBytes).toBeGreaterThan(1000);
  }
});
