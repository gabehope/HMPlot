import { test, expect } from './fixtures.js';
import { pixelReader } from './png.js';

test.describe('declared scene settings', () => {
  test.use({ deviceScaleFactor: 2 });
  test('canonical color and dash edits replay in SVG, while mapped colors stay mapped', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/test/notebook?fixture=commands');
    await page.waitForFunction(() => window.notebookReady && [...document.querySelectorAll('.canvas')]
      .every((canvas) => canvas.getAttribute('aria-busy') === 'false'));
    const edited = await page.evaluate(async () => {
      const runtime = window.notebookRuntime;
      await runtime.command({ command: 'animations_finished', target: runtime.root.id, args: {} });
      const nodes = [];
      const walk = (node) => { nodes.push(node); node.children.forEach(walk); };
      walk(window.notebookState.root);
      const points = nodes.find((node) => node.kind === 'Points'), line = nodes.find((node) => node.kind === 'Line');
      window.notebookMessages.length = 0;
      // As the settings pane edits them: the user layer (TODO 136.7).
      const user = { layer: 'user' };
      runtime.reference(points.id).getMark().options.set('fillColor', '#ff0000', user);
      const mark = runtime.reference(line.id).getMark();
      mark.options.set('dashed', true, user); mark.options.set('dashSize', 8, user); mark.options.set('gapSize', 4, user);
      await runtime.command({ command: 'settled', target: runtime.root.id, args: {} });
      const messages = window.notebookMessages.filter((message) => message.type === 'edit');
      const svg = await (await runtime.exportSceneDocument('svg', {})).blob.text();
      const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
      const result = { messages, points: points.id, line: line.id,
        dashes: [...doc.querySelectorAll('[stroke-dasharray]')].map((e) => e.getAttribute('stroke-dasharray')) };
      const state = structuredClone(window.notebookState), byId = new Map();
      const index = (node) => { byId.set(node.id, node); node.children.forEach(index); }; index(state.root);
      for (const message of messages) Object.assign(byId.get(message.target).props, message.props);
      state.revision++;
      window.settingsReplayState = state;
      await runtime.apply(state, (id) => Uint8Array.from(atob(window.notebookBuffers[id]), (c) => c.charCodeAt(0)));
      return result;
    });
    expect(edited.dashes).toContain('8 4');
    expect(edited.messages.some((m) => m.target === edited.points && m.props.fill?.$literal === '#ff0000')).toBe(true);
    expect(edited.messages.some((m) => m.target === edited.line && JSON.stringify(m.props.dash) === '[8,4]')).toBe(true);
    expect(edited.messages.flatMap((m) => Object.keys(m.props))).not.toContain('fillColor');
    expect(edited.messages.flatMap((m) => Object.keys(m.props))).not.toContain('dashSize');
    await page.waitForFunction(() => [...document.querySelectorAll('.canvas')].every((c) => c.getAttribute('aria-busy') === 'false'));
    const replayed = await page.evaluate(async () => {
      const runtime = window.notebookRuntime;
      await runtime.command({ command: 'animations_finished', target: runtime.root.id, args: {} });
      const svg = await (await runtime.exportSceneDocument('svg', {})).blob.text();
      const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
      return { red: doc.querySelectorAll('circle[fill="#ff0000"]').length,
        dashes: [...doc.querySelectorAll('[stroke-dasharray]')].map((e) => e.getAttribute('stroke-dasharray')) };
    });
    expect(replayed).toEqual({ red: 2, dashes: edited.dashes });
    const mapped = await page.evaluate(async (pointsId) => {
      const runtime = window.notebookRuntime, state = structuredClone(window.settingsReplayState);
      state.normalizations.settingsColor = { version: 1, domain: [0, 1], transform: 'linear', domainSource: 'data' };
      state.scales.settingsColor = { kind: 'continuous', version: 1,
        normalization: { $normalization: 'settingsColor' }, range: null, colormap: 'Viridis', quantize: false, levels: 10 };
      const visit = (node) => {
        if (node.id === pointsId) Object.assign(node.props, { fill: [0.2, 0.8], fillScale: { $scale: 'settingsColor' } });
        node.children.forEach(visit);
      };
      visit(state.root); state.revision++;
      await runtime.apply(state, (id) => Uint8Array.from(atob(window.notebookBuffers[id]), (c) => c.charCodeAt(0)));
      await runtime.command({ command: 'animations_finished', target: runtime.root.id, args: {} });
      const colors = async () => {
        const svg = await (await runtime.exportSceneDocument('svg', {})).blob.text();
        return [...new DOMParser().parseFromString(svg, 'image/svg+xml').querySelectorAll('circle')].map((e) => e.getAttribute('fill'));
      };
      const before = await colors(); window.notebookMessages.length = 0;
      runtime.reference(pointsId).getMark().options.set('fillColor', '#0000ff');
      const after = await colors();
      return { before, after, settings: runtime.browserSettings.get(pointsId),
        edits: window.notebookMessages.filter((m) => m.type === 'edit' && m.target === pointsId) };
    }, edited.points);
    expect(mapped.before).toHaveLength(2);
    expect(mapped.before).not.toContain('#ff0000');
    expect(mapped.after).toEqual(mapped.before);
    expect(mapped.settings).not.toHaveProperty('fillScale');
    expect(mapped.settings).not.toHaveProperty('colormap');
    expect(mapped.edits.every((m) => !Object.hasOwn(m.props, 'fill'))).toBe(true);
    expect(errors).toEqual([]);
  });
  test('a Bar template reports its main part\'s settings edits to Python', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/test/notebook?fixture=25_bar');
    await page.waitForFunction(() => window.notebookReady && [...document.querySelectorAll('.canvas')]
      .every((canvas) => canvas.getAttribute('aria-busy') === 'false'));
    const edits = await page.evaluate(async () => {
      const runtime = window.notebookRuntime;
      const bar = window.notebookState.root.children[0].children[0];
      window.notebookMessages.length = 0;
      const options = runtime.reference(bar.id).getMark().options;
      options.set('opacity', 0.4, { layer: 'user' });
      options.set('fillColor', '#ff0000', { layer: 'user' });
      await runtime.command({ command: 'settled', target: runtime.root.id, args: {} });
      return window.notebookMessages.filter((m) => m.type === 'edit').map((m) => ({ target: m.target === bar.id, props: m.props }));
    });
    // The fill is the group column, so the uniform color edit is not a new fill.
    expect(edits).toEqual([{ target: true, props: { opacity: 0.4 } }]);
    expect(errors).toEqual([]);
  });
  test('Frame settings replay public axes without changing their parent-coordinate ranges', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/test/notebook?fixture=38_nested_frames');
    await page.waitForFunction(() => window.notebookReady && [...document.querySelectorAll('.canvas')]
      .every((canvas) => canvas.getAttribute('aria-busy') === 'false'));
    const edited = await page.evaluate(async () => {
      const runtime = window.notebookRuntime, state = structuredClone(window.notebookState);
      const frame = state.root.children[0].children.find((node) => node.kind === 'Frame');
      const options = runtime.reference(frame.id).getFrameOptions();
      window.frameSettingsCircles = async () => {
        await runtime.command({ command: 'animations_finished', target: runtime.root.id, args: {} });
        const svg = await (await runtime.exportSceneDocument('svg', {})).blob.text();
        return [...new DOMParser().parseFromString(svg, 'image/svg+xml').querySelectorAll('circle')]
          .map((circle) => ['cx', 'cy', 'r'].map((name) => circle.getAttribute(name)));
      };
      const before = await window.frameSettingsCircles();
      window.notebookMessages.length = 0;
      // The viewer's edits (the user layer, TODO 136.7): only these replay.
      options.set('xbounds', [0, 200], { layer: 'user' });
      options.child('plot').set('axisLabelX', 'Edited frame', { layer: 'user' });
      options.child('plot').set('frameYShow', false, { layer: 'user' });
      const after = await window.frameSettingsCircles();
      const edits = window.notebookMessages.filter((m) => m.type === 'edit' && m.target === frame.id);
      for (const edit of edits) Object.assign(frame.props, edit.props);
      const settings = structuredClone(runtime.browserSettings.get(frame.id));
      state.revision++;
      await runtime.apply(state, (id) => Uint8Array.from(atob(window.notebookBuffers[id]), (c) => c.charCodeAt(0)));
      return { before, after, settings, props: frame.props };
    });
    expect(edited.after).toHaveLength(3);
    expect(edited.after).not.toEqual(edited.before);
    expect(edited.settings.x).toMatchObject({ domain: [0, 200], range: [10, 100], label: 'Edited frame' });
    expect(edited.settings.y).toMatchObject({ range: [20, 80], visible: false });
    expect(edited.settings.z).toBeUndefined();
    expect(Object.values(edited.settings).every((axis) => !Object.hasOwn(axis, 'show'))).toBe(true);
    await page.waitForFunction(() => [...document.querySelectorAll('.canvas')].every((c) => c.getAttribute('aria-busy') === 'false'));
    expect(await page.evaluate(() => window.frameSettingsCircles())).toEqual(edited.after);
    expect(errors).toEqual([]);
  });
});

