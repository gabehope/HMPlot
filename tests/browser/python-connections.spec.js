import { test, expect } from "./fixtures.js";

// Stage 15 chunk D: connections built in Python, rendered through /test/notebook.
// static/test/notebook-connect.json is the snapshot of this scene (serialized like
// scripts/generate-notebook-fixtures.py does):
//
//   plain = dict(width=320, height=240, responsive=False, tone_mapping=0, axes2d=False)
//   before = hm.Anchor(x="x0", y="y", name="before"); after = hm.Anchor(x="x1", y="y", name="after")
//   with hm.Scene() as scene:
//       with hm.Plot(data=pairs, name="forward", x={"domain": [0, 100]}, y={"domain": [0, 100]}, **plain) as forward:
//           segments = hm.Segments(connections=hm.connect(before, after, key="id"), color="#00c800", width=3)
//           segments.on_click(...)
//           hm.Points(x="x0", y="y", size=9, fill="#ff0000"); hm.Points(x="x1", ..., fill="#0000ff")
//           forward.add(before, after)          # the Segments precede the Anchors they reference
//       with hm.Plot(data=rows, name="facet", **plain):
//           with hm.Fold(fields=["a", "b", "c"]) as fold:
//               hm.Line(connections=hm.connect(facet.endpoint("values"), key="id", order="facet"), ...)
//               fold.add(facet)                  # Facet(column="key", scales="free-y", layout="grid")
//               with facet: hm.Anchor(x=0, y="value", name="values"); magenta Points markers
//       "facet-ref": the same, with values = hm.Anchor(...) inside the Facet and
//               hm.connect(values, key="id") (no order: facet order is the default)
//
// pairs = {id: [1, 2, 3], x0: [10, 15, 20], x1: [80, 85, 90], y: [20, 50, 80]};
// rows = {id: [1, 2, 3], a: [1, 2, 3], b: [30, 20, 10], c: [5, 7, 6]}.

async function open(page) {
  await page.goto("/test/notebook?fixture=connect");
  await page.waitForFunction(() => window.notebookReady, {}, { timeout: 30000 });
}

// Export the Plot named `name` and summarize its pixels: centroids of red, blue, and magenta
// clusters, green pixels, and a `near(x, y)` green test at given points.
function image(page, name, points = []) {
  return page.evaluate(async ({ name, points }) => {
    const runtime = window.notebookRuntime;
    const nodes = [];
    const walk = (node) => { nodes.push(node); (node.children ?? []).forEach(walk); };
    walk(window.notebookState.root);
    const node = nodes.find((item) => item.kind === "Plot" && item.props.name === name);
    await runtime.command({ command: "settled", target: node.id, args: {} });
    const plot = runtime.reference(node.id);
    const png = await plot.exportPNG(), bitmap = await createImageBitmap(png);
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width; canvas.height = bitmap.height;
    const context = canvas.getContext("2d"); context.drawImage(bitmap, 0, 0); bitmap.close();
    const { data, width, height } = context.getImageData(0, 0, canvas.width, canvas.height);
    const dominant = {
      red: (r, g, b) => r > g + 90 && r > b + 90, blue: (r, g, b) => b > r + 90 && b > g + 90,
      green: (r, g, b) => g > r + 60 && g > b + 60, magenta: (r, g, b) => r > 150 && b > 150 && g < 90,
    };
    const pixels = (color) => {
      const out = [];
      for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        if (dominant[color](data[i], data[i + 1], data[i + 2])) out.push([x, y]);
      }
      return out;
    };
    const clusters = (list, gap = 6) => {
      const groups = [];
      for (const p of list) {
        const group = groups.find((g) => g.some((q) => Math.abs(q[0] - p[0]) <= gap && Math.abs(q[1] - p[1]) <= gap));
        if (group) group.push(p); else groups.push([p]);
      }
      return groups.filter((g) => g.length >= 5).map((g) => [g.reduce((s, p) => s + p[0], 0) / g.length, g.reduce((s, p) => s + p[1], 0) / g.length])
        .sort((a, b) => a[1] - b[1] || a[0] - b[0]);
    };
    const near = ([x, y], radius = 3) => {
      for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) {
        const i = (Math.round(y + dy) * width + Math.round(x + dx)) * 4;
        if (dominant.green(data[i], data[i + 1], data[i + 2])) return true;
      }
      return false;
    };
    const green = pixels("green");
    return {
      width, height, error: plot.getRenderError?.() ?? "",
      red: clusters(pixels("red")), blue: clusters(pixels("blue")), magenta: clusters(pixels("magenta"), 7),
      green: green.length, greenX: green.length ? [Math.min(...green.map((p) => p[0])), Math.max(...green.map((p) => p[0]))] : null,
      near: points.map((point) => near(point)),
    };
  }, { name, points });
}
const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];

