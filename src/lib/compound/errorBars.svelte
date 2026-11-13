<script lang="ts">
  import { Segments, DataBoundary, DATA_CONTEXT, AXIS_NAMES_CONTEXT, ENDPOINT_COMPOUND_CONTEXT, MAPPING_CONTEXT, channelTitle } from "../plot/composition.js";
  import type { ErrorBarsProps } from "../plot/publicTypes.js";
  import { getContext, setContext } from "svelte";
  import TemplateHost from "../templates/TemplateHost.svelte";
  import definition from "./errorBars.js";
  // A template (./errorBars.js): the host expands it; this wrapper checks what the template
  // cannot say itself and titles the axes from the caller's columns, as the mark did.
  let own: ErrorBarsProps = $props();
  // An enclosing Mapping's positions and bounds place the bars, as they did the mark: its layers
  // fill what the caller leaves out (position, or x/y/z, as one).
  const mapping: any = getContext(MAPPING_CONTEXT);
  const bars = $derived.by(() => {
    const layers: Record<string, unknown>[] = mapping?.read() ?? [];
    if (!layers.length) return own;
    const given: Record<string, unknown> = {};
    for (const layer of layers) {
      if (layer.position !== undefined) for (const key of ["x", "y", "z"]) delete given[key];
      if (["x", "y", "z"].some((key) => layer[key] !== undefined)) delete given.position;
      for (const key of ["position", "x", "y", "z", "lower", "upper"]) if (layer[key] !== undefined) given[key] = layer[key];
    }
    if (["position", "x", "y", "z"].some((key) => own[key as keyof ErrorBarsProps] !== undefined)) for (const key of ["position", "x", "y", "z"]) delete given[key];
    for (const key of ["lower", "upper"]) if (own[key as keyof ErrorBarsProps] !== undefined) delete given[key];
    return { ...given, ...own } as ErrorBarsProps;
  });
  $effect.pre(() => {
    const { orientation, lower, upper } = bars;
    if (orientation != null && orientation !== "vertical" && orientation !== "horizontal")
      throw Error(`ErrorBars.orientation must be "vertical" or "horizontal", not ${JSON.stringify(orientation)}.`);
    if (lower === undefined || upper === undefined)
      throw Error(`ErrorBars needs both lower and upper: where each bar starts and ends, in its axis's units.`);
    const across = orientation === "horizontal" ? "y" : "x";
    if (bars.position === undefined && bars[across] === undefined)
      throw Error(`ErrorBars needs ${across} (or position): where each bar stands along the other axis.`);
  });
  // Axis titles: a bar's position axis takes its column's name, its value axis the one name its
  // y (or x), lower and upper share, if they do; a position array titles neither. Inside a
  // compound, the compound's names stand.
  const data: any = getContext(DATA_CONTEXT);
  if (!getContext(AXIS_NAMES_CONTEXT))
    setContext(AXIS_NAMES_CONTEXT, () => {
      if (bars.position !== undefined) return { x: null, y: null, z: null };
      let scope;
      try { scope = data?.read(); } catch { return {}; }
      const value = bars.orientation === "horizontal" ? "x" : "y";
      const vote = (axis: "x" | "y" | "z") => {
        let name: string | null | undefined;
        for (const channel of [bars[axis], ...(axis === value ? [bars.lower, bars.upper] : [])]) {
          const title = channelTitle(scope, channel);
          if (title === undefined) continue;
          if (title === null || (name !== undefined && name !== title)) return null;
          name = title;
        }
        return name;
      };
      return Object.fromEntries((["x", "y", "z"] as const).map((axis) => [axis, vote(axis)]).filter(([, name]) => name !== undefined));
    });
  // Bars given as arrays alone (no column names) read them from a table of their own, the mark
  // having had no Data scope to need: the template's bounds are expressions over its rows.
  const CHANNELS = ["position", "x", "y", "z", "lower", "upper"] as const;
  const hosted = $derived.by(() => {
    const values = CHANNELS.map((key) => bars[key]);
    const array = (value: unknown) => Array.isArray(value) || ArrayBuffer.isView(value) || (!!value && typeof value === "object" && "shape" in value);
    const bare = values.some(array) && values.every((value) => value === undefined || typeof value === "number" || array(value));
    if (!bare) return bars;
    const table: Record<string, unknown> = {}, renamed: Record<string, string> = {};
    CHANNELS.forEach((key, i) => {
      if (!array(values[i])) return;
      table[`__${key}`] = values[i];
      renamed[key] = `__${key}`;
    });
    // Positions as rows of numbers ([[x, y], ...]) are columns x, y (and z) of that table.
    const rows = bars.position;
    if (Array.isArray(rows) && rows.every(Array.isArray)) {
      delete table.__position;
      const { position, ...rest } = renamed;
      (["x", "y", "z"] as const).slice(0, (rows[0] as unknown[])?.length ?? 2).forEach((key, i) => {
        table[`__${key}`] = rows.map((row) => (row as unknown[])[i]);
        rest[key] = `__${key}`;
      });
      return { ...bars, position: undefined, ...rest, _table: table };
    }
    return { ...bars, ...renamed, _table: table };
  });
  // Connections: its Segments registers as an ErrorBars, which offers no endpoint yet (its
  // boundary intersections), as when it was a mark of its own.
  setContext(ENDPOINT_COMPOUND_CONTEXT, { kind: "ErrorBars", markKind: "Segments", name: () => bars.name, valueAxis: () => (bars.orientation === "horizontal" ? 0 : 1) });
  let host = $state<any>();
  export const getLegendSource = () => host?.getLegendSource();
  export const getMark = () => host?.getMark();
  export const whenSettled = () => host?.whenSettled();
  export const subscribeSettings = (listener: (values: Record<string, unknown>) => void) => host?.subscribeSettings(listener) ?? (() => {});
</script>

<TemplateHost {definition} parts={{ DataBoundary, Segments }} props={hosted} bind:this={host} />