test('Row keeps inputs at their natural widths and wraps them on a narrow page', async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 800 });
  await page.route('**/test/notebook.json', async route => {
    const fixture = await (await route.fetch()).json();
    const state = fixture.state;
    const row = state.root.children[0].children[0];
    const slider = row.children[0];
    row.children = [0, 1, 2].map(i => ({ ...structuredClone(slider), id: `slider-${i}`,
      props: { ...slider.props, name: `bins${i}`, label: `Bins ${i}` } }));
    state.root.children = [row];
    await route.fulfill({ json: fixture });
  });
  await page.goto('/test/notebook');
  await page.waitForFunction(() => window.notebookReady);
  const controls = page.locator('.hm-input');
  await expect(controls).toHaveCount(3);
  const boxes = () => controls.evaluateAll(nodes => nodes.map(node => {
    const { x, y, width, height } = node.getBoundingClientRect();
    return { x, y, width, height };
  }));
  const wide = await boxes();
  expect(wide[2].y).toBeCloseTo(wide[0].y, 0);
  expect(wide[2].x).toBeGreaterThan(wide[0].x + wide[0].width);
  await page.setViewportSize({ width: 340, height: 800 });
  await expect.poll(async () => (await boxes())[2].y).toBeGreaterThan(wide[0].y + wide[0].height);
  const narrow = await boxes();
  expect(narrow[0].width).toBeCloseTo(wide[0].width, 0);
  expect(narrow.every(box => box.x >= 0 && box.x + box.width <= 340)).toBe(true);
  await page.getByRole('slider', { name: 'Bins 0', exact: true }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(controls.first().locator('output')).toHaveText('9');
});

