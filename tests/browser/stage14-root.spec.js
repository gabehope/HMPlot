import { test, expect } from "./fixtures.js";

test("one logical Frame becomes the root through Data and nested children", async ({ page }) => {
  await page.goto("/test/stage14-root");
  await page.waitForFunction(() => window.stage14Root?.root?.getFrameOptions());
  const state = () => page.evaluate(async () => {
    const { plot, root } = window.stage14Root;
    await plot.whenSettled();
    return {
      promoted: root.getFrameOptions().frameDefinition.parent === null,
      rootLayout: root.getAxisLayout(),
      plotLayout: plot.getAxisLayout(),
      canvases: document.querySelectorAll("canvas").length,
      error: plot.getRenderError(),
    };
  });
  await expect.poll(async () => (await state()).promoted).toBe(true);
  const initial = await state();
  expect(initial.plotLayout).toEqual(initial.rootLayout);
  expect(initial.canvases).toBe(1);
  expect(initial.error).toBe("");
  await page.evaluate(() => window.stage14Root.outside(true));
  await expect.poll(async () => (await state()).promoted).toBe(false);
  await page.evaluate(() => window.stage14Root.outside(false));
  await expect.poll(async () => (await state()).promoted).toBe(true);
  await page.evaluate(() => window.stage14Root.sibling(true));
  await expect.poll(async () => (await state()).promoted).toBe(false);
  await page.evaluate(() => window.stage14Root.sibling(false));
  await expect.poll(async () => (await state()).promoted).toBe(true);
  await page.evaluate(() => window.stage14Root.ranged(true));
  await expect.poll(async () => (await state()).promoted).toBe(false);
  expect((await state()).canvases).toBe(1);
});

test("a superseded queued root selection keeps the published coordinates", async ({ page }) => {
  await page.goto("/test/stage14-root");
  await page.waitForFunction(() => window.stage14Root?.root?.getFrameOptions());
  await page.locator(".canvas").filter({ has: page.locator("canvas") }).waitFor();
  await expect(page.locator(".canvas")).toHaveAttribute("aria-busy", "false");
  const state = await page.evaluate(async () => {
    const { plot, root } = window.stage14Root;
    await plot.whenSettled();
    const options = root.getFrameOptions(), revision = options.get("_rootRevision");
    window.stage14Root.supersedeRoot();
    await plot.whenSettled();
    const image = await createImageBitmap(await plot.exportPNG());
    const canvas = document.createElement("canvas");
    canvas.width = image.width; canvas.height = image.height;
    const context = canvas.getContext("2d");
    context.drawImage(image, 0, 0); image.close();
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let blue = 0;
    for (let i = 0; i < pixels.length; i += 4)
      if (pixels[i] < 90 && pixels[i + 1] > 65 && pixels[i + 1] < 170 && pixels[i + 2] > 110) blue++;
    return { promoted: options.frameDefinition.parent === null,
      revisionBefore: revision, revisionAfter: options.get("_rootRevision"),
      blue, error: plot.getRenderError() };
  });
  expect(state.promoted).toBe(true);
  expect(state.revisionAfter).toBe(state.revisionBefore);
  expect(state.blue).toBeGreaterThan(20);
  expect(state.error).toBe("");
});

test("unmounting cancels a queued root publication", async ({ page }) => {
  await page.goto("/test/stage14-root");
  await page.waitForFunction(() => window.stage14Root?.root?.getFrameOptions());
  await expect(page.locator(".canvas")).toHaveAttribute("aria-busy", "false");
  const writes = await page.evaluate(async () => {
    const { plot, root } = window.stage14Root;
    await plot.whenSettled();
    const owner = root.getFrameOptions().owner("_rootRevision"), originalSet = owner.set;
    let writes = 0;
    owner.set = function (key, ...args) {
      if (key === "_rootRevision") writes++;
      return originalSet.call(this, key, ...args);
    };
    try {
      window.stage14Root.unmountWithQueuedRoot();
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      return writes;
    } finally { owner.set = originalSet; }
  });
  expect(writes).toBe(0);
  await expect(page.locator(".canvas, canvas")).toHaveCount(0);
});

test("the promoted Frame owns root brushing and navigation", async ({ page }) => {
  await page.goto("/test/stage14-root");
  await page.waitForFunction(() => ((m) => m?.view.marks.of(m))(window.stage14Root?.points?.getMark())?.interaction);
  await expect.poll(() => page.evaluate(() => window.stage14Root.root.getFrameOptions().frameDefinition.parent === null)).toBe(true);
  const rectangle = await page.evaluate(() => {
    const host = document.querySelector('[aria-label="Plot canvas"]').getBoundingClientRect();
    const layout = window.stage14Root.root.getAxisLayout();
    return { x: host.left + layout.left, y: host.top + layout.top,
      width: layout.right - layout.left, height: layout.bottom - layout.top };
  });
  await page.keyboard.down("Shift");
  await page.mouse.move(rectangle.x + rectangle.width * 0.2, rectangle.y + rectangle.height * 0.2);
  await page.mouse.down();
  await page.mouse.move(rectangle.x + rectangle.width * 0.6, rectangle.y + rectangle.height * 0.7, { steps: 8 });
  await page.mouse.up();
  await page.keyboard.up("Shift");
  const constraints = () => page.evaluate(() => {
    const binding = ((m) => m?.view.marks.of(m))(window.stage14Root.points.getMark())?.interaction;
    return binding.brush.getConstraints(binding.owner).map((item) => ({ name: item.name, frame: item.frame }));
  });
  await expect.poll(async () => (await constraints()).length).toBe(2);
  expect((await constraints()).map((item) => item.name).sort()).toEqual(["x", "y"]);
  await page.evaluate(() => window.stage14Root.plot.setViewport({ x: 0.5, y: 0.5, zoom: 2 }));
  await expect.poll(() => page.evaluate(() => window.stage14Root.plot.getViewport()?.zoom)).toBe(2);
  await page.evaluate(() => window.stage14Root.plot.fit());
  await expect.poll(() => page.evaluate(() => window.stage14Root.plot.getViewport()?.zoom)).toBe(1);
  const exportSize = await page.evaluate(async () => {
    await window.stage14Root.plot.whenSettled();
    return (await window.stage14Root.plot.exportPNG()).size;
  });
  expect(exportSize).toBeGreaterThan(1000);
  expect(await page.evaluate(() => window.stage14Root.plot.getRenderError())).toBe("");
});

