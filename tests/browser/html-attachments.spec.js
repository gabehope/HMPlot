import { test, expect } from "./fixtures.js";
test.use({ deviceScaleFactor: 2 });

for (const dpr of [1, 2])
  test.describe(`HTML at DPR ${dpr}`, () => {
    test.use({ deviceScaleFactor: dpr });
    test("tracks nested coordinates, retains native controls, hides and reports export omissions", async ({
      page,
    }) => {
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto("/test/html-attachments");
      await expect(page.locator(".canvas")).toHaveAttribute(
        "aria-busy",
        "false",
      );
      await page.evaluate(() => window.htmlTest.plot.whenSettled());
      const button = page.getByRole("button", { name: "Attached 0" });
      await expect(button).toBeVisible();
      const alignment = () =>
        page.evaluate(() => {
          const { frame } = window.htmlTest,
            mapping = frame.getScreenMapping();
          const p = mapping.project({ x: 5, y: 5 }),
            c = document.querySelector(".canvas").getBoundingClientRect();
          const h = document
            .querySelector("[data-hmplot-html]")
            .getBoundingClientRect();
          const inverse = mapping.unproject(p);
          return {
            dx: h.left - c.left - p.x - 10,
            dy: h.top - c.top - p.y - 10,
            inverse,
          };
        });
      for (const change of [null, "domain", "resize"]) {
        if (change)
          await page.evaluate(async (change) => {
            window.htmlTest[change](change === "domain" ? 20 : 700);
            await window.htmlTest.plot.whenSettled();
          }, change);
        await expect
          .poll(async () => Math.abs((await alignment()).dx))
          .toBeLessThan(1);
        expect(Math.abs((await alignment()).dy)).toBeLessThan(1);
        expect((await alignment()).inverse.x).toBeCloseTo(5);
        const png = (await page.locator(".canvas").screenshot()).toString(
          "base64",
        );
        const drawnError = await page.evaluate(async (png) => {
          const bitmap = await createImageBitmap(
            await (await fetch(`data:image/png;base64,${png}`)).blob(),
          );
          const canvas = document.createElement("canvas");
          canvas.width = bitmap.width;
          canvas.height = bitmap.height;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(bitmap, 0, 0);
          const pixels = ctx.getImageData(
            0,
            0,
            canvas.width,
            canvas.height,
          ).data;
          let n = 0,
            x = 0,
            y = 0;
          for (let i = 0; i < pixels.length; i += 4) {
            if (pixels[i] < 180 || pixels[i + 1] > 60 || pixels[i + 2] > 60)
              continue;
            n++;
            x += ((i / 4) % canvas.width) + 0.5;
            y += Math.floor(i / 4 / canvas.width) + 0.5;
          }
          const box = document.querySelector(".canvas").getBoundingClientRect();
          const point = window.htmlTest.frame
            .getScreenMapping()
            .project({ x: 5, y: 5 });
          bitmap.close();
          return n
            ? Math.max(
                Math.abs((x / n / canvas.width) * box.width - point.x),
                Math.abs((y / n / canvas.height) * box.height - point.y),
              )
            : Infinity;
        }, png);
        expect(drawnError).toBeLessThan(1);
      }
      await button.click();
      await expect(
        page.getByRole("button", { name: "Attached 1" }),
      ).toBeVisible();
      const inspection = await page.evaluate(() => window.htmlTest.inspect());
      expect(inspection.ready).toBe(true);
      expect(inspection.errors).toEqual([]);
      expect(inspection.plots[0].completedFrame).toBeGreaterThan(0);
      expect(
        inspection.plots[0].model.marks.some((mark) => mark.kind === "Points"),
      ).toBe(true);
      expect(
        inspection.warnings.some(
          (warning) => warning.code === "export.html-omitted",
        ),
      ).toBe(true);
      const warnings = await page.evaluate(
        async () => (await window.htmlTest.plot.exportSVG()).report.warnings,
      );
      expect(warnings.join(" ")).toContain("Html attachments are omitted");
      await page.getByRole("button", { name: "Attached 1" }).focus();
      await page.evaluate(() => window.htmlTest.move(200));
      await expect(page.locator("[data-hmplot-html]")).toBeHidden();
      await expect(page.locator(".canvas")).toBeFocused();
      await page.evaluate(() => window.htmlTest.move(5));
      await expect(
        page.getByRole("button", { name: "Attached 1" }),
      ).toBeVisible();
      await page.screenshot({
        path: `artifacts/web-authoring/html-dpr-${dpr}.png`,
      });
      expect(errors).toEqual([]);
    });
  });