test('notebook scene settles and handles animation/export commands', async ({ page }) => {
  test.setTimeout(45_000);
  await page.goto('/test/notebook?fixture=commands');
  await page.waitForFunction(() => window.notebookRuntime?.handles.size >= 4, {}, { timeout: 20_000 });
  const probe = await page.evaluate(async () => {
    const runtime = window.notebookRuntime;
    const handles = await Promise.all([...runtime.handles.values()].map(async ({ id, handle }) => ({
      id,
      type: handle.constructor?.name,
      settled: await Promise.race([
        Promise.resolve().then(() => handle.whenSettled?.()).then(() => 'yes', (error) => `error: ${error.message}`),
        new Promise((resolve) => setTimeout(() => resolve('timeout'), 3000)),
      ]),
    })));
    return { ready: window.notebookReady ?? false, handles, error: runtime.error };
  });
  console.log(JSON.stringify(probe));
  expect(probe.handles.every((handle) => handle.settled === 'yes')).toBe(true);
  await page.waitForFunction(() => window.notebookReady, {}, { timeout: 20_000 });
  const scene = await page.evaluate(async () => {
    const runtime = window.notebookRuntime;
    const target = window.notebookState.root.id;
    const results = {};
    for (const command of ['animations_finished', 'export_png', 'export_svg']) {
      const value = await runtime.command({ command, target, args: { scale: 1 } });
      results[command] = value?.blob?.size ?? value?.size ?? null;
    }
    return results;
  });
  expect(scene.export_png).toBeGreaterThan(100);
  expect(scene.export_svg).toBeGreaterThan(100);

  const timeoutRecovery = await page.evaluate(async () => {
    const runtime = window.notebookRuntime;
    const unregister = runtime.register("never", "", {
      whenSettled: () => new Promise(() => {}),
    }, document.createElement("div"));
    let code;
    try {
      await runtime.command({ command: "settled", target: window.notebookState.root.id, args: { timeoutMs: 30 } });
    } catch (error) {
      code = error.code;
    }
    unregister();
    const recovered = await runtime.command({
      command: "export_png", target: window.notebookState.root.id,
      args: { scale: 1, timeoutMs: 5000 },
    });
    return { code, size: recovered?.size ?? recovered?.blob?.size };
  });
  expect(timeoutRecovery.code).toBe("bridge.timeout");
  expect(timeoutRecovery.size).toBeGreaterThan(100);
});

test.describe('scene application timeouts', () => {
  test.use({ deviceScaleFactor: 2 });
  test('apply honors its timeout, restores the rendered scene, and accepts a subsequent update', async ({ page }) => {
    await page.goto('/test/notebook?fixture=commands');
    await page.waitForFunction(() => window.notebookReady && [...document.querySelectorAll('.canvas')]
      .every((canvas) => canvas.getAttribute('aria-busy') === 'false'));
    const result = await page.evaluate(async () => {
      const runtime = window.notebookRuntime, previousRoot = runtime.root, previousRevision = runtime.revision;
      const circles = async () => {
        await runtime.command({ command: 'animations_finished', target: runtime.root.id, args: {} });
        const svg = await (await runtime.exportSceneDocument('svg', {})).blob.text();
        return [...new DOMParser().parseFromString(svg, 'image/svg+xml').querySelectorAll('circle')]
          .map((circle) => ['cx', 'cy', 'r', 'fill'].map((name) => circle.getAttribute(name)));
      };
      const before = await circles(), state = structuredClone(window.notebookState);
      const recolor = (node) => {
        if (node.kind === 'Points') node.props.fill = { $literal: '#ff0000' };
        node.children.forEach(recolor);
      };
      recolor(state.root);
      state.revision++;
      const load = (id) => Uint8Array.from(atob(window.notebookBuffers[id]), (c) => c.charCodeAt(0));
      // Delay one component's preparation, but let rollback settle normally. Without the
      // caller's budget, apply succeeds after 250 ms instead of rejecting after 30 ms.
      let delayNext = true;
      const unregister = runtime.register('delayed-preparation', '', {
        whenSettled() {
          if (!delayNext) return;
          delayNext = false;
          return new Promise((resolve) => setTimeout(resolve, 250));
        },
      }, document.createElement('div'));
      try {
        let code;
        try { await runtime.apply(state, load, { timeoutMs: 30 }); }
        catch (error) { code = error.code; }
        const restored = { root: runtime.root === previousRoot, revision: runtime.revision };
        const afterRollback = await circles();
        delayNext = true;
        await runtime.apply(state, load, { timeoutMs: 20000 });
        return { code, restored, previousRevision, before, afterRollback,
          afterRetry: await circles(), revision: runtime.revision, requestedRevision: state.revision };
      } finally {
        unregister();
      }
    });
    expect(result.code).toBe('bridge.timeout');
    expect(result.restored).toEqual({ root: true, revision: result.previousRevision });
    expect(result.before).toHaveLength(2);
    expect(result.afterRollback).toEqual(result.before);
    expect(result.afterRetry.map((circle) => circle.slice(0, 3))).toEqual(result.before.map((circle) => circle.slice(0, 3)));
    expect(result.afterRetry.map((circle) => circle[3])).toEqual(['#ff0000', '#ff0000']);
    expect(result.revision).toBe(result.requestedRevision);
  });

  test('a failed apply restores the previous theme and offsets, and the retry applies them', async ({ page }) => {
    await page.goto('/test/notebook?fixture=7c-color');
    await page.waitForFunction(() => window.notebookReady && [...document.querySelectorAll('.canvas')]
      .every((canvas) => canvas.getAttribute('aria-busy') === 'false'));
    const result = await page.evaluate(async () => {
      const runtime = window.notebookRuntime, state = structuredClone(window.notebookState);
      const themeId = Object.keys(state.themes).find((id) => state.themes[id].value.name === 'Dark');
      const tableId = Object.keys(state.tables)[0];
      const look = async () => {
        const svg = await (await runtime.exportSceneDocument('svg', {})).blob.text();
        const fills = [...new DOMParser().parseFromString(svg, 'image/svg+xml').querySelectorAll('rect')].map((rect) => rect.getAttribute('fill'));
        return { red: fills.includes('rgb(255, 0, 0)'), offsets: runtime.resources.tables.get(tableId).identity.offsets.columnsDescriptor() };
      };
      const before = await look();
      state.revision++;
      state.themes[themeId] = { version: 2, value: { ...state.themes[themeId].value, view: { background: '#ff0000' } } };
      state.tables[tableId].offsets = { version: 1, length: 5, columns: { x: { rows: [0], deltas: [0.5] } } };
      const load = (id) => Uint8Array.from(atob(window.notebookBuffers[id]), (c) => c.charCodeAt(0));
      let delayNext = true;
      const unregister = runtime.register('delayed-preparation', '', {
        whenSettled() {
          if (!delayNext) return;
          delayNext = false;
          return new Promise((resolve) => setTimeout(resolve, 250));
        },
      }, document.createElement('div'));
      try {
        await runtime.apply(state, load, { timeoutMs: 30 }).catch(() => {});
        const afterRollback = await look();
        await runtime.apply(state, load, { timeoutMs: 20000 });
        return { before, afterRollback, afterRetry: await look() };
      } finally {
        unregister();
      }
    });
    expect(result.before).toEqual({ red: false, offsets: {} });
    expect(result.afterRollback).toEqual(result.before);
    expect(result.afterRetry).toEqual({ red: true, offsets: { x: { rows: [0], deltas: [0.5] } } });
  });
});

