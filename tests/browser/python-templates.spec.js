import { test, expect } from "./fixtures.js";

// Stage 27: Python templates rendered through /test/notebook. scripts/generate-template-fixtures.py
// writes static/test/notebook-templates.json (templates inside a Row, a Plot, a Facet, a
// Partition, and a graph layout, plus a slotless template of two marks) and
// notebook-templates-plain.json (the same scene written out by hand). The browser draws only a
// Template's and a Slot's children, so both must render the same.

async function open(page, fixture) {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`/test/notebook?fixture=${fixture}`);
  await page.waitForFunction(() => window.notebookReady, {}, { timeout: 30000 });
  // whenSettled can resolve while a plot still shows "Loading…"; wait for every canvas first.
  await page.waitForFunction(() => {
    const canvases = [...document.querySelectorAll(".canvas")];
    return canvases.length > 0 && canvases.every((canvas) => canvas.getAttribute("aria-busy") === "false");
  }, {}, { timeout: 30000 });
  return errors;
}

// Everything the comparison needs, from one rendered fixture: the kinds in the scene tree, the
// layout boxes of the plots, the whole-scene PNG, and a per-plot summary (dominant-color pixel
// counts, and for "points" the color at each red marker's center).
function render(page) {
  return page.evaluate(async () => {
    const runtime = window.notebookRuntime, root = window.notebookState.root;
    await runtime.command({ command: "settled", target: root.id, args: {} });
    const nodes = [];
    const walk = (node) => { nodes.push(node); node.children.forEach(walk); };
    walk(root);
    const pixels = async (blob) => {
      const bitmap = await createImageBitmap(blob), canvas = document.createElement("canvas");
      canvas.width = bitmap.width; canvas.height = bitmap.height;
      const context = canvas.getContext("2d"); context.drawImage(bitmap, 0, 0); bitmap.close();
      return context.getImageData(0, 0, canvas.width, canvas.height);
    };
    const dominant = {
      red: (r, g, b) => r > g + 90 && r > b + 90, blue: (r, g, b) => b > r + 90 && b > g + 90,
      green: (r, g, b) => g > r + 60 && g > b + 60,
    };
    const summary = ({ data, width, height }) => {
      const counts = { red: 0, blue: 0, green: 0 }, red = [];
      for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        for (const color of Object.keys(counts)) if (dominant[color](data[i], data[i + 1], data[i + 2])) {
          counts[color]++;
          if (color === "red") red.push([x, y]);
        }
      }
      // Red marker clusters and the dominant color at each one's center.
      const clusters = [];
      for (const p of red) {
        const cluster = clusters.find((c) => c.some((q) => Math.abs(q[0] - p[0]) <= 6 && Math.abs(q[1] - p[1]) <= 6));
        if (cluster) cluster.push(p); else clusters.push([p]);
      }
      const centers = clusters.filter((c) => c.length >= 5).map((c) => {
        const x = Math.round(c.reduce((s, p) => s + p[0], 0) / c.length), y = Math.round(c.reduce((s, p) => s + p[1], 0) / c.length);
        const i = (y * width + x) * 4;
        return Object.keys(dominant).find((color) => dominant[color](data[i], data[i + 1], data[i + 2])) ?? "other";
      });
      return { ...counts, centers };
    };
    const plots = {};
    for (const node of nodes.filter((item) => item.kind === "Plot")) {
      // Facet cells register in no fixed order; sort by cell key as the runtime's cell export does.
      const handles = [...runtime.handles.values()].filter((entry) => entry.id === node.id)
        .sort((a, b) => a.key.localeCompare(b.key));
      plots[node.props.name] = await Promise.all(handles.map(async (entry) => ({
        error: entry.handle.getRenderError?.() ?? "",
        ...summary(await pixels(await entry.handle.exportPNG())),
      })));
    }
    const scene = await runtime.command({ command: "export_png", target: root.id, args: { scale: 1 } });
    const bytes = new Uint8Array(await scene.arrayBuffer());
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return {
      kinds: [...new Set(nodes.map((node) => node.kind))].sort(),
      boxes: [...document.querySelectorAll(".hm-plot")].map((element) => {
        const box = element.getBoundingClientRect();
        return [box.left, box.top, box.width, box.height].map(Math.round);
      }),
      rowChildren: [...document.querySelectorAll('.hm-layout[data-kind="Row"]')].map((row) =>
        [...row.children].map((child) => child.className.split(" ").find((name) => name.startsWith("hm-")))),
      plots,
      scene: btoa(binary),
      error: runtime.error ?? "",
      failures: (window.notebookMessages ?? []).filter((message) => message.type === "error").map((message) => message.message),
    };
  });
}

