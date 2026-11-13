<script module>
  // The first-party plugins (the sky, the atmosphere; TODO 138.5), which Python scenes name as
  // built-in effects: registered before any scene draws.
  import { registerFirstPartyPlugins } from "../plugins/index.js";
  registerFirstPartyPlugins();
</script>

<script>
  import { setContext } from "svelte";
  import SceneNode from "./SceneNode.svelte";
  // `fill` (TODO 132.5): a Plot without a width fills its host (a notebook cell, an exported
  // page) instead of stopping at 800px. The docs' examples keep the 800px default, as headless
  // image exports do (runtime.fill).
  let { runtime, notebook = false, fill = true } = $props();
  setContext("hmplot-fill-host", () => fill && runtime.fill);
</script>

<div class="hmplot-notebook" class:framed={notebook}>
  {#if runtime.error || runtime.rejected}<div role="alert">{runtime.error || runtime.rejected}</div>{/if}
  {#if runtime.snapshot}
    <figure class="hmplot-snapshot">
      {#if runtime.snapshot.src}
        <img src={runtime.snapshot.src} alt={runtime.snapshot.alt} width={runtime.snapshot.width} height={runtime.snapshot.height} />
      {/if}
      <figcaption role="status">{runtime.snapshot.note}</figcaption>
    </figure>
  {/if}
  <!-- A new root (a Python Run's scene, an example rebuilt) is a new tree: its kind and its inputs
       start over (TODO 69.16). Python's updates keep the root's id. -->
  {#if runtime.root}{#key runtime.root.id}<SceneNode node={runtime.root} {runtime} />{/key}{/if}
</div>

<style>
  .hmplot-notebook {
    width: 100%;
    min-width: 0;
    font: 13px system-ui;
    color: #30343b;
  }
  .hmplot-notebook.framed {
    width: auto;
    max-width: 100%;
    box-sizing: border-box;
    margin: 8px 0;
    padding: var(--hmplot-notebook-frame-padding, 12px);
    border: 1px solid var(--hmplot-notebook-frame-border, #dfe3e8);
    border-radius: var(--hmplot-notebook-frame-radius, 8px);
    background: var(--hmplot-notebook-frame-background, #f7f8fb);
    box-shadow: 0 1px 3px #1722460d;
  }
  .hmplot-notebook :global(*) {
    box-sizing: border-box;
  }
  [role="alert"] {
    padding: 10px;
    color: #a32b30;
    background: #fff0ef;
  }
  .hmplot-snapshot {
    margin: 0;
  }
  .hmplot-snapshot img {
    display: block;
    max-width: 100%;
    height: auto;
    background: white;
  }
  .hmplot-snapshot figcaption {
    margin-top: 6px;
    color: #5b6573;
  }
</style>
