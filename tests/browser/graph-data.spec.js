import { test, expect } from './fixtures.js';
import { installGpuCounters, installGpuErrors, gpuCounters, countersDelta } from './gpu-counters.js';

test.use({ deviceScaleFactor: 2 });
const settle = async page => {
  await page.waitForFunction(() => document.querySelector('[role="alert"]') ||
    window.graphDataFixture?.plot && document.querySelector('.canvas')?.getAttribute('aria-busy') === 'false');
  await expect(page.locator('[role="alert"]')).toHaveCount(0);
  await page.evaluate(() => window.graphDataFixture.plot.whenSettled());
  await page.evaluate(() => window.graphDataFixture.plot.whenAnimationsFinished());
};
const set = async (page, values) => { await page.evaluate(values => window.graphDataFixture.set(values), values); await settle(page); };
const snapshot = page => page.evaluate(() => window.graphDataFixture.snapshot());
const structure = page => page.evaluate(() => window.graphDataFixture.structure());
const expectPixels = result => {
  for (const [r, g, b, a] of result.pointPixels) {
    expect(r).toBeGreaterThan(120); expect(g).toBeLessThan(90); expect(b).toBeGreaterThan(155); expect(a).toBe(255);
  }
  for (const [r, g, b, a] of result.linkPixels) {
    expect(r).toBeGreaterThan(180); expect(g).toBeLessThan(100); expect(b).toBeLessThan(100); expect(a).toBe(255);
  }
};

test('renderer-free graph transforms sort/filter nodes and keep moving edge endpoints aligned in raster and vector exports', async ({ page }, testInfo) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(installGpuCounters); await page.addInitScript(installGpuErrors);
  await page.goto('/test/graph-data'); await settle(page);
  const whole = await structure(page), initial = await snapshot(page);
  expect(whole.relation).toBe('edges'); expect(whole.ids).toEqual(['root', 'other', 'leaf', 'branch']);
  expect(initial.circles).toHaveLength(4); expect(initial.links).toHaveLength(3); expectPixels(initial);
  await set(page, { shift: 1 });
  const shifted = await snapshot(page);
  expect((await structure(page)).plan).toBe(whole.plan);
  for (let row = 0; row < initial.circles.length; row++) {
    expect(shifted.circles[row][0] - initial.circles[row][0]).toBeCloseTo(60, 2);
    expect(shifted.circles[row][1]).toBe(initial.circles[row][1]);
  }
  for (const link of shifted.links) {
    expect(shifted.circles.some(([x, y]) => Math.abs(link[0] - x) < .1 && Math.abs(link[1] - y) < .1)).toBe(true);
    expect(shifted.circles.some(([x, y]) => Math.abs(link[2] - x) < .1 && Math.abs(link[3] - y) < .1)).toBe(true);
  }
  expectPixels(shifted);
  await set(page, { shift: 2 }); await set(page, { shift: 1 });
  const before = await gpuCounters(page), frame = shifted.frames;
  for (const shift of [2, 1, 0, 1]) await set(page, { shift });
  const work = await countersDelta(page, before, await gpuCounters(page));
  expect(work.shaders).toBe(0); expect(work.compute).toBe(0); expect(work.render).toBe(0);
  // A cached structural lookup does no GPU read, even after numerical transforms changed.
  const cached = await page.evaluate(async () => {
    const readbacks = () => window.__gpuCounters.snapshot().readbacks;
    const before = readbacks();
    const state = await window.graphDataFixture.structure();
    return { state, readbacks: readbacks() - before };
  });
  expect(cached.state.plan).toBe(whole.plan); expect(cached.readbacks).toBe(0);
  // A table's nested reactive column replacement also updates the current graph geometry.
  const beforeLift = await snapshot(page);
  await set(page, { lift: .5 }); const lifted = await snapshot(page);
  for (let row = 0; row < lifted.circles.length; row++) {
    expect(lifted.circles[row][1] - beforeLift.circles[row][1]).toBeCloseTo(-36, 2);
  }
  expectPixels(lifted);
  await set(page, { branch: true });
  const branch = await structure(page), branchImage = await snapshot(page);
  expect(branch.ids).toEqual(['root', 'leaf', 'branch']); expect(branch.rows).toEqual([0, 1]);
  expect(branch.plan).not.toBe(whole.plan);
  expect(branchImage.circles).toHaveLength(3); expect(branchImage.links).toHaveLength(2); expectPixels(branchImage);
  expect(branchImage.frames).toBeGreaterThan(frame + 3); expect(branchImage.error).toBeFalsy();
  await page.locator('canvas').first().screenshot({ path: testInfo.outputPath('filtered-graph.png') });
  expect(errors).toEqual([]); expect(await page.evaluate(() => window.__gpuErrors)).toEqual([]);
});

