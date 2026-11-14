# hmplot/check

Inspect mounted Svelte plots for readiness, diagnostics and export omissions.

JavaScript only.

## Example

```svelte
import { inspect } from "hmplot/check";
const report = await inspect({ timeout: 30000 });
```

## Members

### InspectionOptions

- `root` (`ParentNode`): Document, plot container or application subtree. Defaults to document.
- `timeout` (`number`): Total readiness/settling budget in milliseconds; defaults to 30000.

### PlotInspection

- `title` (`string`): Required.
- `description` (`string`): Required.
- `ready` (`boolean`): Required.
- `completed_frame` (`number`): Required.
- `pending_preparations` (`number`): Required.
- `model` (`unknown`): Required.
- `animation` (`unknown`): Required.
- `work` (`{ markPreparations: number; transformRuns: Record<string, number>; }`): What the plot did to get here (2026-10-22): mark preparations and transform runs by cause. Required.
- `diagnostics` (`Diagnostic[]`): Required.
- `export_omissions` (`string[]`): Required.

### InspectionReport

- `schema` (`1`): Required.
- `ready` (`boolean`): Required.
- `plots` (`PlotInspection[]`): Required.
- `errors` (`Diagnostic[]`): Required.
- `warnings` (`Diagnostic[]`): Required.
- `lints` (`Diagnostic[]`): Required.

### Exports

- `inspect` (`(options?: InspectionOptions) => Promise<InspectionReport>`): Wait for completed draws and collect serializable diagnostics; screenshots and interaction assertions belong to the caller.

`inspect()` checks mounted Svelte plots. Import it explicitly in browser tests;
HMPlot installs no global testing hook. It returns an `InspectionReport` containing
`PlotInspection` records and structured errors, warnings and lints. `InspectionOptions`
selects a DOM root and a total timeout, defaulting to 30 seconds.

Wait for application data to finish loading before calling it. Inspection waits
for mounted plots' first visible draws, then the work already started by each plot.
An ongoing animation does not need to finish. A timeout is reported as an error,
never as successful settling. Visible application alerts in the inspection root are included as errors.
Reports include mark summaries and axis descriptions
in `model`, completed-frame counters, pending preparations and export omissions.

```js
import { inspect } from "hmplot/check";
const report = await inspect({ root: document.querySelector("main") });
console.log(JSON.stringify(report));
```

For Playwright, expose the imported function from a test-only application entry
point, then use `await page.evaluate(() => window.inspectPlot())`. Save its JSON
and a `page.screenshot()` at device pixel ratio 2. Check values, exported geometry,
or DOM after interactions; a changed screenshot alone does not establish correct
selection, aggregation, or filtering. See the web authoring guide for a complete
checking workflow.
