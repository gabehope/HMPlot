<script lang="ts">
  import { provideAnimationGroup } from "./utils/animationGroupContext.js";
  import { useReporter } from "./utils/reporter.js";
  import { notePageWarning } from "../checking/registry.js";
  import { getContext, setContext, onDestroy, tick, untrack } from "svelte";
  import { readTable } from "./utils/readback.js";
  import { DATA_CONTEXT, createDataScope } from "./utils/categorical.js";
  import { FORCE_CONTEXT } from "./utils/forceContext.js";
  import { rootScope } from "./utils/dataView.js";
  import { VIEW_CLOCK_CONTEXT } from "./utils/viewState.js";
  import { useViewServices } from "./utils/viewServices.js";
  import { pipelineSource, isPipelineReference } from "./utils/pipelineReference.js";
  import type { DataProps } from "./publicTypes.js";
  let {
    value = undefined,
    rows = undefined,
    key = undefined,
    schema = undefined,
    animationGroup = undefined,
    children,
  }: DataProps = $props();
  provideAnimationGroup(() => animationGroup);
  const scope = createDataScope();
  setContext(FORCE_CONTEXT, undefined);
  let error = $state("");
  // read() also runs inside descendants' $derived values and blocks (BoxPlot's orientation):
  // writing $state there is a Svelte error, so the message is written untracked, on change only.
  const showError = (message: string) => untrack(() => { if (error !== message) error = message; });
  onDestroy(() => scope.dispose());
  // value={handle} (TODO 142.3): a transform's live output, read where this Data is, not a copy
  // of it; the marks under it keep their visual parent (this Data's Plot or Frame). The source
  // is fixed: the first one it reads, until it unmounts.
  let fixed: any = null;
  const linked = () => {
    if (!isPipelineReference(value)) return null;
    const source = pipelineSource(value, "Data");
    // Fixed while its transform lives; a remounted one (a scene update) is the same reference.
    if (source && fixed && source !== fixed && fixed.alive)
      throw Error("Data: value references one pipeline output for the Data's life; make another Data for another output.");
    if (source) fixed = source;
    return source;
  };
  const referenced = $derived(isPipelineReference(value));
  // Its children draw once the output exists (as a transform's children do).
  const ready = $derived.by(() => {
    if (!referenced) return true;
    try { return linked()?.current() != null; } catch (reason) { showError(reason?.message ?? String(reason)); return false; }
  });
  // A view drawing the output shares the pipeline's clock and pointer (TODO 142.5), as a view
  // under it would: a Data inside a Plot binds that Plot's view; views under a Data outside
  // every Plot adopt through it. An output read by views with different clocks is an error the
  // pipeline reports, never a guess.
  const viewServices = useViewServices(), outerClock: any = getContext(VIEW_CLOCK_CONTEXT);
  $effect(() => {
    if (!referenced || !viewServices) return;
    try { return linked()?.adopt?.(viewServices); } catch { return undefined; }
  });
  if (!viewServices)
    setContext(VIEW_CLOCK_CONTEXT, {
      adopt(view: any) {
        const stops = [untrack(() => { try { return linked()?.adopt?.(view); } catch { return undefined; } }), outerClock?.adopt(view)];
        return () => stops.forEach((stop) => stop?.());
      },
    });
  const provider = {
    read() {
      const source = linked();
      if (source) {
        const result = source.read();
        showError("");
        return result;
      }
      if (isPipelineReference(value)) throw Error("Data: the referenced pipeline is not mounted.");
      try {
        scope.setKey(key);
        const started = performance.now();
        scope.update(value, schema, { rows });
        noteSlowRead(performance.now() - started);
        showError("");
      } catch (reason) {
        // Keep the last complete scope published while making a failed table
        // replacement visible to the application. Descendants can therefore
        // continue rendering their prior frame instead of disappearing.
        showError(reason?.message ?? String(reason));
      }
      return scope;
    },
    domainSource() {
      return linked()?.domainSource?.() ?? null;
    },
    /** Whether the referenced pipeline has a run in flight (reactive; a table of its own never does). */
    upstreamPending() {
      try { return Boolean(linked()?.upstreamPending?.()); } catch { return false; }
    },
  };
  setContext(DATA_CONTEXT, provider);
  /**
   * Its table's rows on the host (TODO 145.1): `{ length, version, columns }` (`rows` with
   * `{ rows: true }`); a referenced pipeline's output once it has run.
   */
  export async function read(options: { columns?: string[]; rows?: boolean } = {}) {
    await tick();
    const source = linked();
    if (source) await source.whenSettled?.();
    else if (isPipelineReference(value)) throw Error("Data: the referenced pipeline is not mounted.");
    const table: any = provider.read();
    if (error) throw Error(`Data: ${error}`);
    const release = table.retain?.();
    try {
      return await readTable(table, { ...options, component: "Data" });
    } finally {
      release?.();
    }
  }
  // The table: a referenced output's source table's (its interaction state is that table's).
  const table = (): any => (linked() ? rootScope(linked().read()) : scope);
  export const getSelection = () => table().identity.selection;
  export const getBrush = () => table().identity.brush;
  export const getHover = () => table().identity.hover;
  /** The table's offsets (TODO 38): per-row deltas views read through offset() and moved(). */
  export const getOffsets = () => table().identity.offsets;
  export const resetOffsets = (columns: string | string[] | undefined = undefined) => { table().identity.offsets.clear(columns); };
  /** The table with its dragged columns replaced by their moved values; `value` is unchanged. */
  export const applyOffsets = () => table().applyOffsets();
  // Its error is a diagnostic of its scene node too (TODO 136.6, utils/reporter.js).
  const reportError = useReporter("Data");
  $effect(() => reportError(error));
  // Reading a table that slowly (2026-10-23: a million rows in deep $state took minutes, every
  // element read through Svelte's proxy) is worth saying, with the usual causes.
  const reportSlow = useReporter("Data", { severity: "warning" });
  let warnedSlow = false;
  function noteSlowRead(ms: number) {
    if (ms < 1000 || warnedSlow) return;
    warnedSlow = true;
    const message = `Data: reading the table took ${(ms / 1000).toFixed(1)} s. A large table in $state is proxied by Svelte and read element by element; hold it in $state.raw, as columns of typed arrays (Float64Array), or an Arrow table, not an array of row objects.`;
    console.warn(message);
    notePageWarning(slowOwner, message);
    queueMicrotask(() => reportSlow(message));
  }
  const slowOwner = {};
  onDestroy(() => notePageWarning(slowOwner, null));
</script>

<!-- A reference bound after mount (bind:this resolves after its first render) remounts the
     children over it rather than leave them on the empty table. -->
{#key referenced}{#if ready}{@render children?.()}{/if}{/key}
{#if error}<p class="data-error" role="alert">{error}</p>{/if}

<style>
  .data-error {
    margin: 4px 0;
    color: #a32b30;
    font: 12px/1.35 system-ui, sans-serif;
  }
</style>
