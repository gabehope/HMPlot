---
title: Author web visualizations with Svelte
section: guides
order: 140
summary: Six core concepts, SVG and D3 equivalents, HTML integration, and a browser checking workflow.
---

HMPlot is a GPU plotting library with a declarative data pipeline. Use it for
data-driven geometry and interactions; use Svelte and HTML for application UI.
It does not implement the SVG document model. Start from a component's Svelte
reference page, then compile and inspect the result in a WebGPU browser.

## Six concepts

| Concept | Responsibility |
| --- | --- |
| Plot | Owns a canvas, camera, viewport, interaction lifecycle and exports. |
| Frame | Defines coordinates and scales. Children inherit dimensions unless they establish their own domain, transform or range. |
| Data | Supplies columns and observation identity. `Plot data={table}` is shorthand for a data scope. |
| Transforms | Produce columns or rows for descendants. Order is meaningful; transformations are not SVG groups. |
| Marks | Draw many items from columns in one component: Points, Line, Rect, Text, Heatmap, and others. |
| Interaction resources | Carry selection, brush, hover or input state between views and into expressions. |

```svelte
<script>
  import { Plot, Points, literal } from "hmplot";
  const observations = { id: [1, 2, 3], time: [1, 2, 3], value: [4, 2, 5] };
</script>

<Plot data={observations} key="id" height={320} description="Three measurements over time.">
  <Points x="time" y="value" fill={literal("#3478c7")} brush tooltip />
</Plot>
```

For separate tables within a plot, wrap marks in `<Data value={table}>` and use
`<Plot autoBounds>` to infer domains from those descendant scopes. Plot enables
automatic bounds by default when it receives or inherits a table. Explicit domains
always win. Add `legend` to Plot to request continuous scale legends; by default
only categorical legends appear. A mark’s
`data` channel is not the same as the Plot table shortcut. Empty or all-missing
host columns need an explicit `schema` (for example `{ x: "numeric" }`). A
reactive Filter preserves its input schema when no rows match.

The `data` prop on a mark is a mark channel, **not** a table shortcut. To give
different marks different tables, use sibling Data scopes. Every field named by
a mark must exist in its nearest active Data scope:

```svelte
<script>
  import { Plot, Data, Line, Points } from "hmplot";
  const readings = { time: [1, 2], value: [3, 5] };
  const limits = { time: [1, 2], limit: [4, 4] };
</script>
<Plot autoBounds>
  <Data value={readings}><Line x="time" y="value" /></Data>
  <Data value={limits}><Points x="time" y="limit" /></Data>
</Plot>
```

Use the task's supplied data as the source of truth. If a file fails to load,
fix the import or decoder; fabricated replacement rows can make a plausible
picture while giving every linked count and statistic the wrong meaning. For a
self-contained Vite/Svelte build, import CSV text at build time:

```js
import csvText from "./data/measurements.csv?raw";
import { csvParse } from "d3";
const rows = csvParse(csvText, (row) => ({
  x: Number(row.x),
  y: Number(row.y),
}));
```

For Parquet, import a URL and decode the fetched bytes; `?url` may become an
inline `data:` URL in a standalone build, so avoid a range-request reader that
assumes an HTTP server:

```js
import parquetUrl from "./data/measurements.parquet?url";
import { parquetReadObjects } from "hyparquet";
import { compressors } from "hyparquet-compressors";
const bytes = await (await fetch(parquetUrl)).arrayBuffer();
const rows = await parquetReadObjects({ file: bytes, compressors });
```

For asynchronous loading inside a Svelte component, do this in `onMount` and
show a loading or error state until the actual rows are ready. Do not construct
the Plot with substitute data while loading. Inspect the file's fields and
types before binding channels; coerce numeric CSV fields deliberately.

One Points component draws all rows. Do not create a component per observation.
Use a keyed Svelte loop for a few independently configured panels or HTML cards.
Use `Partition` when each group should instantiate a subtree; use `Group` when
many input rows should become aggregate output rows. A Line's `series` splits
independent paths without requiring one Line component per series.

## Resolve ambiguity explicitly

- **Columns and literals:** a string mark channel can name a column or a literal.
  Use `col("value")` for an explicit column and `literal("red")` for a constant.
  Strings inside expressions name columns: `equal("status", literal("ready"))`.
  Use expression functions such as `add`, `less`, `logical_and`, and `where`;
  JavaScript operators do not build HMPlot expressions.
- **Correspondence:** `Data.key` identifies observations across table updates;
  `animationGroup` matches visual items across animation snapshots;
  `selection({ by: "id" })` relates matching key values across data scopes.
  Use stable unique observation keys. Grouping changes the unit being drawn;
  do not assume an aggregate callback contains one original row.
