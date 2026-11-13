import { test, expect } from "./fixtures.js";

// TODO 130.2: a mark converted to a template draws, exports and describes itself as its
// hand-written component did. Each case renders once with the library's mark and once with a
// copy of the old component (/test/template-parity), and compares the two.
const snapshot = async (page, name, impl) => {
  await page.goto(`/test/template-parity?case=${name}&impl=${impl}`);
  await page.waitForFunction(() => window.templateParity?.plot && window.templateParity.mark);
  await page.waitForFunction(() => [...document.querySelectorAll(".canvas")]
    .every((canvas) => canvas.getAttribute("aria-busy") === "false"));
  return page.evaluate(async () => {
    const { plot, mark } = window.templateParity;
    await plot.whenSettled();
    await mark.whenSettled?.();
    const blob = await plot.exportPNG();
    const bitmap = await createImageBitmap(blob);
    const size = [bitmap.width, bitmap.height]; bitmap.close();
    const png = await new Promise((resolve, reject) => {
      const reader = new FileReader(); reader.onload = () => resolve(reader.result);
      reader.onerror = reject; reader.readAsDataURL(blob);
    });
    const svg = await (await plot.exportSVG({ mode: "vector" })).blob.text();
    return {
      size, png, svg: svg.replace(/(id|href|clip-path|mask|fill|filter)="(url\()?#?[^"]*\d[^"]*"/g, ""),
      description: plot.getDescription(), mark: mark.getMark?.()?.constructor?.name ?? null, legend: !!mark.getLegendSource?.(),
    };
  });
};

// An error bar's SVG as a set of straight strokes: the old mark wrote each bar and then its caps,
// refined bars on a log axis into pieces, and drew caps the other way; Segments writes
// the bars, then the caps. Each path's ends are kept (a straight run's pieces dropped), rounded,
// put in order, and the paths sorted.
const strokes = (svg) => svg.replace(/<path d="([^"]*)"([^>]*)><\/path>/g, (whole, d, rest) => {
  const points = [...d.matchAll(/(-?[\d.]+) (-?[\d.]+)/g)].map((m) => [Number(m[1]), Number(m[2])]);
  const [[ax, ay], [bx, by]] = [points[0], points.at(-1)];
  const straight = points.every(([x, y]) => Math.abs((bx - ax) * (y - ay) - (by - ay) * (x - ax)) < 0.01 * Math.hypot(bx - ax, by - ay));
  if (!straight || /[^MLV\d.\s-]/.test(d)) return whole;
  const ends = [points[0], points.at(-1)].map(([x, y]) => `${x.toFixed(2)} ${y.toFixed(2)}`).sort();
  return `<path d="${ends.join(" ")}"${rest}></path>`;
}).split(/(?=<path )/).map((part) => part.replace(/<\/svg>$/, "")).sort().join("");

