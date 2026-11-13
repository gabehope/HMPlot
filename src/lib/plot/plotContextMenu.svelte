<script lang="ts">
  // The plot's context menu: settings, and export when the plot can export (TODO 60). Its
  // colors follow the plot's theme like the settings pane (controlsTheme.js).
  let {onsettings, onexport = undefined, onclose = () => {}} = $props();
  let activating = false;
  let menu: HTMLDivElement, items: HTMLButtonElement[] = $state([]);
  let point = {x: 0, y: 0};
  export function open(x: number, y: number) {
    activating = false;
    point = {x, y};
    menu.showPopover();
    const viewport = window.visualViewport;
    const left = viewport?.offsetLeft ?? 0, top = viewport?.offsetTop ?? 0;
    const width = viewport?.width ?? innerWidth, height = viewport?.height ?? innerHeight;
    menu.style.left = `${Math.max(left + 8, Math.min(x, left + width - menu.offsetWidth - 8))}px`;
    menu.style.top = `${Math.max(top + 8, Math.min(y, top + height - menu.offsetHeight - 8))}px`;
    items[0]?.focus();
  }
  function outside(event: PointerEvent) {
    if(menu?.matches(':popover-open') && !menu.contains(event.target as Node)) menu.hidePopover();
  }
  function escape(event: KeyboardEvent) {
    if(event.key === 'Escape' && menu?.matches(':popover-open')) {
      event.preventDefault(); menu.hidePopover();
    }
  }
  function activate(action: (point: {x: number, y: number}) => void) { activating = true; menu.hidePopover(); action(point); }
  function move(event: KeyboardEvent) {
    const list = items.filter(Boolean), index = list.indexOf(document.activeElement as HTMLButtonElement);
    const next = event.key === 'ArrowDown' ? list[(index + 1) % list.length]
      : event.key === 'ArrowUp' ? list[(index - 1 + list.length) % list.length]
      : event.key === 'Home' ? list[0] : event.key === 'End' ? list.at(-1) : undefined;
    if (next) { event.preventDefault(); next.focus(); }
  }
</script>
<svelte:window onpointerdown={outside} onkeydown={escape} />
<div bind:this={menu} popover="manual" role="menu" tabindex="-1" aria-label="Plot actions"
  ontoggle={event => { if(event.newState === 'closed' && !activating) onclose(); }}
  onkeydown={move}>
  <button bind:this={items[0]} role="menuitem" onclick={() => activate(onsettings)}>Open settings</button>
  {#if onexport}<button bind:this={items[1]} role="menuitem" onclick={() => activate(onexport)}>Export…</button>{/if}
</div>
<style>
  div {
    --bg: var(--hm-controls-background, var(--hm-theme-background, #fff));
    --fg: var(--hm-controls-color, var(--hm-theme-color, #303846));
    --accent-base: var(--hm-controls-accent, #5261d8);
    position:fixed;inset:auto;margin:0;padding:4px;
    border:1px solid color-mix(in srgb, var(--fg) 15%, var(--bg));border-radius:6px;
    background:var(--bg);color:var(--fg);color-scheme:var(--hm-theme-scheme, light);
    box-shadow:0 3px 12px #0002;min-width:160px;max-width:calc(100vw - 16px);
    font:14px var(--hm-controls-font, system-ui, sans-serif);
  }
  button {display:block;width:100%;border:0;background:none;color:inherit;text-align:left;padding:8px 12px;font:inherit;border-radius:4px;cursor:pointer}
  button:hover,button:focus-visible {background:color-mix(in srgb, var(--accent-base) 14%, var(--bg));outline:2px solid color-mix(in srgb, var(--accent-base) 60%, var(--fg));outline-offset:-2px}
</style>
