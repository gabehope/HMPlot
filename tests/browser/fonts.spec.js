import { test, expect } from "./fixtures.js";

// Whether two screenshots (PNG buffers) show the same picture: no channel of any pixel more than 2
// apart. Captures of the same still canvas can differ by one step where an axis line is
// composited (184 against 185), which an exact comparison of the bytes read as a change.
const samePixels = (page, a, b) =>
  page.evaluate(async ([a, b]) => {
    const read = async (base64) => {
      const image = new Image();
      image.src = `data:image/png;base64,${base64}`;
      await image.decode();
      const canvas = Object.assign(document.createElement("canvas"), { width: image.width, height: image.height });
      const context = canvas.getContext("2d");
      context.drawImage(image, 0, 0);
      return context.getImageData(0, 0, image.width, image.height).data;
    };
    const [p, q] = [await read(a), await read(b)];
    if (p.length !== q.length) return false;
    for (let i = 0; i < p.length; i++) if (Math.abs(p[i] - q[i]) > 2) return false;
    return true;
  }, [a.toString("base64"), b.toString("base64")]);

test("loading a Text font replaces retained glyphs and widths without changing its rows", async ({ page }) => {
  await page.goto('/test/text-dependencies');
  await page.waitForFunction(()=>window.textDependencies?.labels?.getMark?.() &&
    [...document.querySelectorAll('.canvas')].every(canvas=>canvas.getAttribute('aria-busy')==='false'));
  await page.evaluate(async()=>{
    const f=window.textDependencies; f.setFont('"Late labels", monospace');
    await f.plot.whenSettled();
    const mark=f.labels.getMark();
    window.fontBefore={texture:mark.atlas.texture,widths:[...mark.exportWidths],count:mark.count};
  });
  const before=await page.locator('canvas').screenshot();
  const result=await page.evaluate(async()=>{
    const face=new FontFace('Late labels','url("/src/lib/fonts/source-sans-3/SourceSans3-Regular.ttf")');
    document.fonts.add(face); await face.load(); await document.fonts.ready;
    await new Promise(requestAnimationFrame); await window.textDependencies.plot.whenSettled();
    const mark=window.textDependencies.labels.getMark(), previous=window.fontBefore;
    const {blob}=await window.textDependencies.plot.exportSVG({mode:'vector'});
    return {changed:previous.texture!==mark.atlas.texture,widths:mark.exportWidths,
      beforeWidths:previous.widths,count:mark.count,beforeCount:previous.count,
      svg:await blob.text(),error:window.textDependencies.plot.getRenderError()};
  });
  expect(result.error).toBeFalsy(); expect(result.changed).toBe(true);
  expect(result.widths).not.toEqual(result.beforeWidths); expect(result.count).toBe(result.beforeCount);
  expect(result.svg).toContain('Original'); expect(result.svg).toContain('Late labels');
  expect((await page.locator('canvas').screenshot()).equals(before)).toBe(false);
});

test("text fonts render distinct glyphs, reset, and isolate cached geometry", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error" && !m.text().includes("favicon"))
      errors.push(m.text());
  });
  await page.goto("/test/feature-gallery");
  const plot = page.getByRole("region", {
    name: "Lines and labels",
    exact: true,
  });
  const canvas = plot.locator("canvas");
  async function open() {
    await canvas.hover();
    await page
      .getByRole("button", {
        name: "Settings for Lines and labels",
        exact: true,
      })
      .click();
  }
  await open();
  const panel = page.getByRole("dialog", {
    name: "Settings · Lines and labels",
    exact: true,
  });
  await panel.getByRole("treeitem", { name: /Title/ }).click();
  await panel.getByRole("button", { name: "Search settings", exact: true }).click();
  await panel.locator("input.search").fill("Text layout");
  const font = panel.getByLabel("Font", { exact: true });
  await expect(font).toHaveValue("helvetiker");
  await panel.getByRole("button", { name: "Close settings", exact: true }).click();
  await page.mouse.move(5, 5);
  await page.waitForTimeout(500);
  const original = await canvas.screenshot();
  await open();
  await font.selectOption("optimer");
  await panel.getByRole("button", { name: "Close settings", exact: true }).click();
  await page.mouse.move(5, 5);
  await expect
    .poll(async () => samePixels(page, await canvas.screenshot(), original))
    .toBe(false);
  await open();
  for (const face of [
    "gentilis",
    "gentilis-bold",
    "helvetiker-bold",
    "optimer-bold",
    "droid-sans-mono",
  ])
    await font.selectOption(face);
  await panel
    .getByRole("button", { name: "Reset Font to inherited", exact: true })
    .click();
  await expect(font).toHaveValue("helvetiker");
  await panel.getByRole("button", { name: "Close settings", exact: true }).click();
  await page.mouse.move(5, 5);
  await expect
    .poll(async () => samePixels(page, await canvas.screenshot(), original))
    .toBe(true);
  const result = await page.evaluate(async () => {
    const { labelGeometry } = await import("/src/lib/plot/utils/labels.js");
    const [a, b, c] = await Promise.all([
      labelGeometry("Font test", false, "center", "helvetiker"),
      labelGeometry("Font test", false, "center", "helvetiker"),
      labelGeometry("Font test", false, "center", "optimer"),
    ]);
    const result = {
      shared: a.geometry === b.geometry,
      distinct: a.geometry !== c.geometry,
      disposed: 0,
    };
    a.geometry.addEventListener("dispose", () => result.disposed++);
    a.release();
    result.aliveAfterFirstRelease = result.disposed === 0;
    b.release();
    c.release();
    return result;
  });
  expect(result).toEqual({
    shared: true,
    distinct: true,
    disposed: 1,
    aliveAfterFirstRelease: true,
  });
  await open();
  await panel.getByRole("treeitem", { name: /Formula/ }).click();
  await expect(panel.getByLabel("Font", { exact: true })).toHaveCount(0);
  expect(errors).toEqual([]);
});

