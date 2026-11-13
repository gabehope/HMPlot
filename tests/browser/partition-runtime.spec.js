import { test, expect } from "./fixtures.js";

// 11.11 A2/A3: a Python-style scene with marks inside a Partition (SceneRuntime, binary columns).
async function open(page) {
  await page.goto("/test/partition-runtime");
  await page.waitForFunction(() => window.partitionRuntimeReady, {}, { timeout: 20_000 });
  await page.evaluate(() => window.partitionRuntime.settle(20_000));
}
const handles = (page, id) => page.evaluate((id) => [...window.partitionRuntime.handles.values()]
  .filter((entry) => entry.id === id)
  .map((entry) => ({ key: entry.key, group: entry.group?.label ?? null })), id);

test("every group's instance of a node registers its own runtime handle, keyed by the group", async ({ page }) => {
  await open(page);
  expect(await handles(page, "points")).toEqual([
    { key: '["Adelie"]', group: "Adelie" },
    { key: '["Gentoo"]', group: "Gentoo" },
    { key: '["Chinstrap"]', group: "Chinstrap" },
  ]);
  // Nodes outside a Partition keep the empty key.
  expect(await handles(page, "plot")).toEqual([{ key: "", group: null }]);
  // A numeric key (a float column, as Python sends it) partitions by its distinct values, ascending.
  const cyl = await page.evaluate(() => window.partitionRuntime.command({ command: "groups", target: "partition-cyl" }));
  expect(cyl.map((group) => [group.label, group.values, group.marks])).toEqual([
    ["4", { cyl: 4 }, ["Line 1"]], ["6", { cyl: 6 }, ["Line 1"]], ["8", { cyl: 8 }, ["Line 1"]],
  ]);
  expect(await handles(page, "line")).toHaveLength(3);
});

test("handle keys compose the facet cell key and every enclosing group key, outer to inner", async ({ page }) => {
  await open(page);
  // `${id}:${facetCellKey}/${outerGroupKey}/${innerGroupKey}`; the facet cell key is JSON of
  // [row, column] and a group key is JSON of its `by` values.
  await expect.poll(() => handles(page, "dots").then((entries) => entries.map((entry) => entry.key).sort())).toEqual(
    ["Adelie", "Chinstrap", "Gentoo"].flatMap((species) => [4, 6, 8].map((cyl) =>
      `[null,"${species}"]/[${cyl}]/["${species}"]`)).sort(),
  );
  const entry = await page.evaluate(() => {
    const found = window.partitionRuntime.handles.get('dots:[null,"Gentoo"]/[6]/["Gentoo"]');
    return found && { key: found.key, column: found.cell?.column, group: found.group };
  });
  // The entry keeps the facet cell and the innermost group ({key, values, label}); the group's
  // values compose the enclosing Partitions'.
  expect(entry).toEqual({
    key: '[null,"Gentoo"]/[6]/["Gentoo"]', column: "Gentoo",
    group: { key: '["Gentoo"]', values: { cyl: 6, species: "Gentoo" }, label: "Gentoo" },
  });
  // The Facet and the Plot in each cell carry the facet key only; the Partitions are not
  // repeated by themselves, so the inner one registers once per outer group.
  expect((await handles(page, "plot-facet")).map((h) => h.key).sort()).toEqual(
    ['[null,"Adelie"]', '[null,"Chinstrap"]', '[null,"Gentoo"]'],
  );
  expect((await handles(page, "partition-inner")).map((h) => h.key).sort()).toEqual(
    ["Adelie", "Chinstrap", "Gentoo"].flatMap((species) => [4, 6, 8].map((cyl) => `[null,"${species}"]/[${cyl}]`)).sort(),
  );
});

test("a command on a mark inside a Partition still resolves after the last-mounted group exits", async ({ page }) => {
  await open(page);
  await page.evaluate(() => window.partitionRuntimeApply(["Adelie", "Gentoo"]));
  await page.evaluate(() => window.partitionRuntime.settle(20_000));
  await expect.poll(() => handles(page, "points")).toEqual([
    { key: '["Adelie"]', group: "Adelie" },
    { key: '["Gentoo"]', group: "Gentoo" },
  ]);
  // "fit" fans out over every mounted instance; without a handle it would reject with
  // "Target is not mounted."
  await expect(page.evaluate(() => window.partitionRuntime.command({ command: "fit", target: "points" }))).resolves.toBeNull();
  const groups = await page.evaluate(() => window.partitionRuntime.command({ command: "groups", target: "partition" }));
  expect(groups.map((group) => group.label)).toEqual(["Adelie", "Gentoo"]);
  // Bringing the species back re-registers its instance.
  await page.evaluate(() => window.partitionRuntimeApply());
  await page.evaluate(() => window.partitionRuntime.settle(20_000));
  await expect.poll(() => handles(page, "points").then((h) => h.length)).toBe(3);
});

test("an event from a mark inside a group names the group", async ({ page }) => {
  await open(page);
  const canvas = page.locator("section.hm-plot canvas").first();
  const box = await canvas.boundingBox();
  // Adelie rows sit at the bottom of the plot; click one of them.
  const point = await page.evaluate(() => {
    const entry = [...window.partitionRuntime.handles.values()].find(({ id }) => id === "plot");
    const layout = entry.handle.getAxisLayout();
    const fraction = (axis, value) => {
      const ticks = layout[axis].major, first = ticks[0], last = ticks.at(-1);
      return first.fraction + (value - first.value) / (last.value - first.value) * (last.fraction - first.fraction);
    };
    return { x: fraction("x", 0), y: 1 - fraction("y", 10) };
  });
  await page.mouse.click(box.x + box.width * point.x, box.y + box.height * point.y);
  await expect.poll(() => page.evaluate(() => (window.partitionRuntimeMessages ?? [])
    .filter((message) => message.type === "event" && message.event === "click")
    .map((message) => [message.payload.partition_group, message.payload.facet_cell]))).toEqual([['["Adelie"]', undefined]]);
});