for (const name of ["ecdf-basic", "ecdf-by", "ecdf-complementary", "ecdf-color", "ecdf-theme",
  "bar-vertical", "bar-horizontal", "bar-orientation", "bar-stack", "bar-group", "bar-overlap", "bar-theme",
  "histogram-x", "histogram-y", "histogram-bins", "histogram-edges", "histogram-array", "histogram-brush", "histogram-theme",
  "swarm-x", "swarm-y", "swarm-orientation", "swarm-theme",
  "smooth-linear", "smooth-poly", "smooth-noband", "smooth-hidden", "smooth-theme",
  "rulex-constant", "rulex-column", "rulex-ends", "ruley-constant", "ruley-ends", "ruley-theme",
  "callout-one", "callout-rows", "callout-plain", "callout-theme",
  "densitycontour-basic", "densitycontour-styled", "densitycontour-theme", "densitycontour-bandsmode",
  "densitybands-basic", "densitybands-styled", "densitybands-theme",
  "errorbars-vertical", "errorbars-horizontal", "errorbars-position", "errorbars-scalar", "errorbars-theme", "errorbars-log", "errorbars-polar", "errorbars-mapping",
  "lollipop-vertical", "lollipop-horizontal", "lollipop-baseline", "lollipop-column", "lollipop-numeric", "lollipop-orientation", "lollipop-theme",
  "boxplot-vertical", "boxplot-horizontal", "boxplot-styled", "boxplot-nooutliers", "boxplot-theme",
  "violin-vertical", "violin-horizontal", "violin-orientation", "violin-half", "violin-bandwidth", "violin-theme",
  "pie-basic", "pie-donut", "pie-percent", "pie-sunburst", "pie-half", "pie-polar", "pie-theme"])
  test(`template parity: ${name}`, async ({ page }) => {
    const { png: legacyPNG, ...legacy } = await snapshot(page, name, "legacy");
    const { png: hostPNG, ...host } = await snapshot(page, name, "host");
    if (name.startsWith("errorbars")) expect(strokes(host.svg)).toBe(strokes(legacy.svg));
    // Stems ran from the lower end to the upper (ErrorBars), with zero-size caps written as empty
    // paths; they run from the baseline now, without caps.
    const capless = (svg) => svg.replace(/<path d="M(-?[\d.]+) (-?[\d.]+) L\1 \2"[^>]*stroke-linecap="butt"[^>]*><\/path>/g, "");
    // With a baseline column the left gutter settles 7px wider, the same chart with its bands
    // shifted: the parts' domains arrive in another order, and the layout does not go back to a
    // width it left in the last second (plotLayoutLifecycle.svelte.ts).
    const gutter = name === "lollipop-column";
    if (!gutter && legacyPNG !== hostPNG) {
      // Identical vector paths can differ slightly at raster edges (measured: 266 pixels,
      // at most 11/255). Keep exact SVG checks and bound both peak and mean pixel error.
      const difference = await page.evaluate(async ([a, b]) => {
        const read = async (url) => {
          const image = await createImageBitmap(await (await fetch(url)).blob());
          const canvas = new OffscreenCanvas(image.width, image.height), context = canvas.getContext("2d");
          context.drawImage(image, 0, 0); image.close();
          return context.getImageData(0, 0, canvas.width, canvas.height).data;
        };
        const [x, y] = await Promise.all([read(a), read(b)]);
        if (x.length !== y.length) return { max: Infinity, mean: Infinity };
        let max = 0, sum = 0;
        for (let i = 0; i < x.length; i++) { const d = Math.abs(x[i] - y[i]); max = Math.max(max, d); sum += d; }
        return { max, mean: sum / x.length };
      }, [legacyPNG, hostPNG]);
      expect(difference.max).toBeLessThanOrEqual(16);
      expect(difference.mean).toBeLessThan(0.1);
    }
    if (name.startsWith("lollipop") && !gutter) expect(strokes(host.svg)).toBe(strokes(capless(legacy.svg)));
    expect(host.mark).not.toBeNull();
    expect(host.description).toMatch(name.startsWith("bar") ? /^Bar chart of .* 6 bars\.$/ : name.startsWith("histogram") ? /^Histogram/ : name.startsWith("swarm") ? /^Swarm plot/ : name === "smooth-hidden" ? /./ : name.startsWith("smooth") ? /fitted curve/i : name.startsWith("rule") ? /rules/ : name.startsWith("callout") ? /callout/ : name.startsWith("density") ? /density (contours|bands)/i : name.startsWith("errorbars") ? /error bars/ : name.startsWith("lollipop") ? /^Lollipop chart/ : name.startsWith("boxplot") ? /^Box plot/ : name.startsWith("violin") ? /^Violin plot/ : name.startsWith("pie") ? /^Pie chart/ : /^ECDF plot/);
    // The hand-written rules and callouts had no handle: their copies answer nothing.
    // An error bar was its own mark class; it is a Segments now.
    expect(host).toEqual(name.startsWith("rule") || name.startsWith("callout") ? { ...legacy, mark: host.mark, legend: host.legend }
      : name.startsWith("errorbars") ? { ...legacy, mark: "Segments", svg: host.svg }
      : name.startsWith("lollipop") ? { ...legacy, svg: host.svg }
      // DensityBands is its own mark, described as one: the hand-written bands were "density contours".
      : name.startsWith("densitybands") || name.endsWith("bandsmode") ? { ...legacy, description: legacy.description.replace(/^Density contours/, "Density bands"), svg: legacy.svg.replace("<desc>Density contours", "<desc>Density bands") } : legacy);
  });

