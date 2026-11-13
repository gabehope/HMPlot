import { test, expect } from "./fixtures.js";

test.use({ deviceScaleFactor: 2 });

// TODO 136.18: each mark family draws at 1, 1,000, 1,025 (past the old 1,024 cliffs), 100,000
// and 1,000,000 rows (Text to 100,000; a Line or Area from 2 rows, its shortest path), without
// an error, and something is drawn. Nightly: the browser suite runs it, the gate leaves it out.
const SIZES = [1, 1000, 1025, 100000, 1000000], PATHS = [2, ...SIZES.slice(1)];
const FAMILIES = { Points: SIZES, Line: PATHS, Segments: SIZES, Rect: SIZES, Area: PATHS, Text: SIZES.slice(0, 4) };
for (const [kind, sizes] of Object.entries(FAMILIES))
  for (const n of sizes)
    test(`${kind} draws ${n.toLocaleString("en")} rows @nightly`, async ({ page }) => {
      test.setTimeout(n >= 1000000 ? 900000 : 240000);
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(`/test/scale-sweep?kind=${kind}&n=${n}`);
      await page.waitForFunction(() => window.scaleSweep?.plot?.whenSettled, null, { timeout: n >= 1000000 ? 600000 : 120000 });
      const result = await page.evaluate(async () => {
        const { plot } = window.scaleSweep;
        await plot.whenSettled();
        const bitmap = await createImageBitmap(await plot.exportPNG());
        const canvas = new OffscreenCanvas(bitmap.width, bitmap.height), context = canvas.getContext("2d");
        context.drawImage(bitmap, 0, 0); bitmap.close();
        const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
        let ink = 0;
        // The marks' color (#2a6f97): blue well above red.
        for (let i = 0; i < data.length; i += 4) if (data[i + 2] > data[i] + 60 && data[i + 3] > 128) ink++;
        return { ink, error: plot.getRenderError() };
      });
      expect(result.error).toBeFalsy();
      expect(result.ink).toBeGreaterThan(0);
      expect(errors).toEqual([]);
    });
