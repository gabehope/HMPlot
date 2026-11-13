<script>
  // Records what the enclosing Data scope publishes: its length, a column's values, and how
  // many views have arrived (one per transform run).
  import { getContext } from "svelte";
  import { DATA_CONTEXT } from "$lib/plot/utils/categorical.js";
  let { name, probes, column = undefined } = $props();
  const context = getContext(DATA_CONTEXT);
  // One probe per Facet cell when it sits in one: `cells` keeps each instance's length.
  const instance = Symbol();
  $effect(() => {
    let view;
    try { view = context.read(); } catch { return; }
    const entry = (probes[name] ??= { runs: 0, cells: new Map() });
    entry.runs++;
    entry.length = view.length;
    entry.cells.set(instance, view.length);
    entry.live = view.live;
    if (column) {
      const values = view.get(column);
      (values?.ref ? values.ref.data() : Promise.resolve(values)).then((data) => { entry.values = Array.from(data); });
    }
  });
</script>