test("a scene built with templates renders exactly like the same scene written by hand", async ({ page }) => {
  test.setTimeout(120000);
  const errors = await open(page, "templates");
  const templated = await render(page);
  const plainErrors = await open(page, "templates-plain");
  const plain = await render(page);

  expect(templated.kinds).toContain("Template");
  expect(templated.kinds).toContain("Slot");
  expect(plain.kinds).not.toContain("Template");
  for (const result of [templated, plain]) {
    expect(result.error).toBe("");
    expect(result.failures).toEqual([]);
  }
  expect(errors).toEqual([]);
  expect(plainErrors).toEqual([]);

  // Templates add no element: the Rows hold the same plot sections, laid out the same.
  expect(templated.rowChildren).toEqual(plain.rowChildren);
  expect(templated.rowChildren[0]).toEqual(["hm-plot", "hm-plot"]);
  expect(templated.boxes).toEqual(plain.boxes);

  // Every plot draws something and matches its hand-written twin; the Facet has two cells.
  expect(Object.keys(templated.plots).sort()).toEqual(["facet", "graph", "line", "partition", "points", "stem"]);
  expect(templated.plots.facet).toHaveLength(2);
  for (const [name, cells] of Object.entries(templated.plots)) {
    expect(cells, name).toEqual(plain.plots[name]);
    for (const cell of cells) {
      expect(cell.error, name).toBe("");
      expect(cell.red + cell.blue + cell.green, name).toBeGreaterThan(0);
    }
  }
  // The slot keeps its position: the template's blue markers come after the caller's red
  // points, so they are drawn over their centers.
  expect(templated.plots.points[0].centers).toEqual(["blue", "blue", "blue"]);
  expect(templated.plots.stem[0].green).toBeGreaterThan(0);

  expect(templated.scene).toBe(plain.scene);
});

// R2.0b.5: hm.visualize_tree of the templated scene (notebook-templates-tree.json). Hovering a
// node highlights its path to the root and its subtree, with the library's own interaction: a
// Calculate over @nearest (the row the tooltip shows, TODO 72) marks the rows, and a Filter of
// them draws the path's edges.
test("visualize_tree highlights a hovered node's path to the root and its subtree", async ({ page }) => {
  const errors = await open(page, "templates-tree");
  // Each mark's lit and dimmed rows (row opacity 1 and 0.25), and how many rows it shows.
  const marks = () => page.evaluate(async () => {
    const found = [...window.notebookRuntime.handles.values()].map(({ handle }) => handle?.getMark?.()).filter(Boolean);
    const summary = {};
    for (const mark of found) {
      const values = (await mark.fields.get("interactionOpacity").data.ref.jsAsync()).flat(Infinity);
      const name = mark.fields.has("textCode") ? "labels" : mark.fields.has("position") ? "points"
        // visualize_tree authors width=1 for all edges and width=2 for the hovered path.
        // A logical count is not a mark's role: the graph fixture can add components.
        : mark.fields.get("width").data === 1 ? "edges" : "path";
      summary[name] = name === "path" ? mark.view.marks.of(mark)?.rows.count ?? mark.count
        : [values.filter((v) => v === 1).length, values.filter((v) => v === 0.25).length];
    }
    return summary;
  });
  // GraphData replaces Graph, with explicit Nodes and Calculate adding two authored nodes.
  await expect.poll(marks).toEqual({ points: [44, 0], labels: [44, 0], edges: [43, 0], path: 0 });
  // The first Panel's Plot is row 4 of this fixture. Its path to the root (Scene, Row,
  // Panel, Data) and its subtree (Slot, two Points) are 8 of the 44 nodes, joined by 7 edges.
  // Read its drawn center: compact tidy and approximate tidy have different coordinates.
  const canvas = await page.locator("canvas").first().boundingBox();
  const point = await page.evaluate(async () => {
    const plot = [...window.notebookRuntime.handles.values()].find(({ handle }) => handle?.getAxisLayout).handle;
    const source = await (await plot.exportSVG({ mode: "vector" })).blob.text();
    const node = new DOMParser().parseFromString(source, "image/svg+xml").querySelectorAll("circle")[4];
    return { x: Number(node.getAttribute("cx")), y: Number(node.getAttribute("cy")) };
  });
  await page.mouse.move(canvas.x + point.x, canvas.y + point.y);
  await expect.poll(marks).toEqual({ points: [8, 36], labels: [8, 36], edges: [7, 36], path: 7 });
  const tooltip = await page.locator(".plot-tooltip").innerText();
  expect(tooltip).toMatch(/Plot and layout/);
  expect(tooltip).toMatch(/props\s+[^\n]*height=180/);
  expect(tooltip).toMatch(/responsive=False/);
  await page.mouse.move(1, 1);
  await expect.poll(marks).toEqual({ points: [44, 0], labels: [44, 0], edges: [43, 0], path: 0 });
  expect(errors).toEqual([]);
});