test("changing the logical root cancels an in-progress brush", async ({ page }) => {
  await page.goto("/test/stage14-root");
  await page.waitForFunction(() => ((m) => m?.view.marks.of(m))(window.stage14Root?.points?.getMark())?.interaction);
  await expect.poll(() => page.evaluate(() =>
    window.stage14Root.root.getFrameOptions().frameDefinition.parent === null)).toBe(true);
  const rectangle = await page.evaluate(() => {
    const host = document.querySelector('[aria-label="Plot canvas"]').getBoundingClientRect();
    const layout = window.stage14Root.root.getAxisLayout();
    return { x: host.left + layout.left, y: host.top + layout.top,
      width: layout.right - layout.left, height: layout.bottom - layout.top };
  });
  await page.keyboard.down("Shift");
  await page.mouse.move(rectangle.x + rectangle.width * 0.2, rectangle.y + rectangle.height * 0.2);
  await page.mouse.down();
  await page.mouse.move(rectangle.x + rectangle.width * 0.6, rectangle.y + rectangle.height * 0.7, { steps: 8 });
  await expect.poll(() => page.evaluate(() => {
    const binding = ((m) => m?.view.marks.of(m))(window.stage14Root.points.getMark())?.interaction;
    return binding.brush.previewActive;
  })).toBe(true);
  await page.evaluate(() => window.stage14Root.outside(true));
  await expect.poll(() => page.evaluate(() =>
    window.stage14Root.root.getFrameOptions().frameDefinition.parent !== null)).toBe(true);
  await page.mouse.up();
  await page.keyboard.up("Shift");
  const state = await page.evaluate(() => {
    const binding = ((m) => m?.view.marks.of(m))(window.stage14Root.points.getMark())?.interaction;
    return { preview: binding.brush.previewActive,
      committed: binding.brush.getConstraints(binding.owner, "committed").length,
      error: window.stage14Root.plot.getRenderError() };
  });
  expect(state).toEqual({ preview: false, committed: 0, error: "" });
});

test("a promoted spherical root keeps horizontal wrapping", async ({ page }) => {
  await page.goto("/test/stage14-spherical-root");
  await page.waitForFunction(() => window.stage14Sphere?.root?.getFrameOptions());
  await expect.poll(() => page.evaluate(() =>
    window.stage14Sphere.root.getFrameOptions().frameDefinition.parent === null)).toBe(true);
  await page.evaluate(() => window.stage14Sphere.plot.setViewport({ x: 1.25 }));
  await expect.poll(() => page.evaluate(() => window.stage14Sphere.plot.getViewport().x)).toBeCloseTo(1.25);
  const clusters = () => page.evaluate(async () => {
    const plot = window.stage14Sphere.plot;
    await plot.whenSettled();
    const image = await createImageBitmap(await plot.exportPNG());
    const canvas = document.createElement("canvas");
    canvas.width = image.width; canvas.height = image.height;
    const context = canvas.getContext("2d");
    context.drawImage(image, 0, 0); image.close();
    const { data, width, height } = context.getImageData(0, 0, canvas.width, canvas.height);
    let groups = 0, previous = false;
    for (let x = 0; x < width; x++) {
      let blue = 0;
      for (let y = 0; y < height; y++) {
        const offset = (y * width + x) * 4;
        if (data[offset] < 90 && data[offset + 1] > 65 &&
            data[offset + 1] < 170 && data[offset + 2] > 110) blue++;
      }
      const present = blue >= 3;
      if (present && !previous) groups++;
      previous = present;
    }
    return groups;
  });
  for (const projection of ["equirectangular", "mercator", "equal-area"]) {
    await page.evaluate((value) => window.stage14Sphere.setProjection(value), projection);
    await expect.poll(() => page.evaluate(() => window.stage14Sphere.root.getFrameOptions().get("projection")))
      .toBe(projection);
    expect(await clusters(), projection).toBeGreaterThanOrEqual(3);
    expect(await page.evaluate(() => window.stage14Sphere.plot.getRenderError())).toBe("");
  }
  await page.evaluate(() => window.stage14Sphere.plot.setViewport({ x: 1, zoom: 2 }));
  await expect(page.getByRole("application", { name: "Plot overview" }).locator("svg rect")).toHaveCount(2);
  expect(await page.evaluate(() => window.stage14Sphere.plot.getRenderError())).toBe("");
});

test("nested coordinate overrides report the unsupported mapping and recover when removed", async ({ page }) => {
  await page.goto("/test/stage14-root");
  await page.waitForFunction(() => window.stage14Root?.plot?.getRenderError);
  await page.evaluate(() => window.stage14Root.nestedOverride(true));
  await expect.poll(() => page.evaluate(() => window.stage14Root.plot.getRenderError()))
    .toContain("Nested Frame coordinate overrides require X/Y parent ranges or placement.");
  await page.evaluate(() => window.stage14Root.nestedOverride(false));
  await expect.poll(() => page.evaluate(() => window.stage14Root.plot.getRenderError())).toBe("");
});