test('camera command: a Plot in Facet cells sets every cell and reports the first; a Facet target reaches its Plots', async ({ page }) => {
  // 9D A16, on the runtime with stand-in handles: two cells of one Plot node (same id, cell
  // keys) inside a Facet element, and a mounted non-3D target.
  await page.goto('/test/notebook?fixture=commands');
  await page.waitForFunction(() => window.notebookReady, {}, { timeout: 20_000 });
  const result = await page.evaluate(async () => {
    const runtime = window.notebookRuntime;
    const facet = document.createElement('div');
    const cells = [document.createElement('div'), document.createElement('div')];
    cells.forEach((cell) => facet.append(cell));
    document.body.append(facet);
    const plot = (position) => {
      let state = { position, target: [0, 0, 0], up: [0, 1, 0], fov: 50, near: 0.1, far: 2000, zoom: 1, mode: 'orbit' };
      return { getCamera: () => ({ ...state }), setCamera: async (patch) => { state = { ...state, ...patch }; } };
    };
    const [a, b] = [plot([1, 1, 1]), plot([2, 2, 2])];
    const stops = [
      runtime.register('camera-plot', 'cell-a', a, cells[0], 'cell-a'),
      runtime.register('camera-plot', 'cell-b', b, cells[1], 'cell-b'),
      runtime.register('camera-facet', '', {}, facet),
      runtime.register('flat', '', { getCamera: () => undefined }, document.createElement('div')),
    ];
    try {
      const out = {};
      out.get = await runtime.command({ command: 'camera', target: 'camera-plot', args: {} });
      out.set = await runtime.command({ command: 'camera', target: 'camera-plot', args: { state: { position: [5, 6, 7] } } });
      out.cells = [a.getCamera().position, b.getCamera().position];
      await runtime.command({ command: 'camera', target: 'camera-facet', args: { state: { fov: 30 } } });
      out.facetFov = [a.getCamera().fov, b.getCamera().fov];
      out.viaFacet = (await runtime.command({ command: 'camera', target: 'camera-facet', args: {} })).position;
      try { await runtime.command({ command: 'camera', target: 'flat', args: {} }); } catch (error) { out.flat = error.message; }
      return out;
    } finally {
      stops.forEach((stop) => stop());
      facet.remove();
    }
  });
  expect(result.get.position).toEqual([1, 1, 1]);
  expect(result.set.position).toEqual([5, 6, 7]);
  expect(result.cells).toEqual([[5, 6, 7], [5, 6, 7]]);
  expect(result.facetFov).toEqual([30, 30]);
  expect(result.viaFacet).toEqual([5, 6, 7]);
  expect(result.flat).toBe('Target has no 3D camera.');
});

