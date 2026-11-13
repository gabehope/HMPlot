import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
const base = process.env.HEATMAP_TEST_URL ?? "http://[::1]:5184";
const browser = await chromium.launch({
  channel: "chrome",
  headless: true,
  args: ["--enable-unsafe-webgpu"],
});
try {
  for (const fixture of [
    "01_dataframe",
    "02_dashboard",
    "03_facets",
    "04_updates",
    "05_linked",
    "06_surface",
    "07_maps",
    "08_force",
    "09_callbacks",
    "10_frames", "11_histograms", "12_axis_types", "13_point_labels",
    "14_mapping_labels", "15_polar_radius", "16_rooted_tree", "17_pairs",
    "18_curves", "19_density", "20_pivot_fold", "21_quantile_joinaggregate",
    "22_violin", "23_boxplot", "24_swarm", "25_bar", "26_sunburst", "27_lollipop",
    "60_facet_fields", "63_dragging", "76_join", "77_crosshair", "78_tooltips", "79_titles_and_markdown", "80_netcdf", "81_statistics",
  ]) {
    const page = await browser.newPage({
        viewport: { width: 1200, height: 900 },
        deviceScaleFactor: 2,
      }),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(`${base}/test/notebook?fixture=${fixture}`);
    await page.waitForFunction(
      () => window.notebookReady,
      {},
      { timeout: 30000 },
    );
    await page.waitForFunction(() => {
      const canvases = [...document.querySelectorAll(".canvas")];
      return canvases.length && canvases.every(canvas => canvas.getAttribute("aria-busy") === "false");
    }, null, { timeout: 30000 });
    await page.evaluate(() => Promise.all([...window.notebookRuntime.handles.values()]
      .filter(entry => entry.handle.whenSettled).map(entry => entry.handle.whenSettled())));
    const result = await page.evaluate(async () => {
      const r = window.notebookRuntime,
        plots = [...r.handles.values()].filter((h) => h.handle.getDiagnostics && h.handle.getAxisLayout);
      const initial = plots.map((p) => p.handle),
        resources = [...r.resources.columns.values()];
      const state = structuredClone(window.notebookState);
      state.revision++;
      const visit = (n) => {
        if (n.kind === "Plot") n.props.animationDuration = 250;
        n.children.forEach(visit);
      };
      visit(state.root);
      await r.apply(state, () => {
        throw Error("Unchanged columns must not be uploaded");
      });
      const A = new r.resources.constructor(), B = new r.resources.constructor();
      const columnId=crypto.randomUUID(), scaleId=crypto.randomUUID();
      const probe={columns:{[columnId]:{dtype:'float32',shape:[2],byte_order:'little'}},tables:{},scales:{[scaleId]:{domain:null,range:null,unknown:'#888'}}};
      const load=async()=>{await new Promise(resolve=>setTimeout(resolve,10));return new Uint8Array(new Float32Array([1,2]).buffer);};
      const [pa,pb]=await Promise.all([A.prepare(probe,load),B.prepare(probe,load)]);A.commit(pa);B.commit(pb);
      const shared=A.columns.get(columnId)===B.columns.get(columnId)&&A.scales.get(scaleId)===B.scales.get(scaleId);
      A.dispose();B.columns.get(columnId).values.ref.dispose();B.dispose();
      const reused =
        plots.every((p, i) => r.reference(p.id, p.key) === initial[i]) &&
        resources.every((a) => [...r.resources.columns.values()].includes(a));
      const bad = structuredClone(state);
      bad.revision++;
      bad.root.children.push({
        id: "invalid",
        kind: "NotAMark",
        props: {},
        children: [],
      });
      let rejected = false;
      try {
        await r.apply(bad, () => {});
      } catch {
        rejected = true;
      }
      const retained = r.root === state.root;
      const blob = await r.exportScene(1);
      const bitmap = await createImageBitmap(blob);
      const c = document.createElement("canvas");
      c.width = bitmap.width;
      c.height = bitmap.height;
      const ctx = c.getContext("2d");
      ctx.drawImage(bitmap, 0, 0);
      bitmap.close();
      const pixels = ctx.getImageData(0, 0, c.width, c.height).data;
      let colored = 0;
      for (let i = 0; i < pixels.length; i += 4)
        if (
          Math.max(pixels[i], pixels[i + 1], pixels[i + 2]) -
            Math.min(pixels[i], pixels[i + 1], pixels[i + 2]) >
          25
        )
          colored++;
      return {
        reused, shared,
        rejected,
        retained,
        colored,
        plots: plots.length,
        bytes: blob.size,
        errors: plots.map((p) => p.handle.getRenderError()).filter(Boolean),
      };
    });
    assert.equal(result.reused, true);
    assert.equal(result.shared, true);
    assert.equal(result.rejected, true);
    assert.equal(result.retained, true);
    assert.ok(result.colored > 20, `Blank export ${fixture}`);
    assert.deepEqual(result.errors, []);
    assert.deepEqual(errors, []);
    if (fixture === "27_lollipop") {
      // Its y axis dict spells tick_count in snake_case, which Python converts (TODO 34.4c);
      // the default would put a tick every 10.
      const ticks = await page.evaluate(() => [...window.notebookRuntime.handles.values()]
        .find((h) => h.handle.getAxisLayout?.()?.y)?.handle.getAxisLayout().y.major.map((t) => t.label));
      assert.deepEqual(ticks, ["−20", "0", "20", "40"]);
    }
    if (fixture === "80_netcdf") {
      // A NetCDF grid table on the globe (TODO 48.6): its variable's long name and units title
      // the colorbar.
      await page.waitForFunction(() => document.querySelector(".guide-title")?.textContent);
      const title = await page.evaluate(() => document.querySelector(".guide-title").textContent);
      assert.equal(title, "Monthly Means of Sea Surface Temperature (degC)");
      // hm.stream's next month (TODO 48.7): a snapshot whose table has a new variable column
      // uploads only that column, the coordinates staying, and redraws the globe.
      const step = await page.evaluate(async () => {
        const r = window.notebookRuntime, state = structuredClone(window.notebookState);
        const [, table] = Object.entries(state.tables).find(([, t]) => t.grid?.dims.length === 2);
        const previous = table.columns.sst.$column, before = await (await r.exportScene(1)).arrayBuffer();
        state.revision++;
        table.version++;
        table.columns.sst = { $column: "next-sst" };
        state.columns["next-sst"] = { ...state.columns[previous], id: "next-sst" };
        const loaded = [];
        await r.apply(state, async (id) => {
          loaded.push(id);
          return new Uint8Array(new Float32Array(state.columns[id].shape[0]).fill(30).buffer);
        });
        const after = await (await r.exportScene(1)).arrayBuffer();
        const same = before.byteLength === after.byteLength && new Uint8Array(before).every((v, i) => v === new Uint8Array(after)[i]);
        return { loaded, same };
      });
      assert.deepEqual(step, { loaded: ["next-sst"], same: false });
    }
    if (fixture === "02_dashboard") {
      // Inputs (TODO 41): the Bins slider re-bins the histogram, the Series select changes the
      // plotted column and its axis titles, and each change is sent to Python.
      const state = () => page.evaluate(() => ({
        counts: [...window.notebookRuntime.handles.values()].map((h) => h.handle?.getMark?.()?.count).filter((n) => n !== undefined),
        titles: [...document.querySelectorAll('[aria-label="Plot canvas"]')].flatMap((host) =>
          [...host.querySelectorAll(".x-title, .y-title")].map((e) => e.textContent)),
      }));
      assert.ok((await state()).counts.includes(16));
      await page.getByRole("slider", { name: "Bins" }).fill("8");
      await page.getByRole("combobox", { name: "Series" }).selectOption({ label: "cosine" });
      await page.waitForFunction(() => [...document.querySelectorAll(".y-title")].some((e) => e.textContent === "cosine"));
      await page.waitForFunction(() => [...window.notebookRuntime.handles.values()].some((h) => h.handle?.getMark?.()?.count === 8));
      // Axis guides publish with the completed draw, after the transform's count changes.
      await page.evaluate(() => Promise.all([...window.notebookRuntime.handles.values()]
        .filter(h => h.handle.getAxisLayout).map(h => h.handle.whenSettled())));
      const after = await state();
      assert.ok(after.titles.includes("cosine") && !after.titles.includes("sine"), JSON.stringify(after.titles));
      const sent = await page.evaluate(() => (window.notebookMessages ?? []).filter((m) => m.type === "input").map((m) => m.value));
      assert.deepEqual(sent, [8, "cosine"]);
    }
    console.log(fixture, JSON.stringify(result));
    await page.close();
  }
} finally {
  await browser.close();
}