test('GraphData reports its rebuild as pending until whenSettled, as scene exports wait for it', async ({ page }) => {
  await page.goto('/test/graph-data'); await settle(page);
  const seen = await page.evaluate(async () => {
    const f = window.graphDataFixture, pending = [];
    const stop = f.graph.subscribe(status => pending.push(status.pending));
    await f.set({ lift: 1 }); await f.graph.whenSettled(); stop();
    return pending;
  });
  expect(seen[0]).toBe(false); expect(seen).toContain(true); expect(seen.at(-1)).toBe(false);
});

test('GraphData infers nodes from edges= or the surrounding data, reduces onto them, and rejects nodes without edges', async ({ page }) => {
  await page.goto('/test/graph-data-inferred');
  await page.waitForFunction(() => window.graphInferredFixture?.ready &&
    [...document.querySelectorAll('.canvas')].every(canvas => canvas.getAttribute('aria-busy') === 'false'));
  const result = await page.evaluate(() => window.graphInferredFixture.snapshot());
  // Out-degrees 2, 1 and 0 (a, b, c) place three inferred nodes at three x positions.
  expect(new Set(result.tables.map(Math.round)).size).toBe(3);
  // The Filter hides a's edges, so only b and c are inferred.
  expect(result.scoped).toHaveLength(2);
  expect(result.errors.filter(Boolean)).toEqual([]);
  const [before, after] = await page.evaluate(() => window.graphInferredFixture.enrichedErrors());
  expect(before).toMatch(/numeric/); expect(after).toBe('');
  await page.evaluate(() => window.graphInferredFixture.misuse());
  await expect(page.locator('[role="alert"]')).toHaveText(/GraphData: pass edges= with nodes=/);
});

test('DAG reports its layout as pending until whenSettled, and its error, as a transform does', async ({ page }) => {
  await page.goto('/test/graph-layout-status');
  await page.waitForFunction(() => window.graphLayoutFixture?.plot && document.querySelector('.canvas')?.getAttribute('aria-busy') === 'false');
  const seen = await page.evaluate(async () => {
    const f = window.graphLayoutFixture, statuses = [];
    const stop = f.dag.subscribe(status => statuses.push({ pending: status.pending, error: status.error ?? '' }));
    await f.set({ source: ['A', 'B', 'C'], target: ['B', 'C', 'A'] });
    await f.dag.whenSettled().catch(() => {});
    stop();
    return statuses;
  });
  expect(seen[0]).toEqual({ pending: false, error: '' });
  expect(seen.some(status => status.pending)).toBe(true);
  expect(seen.at(-1).pending).toBe(false);
  expect(seen.at(-1).error).toMatch(/acyclic graph/);
});

test('withdrawing and remounting graph containers releases their selected ordinary views', async ({ page }) => {
  await page.goto('/test/graph-data'); await settle(page);
  for (let iteration = 0; iteration < 3; iteration++) {
    await page.evaluate(() => { window.oldGraphView = window.graphDataFixture.scopes.prepared; return window.graphDataFixture.set({ mounted: false }); });
    await expect(page.locator('canvas')).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => {
      try { const release = window.oldGraphView.retain(); release(); return false; }
      catch (error) { return /disposed/.test(error.message); }
    })).toBe(true);
    await page.evaluate(() => { delete window.oldGraphView; return window.graphDataFixture.set({ mounted: true }); });
    await settle(page);
    expect((await snapshot(page)).circles).toHaveLength(4);
  }
});

test('Python int64 graph IDs resolve a numeric Tree root and retain the supplied Table interaction key', async ({ page }, testInfo) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/test/notebook?fixture=graph-int64');
  await page.waitForFunction(() => window.notebookReady && [...document.querySelectorAll('.canvas')].length > 0 &&
    [...document.querySelectorAll('.canvas')].every(canvas => canvas.getAttribute('aria-busy') === 'false'));
  const result = await page.evaluate(async () => {
    const runtime = window.notebookRuntime, all = [];
    const walk = node => { all.push(node); (node.children ?? []).forEach(walk); }; walk(window.notebookState.root);
    const graph = all.find(node => node.kind === 'GraphData'), tableId = graph.props.nodes.$table;
    const table = runtime.resources.tables.get(tableId), plot = runtime.reference(all.find(node => node.kind === 'Plot').id);
    await plot.whenSettled();
    const { blob } = await plot.exportSVG({ mode: 'vector' });
    const svg = new DOMParser().parseFromString(await blob.text(), 'image/svg+xml');
    const resource = window.notebookState.tables[tableId].selection.$selection;
    const selected = await runtime.command({ command: 'selection', target: resource,
      args: { owner: tableId, operation: 'replace', rows: [1] } });
    return { key: table.identity.key, shapes: svg.querySelectorAll('path[fill="#8e3db3"],rect[fill="#8e3db3"]').length,
      selected: selected.owners[tableId], error: runtime.error || plot.getRenderError(),
      integerColumns: Object.values(window.notebookState.columns).filter(column => column.dtype === 'int64').length };
  });
  expect(result.key).toBe('observation'); expect(result.selected).toEqual([1]); expect(result.shapes).toBe(3);
  expect(result.integerColumns).toBeGreaterThanOrEqual(3); expect(result.error).toBeFalsy(); expect(errors).toEqual([]);
  await page.locator('canvas').first().screenshot({ path: testInfo.outputPath('python-int64-partition.png') });
});