- **Frames:** an inherited dimension shares its parent mapping. An explicit
  child domain establishes a local dimension; a child range is expressed in
  parent coordinates. `placement` anchors a fixed-size frame. Read the Frame
  reference before nesting nonlinear scales or mixing coordinate systems.
- **Ordering:** Filter then Group computes statistics from matching observations.
  Group then Filter selects already-computed groups. Decide which question the
  chart should answer before placing the filter.
- **Group output:** Group always creates a `count` column. Do not also name a
  column `count` in `columns`; use the built-in `count`, or give another
  reduction a different output name, such as `flights: count()`.

Svelte 5 state that an event handler reassigns must be declared with `let`, for
example `let selected = $state(null)`. A `const` state binding cannot be
reassigned. Use `const` for stable input data and `$derived` for values computed
from state.

Static JavaScript preprocessing is appropriate for parsing, stable lookup tables,
or an algorithm HMPlot does not provide. Keep frequently changing filters and
reductions in a reactive pipeline when practical. Do not recompute and upload an
entire host table on every pointer move merely to change a threshold. GPU work can
still incur compilation, dispatch and readback costs; measure the complete update.

## SVG and D3 task equivalents

| Web visualization task | HMPlot approach |
| --- | --- |
| Repeated circles, rectangles or labels | Points, Rect, Text driven by columns |
| Joined path elements | Line with ordered rows and `series`; Segments for independent edges |
| Scales and axes | Plot/Frame `x`, `y`, `z`; shared appearance scale resources |
| Data join and keyed transition | Data/Plot `key`, mark animation, optional `animationGroup` |
| Faceted groups | Facet, Panels, or Partition according to the intended layout |
| Brush and linked highlighting | `brush`, `respond`, and shared selection resources |
| Tooltip | Mark `tooltip`; use its custom content contract for rich hover content |
| Persistent HTML callout or button | Html inside the relevant Frame |
| Layout algorithm | A supported graph/layout transform, or static preprocessing into columns |
| SVG clipping path | Rectangular 2D `axisMask`; arbitrary SVG clipping paths are not supported |
| Full SVG document or rich document text | Keep it as application DOM; custom point symbols do not imply arbitrary SVG support |

Core components come from `hmplot`; chart patterns from `hmplot/charts`; statistical
patterns from `hmplot/stats`. Import the documented public subpath, not renderer
internals. Most tasks compose existing marks and transforms without a new plugin.

## Two small compositions

Aggregate rows before drawing a bar for each region. Moving Filter inside Group
would filter aggregate rows instead of orders.

```svelte
<script>
  import { Plot, Group, Filter, sum, greater_equal } from "hmplot";
  import { Bar } from "hmplot/charts";
  const orders = { region: ["East", "West", "East"], amount: [12, 7, 20] };
  let minimum = $state(10);
</script>
<label>Minimum order <input type="number" bind:value={minimum} /></label>
<Plot data={orders} height={260}>
  <Filter where={greater_equal("amount", minimum)}>
    <Group by="region" columns={{ revenue: sum("amount") }}>
      <Bar x="region" y="revenue" />
    </Group>
  </Filter>
</Plot>
```

Use a shared resource when two separate tables represent the same entities.
The matching key values must use the same type in both tables.

```svelte
<script>
  import { Plot, Points, selection } from "hmplot";
  const focus = selection({ by: "id" });
  const measurements = { id: ["a", "b"], x: [1, 2], y: [3, 1] };
  const estimates = { id: ["b", "a"], x: [4, 2], y: [2, 5] };
</script>
<Plot data={measurements} height={220}>
  <Points x="x" y="y" select={focus} respond={focus} />
</Plot>
<Plot data={estimates} height={220}>
  <Points x="x" y="y" select={focus} respond={focus} />
</Plot>
```

## HTML, coordinates and accessibility

```svelte
<Html x={selected.x} y={selected.y} dx={12} dy={-8}>
  <button onclick={() => openDetails(selected.id)}>Open measurement details</button>
</Html>
```

The anchor follows the nearest frame's displayed numeric 2D coordinates. Offsets
are CSS pixels. Html preserves Svelte context and native controls, contributes no
domain or layout space, and is hidden when its anchor is clipped or invalid. Content
may extend into margins but is clipped at the canvas boundary. Use CSS inside the
attachment for alignment. It does not follow an animated mark's endpoint.

The overlay background is pointer-transparent. Attachment content receives native
events, and plot navigation ignores events originating inside an attachment.
Resize, pan/zoom and scale animation update attachment positions after completed
draws. Html owns its subscription and wrapper cleanup; applications must unsubscribe
from mappings they subscribe to themselves.