// TODO 52: plots load the bundled default font (Source Sans 3) before they lay out text, and axis
// and legend text use it; only the faces text uses load.
test("plot text uses the bundled default font, loaded before layout", async ({ page }) => {
  await page.goto("/examples/themes");
  await page.waitForFunction(() => {
    const canvases = [...document.querySelectorAll(".canvas")];
    return canvases.length && canvases.every((element) => element.getAttribute("aria-busy") === "false");
  });
  const state = await page.evaluate(() => {
    const faces = [...document.fonts].filter((face) => face.family.replace(/"/g, "") === "Source Sans 3");
    return {
      faces: faces.map((face) => `${face.weight} ${face.style}`),
      regular: faces.find((face) => face.weight === "400" && face.style === "normal").status,
      checked: document.fonts.check('12px "Source Sans 3"'),
      axis: getComputedStyle(document.querySelector(".canvas svg.axes .x-tick text")).fontFamily,
      legend: getComputedStyle(document.querySelector("[data-plot-guide]")).fontFamily,
    };
  });
  expect(state).toEqual({
    faces: ["400 normal", "400 italic", "700 normal", "700 italic"],
    regular: "loaded",
    checked: true,
    axis: '"Source Sans 3", system-ui, -apple-system, sans-serif',
    legend: '"Source Sans 3", system-ui, -apple-system, sans-serif',
  });
  // A PNG export draws the axis SVG as an image, which cannot reach the page's fonts: it carries
  // the face itself, so its tick labels are the screen's pixels (without it they differ).
  await page.evaluate(() => window.__examples.plot.whenSettled());
  // The docs' Example fades its static preview (an SVG image, whose text cannot reach the page's
  // fonts) out over the live plot once that has drawn: compare the live plot shown alone.
  await expect(page.locator(".live.ready")).toBeVisible({ timeout: 30000 });
  const screen = (await page.locator(".canvas").first().screenshot()).toString("base64");
  const differences = await page.evaluate(async (screen) => {
    const pixels = async (blob) => {
      const bitmap = await createImageBitmap(blob), canvas = Object.assign(document.createElement("canvas"), { width: bitmap.width, height: bitmap.height });
      const context = canvas.getContext("2d");
      context.drawImage(bitmap, 0, 0);
      return context.getImageData(0, 0, canvas.width, canvas.height);
    };
    const shown = await pixels(await (await fetch(`data:image/png;base64,${screen}`)).blob()),
      exported = await pixels(await window.__examples.plot.exportPNG()),
      host = document.querySelector(".canvas").getBoundingClientRect(),
      plot = document.querySelector("section.plot").getBoundingClientRect(),
      dx = Math.round(host.left - plot.left), dy = Math.round(host.top - plot.top);
    // The mean channel difference over the box of each axis's tick labels.
    return ["x", "y"].map((axis) => {
      const boxes = [...document.querySelectorAll(`.canvas svg.axes .${axis}-tick text`)].map((text) => text.getBoundingClientRect());
      const left = Math.floor(Math.min(...boxes.map((b) => b.left)) - host.left), right = Math.ceil(Math.max(...boxes.map((b) => b.right)) - host.left),
        top = Math.floor(Math.min(...boxes.map((b) => b.top)) - host.top), bottom = Math.ceil(Math.max(...boxes.map((b) => b.bottom)) - host.top);
      let sum = 0, count = 0;
      for (let y = top; y < bottom; y++)
        for (let x = left; x < right; x++)
          for (let k = 0; k < 3; k++, count++)
            sum += Math.abs(shown.data[(y * shown.width + x) * 4 + k] - exported.data[((y + dy) * exported.width + x + dx) * 4 + k]);
      return sum / count;
    });
  }, screen);
  expect(differences[0]).toBeLessThan(0.5);
  expect(differences[1]).toBeLessThan(0.5);
});

// A label's billboard task follows the camera, which turns only in frames that draw anyway: a plot
// of labels at rest draws no frames (it drew 60 a second, and its screenshots never settled).
test("a plot of labels at rest draws no frames", async ({ page }) => {
  await page.addInitScript(() => {
    window.labelFrames = 0;
    const original = GPUCanvasContext.prototype.getCurrentTexture;
    GPUCanvasContext.prototype.getCurrentTexture = function (...args) {
      if (this.canvas.closest('[aria-label="Lines and labels"]')) window.labelFrames++;
      return original.apply(this, args);
    };
  });
  await page.goto("/test/feature-gallery");
  await page.waitForFunction(() => [...document.querySelectorAll(".canvas")].every((canvas) => canvas.getAttribute("aria-busy") === "false"));
  await page.waitForFunction(() => window.labelFrames > 0);
  await page.waitForTimeout(1500);
  const before = await page.evaluate(() => window.labelFrames);
  await page.waitForTimeout(1000);
  expect(await page.evaluate(() => window.labelFrames)).toBe(before);
});
