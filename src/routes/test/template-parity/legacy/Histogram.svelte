<script>
  // A copy of the hand-written Histogram before it became a template (TODO 130.3), for parity.
  import { Transform, Rect, Points, Undescribed, DataBoundary, ThemeDefaults, getOptionsContext, setOptionsContext, IntegerType, SelectType, FieldType, ENDPOINT_COMPOUND_CONTEXT, endpointDescriptor, DATA_CONTEXT, AXIS_NAMES_CONTEXT, channelTitle, INPUT_CONTEXT, InputPending, resolveInput } from "$lib/plot/composition.js";
  import { untrack, onDestroy, tick, setContext, getContext } from "svelte";
  let {
    x = undefined,
    y = undefined,
    bins = $bindable(30),
    normalization = $bindable("count"),
    name = undefined,
    brush = undefined,
    ...props
  } = $props();
  const options = getOptionsContext().splitUnique(
    untrack(() => name),
    "group",
    "Histogram",
  );
  setOptionsContext(options);
  options.ensure(
    "histogramBins",
    new FieldType({ defaultValue: 30, ui: { ui: "text" } }),
  );
  options.ensure(
    "histogramNormalization",
    new SelectType({
      defaultValue: "count",
      options: ["count", "proportion", "density"],
    }),
  );
  options.setDisplayList(["histogramBins", "histogramNormalization"]);
  const b = options.store("histogramBins"),
    n = options.store("histogramNormalization");
  // The settings pane edits bins as text: a whole number is a count and a comma-separated
  // list of numbers is explicit edges. Rule names and expressions pass through unchanged
  // (the pane shows an expression read-only).
  const binsValue = (value) => {
    if (typeof value !== "string") return value;
    const text = value.trim();
    if (/^\d+$/.test(text)) return Number(text);
    const parts = text.split(",").map((part) => part.trim());
    return parts.length > 1 && parts.every((part) => part !== "" && Number.isFinite(Number(part)))
      ? parts.map(Number)
      : text;
  };
  // Input reads (TODO 41.5): bins={input("bins")}, normalization={input("norm")} and x="$metric"
  // take the inputs' values; a pending input leaves the last values in place until it is known.
  const inputStore = getContext(INPUT_CONTEXT) ?? null;
  const read = (value, key, strings = false) => {
    try {
      return resolveInput(value, inputStore, `Histogram.${key}`, strings);
    } catch (error) {
      if (error instanceof InputPending) return undefined;
      throw error;
    }
  };
  $effect(() => {
    const nextBins = read(bins, "bins"), nextNormalization = read(normalization, "normalization");
    if (nextBins !== undefined) options.set("histogramBins", nextBins);
    if (nextNormalization !== undefined && !["count", "proportion", "density"].includes(nextNormalization))
      throw Error(`Histogram normalization is "count", "proportion" or "density"; received ${JSON.stringify(nextNormalization)}.`);
    if (nextNormalization !== undefined) options.set("histogramNormalization", nextNormalization);
  });
  let handle = $state(),
    mark = $state();
  const axis = $derived(x === undefined ? "y" : "x");
  const input = $derived(x === undefined ? read(y, "y", true) : read(x, "x", true));
  const direct = $derived(
    typeof input === "string" ? undefined : { __histogramValue: input },
  );
  const config = $derived({
    [axis]: typeof input === "string" ? input : "__histogramValue",
  });
  $effect(() => {
    if ((x === undefined) === (y === undefined))
      throw Error("Histogram requires exactly one of x or y.");
  });
  export const subscribe = (f) => handle?.subscribe(f);
  export const whenSettled = () => handle?.whenSettled();
  export const update = async (patch) => {
    if (patch.bins !== undefined) bins = patch.bins;
    if (patch.normalization !== undefined) normalization = patch.normalization;
    await tick();
    await handle?.whenSettled();
  };
  export const getLegendSource = () => mark?.getLegendSource();
  export const getMark = () => mark?.getMark();
  onDestroy(() => options.dispose());
  // Connections: the Rect registers as this Histogram's endpoint; bars rise along the value axis.
  setContext(ENDPOINT_COMPOUND_CONTEXT, {
    kind: "Histogram", markKind: "Rect", name: () => name, valueAxis: () => (axis === "x" ? 1 : 0),
  });
  // Axis titles: the binned column along its axis, the normalization (count, proportion or
  // density) along the other.
  const outer = getContext(DATA_CONTEXT);
  setContext(AXIS_NAMES_CONTEXT, () => {
    let scope;
    try { scope = outer?.read(); } catch { return {}; }
    return { [axis]: channelTitle(scope, input), [axis === "x" ? "y" : "x"]: $n };
  });
  const self = { getMark };
  /** This Histogram as a connection endpoint: `at` is "center", an edge, "value" or "baseline". */
  export const endpoint = (config = {}) =>
    endpointDescriptor({ handle: self, at: config.at, kind: "Histogram" });
</script>

<ThemeDefaults kind="Histogram"><DataBoundary data={direct}
  ><!-- brush (eval 2026-10-13: crossfilters brush histograms): the bins are not the rows, so an
    invisible part plots the binned column over the rows themselves and carries the brush, along
    the binned axis. Its constraint is on that column: @brushed and Filter(where=...) select the
    rows in every view, and the bins respond to it as any mark does. -->
  {#if brush !== undefined && brush !== false}<Undescribed>{#if axis === "x"}<Points x={config.x} y={0} size={0} opacity={0}
      legend={false} tooltip={false} brush={brush === true ? { axis: "x" } : { axis: "x", ...brush }} respond={false} />
    {:else}<Points x={0} y={config.y} size={0} opacity={0}
      legend={false} tooltip={false} brush={brush === true ? { axis: "y" } : { axis: "y", ...brush }} respond={false} />{/if}</Undescribed>{/if}
  <Transform
    bind:this={handle}
    kind="Bin"
    {...config}
    {name}
    bins={binsValue($b)}
    normalization={$n}
  >
    <!-- Bin's normalization gives the bars' ends along the other axis too, so one Rect draws
      both orientations. -->
    <Rect bind:this={mark} x0="x0" x1="x1" y0="y0" y1="y1" {...props} />
  </Transform></DataBoundary></ThemeDefaults>
