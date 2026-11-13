<script>
  /**
   * A plot's settings and export buttons (TODO 60): icons in the lower right of the plot area,
   * shown faintly while the pointer is over the plot and fully when the pointer or keyboard
   * focus is on a button. Touch screens have no hover, so there they stay faint. A Facet puts its
   * own in the top corner (corner="top"), clear of its last cell's.
   */
  let {
    label,
    revealed = false,
    touch = false,
    corner = "bottom",
    settingsOpen = false,
    exportOpen = false,
    canExport = true,
    settingsButton = $bindable(),
    exportButton = $bindable(),
    onsettings,
    onexport,
  } = $props();
</script>

<div class="plot-controls" class:revealed={revealed || exportOpen} class:touch class:top={corner === "top"} data-plot-controls>
  <button
    bind:this={settingsButton}
    aria-label={`Settings for ${label}`}
    title="Settings"
    aria-haspopup="dialog"
    aria-expanded={settingsOpen}
    onclick={() => onsettings?.(settingsButton)}
  ><svg viewBox="0 0 16 16" aria-hidden="true"
      ><path d="M6.13 2.72L6.55 0.85L9.45 0.85L9.87 2.72L10.41 2.95L12.03 1.92L14.08 3.97L13.05 5.59L13.28 6.13L15.15 6.55L15.15 9.45L13.28 9.87L13.05 10.41L14.08 12.03L12.03 14.08L10.41 13.05L9.87 13.28L9.45 15.15L6.55 15.15L6.13 13.28L5.59 13.05L3.97 14.08L1.92 12.03L2.95 10.41L2.72 9.87L0.85 9.45L0.85 6.55L2.72 6.13L2.95 5.59L1.92 3.97L3.97 1.92L5.59 2.95Z" /><circle cx="8" cy="8" r="2.3" /></svg
    ></button>
  {#if canExport}<button
      bind:this={exportButton}
      aria-label={`Export ${label}`}
      title="Export"
      aria-haspopup="dialog"
      aria-expanded={exportOpen}
      onclick={() => onexport?.(exportButton)}
    ><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.75v8.5M4.25 6.75 8 10.5l3.75-3.75M2.25 11.25v3h11.5v-3" /></svg></button
    >{/if}
</div>

<style>
  /* 24px buttons 4px from the bottom stay inside the default 32px axis margin. */
  .plot-controls {
    --bg: var(--hm-controls-background, var(--hm-theme-background, #fff));
    --fg: var(--hm-controls-color, var(--hm-theme-color, #252b38));
    --accent-base: var(--hm-controls-accent, #5261d8);
    position: absolute;
    right: 4px;
    bottom: 4px;
    z-index: 10;
    display: flex;
    gap: 4px;
    opacity: 0;
    pointer-events: none;
    transition: opacity 120ms ease;
  }
  .plot-controls.top { top: 6px; bottom: auto; right: 6px; z-index: 20; }
  .plot-controls.revealed,
  .plot-controls.touch { opacity: 0.45; pointer-events: auto; }
  .plot-controls:hover,
  .plot-controls:focus-within { opacity: 1; pointer-events: auto; }
  button {
    display: grid;
    place-items: center;
    width: 24px;
    height: 24px;
    padding: 0;
    border: 1px solid color-mix(in srgb, var(--fg) 22%, var(--bg));
    border-radius: 6px;
    background: color-mix(in srgb, var(--bg) 95%, transparent);
    color: var(--fg);
    cursor: pointer;
    box-shadow: 0 1px 4px #17224614;
  }
  button:hover { background: var(--bg); border-color: color-mix(in srgb, var(--fg) 40%, var(--bg)); }
  button[aria-expanded="true"] {
    color: color-mix(in srgb, var(--accent-base) 75%, var(--fg));
    border-color: color-mix(in srgb, var(--accent-base) 45%, var(--bg));
    background: color-mix(in srgb, var(--accent-base) 15%, var(--bg));
  }
  button:focus-visible { outline: 2px solid var(--accent-base); outline-offset: 2px; }
  svg { width: 14px; height: 14px; fill: none; stroke: currentColor; stroke-width: 1.25; stroke-linecap: round; stroke-linejoin: round; }
  @media (prefers-reduced-motion: reduce) { .plot-controls { transition: none; } }
</style>