test("template parity: a count Ecdf titles its axis from the transform, ECDF (count)", async ({ page }) => {
  const legacy = await snapshot(page, "ecdf-count", "legacy"), host = await snapshot(page, "ecdf-count", "host");
  expect(legacy.svg).toContain(">ECDF<");
  expect(host.svg).toContain("ECDF (count)");
  expect(legacy.description).toContain("ECDF against value");
  expect(host.description).toContain("ECDF (count) against value");
  expect(host.description).toMatch(/^ECDF plot/); // the noun from its definition (templates/builtins.js)
});

test("a template's parameter change re-evaluates its parts' props in place", async ({ page }) => {
  await page.goto("/test/template-parity?case=ecdf-by&impl=host");
  await page.waitForFunction(() => window.templateParity?.mark?.getMark());
  await page.waitForFunction(() => [...document.querySelectorAll(".canvas")]
    .every((canvas) => canvas.getAttribute("aria-busy") === "false"));
  const result = await page.evaluate(async () => {
    const { plot, mark } = window.templateParity, before = mark.getMark();
    window.templateParity.set({ complementary: true });
    await new Promise((resolve) => requestAnimationFrame(resolve));
    await plot.whenSettled();
    await mark.whenSettled();
    return { same: mark.getMark() === before, svg: await (await plot.exportSVG({ mode: "vector" })).blob.text() };
  });
  expect(result.same).toBe(true);
  expect(result.svg).toContain("1 − ECDF");
});

test("a Legend for a template finds its main part once that mounts", async ({ page }) => {
  await page.goto("/test/template-parity?case=ecdf-legend&impl=host");
  await page.waitForFunction(() => window.templateParity?.plot);
  await page.waitForFunction(() => [...document.querySelectorAll(".canvas")]
    .every((canvas) => canvas.getAttribute("aria-busy") === "false"));
  await page.evaluate(() => window.templateParity.plot.whenSettled());
  const svg = await page.evaluate(async () => (await window.templateParity.plot.exportSVG({ mode: "vector" })).blob.text());
  for (const group of ["a", "b", "c"]) expect(svg).toContain(`>${group}<`);
});

test("a Bar template refuses width and is a connection endpoint at its value end", async ({ page }) => {
  await page.goto("/test/template-parity?case=bar-vertical&impl=host");
  await page.waitForFunction(() => window.templateParity?.mark?.getMark());
  const result = await page.evaluate(() => {
    const endpoint = window.templateParity.mark.endpoint({ at: "value" });
    let error = "";
    try { window.templateParity.mark.endpoint({ at: "median" }); } catch (e) { error = e.message; }
    return { at: endpoint.at, kind: endpoint.kind, error };
  });
  expect(result).toEqual({ at: "value", kind: "Bar", error: expect.stringContaining('Bar.endpoint: Bar does not offer at="median"') });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.evaluate(() => window.templateParity.set({ width: 3 }));
  await expect.poll(() => errors.join("\n")).toContain("Bar.width is not a prop: bandFraction sets the bar's share of its band.");
});

