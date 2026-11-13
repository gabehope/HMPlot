<script lang="ts">
  // TableView (TODO 145.4): the rows of the data around it as an HTML table, live: a Group's groups,
  // a Sort's top rows, a Filter's kept rows, a layout's nodes. For lists and readouts a page
  // shows beside its plots (the top ten under a brush, the values at a hovered date); rows of
  // text in the DOM cannot be composed from GPU marks, as Html's cannot. Its rows are read back
  // (limit of them, sliced on the GPU) when the data publishes, never per pointer move. A click
  // or a hover on a row writes a selection or an input, as a mark's does.
  import { getContext, onDestroy, untrack } from "svelte";
  import { DATA_CONTEXT } from "./utils/categorical.js";
  import { INPUT_CONTEXT } from "./utils/inputs.js";
  import { VIEW_CONTEXT } from "./utils/axisFrame.js";
  import { readTable } from "./utils/readback.js";
  import { formatValue } from "./utils/tooltip.js";
  import { interactionRows } from "./utils/interaction.js";
  import { inputWriter, createInputWriters, writerValue, RESET } from "./utils/inputWriters.js";
  import { controlTheme } from "./utils/controlTheme.svelte.js";
  import { useReporter } from "./utils/reporter.js";
  import type { TableViewProps } from "./publicTypes.js";
  let { columns = undefined, limit = 100, title = undefined, select = undefined, hover = undefined, name = undefined }: TableViewProps = $props();
  const parent: any = getContext(DATA_CONTEXT);
  if (!parent) throw Error("TableView needs data around it: put it inside a Data, a transform (a Group, a Sort, ...) or a GraphData's Nodes.");
  if (getContext(VIEW_CONTEXT)) throw Error("TableView is inside a Plot; put it in a Row beside the Plot, inside the same Data.");
  const inputs: any = getContext(INPUT_CONTEXT) ?? null;
  const controls = controlTheme();
  type Field = { field: string; label?: string; format?: string };
  const fieldsOf = (given: TableViewProps["columns"], scope: any): Field[] => {
    if (given === undefined)
      return scope.keys().filter((key: string) => !key.startsWith("@") && !key.startsWith("__")).map((field: string) => ({ field }));
    if (!Array.isArray(given)) throw Error("TableView columns: a list of column names, or of { field, label, format }.");
    return given.map((entry) => {
      // A name, or { field, label, format }; a column node (col("x")) names its column.
      const item = entry as any;
      const field = typeof item === "string" ? item : item?.op === "col" ? item.args?.[0] : item?.field;
      if (typeof field !== "string" || !field) throw Error(`TableView columns: each entry names a column, as a string or { field }; received ${JSON.stringify(item)}.`);
      return typeof item === "string" || item?.op === "col" ? { field } : { field, label: item.label, format: item.format };
    });
  };
  // The rows shown and the scope they were read from, held until the next one replaces it, so a
  // click maps its row to the scope's source rows.
  let shown = $state.raw<{ fields: Field[]; table: any; scope: any } | null>(null), error = $state(""), reading = $state(0);
  // Busy while a transform above has a run in flight or the rows are being read: hmplot/check
  // waits for it, as it waits for a plot to settle.
  const busy = $derived(reading > 0 || Boolean(parent.upstreamPending?.()));
  let held: (() => void) | undefined;
  const hold = (scope: any) => { held?.(); held = scope.retain?.(); };
  onDestroy(() => held?.());
  const selectWriter = $derived(inputWriter(select, "TableView", "select"));
  const hoverWriter = $derived(inputWriter(hover, "TableView", "hover"));
  $effect(() => {
    let scope: any;
    try {
      scope = parent.read();
      scope.version;
    } catch (reason: any) {
      error = /preparing/.test(reason?.message ?? "") ? "" : (reason?.message ?? String(reason));
      return;
    }
    let fields: Field[], read: string[];
    try {
      fields = fieldsOf(columns, scope);
      if (!(Number.isInteger(limit) && limit >= 0)) throw Error("TableView limit: a whole number of rows, 0 or more.");
      // A writer's column is read too, so a click writes its value without another readback.
      read = [...new Set([...fields.map((f) => f.field), ...[selectWriter, hoverWriter].flatMap((w) => (w?.column ? [w.column] : []))])];
    } catch (reason: any) {
      error = reason.message;
      return;
    }
    const release = scope.retain?.();
    let canceled = false;
    untrack(() => reading++);
    readTable(scope, { columns: read, limit, component: "TableView" })
      .then((table) => {
        if (canceled) return;
        hold(scope);
        shown = { fields, table, scope };
        error = "";
      }, (reason) => { if (!canceled) error = reason?.message ?? String(reason); })
      .finally(() => { release?.(); reading--; });
    return () => { canceled = true; };
  });
  // select and hover (TODO 145.2): selections, or inputs a click or a hover writes. Writers are
  // registered as the props name them and released as they change or go (utils/inputWriters.js),
  // which also gives the selection resources the props name otherwise.
  const writers = createInputWriters(inputs, "TableView");
  let interaction = $state.raw<any>(null);
  $effect(() => {
    const scope = shown?.scope, props = { select, hover };
    if (!scope) return;
    untrack(() => {
      try {
        interaction = writers.prepare(props, scope);
      } catch (reason: any) {
        interaction = null;
        error = reason.message;
      }
    });
  });
  // A hover on a selection reads its row's source rows asynchronously: a newer enter, a leave,
  // new rows and the component's end each supersede a read in flight.
  let hovering = 0;
  $effect(() => {
    shown;
    untrack(() => hovering++);
  });
  onDestroy(() => {
    hovering++;
    interaction?.hoverState?.cancelPreview(shown?.scope.identity);
  });
  async function click(row: number, event: MouseEvent) {
    const at = shown, state = interaction;
    if (!at || !state) return;
    if (state.select && inputs) {
      const writer = state.select, value = writerValue(writer, (column) => at.table.columns[column][row]);
      if (value === RESET) return inputs.reset(writer.name);
      // The row the input holds already: a second click restores its default.
      let current: unknown;
      try { current = inputs.read(writer.name, "TableView.select"); } catch { current = undefined; }
      const same = current instanceof Date && value instanceof Date ? current.getTime() === value.getTime() : Object.is(current, value);
      if (same) inputs.reset(writer.name);
      else inputs.commit(writer.name, value);
      return;
    }
    const selection = state.selectState;
    if (!selection) return;
    const owner = at.scope.identity, rows = await interactionRows(at.scope, [row]);
    if (shown !== at) return; // the rows changed while their source rows were read
    if (event.shiftKey || event.metaKey || event.ctrlKey) selection.toggle(owner, rows);
    else {
      const current = selection.rows(owner);
      if (rows.length && current.size === rows.length && rows.every((r) => current.has(r))) selection.clear(owner);
      else selection.replace(owner, rows);
    }
  }
  async function enter(row: number) {
    const at = shown, state = interaction, token = ++hovering;
    if (!at || !state) return;
    if (state.hover && inputs) return inputs.preview(state.hover.name, writerValue(state.hover, (column) => at.table.columns[column][row]), writers.owners.hover);
    if (!state.hoverState) return;
    const rows = await interactionRows(at.scope, [row]);
    if (token !== hovering) return;
    state.hoverState.replace(at.scope.identity, rows, { phase: "preview" });
  }
  function leave() {
    hovering++;
    const state = interaction;
    if (state?.hover && inputs) return inputs.endPreview(state.hover.name, writers.owners.hover);
    state?.hoverState?.cancelPreview(shown?.scope.identity);
  }
  const interactive = $derived(Boolean(select || hover));
  const cell = (field: Field, value: unknown) => {
    const meta = shown?.scope.metadata?.(field.field);
    if (value instanceof Date)
      return formatValue(value.getTime(), { type: "datetime", origin: 0, timezone: meta?.timezone ?? "UTC" }, field.format);
    return formatValue(value, meta?.type === "datetime" ? undefined : meta, field.format);
  };
  const count = $derived(shown ? Math.min(shown.table.length, limit) : 0);
  const reportError = useReporter("TableView");
  $effect(() => reportError(error));