test('viewport command and event carry the orthographic center through repeated 2D plots', async ({ page }) => {
  await page.goto('/test/notebook?fixture=commands');
  await page.waitForFunction(() => window.notebookReady, {}, { timeout: 20_000 });
  const result = await page.evaluate(async () => {
    const runtime = window.notebookRuntime, sent = [], originalSend = runtime.send;
    const facet = document.createElement('div');
    const cells = [document.createElement('div'), document.createElement('div')];
    cells.forEach((cell) => facet.append(cell)); document.body.append(facet);
    const plot = (longitude) => {
      let state = { x: .5, y: .5, zoom: 1, zoomX: 1, zoomY: 1, center: [longitude, 0] };
      return { getCamera: () => null, getViewport: () => ({ ...state }),
        setViewport: (patch) => { state = { ...state, ...patch }; } };
    };
    const [a, b] = [plot(0), plot(20)];
    const stops = [
      runtime.register('viewport-plot', 'cell-a', a, cells[0], 'cell-a'),
      runtime.register('viewport-plot', 'cell-b', b, cells[1], 'cell-b'),
      runtime.register('viewport-facet', '', {}, facet),
      runtime.register('viewport-3d', '', { getCamera: () => ({ position: [0, 0, 1] }),
        getViewport: () => ({ center: [0, 0] }) }, document.createElement('div')),
    ];
    try {
      runtime.send = (message) => sent.push(message);
      const out = {};
      out.get = await runtime.command({ command: 'viewport', target: 'viewport-plot', args: {} });
      out.set = await runtime.command({ command: 'viewport', target: 'viewport-plot', args: { state: { center: [60, 10] } } });
      out.cells = [a.getViewport().center, b.getViewport().center];
      await runtime.command({ command: 'viewport', target: 'viewport-facet', args: { state: { zoom: 2 } } });
      out.zooms = [a.getViewport().zoom, b.getViewport().zoom];
      try { await runtime.command({ command: 'viewport', target: 'viewport-3d', args: {} }); }
      catch (error) { out.threeDimensional = error.message; }
      const props = runtime.props({ kind: 'Plot', id: 'viewport-event', props: {}, events: ['viewportchange'] });
      props.onviewportchange({ center: [45, 5], zoom: 2 });
      out.event = sent.find((message) => message.event === 'viewportchange');
      return out;
    } finally {
      runtime.send = originalSend;
      stops.forEach((stop) => stop()); facet.remove();
    }
  });
  expect(result.get.center).toEqual([0, 0]);
  expect(result.set.center).toEqual([60, 10]);
  expect(result.cells).toEqual([[60, 10], [60, 10]]);
  expect(result.zooms).toEqual([2, 2]);
  expect(result.threeDimensional).toBe('Target has no 2D viewport.');
  expect(result.event.payload.viewport.center).toEqual([45, 5]);
});

// TODO 46: Title and Markdown in a Python scene (python/examples/79): {$name} placeholders follow a
// slider; the scene's SVG and PDF keep a Title's lines as text where the page draws them, and place
// a Markdown block as an image of how it looks (math and all).
test('Title and Markdown: placeholders follow an input; exports keep Title as text and Markdown as an image', async ({ page }) => {
  await page.goto('/test/notebook?fixture=79_titles_and_markdown');
  await page.waitForFunction(() => window.notebookReady, {}, { timeout: 30_000 });
  await page.waitForFunction(() => [...document.querySelectorAll('.canvas')].every((canvas) => canvas.getAttribute('aria-busy') === 'false'));
  const heading = page.locator('.hm-title-block text').first();
  await expect(heading).toHaveText('Temperature anomaly, window of 12 months');
  await expect(page.locator('.hm-markdown')).toContainText('running mean over the last 12 months.');
  await page.getByLabel('Running mean (months)').fill('5');
  await expect(heading).toHaveText('Temperature anomaly, window of 5 months');
  await expect(page.locator('.hm-markdown')).toContainText('over the last 5 months.');
  // MathJax draws every glyph of in-line math in one SVG ("°C" after the space too).
  await expect.poll(() => page.evaluate(() => [...document.querySelectorAll('.hm-markdown .hm-math.rendered path[data-c]')].map((p) => p.dataset.c).join(',')))
    .toBe('30,2E,31,34,B0,43');
  const result = await page.evaluate(async () => {
    const runtime = window.notebookRuntime, root = document.querySelector('.hm-layout').getBoundingClientRect();
    const svg = await (await runtime.exportSceneDocument('svg', {})).blob.text(), pdf = await runtime.exportSceneDocument('pdf', {});
    const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
    const title = [...doc.querySelectorAll('text')].find((text) => text.textContent === 'Temperature anomaly, window of 5 months');
    // The title's baseline in the export, against the page's (the export's origin is the scene's).
    const onScreen = document.querySelector('.hm-title-block svg').getBoundingClientRect(), text = document.querySelector('.hm-title-block text');
    const shift = (element) => { let y = 0; for (let node = element; node && node.getAttribute; node = node.parentNode) { const m = /translate\(([-\d.]+)[ ,]+([-\d.]+)\)/.exec(node.getAttribute('transform') ?? ''); if (m) y += Number(m[2]); } return y; };
    return {
      titleY: title ? Number(title.getAttribute('y')) + shift(title) : null, screenY: onScreen.top - root.top + Number(text.getAttribute('y')),
      images: doc.querySelectorAll('image').length, layers: pdf.report.rasterLayers.map((layer) => layer.kind),
      fonts: pdf.report.fonts.map((font) => font.family), markdownText: svg.includes('How to read it'),
    };
  });
  expect(result.titleY).toBeCloseTo(result.screenY, 0);
  expect(result.images).toBe(1);
  expect(result.layers).toContain('markdown');
  expect(result.markdownText).toBe(false);
  expect(result.fonts).toContain('Source Sans 3');
});