test('independent Plot data suspends Force dragging and removing it restores the inherited nodes', async ({ page }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/test/notebook?fixture=graph-int64');
  await page.waitForFunction(() => window.notebookReady);
  await page.evaluate(async () => {
    const state = structuredClone(window.notebookState), all = [];
    const walk = node => { all.push(node); (node.children ?? []).forEach(walk); }; walk(state.root);
    const layout = all.find(node => node.kind === 'Tree'), plot = all.find(node => node.kind === 'Plot'),
      mark = all.find(node => node.kind === 'Rect'), nodes = all.find(node => node.kind === 'Nodes');
    layout.kind = 'Force'; layout.props = { running: false, initial: { x: 'weight', y: 0 } };
    nodes.props.drag = true;
    layout.children = [nodes]; nodes.children = [plot]; plot.children = [mark];
    Object.assign(plot.props, { autoBounds: false, x: { domain: [-1, 5] }, y: { domain: [-1, 2] } });
    mark.kind = 'Points'; mark.props = { x: 'x', y: 'y', fill: '#8e3db3', size: 20, select: true };
    window.boundaryFixture = { state, plotNode: plot, plotId: plot.id, forceId: layout.id, markId: mark.id };
    const apply = async () => {
      // Each protocol publication is a new snapshot; mutating the retained scene object
      // would also mutate the runtime's previous props and hide the authored update.
      const next = structuredClone(state);
      await window.notebookRuntime.apply(next, id => ({ descriptor: next.columns[id],
        payload: Uint8Array.from(atob(window.notebookBuffers[id]), char => char.charCodeAt(0)) }));
      await window.notebookRuntime.settle();
    };
    window.boundaryFixture.apply = apply; await apply();
  });
  const ready = async () => {
    await page.waitForFunction(() => [...document.querySelectorAll('.canvas')].length > 0 &&
      [...document.querySelectorAll('.canvas')].every(canvas => canvas.getAttribute('aria-busy') === 'false'));
    await page.evaluate(async () => {
      const f = window.boundaryFixture, r = window.notebookRuntime;
      await r.reference(f.forceId).whenSettled(); await r.reference(f.plotId).whenSettled();
    });
  };
  const image = () => page.evaluate(async () => {
    const f = window.boundaryFixture, plot = window.notebookRuntime.reference(f.plotId);
    const { blob } = await plot.exportSVG({ mode: 'vector' });
    const svg = new DOMParser().parseFromString(await blob.text(), 'image/svg+xml');
    return [...svg.querySelectorAll('circle[fill="#8e3db3"]')].map(circle =>
      [Number(circle.getAttribute('cx')), Number(circle.getAttribute('cy'))]);
  });
  const selected = () => page.evaluate(() => {
    let status; window.notebookRuntime.reference(window.boundaryFixture.forceId).subscribe(next => status = next)();
    return status.selected;
  });
  await ready(); expect(await image()).toHaveLength(3);
  const initialSelection = await selected();
  await page.evaluate(async () => {
    const f = window.boundaryFixture;
    f.plotNode.props.data = { id: ['external-a', 'external-b'], x: [0, 2], y: [1, 1] };
    await f.apply();
  });
  await ready(); const external = await image(); expect(external).toHaveLength(2);
  const canvas = page.locator('canvas').first(); await canvas.scrollIntoViewIfNeeded();
  let box = await canvas.boundingBox();
  await page.mouse.click(box.x + external[0][0], box.y + external[0][1]);
  await expect.poll(() => page.evaluate(() => window.notebookRuntime.reference(window.boundaryFixture.plotId)
    .getSelection().status().count)).toBe(1);
  expect(await selected()).toBe(initialSelection); expect(await image()).toEqual(external);
  await page.evaluate(async () => {
    const f = window.boundaryFixture;
    delete f.plotNode.props.data; await f.apply();
  });
  await ready(); const inherited = await image(); expect(inherited).toHaveLength(3);
  box = await canvas.boundingBox();
  await page.mouse.move(box.x + inherited[0][0], box.y + inherited[0][1]); await page.mouse.down();
  await expect.poll(selected).toBe(0);
  await page.mouse.move(box.x + inherited[0][0] + 35, box.y + inherited[0][1], { steps: 6 });
  await page.mouse.up(); await ready();
  const moved = await image(); expect(moved[0][0]).toBeGreaterThan(inherited[0][0] + 30);
  expect(moved[0][1]).toBeCloseTo(inherited[0][1], 1); expect(errors).toEqual([]);
});