// TODO 130.2 slice 9a: a lollipop template whose heads are its main part, and a template whose
// Facet holds the stems and heads (notebook-templates-follow.json). The legends have the heads'
// entries only, and hiding the heads hides the stems with them, in every cell; Python hears one
// edit, the heads'. A group's declared legend entry (slice 9b) hides the parts it lists, and the
// mark it leaves out keeps its own entry.
test("a template's other marks follow its main part's visibility, and a legend entry's parts its swatch", async ({ page }) => {
  const errors = await open(page, "templates-follow");
  await expect(page.getByRole("button", { name: /^Toggle / })).toHaveCount(4);
  const lollipops = page.getByRole("button", { name: "Toggle Lollipops" });
  const faceted = page.getByRole("button", { name: "Toggle Faceted" });
  const change = page.getByRole("button", { name: "Toggle Change" });
  const shown = () => render(page).then((result) => result.plots);
  const before = await shown();
  for (const cell of [...before.lollipop, ...before.faceted]) {
    expect(cell.red).toBeGreaterThan(0);
    expect(cell.green).toBeGreaterThan(0);
  }
  expect(before.faceted).toHaveLength(2);
  expect(before.dumbbell[0].blue).toBeGreaterThan(0);

  await lollipops.click();
  await faceted.click();
  await change.click();
  await expect(lollipops).toHaveAttribute("aria-pressed", "false");
  await expect(faceted).toHaveAttribute("aria-pressed", "false");
  const hidden = await shown();
  // The export keeps a legend's dimmed swatch: the heads' red drops to it, the stems' green to 0.
  for (const [index, cell] of [...hidden.lollipop, ...hidden.faceted].entries()) {
    expect(cell.green, `cell ${index}`).toBe(0);
    expect(cell.red, `cell ${index}`).toBeLessThan([...before.lollipop, ...before.faceted][index].red / 2 + 1);
  }
  const [dumbbell] = hidden.dumbbell;
  expect(dumbbell.green).toBe(0);
  expect(dumbbell.red).toBeLessThan(before.dumbbell[0].red / 2);
  // The blue markers stay (and show where the hidden red ones covered them).
  expect(dumbbell.blue).toBeGreaterThanOrEqual(before.dumbbell[0].blue);
  const { edits, mains } = await page.evaluate(() => {
    const templates = [];
    const walk = (node) => { if (node.kind === "Template") templates.push(node); node.children.forEach(walk); };
    walk(window.notebookState.root);
    return {
      edits: (window.notebookMessages ?? []).filter((message) => message.type === "edit" && "visible" in message.props)
        .map((message) => message.target),
      mains: templates.flatMap(({ props: { contract } }) => contract.main ?? contract.legendEntries.map((entry) => entry.swatch)),
    };
  });
  expect([...new Set(edits)].sort()).toEqual([...mains].sort());

  await lollipops.click();
  await faceted.click();
  await change.click();
  const again = await shown();
  expect(again).toEqual(before);
  expect(errors).toEqual([]);
});

// TODO 130.2 slice 9c: a template inside a Plot is one settings group, labelled by its kind. With
// a main part it lists only that mark (the stems follow it); a group lists its parts.
test("the settings pane lists a template as one group", async ({ page }) => {
  const errors = await open(page, "templates-follow");
  const tree = async (name) => {
    const region = page.getByRole("region", { name, exact: true });
    await region.locator("canvas").hover();
    await region.getByRole("button", { name: `Settings for ${name}`, exact: true }).click();
    const panel = page.getByRole("dialog", { name: `Settings · ${name}`, exact: true });
    const items = await panel.getByRole("treeitem").evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute("aria-level") + " " + node.textContent.trim().replace(/^▾\s*/, "")));
    await page.keyboard.press("Escape");
    return items;
  };
  const lollipop = await tree("lollipop");
  expect(lollipop.filter((item) => /Lollipop 1 defaults|Sprites|Error bars/.test(item)).map((item) => item.split(" ").slice(1).join(" ")))
    .toEqual(["Lollipop 1 defaultsGroup", "Sprites 1Sprites"]);
  const dumbbell = await tree("dumbbell");
  expect(dumbbell.filter((item) => /dumbbell 1 defaults|Sprites|Error bars/.test(item)).map((item) => item.split(" ").slice(1).join(" ")))
    .toEqual(["dumbbell 1 defaultsGroup", "Sprites 1Sprites", "Error bars 1Error bars", "Sprites 2Sprites", "Sprites 3Sprites"]);
  // The parts sit under the group.
  const level = (items, text) => Number(items.find((item) => item.includes(text)).split(" ")[0]);
  expect(level(dumbbell, "Error bars 1")).toBe(level(dumbbell, "dumbbell 1 defaults") + 1);
  expect(errors).toEqual([]);
});
