# Svelte web visualization workflow

Read `hmplot-docs/docs/web-authoring.md` (the site: `/docs/web-authoring`) for the six
core concepts, data repetition, SVG/D3 equivalents, HTML integration and checking.
Then read only the Svelte reference pages for the components the task needs:
`hmplot-docs/reference/svelte/<name>.md`. Search `llms.txt` to locate them.

Before drawing, inspect every supplied data file and its real field names. Use
those rows; fix a failed import or decoder instead of substituting synthetic
data. The guide shows offline CSV (`?raw`) and Parquet (`?url` plus fetched bytes)
recipes for standalone builds. Numeric CSV fields need explicit conversion.

- Hold data tables in `$state.raw` (or a plain `let` assigned once), never `$state`: Svelte
  deep-proxies `$state`, and HMPlot then reads a million-row table element by element, for
  minutes. Columns of typed arrays (`Float64Array.from(...)`) are fastest.
- Plots placed with your own HTML or CSS do not line up their plot areas: a wider y label
  shifts one chart's frame. Stack plots that share an x axis in `Panels` (one shared x, plot
  areas aligned); link separate plots' domains with `LinkViews`. A Python `Row`/`Column` aligns
  its plots; Svelte has no layout component yet.
- One mark usually draws all rows; use `series` for independent paths. Use Svelte
  loops for independently configured components, not one component per data row.
- Import core components from `hmplot`, chart patterns from `hmplot/charts`, and
  statistical patterns from `hmplot/stats`. Use `Points` for scatter symbols.
- Use expression functions, not JavaScript arithmetic/comparison operators on
  expressions. Explicit `col()` and `literal()` avoid column/literal ambiguity.
- A mark's `data` prop is a channel, not a table. For different tables in one
  plot, wrap each mark in its own `<Data value={table}>`; check that every mark
  field exists in that nearest Data scope.
- Choose filter placement relative to aggregation deliberately. Stable Data keys,
  animationGroup and cross-table selection keys solve different correspondence problems.
- `Group` always outputs `count`; do not redefine it in `columns`. Name an
  additional reduction differently, for example `flights: count()`.
- Declare reassigned Svelte 5 state with `let selected = $state(null)`, not
  `const`. Check each mark's required columns in its own Data scope.
- Use Html for small native DOM attachments; its numeric 2D anchor follows the
  displayed frame. It is omitted from plot exports. Do not infer full SVG support.
- Compile with svelte-check; inspect mounted plots with `hmplot/check`; save
  screenshots at DPR 2 and verify the meaning of each interaction. A screenshot
  changing is not proof that the right rows were selected or aggregated.
- When an evaluation harness owns execution, submit the requested component and
  correct it using the diagnostics and screenshots returned by that harness.

## Linked views stay in the plot

A brush, a hover or a click is a column (`@brushed`, `@hovered`, `@selected`) that Filter,
Group and `respond` read on the GPU. Keep the rows in a Data and the interaction in the marks;
code that filters rows itself and passes new tables on every pointer move is slower than SVG.

```svelte
<script>
  import { Data, Filter, Group, Join, Plot, Segments, Title, TableView, Sort, count, mean } from "hmplot";
  import { Histogram } from "hmplot/charts";
  let { flights, routes } = $props();
  let stats = $state();
</script>

<Data value={flights}>
  <!-- A plain drag brushes (interactive="brush"); the Filter keeps the brushed rows. -->
  <Plot interactive="brush"><Histogram x="dep_hour" bins={24} brush={{ axis: "x" }} /></Plot>
  <Filter where="@brushed" inactive="all">
    <!-- Its kept rows: every row until a brush, then the brushed ones. -->
    <Title text={["Flights: ", count()]} />
    <!-- Statistics of the brushed rows, for marks anywhere (bind:this, then a reference). -->
    <Group bind:this={stats} by="route" columns={{ flights: count(), delay: mean("delay") }}>
      <Sort by="flights" order="desc"><TableView columns={["route", "flights"]} limit={10} /></Sort>
    </Group>
  </Filter>
</Data>
{#if stats}
  <Plot data={routes}>
    <Join data={stats} on="route" fields={["flights", "delay"]}>
      <Segments start="start" end="end" width="flights" color="delay" />
    </Join>
  </Plot>
{/if}
```

- **A click sets one value**, read anywhere in the InputContext: a drill-down's root, a
  focused series. With `const root = input("root", { default: "all" })`, `select={root.set("id")}`
  on a mark writes the clicked row's `id`; a click on nothing restores the default.
  `hover={focus.set("series")}` writes while the pointer is on a row. `<Button label="Top"
  set={root.reset()} />` goes back; a Select named `root` shows and edits the same value.
  `<Treemap root={root} levels={1}>` drills on it. No `onclick` and `$state` needed.
- **A value in your own code** (a breadcrumb, a sentence): `subscribe` to the handle, then
  `const { columns } = await handle.read()`. Once per change of the output, not per move.
- **Your code decides the rows**: `dataHandle.getSelection().replace([3, 5, 6])` selects them
  without new tables, and every mark with `respond="selected"` follows on the GPU.
- Points, Lines and the other marks take `brush`, `hover`, `select`, `tooltip` and `respond`;
  a drag in a plot with `interactive={false}` or `interactive="brush"` brushes without Shift.

The guide contains small independent examples. Evaluation reference solutions are
not part of this guidance.
