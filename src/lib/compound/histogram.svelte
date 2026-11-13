<script>
  import { Transform, Rect, Points, Undescribed, DataBoundary, INPUT_CONTEXT, InputPending, resolveInput, DATA_CONTEXT, AXIS_NAMES_CONTEXT, channelTitle } from "../plot/composition.js";
  import { getContext, setContext, tick } from "svelte";
  import TemplateHost from "../templates/TemplateHost.svelte";
  import definition from "./histogram.js";
  // A template (./histogram.js): the host expands it; this wrapper reads the caller's inputs, an
  // array given as the column, and the brush's axis, and gives it its parts and handle.
  let {
    x = undefined,
    y = undefined,
    bins = $bindable(undefined),
    normalization = $bindable(undefined),
    brush = undefined,
    ...props
  } = $props();
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
  $effect.pre(() => {
    if ((x === undefined) === (y === undefined))
      throw Error("Histogram requires exactly one of x or y.");
  });
  const axis = $derived(x === undefined ? "y" : "x");
  const input = $derived(x === undefined ? read(y, "y", true) : read(x, "x", true));
  // An array as the column: the values become a column of the Histogram's own data.
  const direct = $derived(typeof input === "string" ? undefined : { __histogramValue: input });
  const column = $derived(typeof input === "string" ? input : "__histogramValue");
  const resolvedNormalization = $derived(read(normalization, "normalization"));
  $effect.pre(() => {
    if (resolvedNormalization !== undefined && !["count", "proportion", "density"].includes(resolvedNormalization))
      throw Error(`Histogram normalization is "count", "proportion" or "density"; received ${JSON.stringify(resolvedNormalization)}.`);
  });
  const hosted = $derived({
    ...props,
    [axis]: column,
    bins: read(bins, "bins"),
    normalization: resolvedNormalization,
    brush: brush === undefined || brush === false ? undefined : { axis, ...(brush === true ? {} : brush) },
  });
  let host = $state();
  // An array's axis title is its name (a named Series), the other axis its normalization; a
  // column names its own.
  const outer = getContext(DATA_CONTEXT);
  setContext(AXIS_NAMES_CONTEXT, () => {
    if (typeof input === "string") return undefined;
    let scope;
    try { scope = outer?.read(); } catch { return undefined; }
    return { [axis]: channelTitle(scope, input), [axis === "x" ? "y" : "x"]: host?.parameter("normalization") };
  });
  export const subscribe = (f) => host?.part("bins")?.subscribe(f);
  export const whenSettled = () => host?.whenSettled();
  export const update = async (patch) => {
    if (patch.bins !== undefined) bins = patch.bins;
    if (patch.normalization !== undefined) normalization = patch.normalization;
    await tick();
    await host?.whenSettled();
  };
  export const getLegendSource = () => host?.getLegendSource();
  export const getMark = () => host?.getMark();
  export const subscribeSettings = (listener) => host?.subscribeSettings(listener) ?? (() => {});
  /** This Histogram as a connection endpoint: `at` is "center", an edge, "value" or "baseline". */
  export const endpoint = (config = {}) => host.endpointOf(config);
</script>

<DataBoundary data={direct}>
  <TemplateHost {definition} parts={{ DataBoundary, Undescribed, Points, Transform, Rect }} props={hosted} bind:this={host} />
</DataBoundary>