</script>

<figure class="hm-table" style={controls.style} data-hmplot-table data-name={name} aria-busy={busy}>
  {#if title}<figcaption>{title}</figcaption>{/if}
  {#if error}<p class="hm-table-error" role="alert">TableView: {error}</p>
  {:else if shown}
    <table>
      <thead><tr>{#each shown.fields as field}<th scope="col">{field.label ?? field.field}</th>{/each}</tr></thead>
      <tbody>
        {#each { length: count } as _, row (row)}
          <tr
            class:hm-table-row={interactive}
            tabindex={select ? 0 : undefined}
            onclick={(event) => click(row, event)}
            onkeydown={(event) => { if (select && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); click(row, event as unknown as MouseEvent); } }}
            onpointerenter={() => hover && enter(row)}
            onpointerleave={() => hover && leave()}
          >{#each shown.fields as field}<td class:hm-number={typeof shown.table.columns[field.field][row] === "number"}>{cell(field, shown.table.columns[field.field][row])}</td>{/each}</tr>
        {/each}
      </tbody>
    </table>
    {#if shown.table.length > count}<p class="hm-table-more">{shown.table.length - count} more {shown.table.length - count === 1 ? "row" : "rows"}</p>{/if}
    {#if !count}<p class="hm-table-more">No rows</p>{/if}
  {/if}
</figure>

<style>
  .hm-table { margin: 0; font: var(--hm-control-font, 13px system-ui, sans-serif); color: var(--hm-control-color, inherit); }
  figcaption { font-weight: 600; margin: 0 0 6px; }
  table { border-collapse: collapse; width: 100%; }
  th { text-align: left; font-weight: 600; border-bottom: 1px solid var(--hm-control-border, #c9d2dd); padding: 4px 8px; }
  td { padding: 3px 8px; border-bottom: 1px solid var(--hm-control-rule, #eef1f4); }
  td.hm-number { text-align: right; font-variant-numeric: tabular-nums; }
  tr.hm-table-row { cursor: pointer; }
  tr.hm-table-row:hover, tr.hm-table-row:focus-visible { background: var(--hm-control-hover, #f1f4f7); outline: none; }
  .hm-table-more { margin: 6px 0 0; opacity: 0.7; }
  .hm-table-error { color: #a32b30; margin: 4px 0; }
</style>
