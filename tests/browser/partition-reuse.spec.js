import { test, expect } from "./fixtures.js";

// TODO 17.9: a Partition reuses a group's view when a data update leaves its rows alone, so the
// transforms and marks under it do not run again, and interaction still reaches its marks.
let problems;
test.beforeEach(async ({ page }) => {
  problems = [];
  page.on("pageerror", (error) => problems.push(`pageerror: ${error.message}`));
  page.on("console", (message) => { if (message.type() === "error") problems.push(`console: ${message.text()}`); });
  await page.goto("/test/partition-reuse");
  await page.waitForFunction(() => window.partitionReuse?.partition?.getGroups?.().length === 3);
  await page.evaluate(() => window.partitionReuse.settle());
});
test.afterEach(() => expect(problems).toEqual([]));

/** Transform runs caused by `change` (a partitionReuse method name and argument). */
const runs = (page, change, argument) => page.evaluate(async ([change, argument]) => {
  const { transformRuns } = await import("/src/lib/plot/utils/transforms.js");
  const before = transformRuns.count;
  window.partitionReuse[change](argument);
  await new Promise((resolve) => setTimeout(resolve, 50));
  await window.partitionReuse.settle();
  return transformRuns.count - before;
}, [change, argument]);

test("an in-place update of one group's rows runs its Density only; a whole-table update runs all", async ({ page }) => {
  expect(await runs(page, "gentoo", 2)).toBe(1);
  expect(await runs(page, "append")).toBe(1);
  expect(await runs(page, "replace")).toBe(3);
});

test("a reused group's marks still follow the selection", async ({ page }) => {
  await runs(page, "gentoo", 2);
  const changed = await page.evaluate(async () => {
    const adelie = window.partitionReuse.partition.getGroups().find((group) => group.values.species === "Adelie");
    const mark = adelie.marks.map((handle) => handle.guideMark()).find((item) => item.fields?.get("interactionOpacity") !== undefined || item.view?.marks.of(item)?.interaction);
    const field = () => mark.fields.get("interactionOpacity"), before = field()?.version ?? -1;
    const owner = ((m) => m?.view.marks.of(m))(mark)?.interaction.owner;
    owner.selection.replace(owner, [0]);
    await new Promise((resolve) => setTimeout(resolve, 100));
    await window.partitionReuse.settle();
    return { before, after: field()?.version ?? -1 };
  });
  expect(changed.after, JSON.stringify(changed)).toBeGreaterThan(changed.before);
});

test("under a Filter, a move that leaves a group's rows alone keeps its view (TODO 29.12)", async ({ page }) => {
  await page.goto("/test/partition-reuse?scene=filter");
  await page.waitForFunction(() => window.partitionReuse?.partition?.getGroups?.().length === 3);
  await page.evaluate(() => window.partitionReuse.settle());
  // Gentoo's x is about 8 to 12, the others' below 7.5: a bound between 10 and 11 changes only
  // Gentoo's rows. The Filter runs, and Gentoo's Density; Adelie's and Chinstrap's are kept.
  await runs(page, "setThreshold", 11);
  expect(await runs(page, "setThreshold", 10)).toBe(2);
  expect(await page.evaluate(() => window.partitionReuse.partition.getGroups().length)).toBe(3);
});
