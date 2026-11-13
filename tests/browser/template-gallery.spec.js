import { test, expect } from "./fixtures.js";
import { pixelReader } from "./png.js";
test.use({ deviceScaleFactor: 2 });

for (const name of ["candlestick", "parallel", "ridgeline", "radar"])
  for (const language of ["python", "svelte"])
    test(`${name} portable template draws and exports (${language})`, async ({ page }, testInfo) => {
      const errors = [];
      page.on("pageerror", error => errors.push(error.message));
      await page.addInitScript(language => localStorage.setItem("hmplot-docs-language", language), language);
      await page.goto(language === "svelte" ? `/test/gallery-example?id=template-${name}` : `/examples/template-${name}`);
      await page.waitForFunction(() => window.__examples?.plot);
      await page.waitForFunction(() => [...document.querySelectorAll(".canvas")].every(canvas => canvas.getAttribute("aria-busy") === "false"));
      await page.evaluate(() => window.__examples.settle());
      if (language === "python") await page.locator('.layer:not([hidden]) .live.ready').waitFor();
      expect(await page.evaluate(() => window.__examples.plot.getRenderError())).toBe("");
      const png = await page.locator('.canvas').screenshot({path:testInfo.outputPath(`${name}-${language}.png`)});
      const pixel = pixelReader(png), w = png.readUInt32BE(16), h = png.readUInt32BE(20);
      let colored = 0;
      for (let y=0; y<h; y+=2) for (let x=0; x<w; x+=2) {
        const [r,g,b] = pixel(x,y);
        if (Math.max(r,g,b)-Math.min(r,g,b)>20) colored++;
      }
      expect(colored).toBeGreaterThan(100);
      const exported = await page.evaluate(async () => {
        const plot = window.__examples.plot;
        const svg = await (await plot.exportSVG({mode:"vector"})).blob.text();
        const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
        const pdf = await plot.exportPDF({mode:"vector"});
        const png = await createImageBitmap(await plot.exportPNG());
        const size = [png.width, png.height];
        png.close();
        return { images: (svg.match(/<image\b/g)??[]).length, paths: (svg.match(/<path\b/g)??[]).length,
          pdf: (await pdf.blob.text()).slice(0,5), size,
          labels: [...doc.querySelectorAll("text")].map(node => node.textContent),
          guides: doc.querySelectorAll('[stroke="#cbd5e1"]').length };
      });
      expect(exported.images).toBe(0);
      expect(exported.paths).toBeGreaterThan(5);
      expect(exported.pdf).toBe("%PDF-");
      expect(exported.size.every(value => value > 100)).toBe(true);
      if (name === "radar") {
        for (const label of ["Speed", "Range", "Comfort", "Efficiency", "Value"]) expect(exported.labels).toContain(label);
        expect(exported.guides).toBeGreaterThanOrEqual(9);
      }
      {
        const download = page.getByRole("link", {name:"Download template"}).first();
        await expect(download).toBeVisible();
        const response = await page.request.get(await download.getAttribute("href"));
        expect((await response.json()).template.version).toBe(1);
      }
      expect(errors).toEqual([]);
    });