// TODO 67.6: a Scene's export leaves out a Minimap of a 3D plot, and its report says so (it was
// left out silently). The scene is the docs' Minimap example with its Plot made 3D.
test("a Scene's export reports the Minimap of a 3D plot it leaves out", async ({ page }) => {
  await page.route("**/test/notebook-minimap3d.json", async (route) => {
    // The example's build, by its manifest (payloads are named by their content's hash).
    const { views } = await (await page.request.get("/example-builds/minimap-basic/assets.json")).json();
    const { state, columns } = await (await page.request.get(`/example-builds/${views.plot.payload}`)).json();
    const plot = state.root.children.find((node) => node.kind === "Plot");
    plot.props = { ...plot.props, type: "3d", axes2d: false };
    await route.fulfill({ json: { state, buffers: Object.fromEntries(Object.entries(columns).map(([key, column]) => [key, column.payload])),
      metadata: Object.fromEntries(Object.entries(columns).map(([key, column]) => [key, column.descriptor])) } });
  });
  await page.goto("/test/notebook?fixture=minimap3d");
  await page.waitForFunction(() => window.notebookReady, {}, { timeout: 30_000 });
  await page.waitForFunction(() => [...document.querySelectorAll(".canvas")].every((canvas) => canvas.getAttribute("aria-busy") === "false"));
  const warnings = await page.evaluate(async () => (await window.notebookRuntime.exportSceneDocument("svg", {})).report.warnings);
  expect(warnings).toContain("A Minimap of a 3D plot was left out of the export: only a 2D plot's minimap exports (as an image).");
});

// TODO 69.0, 69.5, 69.6: Python's integer and time columns as Python sends them (python/PROTOCOL.md;
// python/tests/test_core.py checks Python writes these bytes): a duration in seconds, an int64
// with a missing row (a validity mask after the values), a uint64 key past 2^63 and dates in days.
test("Python integer and time columns keep their values, missing rows and units in the browser", async ({ page }) => {
  const column = (Type, values, valid) => {
    const bytes = Buffer.alloc(values.length * 8 + (valid ? values.length : 0));
    new Type(bytes.buffer, bytes.byteOffset, values.length).set(values.map(BigInt));
    if (valid) bytes.set(valid, values.length * 8);
    return bytes.toString("base64");
  };
  const descriptor = (id, dtype, extra = {}) => ({ id, shape: [3], dtype, byte_order: "little", ...extra });
  const metadata = {
    wait: descriptor("wait", "int64", { logical_type: "duration", unit: "s", source_dtype: "timedelta64[s]" }),
    n: descriptor("n", "int64", { logical_type: "numeric", nullable: true, validity: "uint8", source_dtype: "Int64" }),
    id: descriptor("id", "uint64", { logical_type: "numeric", source_dtype: "uint64" }),
    day: descriptor("day", "int64", { logical_type: "datetime", unit: "d", timezone: "UTC", source_dtype: "datetime64[D]" }),
  };
  const buffers = {
    wait: column(BigInt64Array, [5, 10, 15]),
    n: column(BigInt64Array, [-(2n ** 63n), 0, 3], [1, 0, 1]),
    id: column(BigUint64Array, [2n ** 63n, 2n ** 63n + 1n, 2n ** 64n - 1n]),
    day: column(BigInt64Array, [20454, 20455, 20456]),
  };
  const state = {
    protocol: 1, library: "test", scene: "columns-scene", revision: 1,
    root: { id: "scene", kind: "Scene", props: {}, events: [], children: [{
      id: "plot", kind: "Plot", props: { height: 200, responsive: true, autoBounds: true, data: { $table: "t" } }, events: [],
      children: [{ id: "points", kind: "Points", props: { x: "wait", y: "n", size: 10 }, events: [], children: [] }],
    }] },
    tables: { t: { version: 1, key: "id", columns: Object.fromEntries(Object.keys(metadata).map((key) => [key, { $column: key }])) } },
    scales: {}, normalizations: {}, themes: {}, selections: {}, identities: {},
    columns: metadata,
  };
  await page.route("**/test/notebook-python-columns.json", (route) => route.fulfill({ json: { state, buffers, metadata } }));
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/test/notebook?fixture=python-columns");
  await page.waitForFunction(() => window.notebookReady, {}, { timeout: 30_000 });
  const result = await page.evaluate(async () => {
    const runtime = window.notebookRuntime, read = async (id) => Array.from(await runtime.resources.columns.get(id).values.ref.data());
    const points = runtime.reference("points");
    await points.whenSettled?.();
    const position = await points.getMark().fields.get("position").data.ref.jsAsync();
    return { wait: await read("wait"), n: await read("n"), day: await read("day"), origin: runtime.resources.columns.get("day").metadata.origin,
      tokens: runtime.resources.tables.get("t").identity.tokens, position: position.map((row) => row.slice(0, 2)), error: runtime.error || null };
  });
  expect(result.error).toBe(null);
  expect(result.wait).toEqual([5000, 10000, 15000]);
  expect(result.n).toEqual([-(2 ** 63), NaN, 3]);
  expect([result.origin, ...result.day]).toEqual([Date.UTC(2026, 0, 1), 0, 864e5, 1728e5]);
  expect(result.tokens).toEqual(["bigint:9223372036854775808", "bigint:9223372036854775809", "bigint:18446744073709551615"]);
  expect(result.position).toEqual([[5000, -(2 ** 63)], [10000, NaN], [15000, 3]]);
  expect(errors).toEqual([]);
});