test("a connector that precedes its Anchors in a Python scene renders once they mount", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await open(page);
  const first = await image(page, "forward");
  expect(first.error).toBe("");
  expect(first.red).toHaveLength(3);
  expect(first.blue).toHaveLength(3);
  // Each id's segment joins its before (red) and after (blue) point: green at the midpoints,
  // and nothing green left of the red points.
  const probes = first.red.map((red, i) => mid(red, first.blue[i]));
  const drawn = await image(page, "forward", probes);
  expect(drawn.near).toEqual([true, true, true]);
  expect(drawn.greenX[0]).toBeGreaterThan(Math.min(...first.red.map((p) => p[0])) - 8);
  const state = await page.evaluate(() => ({
    error: window.notebookRuntime.error,
    failures: (window.notebookMessages ?? []).filter((message) => message.type === "error").map((message) => message.message),
  }));
  expect(state).toEqual({ error: "", failures: [] });
  expect(errors).toEqual([]);
});

test("a Facet selection and a direct reference to the repeated Anchor draw the same parallel coordinates", async ({ page }) => {
  await open(page);
  const summaries = {};
  for (const name of ["facet", "facet-ref"]) {
    const plain = await image(page, name);
    expect(plain.error, name).toBe("");
    // Three cells of three markers; group them into bands left to right, markers top to bottom.
    expect(plain.magenta, name).toHaveLength(9);
    const bands = [];
    for (const marker of [...plain.magenta].sort((a, b) => a[0] - b[0])) {
      const band = bands.find((b) => Math.abs(b[0][0] - marker[0]) < 20);
      if (band) band.push(marker); else bands.push([marker]);
    }
    expect(bands.map((band) => band.length), name).toEqual([3, 3, 3]);
    bands.forEach((band) => band.sort((a, b) => a[1] - b[1]));
    // Free y per cell: a = [1, 2, 3], b = [30, 20, 10], c = [5, 7, 6]. id 1 runs a-bottom ->
    // b-top -> c-bottom; id 2 a-middle -> b-middle -> c-top; id 3 a-top -> b-bottom -> c-middle.
    const [a, b, c] = bands;
    const probes = [mid(a[2], b[0]), mid(b[0], c[2]), mid(a[1], b[1]), mid(b[1], c[0]), mid(a[0], b[2]), mid(b[2], c[1])];
    const drawn = await image(page, name, probes);
    expect(drawn.near, name).toEqual(probes.map(() => true));
    // The lines start and end at the first and last cells' markers.
    expect(drawn.greenX[0], name).toBeGreaterThan(a[0][0] - 10);
    expect(drawn.greenX[1], name).toBeLessThan(c[0][0] + 10);
    summaries[name] = { bands: bands.map((band) => band.map((m) => m.map(Math.round))), green: drawn.green };
  }
  expect(summaries["facet-ref"].bands).toEqual(summaries.facet.bands);
  expect(Math.abs(summaries["facet-ref"].green - summaries.facet.green)).toBeLessThanOrEqual(summaries.facet.green * 0.05);
});

test("a click on a connector sends a Python event carrying the connection and its endpoint nodes", async ({ page }) => {
  await open(page);
  const first = await image(page, "forward");
  const target = mid(first.red[1], first.blue[1]);
  const [x, y] = await page.evaluate(({ target, width }) => {
    const nodes = [];
    const walk = (node) => { nodes.push(node); (node.children ?? []).forEach(walk); };
    walk(window.notebookState.root);
    const segments = nodes.find((node) => node.kind === "Segments");
    const canvas = window.notebookRuntime.reference(segments.id).getMark().renderer.domElement;
    canvas.scrollIntoView({ block: "center" });
    const rect = canvas.getBoundingClientRect(), scale = rect.width / width;
    return [rect.left + target[0] * scale, rect.top + target[1] * scale];
  }, { target, width: first.width });
  await page.mouse.click(x, y);
  await expect.poll(() => page.evaluate(() => (window.notebookMessages ?? []).filter((message) => message.type === "event").length)).toBeGreaterThan(0);
  const result = await page.evaluate(() => {
    const nodes = [];
    const walk = (node) => { nodes.push(node); (node.children ?? []).forEach(walk); };
    walk(window.notebookState.root);
    const id = (kind, name) => nodes.find((node) => node.kind === kind && (name === undefined || node.props.name === name))?.id;
    const event = window.notebookMessages.filter((message) => message.type === "event").at(-1);
    return { event, segments: id("Segments"), before: id("Anchor", "before"), after: id("Anchor", "after") };
  });
  const { event } = result;
  expect(event.target).toBe(result.segments);
  expect(event.event).toBe("click");
  const { connection } = event.payload;
  expect(connection.key).toBe(2);
  expect(connection.index).toBe(1);
  expect(connection.source).toMatchObject({ slot: 0, label: "before", kind: "Anchor", row: 1, node: result.before });
  expect(connection.target).toMatchObject({ slot: 1, label: "after", kind: "Anchor", row: 1, node: result.after });
  expect(connection.slots.map((slot) => slot.node)).toEqual([result.before, result.after]);
  expect(connection.pair.map((slot) => slot.node)).toEqual([result.before, result.after]);
  expect(JSON.parse(JSON.stringify(event.payload))).toEqual(event.payload);
});

