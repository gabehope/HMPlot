<script>
  // One example (R2.0b.4, TODO 68): src/examples/<id>/ holds <id>.svelte and <id>.py, which are the
  // code shown, and scripts/build_examples.py builds the Python's scene into static/example-builds/<id>/
  // with a web preview of it, listed in the builds' manifest.json (TODO 68.3).
  //
  // This component is the lightweight shell: the preview image and the source are in the page's
  // first HTML (the docs routes render on the server and pass this example's manifest record and
  // sources through the "hmplot-docs-examples" context, from examples/exampleData.server.js). The
  // live view comes from live.js, imported only when the example is near the viewport and the
  // browser has WebGPU, two examples at a time (exampleLoading.js); the preview stays until the
  // live plot has drawn, then fades out over it, and stays for good without WebGPU; a small label
  // in its corner says it is a static preview (as an exported page's snapshot does, htmlPage.js).
  // "Edit in Python" swaps the code for an editor and the plot for what Pyodide runs; "Show tree"
  // shows the component tree.
  import { getContext, onDestroy, onMount, untrack } from "svelte";
  import { quadOut } from "svelte/easing";
  import SourceCode from "./SourceCode.svelte";
  import { liveQueue, nearViewport, webgpuAvailable } from "./exampleLoading.js";
  import { BUILDS, assetURL, manifestEntry } from "./exampleBuilds.js";
  import { fontReady } from "../plot/utils/defaultFont.js";
  import { PREVIEW_FADE, PREVIEW_LABEL, PREVIEW_LIVE, PREVIEW_LOADING, PREVIEW_NO_WEBGPU, PREVIEW_NO_WEBGPU_LABEL, cornerColor, previewLabelColors } from "../scene/htmlPage.js";

  // `priority`: the page's first example, whose preview loads first (the others load lazily).
  let { id, language = $bindable(), highlights = {}, loader = null, sourceLoader = null, example = undefined, priority = false } = $props();
  // Each Example is created for one id (DocsPage keys them): its initial props are what counts.
  const initial = untrack(() => ({ id, legacy: Boolean(loader), code: example?.code ?? "", python: example?.python ?? "" }));
  const provided = getContext("hmplot-docs-examples")?.()?.[initial.id];
  const programs = import.meta.env.DEV ? import.meta.glob("/src/examples/*/*.svelte") : {};
  let Program = $state(), legacyPlot, diagnostics, destroyed = false, revision = 0, host, live, liveModule = $state.raw(), near = false;
  let loading = new AbortController();
  const revise = () => { loading.abort(); loading = new AbortController(); revision++; };
  // A dev server's docs-- example shows its Svelte program live (so a saved fence shows at once);
  // the preview stays until the program's plots have drawn. Gallery programs use the same gate.
  let programHost = $state(), programReady = $state(false);
  let programDone = () => {};
  const devPreview = $derived(import.meta.env.DEV && id.startsWith("docs--"));
  const svelteSources = import.meta.glob("/src/examples/*/*.svelte", { query: "?raw", import: "default" });
  const pythonSources = import.meta.glob("/src/examples/*/*.py", { query: "?raw", import: "default" });

  // The build's assets (views.plot and views.tree: payload and previews; files), and the sources.
  let entry = $state(provided?.views ? { views: provided.views, files: provided.files ?? [] } : null);
  // A gallery program's Python is its equivalent from the catalog, shown as source only (no build).
  let sources = $state(initial.legacy ? { svelte: initial.code, python: initial.python } : { svelte: provided?.sources?.svelte ?? "", python: provided?.sources?.python ?? "" });
  // The source shown: the chosen language when this example has it, else the one it has (a
  // Python-only component's example on a Svelte page, TODO 67.4). The choice itself is kept.
  const shown = $derived(sources[language] ? language : sources.svelte ? "svelte" : sources.python ? "python" : language);
  let editing = $state(false), showTree = $state(false), treeRequested = $state(false), editor = $state(), code = $state(provided?.sources?.python ?? ""), error = $state(null);
  let status = $state("idle"), stdout = $state(""), needsWebGPU = $state(false);
  // Whether this browser has a WebGPU adapter (undefined until asked).
  let gpu = $state();
  // The plot and the tree: a preview until their live view has drawn. `pending`: a dev server is
  // building this example; `unavailable`: its build is missing or failed (TODO 67.4); `failed`: its
  // live view did not start. `previewing`: the preview is in the page (fading out included), and
  // `label`: its label's colors, from the preview's corner.
  const blank = () => ({ live: false, runtime: null, unavailable: false, failed: false, previewing: false, label: null });
  const views = $state({ plot: blank(), tree: blank() });
  // A production page's data is definitive; elsewhere the record is fetched (`pending` until then).
  let pending = $state(!initial.legacy && !provided?.views && !(provided && !import.meta.env.DEV));
  const unavailable = (name) => views[name].unavailable || (!loader && !pending && !entry);
  const cancelled = (current) => () => destroyed || current !== revision;

  // Browser-only: the server bundle must not import the runtime (SvelteKit would link its stylesheets
  // into every docs page's head).
  const loadLive = () => (live ??= import.meta.env.SSR ? Promise.reject(Error("live.js in SSR")) : import("./live.js").then((module) => (liveModule = module)));
  // Draws a payload live. Without WebGPU the preview stays; a Run's result is then an error.
  async function show(name, payload, current = revision) {
    const module = await loadLive();
    if (!cancelled(current)()) await module.present(views[name], payload, cancelled(current));
  }
  // The build's scene for a view, live, when this browser can draw it: the runtime, the payload
  // and the font load together.
  async function goLive(name) {
    const current = revision, signal = loading.signal, url = entry?.views?.[name]?.payload;
    // A dev server's docs-- example draws its Svelte program instead (above).
    if (!url || (name === "plot" && devPreview && navigator.gpu) || !(await webgpuAvailable()) || cancelled(current)()) return;
    await liveQueue.run(async () => {
      if (cancelled(current)()) return;
      // The payload first: the runtime is many module requests, which would queue ahead of it.
      const payload = fetch(assetURL(url), { signal });
      fontReady();
      const [response] = await Promise.all([payload, loadLive()]);
      if (cancelled(current)()) return;
      if (!response.ok) { views[name].unavailable = true; return; }
      await show(name, await response.json(), current);
    }, cancelled(current), { signal }).catch(() => { if (!cancelled(current)()) views[name].failed = true; });
  }
  // The manifest record and the sources again (no page data; a rebuild on the dev server). A dev
  // server answers a missing example's assets.json once that example has built (vite-examples.js).
  // A rebuild that left a view's scene as it was (a dev server rebuilds every example when the
  // package changes) changes nothing on the page; one that changed it shows the new preview until
  // the new scene has drawn, as a page does when it loads.
  let refreshing = 0;
  async function refresh(fresh = false) {
    const asked = ++refreshing;
    const find = (glob, ext) => glob[`/src/examples/${id}/${id}.${ext}`]?.() ?? Promise.resolve("");
    const record = import.meta.env.DEV
      ? fetch(`${BUILDS}/${id}/assets.json?t=${Date.now()}`, { cache: "no-store", signal: loading.signal }).then(r => r.ok ? r.json() : null).catch(() => null)
      : manifestEntry(id, { fresh });
    const [svelte, python, found] = await Promise.all([find(svelteSources, "svelte"), find(pythonSources, "py"), record]);
    if (destroyed || asked !== refreshing) return;
    sources.svelte = svelte; sources.python = python;
    if (!editing) code = python;
    const changed = ["plot", "tree"].filter((name) => entry?.views?.[name]?.payload !== found?.views?.[name]?.payload);
    entry = found;
    pending = false;
    views.plot.unavailable = views.tree.unavailable = views.plot.failed = views.tree.failed = false;
    if (!changed.length || editing) return;
    revise();
    for (const name of changed) views[name].live = false;
    const name = showTree ? "tree" : "plot";
    if (near && changed.includes(name)) await goLive(name);
  }
  // The dev server's program is ready when its plots have drawn (every canvas no longer busy), or
  // after 15 s whatever it shows.
  $effect(() => {
    if (programReady || !programHost) return;
    const ready = () => { programReady = true; programDone(); };
    const check = () => {
      const canvases = programHost.querySelectorAll(".canvas");
      if (programHost.querySelector('[role="alert"]') || canvases.length && [...canvases].every((canvas) => canvas.getAttribute("aria-busy") === "false")) ready();
    };
    const observer = new MutationObserver(check), timer = loader ? null : setTimeout(ready, 15000);
    observer.observe(programHost, { subtree: true, childList: true, attributes: true, attributeFilter: ["aria-busy"] });
    check();
    return () => { observer.disconnect(); if (timer !== null) clearTimeout(timer); };
  });
  // A dev server's guide example shows its program in the plot's place once it has drawn.
  const programShown = (name) => Boolean(name === "plot" && Program && programReady && !editing && !showTree);
  // What a screen reader hears about a view's preview: loading, static for good, or replaced.
  function previewStatus(name) {
    const view = views[name];
    if (view.live || programShown(name)) return PREVIEW_LIVE;
    if (gpu === false) return PREVIEW_NO_WEBGPU;
    return view.failed || view.unavailable ? PREVIEW_LABEL : PREVIEW_LOADING;
  }
  // The preview fades out over the live view (which shows under it from the start), or goes at
  // once with reduced motion.
  function leave(node) {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return { duration: 0 };
    node.classList.add("leaving");
    return { duration: PREVIEW_FADE, easing: quadOut, css: (t) => `opacity: ${t}` };
  }
  // While a view's preview is in the page, its live view is not `ready` (tests and the loading
  // audit read that class as the live plot shown alone).
  const previewing = (view) => () => {
    view.previewing = true;
    return () => (view.previewing = false);
  };
  onMount(() => {
    if (!language) { try { language = localStorage.getItem("hmplot-docs-language") ?? "svelte"; } catch { language = "svelte"; } }
    // A production build for the performance gate opts in with VITE_HMPLOT_PERF_HOOKS=1.
    if (example && (import.meta.env.DEV || import.meta.env.VITE_HMPLOT_PERF_HOOKS === "1")) {
      const plot = () => legacyPlot ?? [...(views.plot.runtime?.handles.values() ?? [])].find(entry => entry.handle?.getAxisLayout && entry.handle?.getDiagnostics)?.handle;
      diagnostics = {get plot() {return plot();},settle:()=>plot()?.whenSettled(),finished:()=>plot()?.whenAnimationsFinished(),diagnostics:()=>plot()?.getDiagnostics()};
      window.__examples = diagnostics;
    }
    if (loader) {
      // Gallery programs use the same viewport gate, preview and cancellable queue as scenes.
      const current = revision, signal = loading.signal;
      const stop = nearViewport(host, () => {
        near = true;
        liveQueue.run(async () => {
          const ok = await webgpuAvailable();
          if (cancelled(current)()) return;
          gpu = ok;
          if (!ok) { needsWebGPU = true; return; }
          const module = await loader();
          if (cancelled(current)()) return;
          const drawn = new Promise(resolve => { programDone = resolve; });
          Program = module.default;
          await drawn;
        }, cancelled(current), { signal }).catch(cause => { if (!cancelled(current)()) error = { message: cause.message }; });
      });
      sourceLoader?.().then(module => { if (!destroyed) sources.svelte = module.default.replaceAll('from "$lib"','from "hmplot"').replaceAll('from "$lib/jax.js"','from "hmplot/jax"').replaceAll('from "$lib/charts/index.js"','from "hmplot/charts"').replaceAll('from "$lib/stats/index.js"','from "hmplot/stats"'); })
        .catch(cause => { if (!destroyed) error = { message: cause.message }; });
      return stop;
    }
    webgpuAvailable().then((ok) => { if (!destroyed) gpu = ok; });
    if (devPreview && navigator.gpu) programs[`/src/examples/${id}/${id}.svelte`]?.().then(module => { if (!destroyed) Program = module.default; });
    // Without the page's data (a test route) or its build (a dev server building it), ask for both.
    const stop = nearViewport(host, () => {
      near = true;
      (provided?.views ? goLive("plot") : refresh()).catch(cause => { if (!destroyed) error = {message:cause.message}; });
    });
    // An example below the fold: the runtime downloads once the page is idle (where WebGPU is, and
    // data is not being saved), so scrolling to it waits for its scene only, not for the runtime.
    const idle = globalThis.requestIdleCallback ?? ((callback) => setTimeout(callback, 1000));
    const idleId = !navigator.connection?.saveData ? idle(() => webgpuAvailable().then((ok) => { if (ok && !destroyed) loadLive().catch(() => {}); }), { timeout: 3000 }) : null;
    const rebuilt = event => {
      if (!event.ids?.includes(id)) return;
      if (event.error) error = {message:event.error};
      else { error = null; refresh(true).catch(cause => error = {message:cause.message}); }
    };
    import.meta.hot?.on("hmplot:examples-built", rebuilt);
    return () => { stop(); if (idleId !== null) (globalThis.cancelIdleCallback ?? clearTimeout)(idleId); import.meta.hot?.off("hmplot:examples-built", rebuilt); };
  });
  onDestroy(() => { if (typeof window !== "undefined" && window.__examples === diagnostics) delete window.__examples; destroyed = true; revise(); programDone(); worker?.terminate(); views.plot.runtime?.dispose(); views.tree.runtime?.dispose(); });

  function choose(value) { language = value; try { localStorage.setItem("hmplot-docs-language", value); } catch {} }
  async function copy() { await navigator.clipboard.writeText(editing ? code : sources[shown]); }
  function download() {
    const python = editing || shown === "python";
    const url = URL.createObjectURL(new Blob([editing ? code : sources[shown]], { type: "text/plain" }));
    const a = document.createElement("a");
    a.href = url; a.download = `${id}.${python ? "py" : "svelte"}`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
  async function toggleTree() {
    showTree = !showTree;
    treeRequested = true;
    if (showTree && !views.tree.live) await goLive("tree");
  }
  async function edit() {
    editing = !editing;
    if (editing && !editor && !import.meta.env.SSR) editor = (await import("./PythonEditor.svelte")).default;
    if (!editing && !loader) await goLive("plot");
  }

  let worker, interrupt;
  function start() {
    worker = new Worker(new URL("./example.worker.js", import.meta.url), { type: "module" });
    // Stop interrupts Python where the page is cross-origin isolated; elsewhere it restarts the worker.
    interrupt = globalThis.crossOriginIsolated ? new Uint8Array(new SharedArrayBuffer(1)) : null;
    worker.onerror = (event) => { status = "error"; error = { message: event.message || "The Python worker stopped.", line: null }; };
  }
  async function run() {
    if (!worker) start();
    if (interrupt) interrupt[0] = 0;
    status = "running"; error = null; stdout = "";
    const current = worker;
    // The runtime downloads while Python runs.
    loadLive();
    const wheel = await fetch(`${BUILDS}/wheel.json`).then((r) => r.json());
    const files = entry?.files ?? [];
    const result = await new Promise((resolve) => {
      current.onmessage = ({ data }) => resolve(data);
      current.postMessage({ type: "run", source: code, tree: true, interrupt, wheel: `${BUILDS}/${wheel.name}`,
        files: files.map((name) => ({ name, url: `${BUILDS}/${id}/files/${name}` })) });
    });
    if (worker !== current) return;
    if (result.type === "error") { status = /KeyboardInterrupt/.test(result.error) ? "stopped" : "error"; error = { message: result.error, line: result.line }; return; }
    status = "rendering";
    stdout = result.value.stdout;
    try {
      await show("plot", result.value.payload);
      if (result.value.tree) { treeRequested = true; await show("tree", result.value.tree); }
      status = "ready";
    } catch (cause) { status = "error"; error = { message: cause?.message ?? String(cause), line: null }; }
  }
  function stop() {
    if (interrupt) { interrupt[0] = 2; return; }
    worker?.terminate(); worker = undefined; status = "stopped";
  }
  function reset() { code = sources.python; error = null; stdout = ""; }
</script>

<section class="example" aria-label="Example" data-example={id} bind:this={host}>
  <div class="plot" class:live-example={!!example || !!Program} aria-label={showTree ? "Component tree" : "Plot"}>
    {#if needsWebGPU}<div class="program" aria-label="Live example"><p class="unavailable" role="status">This example needs WebGPU. The source below is available in any browser.</p></div>{/if}
    {#if Program && !editing && !showTree}
      <div class="program" class:pending={!programReady} aria-label="Live example" bind:this={programHost}><svelte:boundary>
        <Program {example} onready={value => legacyPlot = value} />
        {#snippet failed(cause, reset)}<p role="alert">{cause.message}</p><button onclick={reset}>Retry</button>{/snippet}
      </svelte:boundary></div>
    {/if}
    {#each ["plot", "tree"] as name}
      {@const view = views[name]}
      {@const preview = entry?.views?.[name]?.previews?.web}
      {#if name === "plot" || treeRequested}
        <!-- Over a dev server's program, the plot's layer holds only its preview while it fades. -->
        <div class="layer" class:over={programShown(name)} hidden={(name === "tree") !== showTree}>
          {#if preview && !view.live && !programShown(name)}
            {@const first = priority && name === "plot"}
            <div class="snapshot" aria-label="Snapshot" out:leave {@attach previewing(view)}><img src={assetURL(preview.src)} srcset={preview.srcset?.map(([src, width]) => `${assetURL(src)} ${width}w`).join(", ")}
              sizes={preview.srcset ? `(max-width: ${preview.width + 40}px) 100vw, ${preview.width}px` : undefined}
              width={preview.width} height={preview.height} alt={preview.alt || (name === "plot" ? "The example's plot." : "The example's component tree.")}
              loading={first ? "eager" : "lazy"} fetchpriority={first ? "high" : "auto"} decoding="async"
              onload={(event) => (view.label = previewLabelColors(cornerColor(event.currentTarget)))} />
              <!-- Shown once its colors are known; a status below says it to screen readers. -->
              <span class="preview-label" class:loading={gpu && !view.failed && !view.unavailable} class:toned={view.label !== null} aria-hidden="true"
                style:--label-background={view.label?.background} style:--label-color={view.label?.color} style:--label-line={view.label?.line}
              ><i></i>{gpu === false ? PREVIEW_NO_WEBGPU_LABEL : PREVIEW_LABEL}</span></div>
          {/if}
          {#if preview}<p class="preview-status" role="status">{previewStatus(name)}</p>{/if}
          {#if view.runtime && liveModule}<div class="live" class:pending={!view.live} class:ready={view.live && !view.previewing} hidden={programShown(name)}><liveModule.SceneRenderer runtime={view.runtime} fill={false} /></div>{/if}
          {#if !preview && !view.runtime && !(name === "plot" && Program)}
            {#if loader && !needsWebGPU}<p class="unavailable" role="status">Loading the interactive example…</p>
            {:else if pending}<p class="unavailable" role="status">Loading this example's {name === "plot" ? "preview" : "tree"}…</p>
            {:else if unavailable(name)}<p class="unavailable" role="status">This example's {name === "plot" ? "preview" : "tree"} is unavailable: its build is missing or failed. {sources.svelte || sources.python ? "Its source is below." : ""}</p>{/if}
          {/if}
        </div>
      {/if}
    {/each}
  </div>
  <div class="controls">
    {#if editing}
      <div role="group" aria-label="Python editor">
        <button class="primary" onclick={run} disabled={status === "running" || status === "rendering"}>Run</button>
        <button onclick={stop} disabled={status !== "running"}>Stop</button>
        <button onclick={reset}>Reset</button>
        <span class="status" aria-live="polite">{status === "running" ? "Running Python…" : status === "idle" ? "" : status}</span>
      </div>
    {:else}
      <div role="group" aria-label="Code language">
        {#if sources.svelte}<button class:active={shown === "svelte"} aria-pressed={shown === "svelte"} onclick={() => choose("svelte")}>Svelte</button>{/if}
        {#if sources.python}<button class:active={shown === "python"} aria-pressed={shown === "python"} onclick={() => choose("python")}>Python</button>{/if}
      </div>
    {/if}
    <div>
      <button onclick={copy}>Copy</button><button onclick={download}>Download</button>
      {#each (entry?.files ?? []) as name}
        <a href={`${BUILDS}/${id}/files/${name}`} download={name}>{name.endsWith(".hmplot.json") ? "Download template" : `Download ${name}`}</a>
      {/each}
      {#if sources.python && !initial.legacy}<button onclick={toggleTree}>{showTree ? "Show plot" : "Show tree"}</button>{/if}
      {#if sources.python && !initial.legacy}<button onclick={edit}>{editing ? "Close editor" : "Edit in Python"}</button>{/if}
    </div>
  </div>
  {#if editing && editor}
    {@const Editor = editor}
    <Editor bind:value={code} {error} onrun={run} />
    {#if error}<pre class="error" role="alert">{error.message}</pre>{/if}
    {#if stdout}<pre class="stdout">{stdout}</pre>{/if}
  {:else}
    <section aria-label="Example source"><SourceCode source={sources[shown]} language={shown} highlight={highlights[shown] ?? []} /></section>
    {#if error}<pre class="error" role="alert">{error.message}</pre>{/if}
  {/if}
</section>

<style>
  .example { border: 1px solid #dce2e6; margin: 24px 0; min-width: 0; background: #fff; }
  .plot { position: relative; min-height: 120px; }
  .layer { position: relative; }
  .snapshot { position: relative; width: fit-content; max-width: 100%; }
  .snapshot > img { display: block; max-width: 100%; height: auto; }
  /* The live view draws hidden under the preview until it has drawn; then it shows, and the
     preview fades out over it (out:leave). */
  .live.pending, .program.pending { position: absolute; inset: 0; visibility: hidden; }
  .snapshot:global(.leaving), .layer.over { position: absolute; top: 0; left: 0; z-index: 1; pointer-events: none; }
  .layer.over { right: 0; }
  .snapshot:global(.leaving) ~ .live, .plot:has(.snapshot:global(.leaving)) > .program { isolation: isolate; }
  /* The preview's label, in its top right corner: the plot's background and a muted foreground. */
  .preview-label { position: absolute; top: 4px; right: 4px; display: flex; align-items: center; gap: 5px; padding: 1px 7px 1px 6px; border-radius: 9px;
    font: 500 11px/16px system-ui, -apple-system, "Segoe UI", sans-serif; white-space: nowrap; pointer-events: none; user-select: none;
    color: var(--label-color); background: var(--label-background); box-shadow: 0 0 0 1px var(--label-line); opacity: 0; transition: opacity 0.2s; }
  .preview-label.toned { opacity: 1; }
  .preview-label > i { width: 6px; height: 6px; border-radius: 50%; background: currentColor; display: none; }
  .preview-label.loading > i { display: block; animation: pulse 1.6s ease-in-out infinite; }
  @keyframes pulse { 50% { opacity: 0.3; } }
  @media (prefers-reduced-motion: reduce) { .preview-label { transition: none; } .preview-label.loading > i { animation: none; } }
  .preview-status { position: absolute; width: 1px; height: 1px; margin: -1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
  .controls { display: flex; justify-content: space-between; gap: 12px; flex-wrap: wrap; padding: 7px; border-top: 1px solid #dce2e6; }
  .controls > div { display: flex; flex-wrap: wrap; align-items: center; gap: 2px; }
  button, .controls a { font: inherit; font-size: 12px; border: 0; background: white; color: #215b85; padding: 6px 9px; cursor: pointer; }
  button.active { background: #edf4f8; font-weight: 600; }
  button.primary { background: #174f80; color: #fff; }
  button:disabled { opacity: 0.5; cursor: default; }
  .status { font-size: 12px; color: #667585; padding-left: 8px; }
  .unavailable { margin: 0; padding: 40px 16px; text-align: center; color: #52616d; font-size: 14px; }
  .error, .stdout { margin: 0; padding: 12px; white-space: pre-wrap; font: 12px/1.5 ui-monospace, monospace; border-top: 1px solid #e2e7ec; }
  .error { color: #8b1d24; background: #fff5f5; }
  .stdout { color: #425466; }
</style>