For an external overlay, use `frame.getScreenMapping()` or
`frame.subscribeScreenMapping(listener)`. Snapshots map data to canvas-local CSS
pixels with `project({x,y})` and back with `unproject({x,y})`. Subtract the canvas's
bounding rectangle from pointer `clientX/clientY` before unprojecting; do not use
device pixels or the outer plot's rectangle. CSS transforms on the canvas require
the application's corresponding coordinate conversion. Unsubscribe on cleanup.
Mappings are null before the first draw and for unsupported coordinates.

Use a meaningful Plot `description` and title. Native HTML controls need accessible
names and normal keyboard behavior; preserve visible focus. A hidden attachment is
inert, and focus inside it returns to the plot. Provide a table or textual summary
when users need exact values or the task cannot be completed with the plot's
keyboard interactions. A GPU mark is not an individual DOM accessibility node.

HTML appears in browser screenshots but is omitted from plot PNG/SVG/PDF exports.
SVG/PDF reports and `inspect()` disclose this omission. Use plot Text or other
exportable marks for information required in those artifacts.

## Compile, inspect, interact

1. Run the consumer application's `svelte-check --tsconfig ./tsconfig.json`.
   Fix unknown props and callback payload errors before checking appearance.
2. In a **test-only entry point**, import `inspect` from `hmplot/check` and expose
   `window.inspectPlot = () => inspect({ root: document.querySelector("main") })`.
   The library installs no global hook. Wait for application data loading first.
3. In Playwright, use a WebGPU-capable Chrome and `deviceScaleFactor: 2`.
   Await `page.evaluate(() => window.inspectPlot())`. Inspection waits for first
   visible draws and work already started, bounded by a 30-second total timeout.
4. Save the JSON report and a screenshot. Assert errors are empty and `ready` is
   true; review warnings and lints rather than silently discarding them.
5. Exercise each relevant hover, click, brush, slider, reset and resize. Reinspect
   after each change and assert expected values, geometry, or DOM. Save interaction
   screenshots. A changed screenshot alone does not prove filtering is correct.

```js
// tests/chart.spec.js (run after npm exec svelte-check).
import { test, expect } from "@playwright/test";
import fs from "node:fs/promises";

test.use({ deviceScaleFactor: 2 });
test("selection changes the displayed result", async ({ page }) => {
await page.goto("http://localhost:5173");
// An application-owned loading indicator accounts for asynchronous data loading
// before all of its plots mount. Give this wait a bounded timeout too.
await expect(page.getByTestId("data-ready")).toBeVisible({ timeout: 30_000 });
await fs.mkdir("artifacts", { recursive: true });
const report = await page.evaluate(() => window.inspectPlot());
await fs.writeFile("artifacts/check.json", JSON.stringify(report, null, 2));
expect(report.ready).toBe(true);
expect(report.errors).toEqual([]);
await page.screenshot({ path: "artifacts/initial.png" });
await page.getByRole("button", { name: "Reset" }).click();
expect((await page.evaluate(() => window.inspectPlot())).ready).toBe(true);
await expect(page.getByTestId("matching-count")).toHaveText("3");
await page.screenshot({ path: "artifacts/after-reset.png" });
});
```

Configure Playwright's Chromium launch options with `args: ["--enable-unsafe-webgpu"]`
and, if needed, an `executablePath` to a WebGPU-capable Chrome. Install the test
runner explicitly (`npm install -D @playwright/test`) and start your app's server
before `npx playwright test`. Replace the example's readiness marker, Reset control
and expected count with checks for your application. In this repository,
`node scripts/check-svelte.mjs --help` describes the reusable compile/inspect runner.

For continuous animation, inspection waits for work already requested rather than
waiting for playback to end. Keep the total timeout bounded, capture its animation
and completed-frame fields, and test particular time states by pausing or setting
the application's time control. A timeout is unresolved evidence, not success.

Visible application alerts within the inspection root are also reported. Native
HMPlot component errors retain their component names without the scene runtime.

Diagnostics have `severity`, `code`, `component`, `message` and optional `property`
and `hint`. For example, `check.timeout` means readiness or settling was not
established; it is not a passing check. An application-specific interaction that
was not verified remains unknown. In an agent evaluation where execution belongs
to the harness, submit the component and use the returned diagnostics/screenshots
for corrections instead of launching your own build.

Measure fresh-page startup separately from warmed interaction performance. Count
completed draws, not requestAnimationFrame callbacks, and measure input to the
draw containing that change. Browser profiles can share a shader cache, so a new
context alone does not establish cold shader compilation.