// A Python update republishes the scene (`segments.update(connections=hm.connect(after, before,
// key="id"))`, `after.update(x=50)`); the widget applies the new snapshot like this.
test("a Python update of the connection and of an endpoint redraws the connector and its events", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await open(page);
  const first = await image(page, "forward");
  // Screen x of a data x, from row id 1 (bottom: x0 = 10, x1 = 80).
  const [red, blue] = [first.red[2], first.blue[2]];
  const sx = (x) => red[0] + ((blue[0] - red[0]) * (x - 10)) / 70;
  const rows = first.red.map((point) => point[1]);
  const before = await image(page, "forward", rows.map((y) => [sx(70), y]));
  expect(before.near).toEqual([true, true, true]);

  await page.evaluate(async () => {
    const state = structuredClone(window.notebookState);
    const nodes = [];
    const walk = (node) => { nodes.push(node); (node.children ?? []).forEach(walk); };
    walk(state.root);
    const segments = nodes.find((node) => node.kind === "Segments");
    const after = nodes.find((node) => node.kind === "Anchor" && node.props.name === "after");
    segments.props.connections.$connect.endpoints.reverse();
    after.props.x = 50;
    state.revision += 1;
    const { buffers, metadata } = await (await fetch("/test/notebook-connect.json")).json();
    await window.notebookRuntime.apply(state, (id) => ({
      payload: Uint8Array.from(atob(buffers[id]), (c) => c.charCodeAt(0)), descriptor: metadata?.[id],
    }));
    window.notebookState = state;
  });
  // Every segment now ends at x = 50: green halfway there, none at x = 70.
  const moved = await image(page, "forward", [...rows.map((y, i) => [(first.red[i][0] + sx(50)) / 2, y]), ...rows.map((y) => [sx(70), y])]);
  expect(moved.error).toBe("");
  expect(moved.near).toEqual([true, true, true, false, false, false]);
  expect(moved.greenX[1]).toBeLessThan(sx(50) + 8);

  // The reversed connection reports "after" as its source.
  const target = [(first.red[1][0] + sx(50)) / 2, rows[1]];
  const [x, y] = await page.evaluate(({ target, width }) => {
    const nodes = [];
    const walk = (node) => { nodes.push(node); (node.children ?? []).forEach(walk); };
    walk(window.notebookState.root);
    const segments = nodes.find((node) => node.kind === "Segments");
    const canvas = window.notebookRuntime.reference(segments.id).getMark().renderer.domElement;
    canvas.scrollIntoView({ block: "center" });
    const rect = canvas.getBoundingClientRect(), scale = rect.width / width;
    return [rect.left + target[0] * scale, rect.top + target[1] * scale];
  }, { target, width: first.width });
  await page.mouse.click(x, y);
  await expect.poll(() => page.evaluate(() => (window.notebookMessages ?? []).filter((message) => message.type === "event").length)).toBeGreaterThan(0);
  const connection = await page.evaluate(() => window.notebookMessages.filter((message) => message.type === "event").at(-1).payload.connection);
  expect(connection.key).toBe(2);
  expect(connection.source).toMatchObject({ label: "after", row: 1 });
  expect(connection.target).toMatchObject({ label: "before", row: 1 });
  const failures = await page.evaluate(() => (window.notebookMessages ?? []).filter((message) => message.type === "error").map((message) => message.message));
  expect(failures).toEqual([]);
  expect(errors).toEqual([]);
});
