<script lang="ts">
  // Provider (TODO 20): data loaded asynchronously from explicit reactive params, published to
  // its children as an ordinary data scope. docs/PROVIDERS.md has the lifecycle.
  import { INPUT_CONTEXT, resolveInput } from "./utils/inputs.js";
  import { getContext, setContext, onDestroy, onMount, tick, untrack } from "svelte";
  import type { Snippet } from "svelte";
  import { useThrelte } from "@threlte/core";
  import { DATA_CONTEXT, createDataScope } from "./utils/categorical.js";
  import { statusChannel } from "./utils/componentStatus.svelte.js";
  import { FORCE_CONTEXT } from "./utils/forceContext.js";
  import { facetService } from "./utils/facetService.js";
  import { mountCause, settleClock, settlePreparations, UPSTREAM_LOADS } from './rendering/viewSettlement.js';
import { settleUploads } from './rendering/uploadSettlement.js';
  import { reportDataError } from "./utils/dataErrors.js";
  import { useViewServices } from "./utils/viewServices.js";
  import { pendingRootContent, ROOT_CONTENT_CONTEXT } from "./utils/rootFrameSelection.js";
  import { diagnostic } from "./utils/diagnostics.js";
  import { accumulateResult, createScheduler, decodeInitial, plainParams, requestKeyOf, shareKey, sharedLoad, sourceOf, unwrap } from "./utils/providers.js";
  import type { ProviderProps, ProviderResult, TransformStatus } from "./publicTypes.js";
  let {
    source = undefined,
    url = undefined,
    format = "json",
    path = undefined,
    columns = undefined,
    params = undefined,
    key = undefined,
    schema = undefined,
    initial = undefined,
    debounce = 150,
    refreshInterval = undefined,
    // TODO 127: completed loads merge into the table on screen (true, or { maxRows }).
    accumulate = undefined,
    // From code or inputs (TODO 41.5): each change of its value refreshes (a Button's count works).
    refresh: refreshTrigger = undefined,
    name = undefined,
    onload = undefined,
    onerror = undefined,
    children,
  }: ProviderProps & { children?: Snippet } = $props();
  // Input reads (TODO 41.5): params={{ year: input("year") }} and refresh={input("reload")} take
  // the inputs' values here. A Python scene's props arrive with their reads replaced.
  const inputStore: any = getContext(INPUT_CONTEXT) ?? null;
  const read = (value, key) => resolveInput(value, inputStore, `Provider.${key}`);
  const renderer = (() => {
    try {
      return useThrelte().renderer;
    } catch {
      return undefined;
    }
  })();
  const viewServices = useViewServices();
  const facet = facetService();
  // Inside a Plot, the children mount with the first result: until then the Plot must not pick
  // its root Frame without them (Stage 14's root ownership), as with a transform.
  const releaseRootPending = pendingRootContent(getContext(ROOT_CONTENT_CONTEXT));
  const scope = createDataScope();
  setContext(FORCE_CONTEXT, undefined);
  const errorOwner = {};
  // The published result: { data, version, key, sourceId, revision }.
  let published = $state.raw<any>(undefined);
  let loadError = $state(""),
    requestError = $state(""),
    dataError = $state(""),
    pending = $state(false),
    visible = $state(true),
    alive = true,
    requests = 0,
    lastSourceId: any = undefined,
    // When the last load ended (published, unchanged or failed): refresh ticks count from it.
    lastEnded = -Infinity;
  const prefixed = (message: string) => (message.startsWith("Provider: ") ? message : `Provider: ${message}`);
  const errorText = $derived(requestError || loadError || (dataError ? prefixed(dataError) : ""));
  const normalized = $derived.by(() => {
    try {
      return { source: sourceOf({ source, url, format, path, columns }) };
    } catch (error) {
      return { source: null, error };
    }
  });
  /** accumulate as { maxRows }, or null when loads replace the table. */
  function accumulateOptions() {
    if (accumulate === undefined || accumulate === null || accumulate === false) return null;
    if (accumulate === true) return { maxRows: Infinity };
    const maxRows = accumulate?.maxRows;
    if (isPlainAccumulate(accumulate) && (maxRows === undefined || (Number.isInteger(maxRows) && maxRows > 0)))
      return { maxRows: maxRows ?? Infinity };
    throw diagnostic("provider.accumulate", "Provider: accumulate is true or { maxRows } with a positive whole number of rows.",
      { component: "Provider", property: "accumulate" });
  }
  const isPlainAccumulate = (value) => value && typeof value === "object" && !Array.isArray(value) &&
    Object.keys(value).every((name) => name === "maxRows");
  const report = (callback, value) => {
    try {
      callback?.(value);
    } catch (error) {
      console.error("Provider callback:", error);
    }
  };
  const scheduler = createScheduler({
    view: viewServices,
    async load(request, signal) {
      const started = performance.now();
      const context = { params: request.params, signal, revision: request.revision, version: request.version, refresh: request.fresh, view: undefined, schema };
      // A refresh asks for new data: it never joins a load already running. A CSV is parsed by
      // its schema, so loads share only under one schema (shareKey).
      const value = request.fresh
        ? await request.source.load(context)
        : await sharedLoad(request.source.id, shareKey(request.key, schema), (shared) => request.source.load({ ...context, signal: shared }), signal);
      return { value, ms: performance.now() - started };
    },
    publish(request, { value, ms }) {
      lastEnded = performance.now();
      const { data, version } = unwrap(value);
      if (version !== undefined && published?.sourceId === request.source.id && published.key === request.key && published.version === version) {
        loadError = "";
        return "unchanged";
      }
      if (data === undefined) throw diagnostic("provider.result", "Provider: the load returned no data.", { component: "Provider" });
      // accumulate: the table on screen for this request key (or an exported page's embedded
      // one, before the first load) takes the new rows; a new request key starts afresh.
      const accumulating = accumulateOptions();
      const onScreen = published === undefined ? initialData
        : published.sourceId === request.source.id && published.key === request.key ? published.data : undefined;
      const shown = accumulating && onScreen !== undefined
        ? accumulateResult(onScreen, data, { key, maxRows: accumulating.maxRows })
        : data;
      try {
        scope.setKey(key);
        scope.update(shown, schema);
      } catch (reason) {
        throw diagnostic("provider.result", `Provider: the loaded value is not a table: ${reason?.message ?? reason}`, { component: "Provider" });
      }
      published = { data: shown, version, key: request.key, sourceId: request.source.id, revision: request.revision };
      loadError = "";
      dataError = "";
      report(onload, { revision: request.revision, rows: scope.length, ms });
      return "published";
    },
    fail(request, error) {
      lastEnded = performance.now();
      loadError = prefixed(error?.message ?? String(error));
      report(onerror, { error, revision: request.revision });
    },
    onPending(value) {
      pending = value;
    },
  });

  $effect(() => {
    if (published === undefined && initial === undefined && !loadError && !requestError) return;
    let canceled = false;
    tick().then(() => { if (!canceled) releaseRootPending(); });
    return () => { canceled = true; };
  });
  // A params or source change: the request-key rule (docs/PROVIDERS.md).
  $effect(() => {
    const { source: current, error: sourceError } = normalized;
    let snapshot, requestKey, problem = sourceError;
    if (!problem && current)
      try {
        // Reading every param here makes a change inside a $state object a change too.
        snapshot = plainParams(read(params, "params"));
        requestKey = requestKeyOf(current, snapshot);
      } catch (error) {
        problem = error;
      }
    untrack(() => consider(current, snapshot, requestKey, problem));
  });
  function consider(current, snapshot, requestKey, problem) {
    const sourceChanged = (current?.id ?? null) !== (lastSourceId ?? null);
    lastSourceId = current?.id;
    if (problem) {
      scheduler.cancel();
      requestError = prefixed(problem.message ?? String(problem));
      report(onerror, { error: problem, revision: requests });
      return;
    }
    requestError = "";
    if (!current) {
      scheduler.cancel();
      return;
    }
    const shown = published?.sourceId === current.id ? published.key : undefined;
    if (!sourceChanged) {
      const waiting = scheduler.pending;
      if (requestKey === (waiting ? waiting.key : shown)) return;
      // A -> B -> A: back to the result on screen, so the request for B is dropped.
      if (waiting && requestKey === shown) {
        scheduler.cancel();
        return;
      }
    }
    // The first load serves the plot's mount, when the Provider is inside one being mounted.
    const first = requests === 0;
    scheduler.schedule(
      { key: requestKey, params: snapshot, source: current, revision: ++requests },
      { delay: sourceChanged ? 0 : Math.max(0, Number(debounce) || 0), cause: first ? mountCause(viewServices) : undefined },
    );
  }
  function freshRequest({ tick: ticking = false } = {}) {
    const current = untrack(() => normalized.source);
    if (!current) return Promise.resolve();
    // Ticks never overlap a request: a tick while one is pending is skipped.
    if (ticking && scheduler.pending) return Promise.resolve();
    let snapshot, requestKey;
    try {
      snapshot = plainParams(untrack(() => read(params, "params")));
      requestKey = requestKeyOf(current, snapshot);
    } catch (error) {
      return Promise.reject(error);
    }
    const shown = published?.sourceId === current.id && published.key === requestKey;
    const entry = scheduler.schedule({ key: requestKey, params: snapshot, source: current, revision: ++requests, fresh: true, version: shown ? published.version : undefined });
    return entry.done.then(() => {});
  }
  /** Load again with the same params, even though the request key is unchanged. */
  export function refresh() {
    return freshRequest();
  }
  // The first value is recorded in the first run, not while the component is set up: an input
  // later in the markup (a Refresh button after the Provider) declares its name only then.
  const UNSEEN = Symbol("unseen");
  let seenRefresh: any = UNSEEN;
  $effect(() => {
    const next = read(refreshTrigger, "refresh");
    if (seenRefresh === UNSEEN) {
      seenRefresh = next;
      return;
    }
    if (Object.is(next, seenRefresh)) return;
    seenRefresh = next;
    untrack(() => refresh().catch(() => {}));
  });
  // Periodic refresh: a tick refreshInterval after the last load ended; paused before the first
  // result, while the page is hidden and while an enclosing Facet cell is inactive; on resume, a
  // tick at once if one is due.
  const hasResult = $derived(published !== undefined);
  onMount(() => {
    const update = () => (visible = document.visibilityState !== "hidden");
    update();
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  });
  $effect(() => {
    const interval = Number(refreshInterval);
    const active = facet?.active() ?? true;
    if (!(interval > 0) || !normalized.source || !hasResult || !visible || !active) return;
    let timer, stopped = false;
    const arm = (delay = Math.max(0, lastEnded + interval - performance.now())) => {
      if (!stopped) timer = setTimeout(fire, delay);
    };
    const fire = () => {
      if (scheduler.pending) return arm(interval);
      freshRequest({ tick: true }).catch(() => {}).finally(() => arm());
    };
    arm();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  });

  /**
   * Resolves once the loads requested before this call have been published (or failed) and what
   * they started downstream has settled. A load error does not reject (refresh() does).
   */
  export async function whenSettled({ loads = true } = {}) {
    if (!loads) return;
    // A params change made just before this call requests its load when Svelte flushes.
    await tick();
    const until = settleClock();
    await settleLoads(until);
    await tick();
    await settlePreparations(viewServices, until, { everywhere: true });
    if (viewServices) await settleUploads(viewServices);
  }
  // Plots below wait for this Provider's loads (and those of Providers above it); other plots
  // do not (utils/lifecycle.js UPSTREAM_LOADS).
  const loadsAbove: any = getContext(UPSTREAM_LOADS);
  const settleLoads = (until) => Promise.all([scheduler.settle(until), loadsAbove?.(until)]);
  setContext(UPSTREAM_LOADS, settleLoads);
  /** The result on screen, as the load returned it (exports embed it). */
  export function getResult(): ProviderResult | undefined {
    return published ? { data: published.data, version: published.version, key: published.key, revision: published.revision } : undefined;
  }
  export async function action(id) {
    if (id === "refresh") return refresh();
    throw Error(`Provider has no action ${JSON.stringify(id)}.`);
  }
  function status(): TransformStatus {
    return {
      kind: "Provider",
      name,
      pending,
      error: errorText,
      mounted: alive,
      revision: published?.revision ?? 0,
    };
  }
  export const { subscribe } = statusChannel(status);
  $effect(() => reportDataError(viewServices, errorOwner, errorText));
  export const getSelection = () => scope.identity.selection;
  export const getBrush = () => scope.identity.brush;
  export const getHover = () => scope.identity.hover;
  /** The table's offsets (TODO 38): per-row deltas views read through offset() and moved(). */
  export const getOffsets = () => scope.identity.offsets;
  export const resetOffsets = (columns: string | string[] | undefined = undefined) => { scope.identity.offsets.clear(columns); };
  /** The published result's table with its dragged columns replaced by their moved values. */
  export const applyOffsets = () => scope.applyOffsets();

  // An exported page's embedded result (TODO 48.3): binary columns written by encodeInitial.
  const initialData = $derived(decodeInitial(initial));
  // read() also runs inside descendants' $derived values: the data error is written untracked.
  const showDataError = (message: string) => untrack(() => { if (dataError !== message) dataError = message; });
  setContext(DATA_CONTEXT, {
    read() {
      const value = published ? published.data : initialData;
      if (value === undefined) throw Error("Provider is loading data.");
      try {
        scope.setKey(key);
        scope.update(value, schema);
        showDataError("");
      } catch (reason) {
        // As Data: keep the last complete scope published and show why the update failed.
        showDataError(reason?.message ?? String(reason));
      }
      return scope;
    },
  });
  onDestroy(() => {
    alive = false;
    releaseRootPending();
    scheduler.dispose();
    reportDataError(viewServices, errorOwner, "");
    scope.dispose();
  });
</script>

{#if published !== undefined || initial !== undefined}{@render children?.()}{/if}
{#if errorText && !renderer}<p class="provider-error" role="alert">{errorText}</p>{/if}

<style>
  .provider-error {
    margin: 4px 0;
    color: #a32b30;
    font: 12px/1.35 system-ui, sans-serif;
  }
</style>
