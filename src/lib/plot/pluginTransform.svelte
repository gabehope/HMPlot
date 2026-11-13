<script lang="ts">
  import { getContext, onDestroy, tick, untrack } from "svelte";
  import RowTransform from "./transform.svelte";
  import GraphTransform from "./graphTransform.svelte";
  import { plugins } from "./plugins/runtime.js";
  import { definitions } from "./utils/transforms/index.js";
  import { useReporter, currentSceneNode } from "./utils/reporter.js";
  import { statusChannel } from "./utils/componentStatus.svelte.js";
  import type { TransformStatus } from "./publicTypes.js";
  import type { TransformProps } from "./publicTypes.js";
  import { getOptionsContext, setOptionsContext } from "./utils/context.js";
  import { DATA_CONTEXT } from "./utils/categorical.js";
  import { transformGrid } from "./plugins/transformGrid.js";
  import { pluginSettings } from "./plugins/settings.js";

  let { children, kind, params = {}, name, by, as }: TransformProps = $props();
  let registered = $state(0),
    handle = $state<any>();
  let effective = $state.raw<Record<string, unknown>>({});
  const listeners = new Set<
    (values: { params: Record<string, unknown> }) => void
  >();
  const options = (() => {
    try {
      return getOptionsContext();
    } catch {
      return null;
    }
  })();
  const settings =
    options &&
    pluginSettings(
      options,
      untrack(() => name),
      untrack(() => kind),
      (values) => {
        effective = values;
      },
    );
  if (settings) setOptionsContext(settings.node);
  onDestroy(() => settings?.dispose());
  let status = $state<TransformStatus>({
    kind: untrack(() => kind),
    pending: true,
    error: "",
    mounted: true,
  });
  export const { subscribe } = statusChannel(() => status);
  $effect(() => {
    const child = handle;
    if (child?.subscribe)
      return child.subscribe((value: TransformStatus) => {
        status = value;
      });
    status = { kind, pending: Boolean(stage), error: "", mounted: true };
  });
  const source: any = getContext(DATA_CONTEXT);
  onDestroy(plugins.subscribe(() => registered++));
  const stage = $derived.by(() => {
    registered;
    if (plugins.get("layout", kind)) return "layout";
    if (plugins.get("transform", kind) || definitions.has(kind))
      return "transform";
    return null;
  });
  const layoutParams = $derived({
    ...effective,
    ...(by === undefined ? {} : { by }),
    ...(as === undefined ? {} : { as }),
  });
  $effect.pre(() => {
    registered;
    const definition = plugins.get(stage, kind);
    const scope = source?.read?.();
    const grid = Boolean(scope && transformGrid(scope));
    const values = params;
    untrack(() => {
      effective = settings
        ? settings.configure(kind, definition?.parameters, grid, values)
        : values;
    });
  });
  export function subscribeSettings(
    listener: (values: { params: Record<string, unknown> }) => void,
  ) {
    listeners.add(listener);
    listener({ params: untrack(() => effective) });
    return () => listeners.delete(listener);
  }
  $effect(() => {
    const values = effective;
    const timer = setTimeout(() => {
      for (const listener of listeners) listener({ params: values });
    }, 100);
    return () => clearTimeout(timer);
  });
  const report = useReporter("Transform", { severity: "warning" });
  const scene = currentSceneNode();
  $effect(() => {
    const missing = stage ? null : plugins.missing("transform", kind);
    report(missing);
    if (missing && !scene) console.warn(missing.message);
  });
  export async function whenSettled() {
    await tick();
    await handle?.whenSettled();
  }
  /** Its output as a data source (TODO 142.3): <Data value={handle}>. */
  export const dataSource = () => handle?.dataSource?.();
  /** Its output's rows on the host (TODO 145.1): `{ length, version, columns }`, after it settles. */
  export const read = (options) => handle.read(options);
</script>

{#key kind}
  {#if stage === "layout"}
    <GraphTransform bind:this={handle} {kind} params={layoutParams}
      >{@render children?.()}</GraphTransform
    >
  {:else if stage === "transform"}
    <RowTransform bind:this={handle} {...effective} {kind} {name} {by} {as}
      >{@render children?.()}</RowTransform
    >
  {:else}
    {@render children?.()}
  {/if}
{/key}
