<script>
  import { tick } from "svelte";
  /**
   * The export popover (TODO 60): a small panel above the plot's export button, inside the plot
   * (its offset parent), so it never floats over other page content or a notebook's other cells.
   * It scrolls when the plot is shorter than its fields.
   */
  let {
    label,
    exportPNG = undefined,
    exportSVG = undefined,
    exportPDF = undefined,
    exportHTML = undefined,
    opened = $bindable(false),
  } = $props();
  // anchor: the button it opens above (a press on it does not dismiss it); at: a client point to
  // open at instead (the context menu); focusTarget: where focus returns when it closes.
  let panel = $state(), formatInput = $state(), anchor, at, focusTarget;
  let exporting = $state(false), error = $state(""), format = $state("png"), scale = $state(2),
    documentMode = $state("auto"), rasterDpi = $state(300), width = $state(""), height = $state("");
  let right = $state(8), top = $state(undefined), bottom = $state(44), maxHeight = $state(320);
  $effect(() => {
    // PDF is not offered here (its in-browser conversion is not reliable enough); exportPDF stays
    // on the handles, and Python makes PDFs by printing the SVG in headless Chromium.
    const available = [exportPNG && "png", exportSVG && "svg", exportHTML && "html"].filter(Boolean);
    if (!available.includes(format)) format = available[0] ?? "png";
  });
  function place() {
    const host = panel?.offsetParent;
    const a = at ? new DOMRect(at.x, at.y, 0, 0) : anchor?.isConnected ? anchor.getBoundingClientRect() : null;
    if (!opened || !host || !a) return;
    const h = host.getBoundingClientRect();
    right = Math.max(4, h.right - a.right);
    // Above the button, or below it when there is more room there (a Facet's top-corner button).
    const above = a.top - h.top, below = h.bottom - a.bottom;
    if (above >= below) { top = undefined; bottom = Math.max(4, h.bottom - a.top + 6); maxHeight = Math.max(96, above - 10); }
    else { bottom = undefined; top = a.bottom - h.top + 6; maxHeight = Math.max(96, below - 10); }
  }
  export async function open(element, point = undefined) {
    anchor = point ? undefined : element;
    at = point;
    focusTarget = element;
    error = "";
    opened = true;
    await tick();
    place();
    formatInput?.focus();
  }
  export function close({ restoreFocus = true } = {}) {
    if (!opened) return;
    opened = false;
    if (restoreFocus && focusTarget?.isConnected) focusTarget.focus({ preventScroll: true });
  }
  export function toggle(element) {
    if (opened) close();
    else open(element);
  }
  /** Whether it is open above `element` (not at a point, as from the context menu). */
  export function isAnchoredTo(element) {
    return opened && !!element && anchor === element;
  }
  $effect(() => {
    if (!opened || !panel) return;
    const host = panel.offsetParent;
    const observer = new ResizeObserver(() => place());
    if (host) observer.observe(host);
    // Light dismiss: a press anywhere but the panel or its button closes it.
    const outside = (event) => {
      if (!panel.contains(event.target) && !anchor?.contains(event.target)) close({ restoreFocus: false });
    };
    document.addEventListener("pointerdown", outside, true);
    return () => {
      observer.disconnect();
      document.removeEventListener("pointerdown", outside, true);
    };
  });
  function download(blob, kind) {
    const url = URL.createObjectURL(blob), a = document.createElement("a");
    a.href = url; a.download = `${label || "plot"}.${kind}`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function save() {
    exporting = true; error = "";
    try {
      if (format === "png") download(await exportPNG({ scale }), "png");
      else if (format === "html") {
        const result = await exportHTML();
        download(result?.blob ?? result, "html");
        if (result?.warnings?.length) console.warn(`HTML export omitted callbacks: ${result.warnings.join(", ")}`);
      } else {
        const run = format === "svg" ? exportSVG : exportPDF;
        const result = await run({ mode: documentMode, rasterDpi, width: width.trim() || undefined, height: height.trim() || undefined });
        download(result.blob, format);
      }
      close();
    } catch (e) { error = e.message; }
    finally { exporting = false; }
  }
</script>

<svelte:window onresize={place} />
{#if opened}<div
    bind:this={panel}
    class="export-panel"
    role="dialog"
    aria-label={`Export · ${label}`}
    tabindex="-1"
    style:right={`${right}px`}
    style:top={top === undefined ? undefined : `${top}px`}
    style:bottom={bottom === undefined ? undefined : `${bottom}px`}
    style:max-height={`${maxHeight}px`}
    onkeydown={(event) => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(); } }}
  >
    <label>Format <select bind:this={formatInput} bind:value={format}>
      {#if exportPNG}<option value="png">PNG</option>{/if}
      {#if exportSVG}<option value="svg">SVG</option>{/if}
      {#if exportHTML}<option value="html">Interactive HTML</option>{/if}
    </select></label>
    {#if format === "png"}
      <label>Scale <span class="unit-input"><input aria-label="PNG export scale" type="number" min="0.1" max="10" step="0.5" bind:value={scale} /><span>×</span></span></label>
    {:else if format !== "html"}
      <label>Vector mode <select bind:value={documentMode}><option value="auto">Hybrid</option><option value="vector">Strict vector</option><option value="raster">Raster</option></select></label>
      <label>Fallback DPI <input aria-label="Document raster DPI" type="number" min="36" max="1200" step="50" bind:value={rasterDpi} /></label>
      <label>Width <input aria-label="Document export width" placeholder="auto / 160mm" bind:value={width} /></label>
      <label>Height <input aria-label="Document export height" placeholder="auto / 4in" bind:value={height} /></label>
    {/if}
    <button class="download" disabled={exporting} onclick={save}>{exporting ? "Saving…" : "Download"}</button>
    {#if error}<p role="alert">{error}</p>{/if}
  </div>{/if}

<style>
  .export-panel {
    --bg: var(--hm-controls-background, var(--hm-theme-background, #fff));
    --fg: var(--hm-controls-color, var(--hm-theme-color, #252b38));
    --accent-base: var(--hm-controls-accent, #5261d8);
    --border: color-mix(in srgb, var(--fg) 13%, var(--bg));
    --field: color-mix(in srgb, var(--fg) 5%, var(--bg));
    position: absolute;
    z-index: 31;
    width: 232px;
    max-width: calc(100% - 8px);
    overflow: auto;
    padding: 10px;
    display: grid;
    gap: 8px;
    box-sizing: border-box;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: var(--bg);
    color: var(--fg);
    color-scheme: var(--hm-theme-scheme, light);
    box-shadow: 0 10px 34px #101a352b;
    font: 13px/1.4 var(--hm-controls-font, system-ui, sans-serif);
  }
  label { display: grid; grid-template-columns: 84px minmax(0, 1fr); align-items: center; gap: 8px; font-size: 11px; }
  input, select { min-width: 0; width: 100%; box-sizing: border-box; font: inherit; color: inherit; border: 1px solid var(--border); border-radius: 5px; padding: 4px 6px; background: var(--field); }
  .unit-input { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 4px; }
  .download { justify-self: end; min-width: 96px; font: inherit; font-weight: 600; color: white; background: var(--accent-base); border: 1px solid color-mix(in srgb, var(--accent-base) 85%, black); border-radius: 6px; padding: 5px 12px; cursor: pointer; }
  .download:disabled { opacity: 0.7; cursor: progress; }
  :focus-visible { outline: 2px solid var(--accent-base); outline-offset: 2px; }
  p[role="alert"] { margin: 0; font-size: 11px; color: color-mix(in srgb, #c0343a 80%, var(--fg)); }
</style>