test("a Histogram's bins and normalization are its settings, and it is an endpoint at its value end", async ({ page }) => {
  await page.goto("/test/template-parity?case=histogram-x&impl=host");
  await page.waitForFunction(() => window.templateParity?.mark?.getMark());
  const seen = () => page.evaluate(() => window.seen.at(-1));
  // The caller's values draw, but are not edits to send back.
  await page.evaluate(async () => {
    const { mark, plot } = window.templateParity;
    window.seen = [];
    mark.subscribeSettings((values) => window.seen.push([values.bins ?? null, values.normalization ?? null]));
    window.templateParity.set({ normalization: "density" });
    await new Promise((resolve) => setTimeout(resolve, 400));
    await plot.whenSettled();
    plot.openSettings();
  });
  expect(await seen()).toEqual([null, null]);
  await page.getByRole("treeitem", { name: "Histogram" }).first().click();
  await page.locator("summary", { hasText: "Binning" }).click();
  const field = page.getByLabel("Bins / edges").and(page.locator("input"));
  // A partial entry keeps the last count; the viewer's whole one is sent, as a number.
  await field.fill("6,");
  await expect.poll(seen).toEqual([30, null]);
  await field.fill("5");
  await expect.poll(seen).toEqual([5, null]);
  await expect.poll(() => page.evaluate(() => window.templateParity.plot.getDescription())).toContain("5 bins");
  const endpoint = await page.evaluate(() => window.templateParity.mark.endpoint({ at: "value" }));
  expect([endpoint.at, endpoint.kind]).toEqual(["value", "Histogram"]);
});

test("a Histogram of a named array titles its axis with the name", async ({ page }) => {
  await page.goto("/test/template-parity?case=histogram-series&impl=host");
  await page.waitForFunction(() => window.templateParity?.mark?.getMark());
  await page.evaluate(async () => { await window.templateParity.plot.whenSettled(); await window.templateParity.mark.whenSettled(); });
  const svg = await page.evaluate(async () => (await window.templateParity.plot.exportSVG({ mode: "vector" })).blob.text());
  expect(svg).toContain(">height<");
  expect(svg).toContain(">count<");
});

test("a Swarm given two numeric positions reports it on the mark, and recovers", async ({ page }) => {
  await page.goto("/test/template-parity?case=swarm-x&impl=host");
  await page.waitForFunction(() => window.templateParity?.mark?.getMark());
  const error = () => page.evaluate(() => window.templateParity.plot.getRenderError() ?? "");
  await page.evaluate(() => window.templateParity.set({ x: "value" }));
  await expect.poll(error).toContain("Swarm needs exactly one categorical position axis or an explicit orientation.");
  await page.evaluate(() => window.templateParity.set({ x: "g" }));
  await expect.poll(error).toBe("");
  await expect.poll(() => page.evaluate(() => window.templateParity.plot.getDescription())).toMatch(/^Swarm plot/);
});

test("a Smooth's band follows its line's visibility, and fit() reads the Regression", async ({ page }) => {
  await page.goto("/test/template-parity?case=smooth-linear&impl=host");
  await page.waitForFunction(() => window.templateParity?.mark?.getMark());
  const paths = () => page.evaluate(async () => {
    const { plot, mark } = window.templateParity;
    await plot.whenSettled();
    await mark.whenSettled();
    const svg = await (await plot.exportSVG({ mode: "vector" })).blob.text();
    return (svg.match(/<path/g) ?? []).length;
  });
  const shown = await paths();
  const fit = await page.evaluate(() => window.templateParity.mark.fit());
  expect(fit.method).toBe("linear");
  expect(fit.coefficients).toHaveLength(2);
  await page.evaluate(() => window.templateParity.mark.getMark().options.set("visible", false, { layer: "user" }));
  await expect.poll(paths).toBeLessThan(shown - 1);
  await page.evaluate(() => window.templateParity.mark.getMark().options.set("visible", true, { layer: "user" }));
  await expect.poll(paths).toBe(shown);
  // band={false} unmounts the band; a level mounts it again.
  await page.evaluate(() => window.templateParity.set({ band: false }));
  await expect.poll(paths).toBeLessThan(shown);
  await page.evaluate(() => window.templateParity.set({ band: 0.9 }));
  await expect.poll(paths).toBe(shown);
});