// TODO 71: the notebook widget (scene/widget.js on a stand-in model). Without WebGPU it asks the
// kernel for a static image at its width and shows it, read-only, with a note and the SVG's title
// and description as alt text; with none it shows the error and what to do. With WebGPU it draws
// as before and asks for nothing.
test('the notebook widget without WebGPU shows the static image the kernel draws, or why there is none', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(Navigator.prototype, 'gpu', { configurable: true, get: () => undefined }));
  await page.goto('/test/notebook?widget&fixture=commands');
  await page.waitForFunction(() => window.widgetMessages?.some((m) => m.type === 'snapshot_request'), {}, { timeout: 30_000 });
  const sent = await page.evaluate(() => window.widgetMessages);
  const request = sent.find((m) => m.type === 'snapshot_request');
  expect(sent.find((m) => m.type === 'error').code).toBe('webgpu.unavailable');
  expect(sent.find((m) => m.type === 'capabilities').ready).toBe(false);
  const figure = page.locator('.hmplot-snapshot');
  await expect(figure.locator('figcaption')).toHaveText(/the kernel is drawing a static image/);
  await expect(page.locator('[role=alert]')).toHaveCount(0);
  expect(request.width).toBeGreaterThan(100);
  expect(request.width).toBe(await figure.evaluate((element) => element.clientWidth));

  await page.evaluate(({ scene, view }) => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180" viewBox="0 0 320 180"><title>Penguins</title>'
      + '<desc>Scatter plot of bill length against flipper length.</desc><rect width="320" height="180" fill="#c73b2b"/>'
      + '<text x="10" y="30" font-size="20" font-family="&quot;Source Sans 3&quot;, system-ui, sans-serif">Label</text></svg>';
    window.widgetReceive({ type: 'snapshot', protocol: 1, scene, view, revision: 1 }, [new DataView(new TextEncoder().encode(svg).buffer)]);
  }, request);
  const image = figure.locator('img');
  await expect(image).toHaveAttribute('alt', 'Penguins. Scatter plot of bill length against flipper length.');
  await expect(figure.locator('figcaption')).toHaveText(/^Static image: this browser has no WebGPU\./);
  const drawn = await image.evaluate(async (img) => {
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const context = canvas.getContext('2d');
    context.drawImage(img, 0, 0);
    return { width: img.getBoundingClientRect().width, height: img.getBoundingClientRect().height,
      pixel: [...context.getImageData(160, 120, 1, 1).data].slice(0, 3), font: atob(img.src.split(',')[1]).includes('@font-face') };
  });
  // Its own size, its pixels, and the bundled font embedded (an image cannot reach the page's).
  expect(drawn).toEqual({ width: 320, height: 180, pixel: [199, 59, 43], font: true });

  await page.evaluate(({ scene, view }) => window.widgetReceive({ type: 'snapshot', protocol: 1, scene, view, revision: 2,
    error: 'hmplot exports need Chrome, Edge or Chromium, and found none.' }), request);
  const alert = page.locator('[role=alert]');
  await expect(alert).toContainText('WebGPU backend is unavailable in this browser/runtime. Open the notebook in a browser with WebGPU');
  await expect(alert).toContainText('The kernel could not draw a static image of it instead: hmplot exports need Chrome, Edge or Chromium, and found none.');
  await expect(figure).toHaveCount(0);
});

test('the notebook widget with WebGPU draws the scene itself and asks for no static image', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => { if (errors.length < 5) errors.push(error.message); });
  await page.goto('/test/notebook?widget&fixture=commands');
  await page.waitForFunction(() => window.widgetMessages?.some((m) => m.type === 'ack'), {}, { timeout: 30_000 });
  await page.waitForFunction(() => {
    const canvases = [...document.querySelectorAll('.canvas')];
    return canvases.length === 2 && canvases.every((canvas) => canvas.getAttribute('aria-busy') === 'false');
  }, {}, { timeout: 30_000 });
  const sent = await page.evaluate(() => window.widgetMessages);
  expect(sent.find((m) => m.type === 'capabilities').ready).toBe(true);
  expect(sent.filter((m) => ['error', 'snapshot_request'].includes(m.type))).toEqual([]);
  await expect(page.locator('.hmplot-snapshot')).toHaveCount(0);
  // Plot A's two points and plot B's line are drawn: colored pixels (the text is gray).
  for (const canvas of await page.locator('.canvas').all()) {
    const read = pixelReader(await canvas.screenshot({ scale: 'css' })), box = await canvas.boundingBox();
    let colored = 0;
    for (let y = 0; y < Math.floor(box.height); y++)
      for (let x = 0; x < Math.floor(box.width); x++)
        if (Math.max(...read(x, y)) - Math.min(...read(x, y)) > 60) colored++;
    expect(colored).toBeGreaterThan(25);
  }
  expect(errors).toEqual([]);
});