test("HTML follows displayed animation and navigation, preserves keyed focus, and stops on disposal", async ({
  page,
}) => {
  await page.goto("/test/html-attachments");
  await expect(page.locator(".canvas")).toHaveAttribute("aria-busy", "false");
  await page.evaluate(() => window.htmlTest.plot.whenSettled());
  const samples = await page.evaluate(async () => {
    const h = window.htmlTest,
      frame = h.frame;
    window.savedFrame = frame;
    window.mappingNotifications = [];
    frame.subscribeScreenMapping((m) =>
      window.mappingNotifications.push(m?.revision ?? null),
    );
    h.animate();
    await new Promise((r) => setTimeout(r, 0));
    h.domain(20);
    const samples = [];
    for (let i = 0; i < 35; i++) {
      await new Promise(requestAnimationFrame);
      const m = frame.getScreenMapping(),
        p = m.project({ x: 5, y: 5 });
      const c = document.querySelector(".canvas").getBoundingClientRect();
      const b = document
        .querySelector("[data-hmplot-html]")
        .getBoundingClientRect();
      samples.push({
        revision: m.revision,
        error: Math.max(
          Math.abs(b.left - c.left - p.x - 10),
          Math.abs(b.top - c.top - p.y - 10),
        ),
      });
    }
    await h.plot.whenSettled();
    return samples;
  });
  expect(new Set(samples.map((s) => s.revision)).size).toBeGreaterThan(3);
  expect(Math.max(...samples.map((s) => s.error))).toBeLessThan(1);
  await page.evaluate(() => window.htmlTest.keys(["A", "B"]));
  const a = page.getByRole("button", { name: "Key A", exact: true });
  await a.focus();
  await page.evaluate(() => window.htmlTest.keys(["B", "A"]));
  await expect(a).toBeFocused();
  await expect(page.locator(".html-overlay button")).toHaveText([
    "Attached 0",
    "Key B",
    "Key A",
  ]);
  const before = await page.evaluate(() => window.htmlTest.plot.getViewport());
  await a.click();
  expect(await page.evaluate(() => window.htmlTest.plot.getViewport())).toEqual(
    before,
  );
  await page.evaluate(() => window.htmlTest.keys(["B"]));
  await expect(page.locator(".canvas")).toBeFocused();
  await expect(a).toHaveCount(0);
  await page.evaluate(() =>
    window.htmlTest.plot.setViewport({ x: 0.1, y: 0.1, zoom: 1.2 }),
  );
  const roundTrip = await page.evaluate(() => {
    const m = window.savedFrame.getScreenMapping();
    return m.unproject(m.project({ x: 5, y: 5 }));
  });
  expect(roundTrip.x).toBeCloseTo(5);
  expect(roundTrip.y).toBeCloseTo(5);
  await page.evaluate(() => window.htmlTest.plot.whenSettled());
  await page.evaluate(() => window.htmlTest.plot.whenAnimationsFinished());
  // Let the navigation's final margin/layout draw complete before measuring idle work.
  await page.waitForTimeout(250);
  const count = await page.evaluate(() => window.mappingNotifications.length);
  const completed = await page.evaluate(
    () => window.htmlTest.plot.getDiagnostics().completedFrame,
  );
  await page.waitForTimeout(200);
  expect(await page.evaluate(() => window.mappingNotifications.length)).toBe(
    count,
  );
  expect(
    await page.evaluate(
      () => window.htmlTest.plot.getDiagnostics().completedFrame,
    ),
  ).toBe(completed);
  await page.getByLabel("Outside plot").focus();
  await page.evaluate(() => window.htmlTest.move(200));
  await expect(page.getByLabel("Outside plot")).toBeFocused();
  await page.evaluate(() => window.htmlTest.unmount());
  await expect(page.locator("[data-hmplot-html]")).toHaveCount(0);
  expect(
    await page.evaluate(() => window.savedFrame.getScreenMapping()),
  ).toBeNull();
  expect(
    await page.evaluate(() => window.mappingNotifications.at(-1)),
  ).toBeNull();
});

test("inspection includes a failed Data scope in a native Svelte application", async ({
  page,
}) => {
  await page.goto("/test/html-attachments");
  await expect(page.locator(".canvas")).toHaveAttribute("aria-busy", "false");
  await page.evaluate(() => window.htmlTest.invalid(true));
  await expect(page.getByRole("alert")).toContainText("explicit schema");
  const report = await page.evaluate(() =>
    window.htmlTest.inspect({ timeout: 3000 }),
  );
  expect(report.ready).toBe(false);
  expect(
    report.errors.some(
      (e) => e.component === "Data" && e.message.includes("explicit schema"),
    ),
  ).toBe(true);
  await page.evaluate(() => window.htmlTest.invalid(false));
  await expect(page.getByRole("alert")).toHaveCount(0);
  expect((await page.evaluate(() => window.htmlTest.inspect())).errors).toEqual(
    [],
  );
});

test("plot mapping subscriptions survive replacement of the internal data scope", async ({
  page,
}) => {
  await page.goto("/test/html-attachments");
  await expect(page.locator(".canvas")).toHaveAttribute("aria-busy", "false");
  await page.evaluate(async () => {
    await window.htmlTest.plot.whenSettled();
    window.rootMappings = [];
    window.htmlTest.plot.subscribeScreenMapping((m) =>
      window.rootMappings.push(m?.revision ?? null),
    );
    window.htmlTest.remount();
  });
  await expect(page.locator(".canvas")).toHaveAttribute("aria-busy", "false");
  await expect
    .poll(() =>
      page.evaluate(() => window.rootMappings.filter((x) => x !== null).length),
    )
    .toBeGreaterThan(1);
  const values = await page.evaluate(() => window.rootMappings);
  expect(values).toContain(null);
  expect(values.at(-1)).toBeGreaterThan(values[0]);
  await expect(page.getByRole("button", { name: "Attached 0" })).toBeVisible();
});
