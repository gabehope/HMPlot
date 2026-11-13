import { test, expect } from "./fixtures.js";

test.use({ deviceScaleFactor: 2 });

// TODO 139: a selection is an expression operand (where(focus, 1, 0.12), its negation) over the
// table's rows and over a Group of a Group, selecting either way; selection({by}) links two
// tables by value, and a hover's membership clears when the pointer leaves.
test("selection operands follow clicks through nested aggregates and hovers across tables", async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 1000 });
  await page.goto("/test/selection-operands");
  await page.waitForFunction(() => window.selectionOperands?.plots?.samples?.whenSettled);
  await expect(page.locator(".canvas[aria-busy='false']")).toHaveCount(5);
  // Each plot's blobs of a color: opaque red ("member"), any red ("mark"), blue, in CSS pixels.
  const order = ["rows", "groups", "negated", "genes", "samples"];
  const blobs = (name, kind) => page.evaluate(async ({ name, kind, index }) => {
    const plot = window.selectionOperands.plots[name];
    await plot.whenSettled();
    const image = await createImageBitmap(await plot.exportPNG());
    const canvas = document.createElement("canvas");
    canvas.width = image.width; canvas.height = image.height;
    const context = canvas.getContext("2d");
    context.drawImage(image, 0, 0); image.close();
    const { data, width, height } = context.getImageData(0, 0, canvas.width, canvas.height);
    const test = (i) => {
      const r = data[i], g = data[i + 1], b = data[i + 2];
      if (kind === "member") return r > 170 && g < 70 && b < 70;
      if (kind === "mark") return r > g + 12 && r > b + 12;
      return b > 150 && r < 90;
    };
    const seen = new Uint8Array(width * height), found = [];
    for (let start = 0; start < width * height; start++) {
      if (seen[start] || !test(start * 4)) continue;
      let n = 0, sx = 0, sy = 0;
      const stack = [start];
      seen[start] = 1;
      while (stack.length) {
        const p = stack.pop(), x = p % width, y = (p - x) / width;
        n++; sx += x; sy += y;
        for (const q of [p - 1, p + 1, p - width, p + width])
          if (q >= 0 && q < width * height && !seen[q] && Math.abs((q % width) - x) <= 1 && test(q * 4)) { seen[q] = 1; stack.push(q); }
      }
      if (n > 30) found.push({ x: sx / n, y: sy / n, n });
    }
    const dpr = width / document.querySelectorAll(".canvas canvas")[index].clientWidth;
    return found.sort((a, b) => a.x - b.x).map((blob) => ({ x: blob.x / dpr, y: blob.y / dpr, n: blob.n }));
  }, { name, kind, index: order.indexOf(name) });
  const canvasOf = (index) => page.locator(".canvas canvas").nth(index);
  const click = async (index, blob) => {
    const box = await canvasOf(index).boundingBox();
    await page.mouse.click(box.x + blob.x, box.y + blob.y);
  };
  const count = async (name, kind = "member") => (await blobs(name, kind)).length;

  // Nothing selected: every row is faded (no "is anything selected" flag), the negation opaque.
  expect(await count("rows")).toBe(0);
  expect(await count("negated")).toBe(12);
  const marks = await blobs("rows", "mark");
  expect(marks.length).toBe(12);
  // Click row 2 (a=q, b=u): the u band of the Group of Groups is a member; the negation shows 11.
  await click(order.indexOf("rows"), marks[2]);
  await expect.poll(() => count("rows")).toBe(1);
  await expect.poll(() => count("groups")).toBe(1);
  expect(await count("negated")).toBe(11);
  const bands = await blobs("groups", "mark");
  expect(bands.length).toBe(3);
  // Click the v band: its contributors are the original rows with b = v (3, 4, 5 and 10).
  await click(order.indexOf("groups"), bands[1]);
  await expect.poll(() => count("rows")).toBe(4);
  const members = (await blobs("rows", "member")).map((blob) => marks.findIndex((mark) => Math.hypot(mark.x - blob.x, mark.y - blob.y) < 4));
  expect(members.sort((a, b) => a - b)).toEqual([3, 4, 5, 10]);
  expect(await count("groups")).toBe(1);
  expect(await count("negated")).toBe(8);

  // Hover gene B: its one sample turns opaque; leaving clears it. Gene A has two samples; the
  // missing gene never matches.
  const genes = await blobs("genes", "blue");
  expect(genes.length).toBe(3);
  const box = await canvasOf(order.indexOf("genes")).boundingBox();
  await page.mouse.move(box.x + genes[1].x, box.y + genes[1].y);
  await expect.poll(() => count("samples")).toBe(1);
  await page.mouse.move(box.x + genes[0].x, box.y + genes[0].y);
  await expect.poll(() => count("samples")).toBe(2);
  await page.mouse.move(box.x + 4, box.y + 4);
  await expect.poll(() => count("samples")).toBe(0);
  expect(await count("samples", "mark")).toBe(7);
  // Frames still complete after the interactions.
  const frames = await page.evaluate(() => new Promise((resolve) => {
    let n = 0; const t0 = performance.now();
    const f = (now) => { n++; if (now - t0 < 500) requestAnimationFrame(f); else resolve(n); };
    requestAnimationFrame(f);
  }));
  expect(frames).toBeGreaterThan(5);
});