// A rejected update leaves its error on the view, and the restored scene still answers commands;
// the next valid update applies (the error describes the earlier update, not the work it waits for).
test('the notebook widget applies a valid update after a rejected one', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => { if (errors.length < 5) errors.push(error.message); });
  await page.goto('/test/notebook?widget&fixture=commands');
  await page.waitForFunction(() => window.widgetMessages?.some((m) => m.type === 'ack'), {}, { timeout: 30_000 });
  const outcome = (revision) => page.waitForFunction((revision) => window.widgetMessages
    .find((m) => ['ack', 'error'].includes(m.type) && m.revision === revision), revision, { timeout: 30_000 })
    .then((handle) => handle.jsonValue());
  const revision = await page.evaluate(() => {
    window.validState = structuredClone(window.widgetState);
    const invalid = structuredClone(window.widgetState);
    invalid.revision++;
    invalid.root.children[0].kind = 'NoSuchComponent';
    window.widgetPublish(invalid);
    return invalid.revision;
  });
  const rejected = await outcome(revision);
  expect(rejected.type).toBe('error');
  expect(rejected.message).toContain('NoSuchComponent');
  await expect(page.getByRole('alert')).toContainText('NoSuchComponent');
  // The restored scene still answers the kernel's commands.
  await page.evaluate(() => {
    const { scene, view } = window.widgetMessages.find((m) => m.type === 'capabilities');
    const state = window.widgetState;
    window.widgetReceive({ type: 'command', protocol: 1, scene, view, request: 'after-rejection', revision: state.revision, target: state.root.id, command: 'settled', args: {} });
  });
  const answer = await page.waitForFunction(() => window.widgetMessages
    .find((m) => ['result', 'error'].includes(m.type) && m.request === 'after-rejection'), {}, { timeout: 30_000 })
    .then((handle) => handle.jsonValue());
  expect(answer.type).toBe('result');
  await page.evaluate((revision) => {
    const valid = window.validState;
    valid.revision = revision + 1;
    const recolor = (node) => {
      if (node.kind === 'Points') node.props.fill = { $literal: '#ff0000' };
      node.children.forEach(recolor);
    };
    recolor(valid.root);
    window.widgetPublish(valid);
  }, revision);
  expect((await outcome(revision + 1)).type).toBe('ack');
  await expect(page.getByRole('alert')).toHaveCount(0);
  // Plot A's points are drawn red.
  const canvas = page.locator('.canvas').first();
  await expect.poll(async () => {
    const read = pixelReader(await canvas.screenshot({ scale: 'css' })), box = await canvas.boundingBox();
    let red = 0;
    for (let y = 0; y < Math.floor(box.height); y++)
      for (let x = 0; x < Math.floor(box.width); x++) {
        const [r, g, b] = read(x, y);
        if (r > 200 && g < 80 && b < 80) red++;
      }
    return red;
  }).toBeGreaterThan(10);
  expect(errors).toEqual([]);
});

// An HTML export from the widget embeds the standalone runtime, which its bundle does not contain
// (Vite had inlined the runtime's own URL as the unbuilt source, so pages exported from a notebook
// never went live). For Python's export_html the page leaves the runtime's place to Python (a
// front end sends nothing over 10 MB to the kernel); for its own download (the settings pane) the
// view asks the kernel once, and the page carries what the kernel sent.
test('the notebook widget exports HTML with the standalone runtime the kernel sends', async ({ page }) => {
  await page.goto('/test/notebook?widget&fixture=commands');
  await page.waitForFunction(() => window.widgetMessages?.some((m) => m.type === 'ack'), {}, { timeout: 30_000 });
  const { scene, view } = await page.evaluate(() => window.widgetMessages.find((m) => m.type === 'capabilities'));
  const exported = (request, args = {}) => page.evaluate(async ({ scene, view, request, args }) => {
    const { state } = await (await fetch('/test/notebook-commands.json')).json();
    window.widgetReceive({ type: 'command', protocol: 1, scene, view, request, revision: state.revision, target: state.root.id, command: 'export_html', args: { snapshot: false, ...args } });
  }, { scene, view, request, args });
  const html = (request) => page.evaluate((request) =>
    new TextDecoder().decode(window.widgetBuffers[window.widgetMessages.findIndex((m) => m.type === 'result' && m.request === request)][0]), request);
  const script = (runtime) => `<script type="module" id="hmplot-runtime">${runtime}\n// The page's own code, after the HMPlot runtime:\nconst payload=`;
  await exported('python', { embedRuntime: false, maxBytes: 10 * 1024 * 1024 - 64 * 1024 });
  await page.waitForFunction(() => window.widgetMessages.some((m) => m.type === 'result' && m.request === 'python'), {}, { timeout: 30_000 });
  expect(await html('python')).toContain(script('/* HMPlot runtime */'));
  // A page over the command's maxBytes is not sent (Jupyter's server closes the connection on a
  // message over 10 MiB): the view says how large it is, and Python exports it headlessly.
  const size = await page.evaluate(() => window.widgetBuffers[window.widgetMessages.findIndex((m) => m.type === 'result' && m.request === 'python')][0].byteLength);
  await exported('limited', { embedRuntime: false, maxBytes: size - 1 });
  await page.waitForFunction(() => window.widgetMessages.some((m) => m.type === 'error' && m.request === 'limited'), {}, { timeout: 30_000 });
  const refused = await page.evaluate(() => window.widgetMessages.filter((m) => m.request === 'limited' && ['result', 'error'].includes(m.type)));
  expect(refused).toMatchObject([{ type: 'error', code: 'bridge.message_too_large', diagnostic: { details: { bytes: size, maxBytes: size - 1 } } }]);
  await exported('first');
  await page.waitForFunction(() => window.widgetMessages.some((m) => m.type === 'standalone_request'), {}, { timeout: 30_000 });
  await page.evaluate(({ scene, view }) => {
    const { request } = window.widgetMessages.find((m) => m.type === 'standalone_request');
    window.widgetReceive({ type: 'standalone', protocol: 1, scene, view, request }, [new DataView(new TextEncoder().encode("globalThis.standIn = '</script>';").buffer)]);
  }, { scene, view });
  await exported('second');
  await page.waitForFunction(() => window.widgetMessages.some((m) => m.type === 'result' && m.request === 'second'), {}, { timeout: 30_000 });
  for (const request of ['first', 'second'])
    expect(await html(request)).toContain(script("globalThis.standIn = '<\\/script>';"));
  expect(await page.evaluate(() => window.widgetMessages.filter((m) => m.type === 'standalone_request').length)).toBe(1);
});