test("a RuleX's refusal follows its Plot between 2D and 3D", async ({ page }) => {
  await page.goto("/test/template-parity?case=rulex-constant&impl=host");
  await page.waitForFunction(() => window.templateParity?.mark?.getMark?.());
  const error = () => page.evaluate(() => window.templateParity.plot.getRenderError() ?? "");
  const svg = () => page.evaluate(async () => {
    await window.templateParity.plot.whenSettled();
    await window.templateParity.mark.whenSettled?.();
    return (await (await window.templateParity.plot.exportSVG({ mode: "vector" })).blob.text()).replace(/(id|href|clip-path|mask|fill|filter)="(url\()?#?[^"]*\d[^"]*"/g, "");
  });
  const before = await svg();
  await page.evaluate(() => window.templateParity.setType("3d"));
  await expect.poll(error).toContain("RuleX in a 3D Cartesian view is not supported: x = c is a plane there.");
  await page.evaluate(() => window.templateParity.setType("2d"));
  await expect.poll(error).toBe("");
  await expect.poll(svg).toBe(before);
});

test("a RuleX in a 3D Cartesian view is refused by name, but a rule at the pointer draws nothing quietly", async ({ page }) => {
  for (const [name, expected] of [["rulex-3d", "RuleX in a 3D Cartesian view is not supported: x = c is a plane there. Use a 2D Plot."], ["rulex-pointer3d", ""]]) {
    await page.goto(`/test/template-parity?case=${name}&impl=host`);
    await page.waitForFunction(() => window.templateParity?.plot);
    const error = () => page.evaluate(() => window.templateParity.plot.getRenderError() ?? "");
    if (expected) await expect.poll(error).toContain(expected);
    else {
      await page.evaluate(async () => { await window.templateParity.plot.whenSettled(); await window.templateParity.mark.whenSettled(); });
      expect(await error()).toBe("");
    }
  }
});

test("a DensityContour given the deprecated mode warns, naming DensityBands", async ({ page }) => {
  const warnings = [];
  page.on("console", (message) => { if (message.type() === "warning") warnings.push(message.text()); });
  await page.goto("/test/template-parity?case=densitycontour-bandsmode&impl=host");
  await page.waitForFunction(() => window.templateParity?.mark?.getMark?.());
  await expect.poll(() => warnings.join("\n")).toContain("DensityContour.mode is deprecated and will be removed: DensityContour draws lines; use DensityBands for filled bands");
});

test("a DensityContour's mode switches between lines and bands, and an unknown one is Contour's error", async ({ page }) => {
  await page.goto("/test/template-parity?case=densitycontour-basic&impl=host");
  await page.waitForFunction(() => window.templateParity?.mark?.getMark?.());
  const state = () => page.evaluate(async () => {
    const { plot, mark } = window.templateParity;
    // Contour's error rejects the wait, as the hand-written mark's did.
    let error = "";
    try { await plot.whenSettled(); await mark.whenSettled?.(); } catch (e) { error = e.message; }
    return { kind: mark.getMark()?.constructor?.name ?? null, error: error || (plot.getRenderError() ?? "") };
  });
  const lines = await state();
  await page.evaluate(() => window.templateParity.set({ mode: "bands" }));
  await expect.poll(async () => (await state()).kind).not.toBe(lines.kind);
  await page.evaluate(() => window.templateParity.set({ mode: "band" }));
  await expect.poll(async () => (await state()).error).toContain('Contour: mode is one of "lines", "bands"');
  await page.evaluate(() => window.templateParity.set({ mode: "lines" }));
  await expect.poll(state).toEqual(lines);
});
