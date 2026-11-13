<script lang="ts">
  import GuideView from "./guideView.svelte";
  import { explainedGuides, resolveGuide, seriesEntries } from "../utils/guides.js";
  let { registry, position, defaultLegend = false, suppress = false }: any = $props();
  let revision = $state(0);
  $effect(() => registry.subscribe(() => revision++));
  const guides = $derived.by(() => {
    revision;
    const seen = new Set();
    return [...registry.guides.values()].filter((g) => {
      if (g.position !== position || (g.key && seen.has(g.key))) return false;
      if (g.key) seen.add(g.key);
      return true;
    });
  });
  // Nested plots (Facet cells) forward their automatic legend setting to this registry.
  // An explicit legend={false} on the host wins over the cells' requests.
  const requested = $derived.by(() => { revision; return !suppress && (defaultLegend || registry.automatic); });
  // A Plot's default legend (`categorical`, TODO 136.17) explains only colors mapped from a
  // category column; legend=true explains every channel and lists the labeled marks.
  const categorical = $derived(typeof requested === "object" && !!requested.categorical);
  // The plot's explicit Legends: the automatic legend leaves the channels they explain (134.9).
  const legends = $derived.by(() => { revision; return [...registry.guides.values()].filter((g) => g.target); });
  // Drawn when it shows something; legend=true with nothing to explain still draws (its lint
  // says so), but not when explicit Legends explain all of it.
  const shows = $derived.by(() => {
    revision;
    if (!categorical && !legends.length) return true;
    // A Legend with no channel over the whole plot already shows all of it.
    if (legends.some((g) => !g.channel && resolveGuide(g.target())?.kind === "plot")) return false;
    const entries = seriesEntries(registry.handle).filter((entry: any) => entry.participates);
    if (explainedGuides(entries, undefined, { categorical, legends }).length > 0 ||
      !categorical && entries.some((entry: any) => entry.labeled)) return true;
    // legend=true over marks that map nothing still draws, so its lint says so.
    return !categorical && !explainedGuides(entries).length;
  });
  const automatic = $derived(
    requested &&
      (typeof requested === "object"
        ? (requested.position ?? "bottom")
        : "bottom") === position && shows,
  );
</script>

{#if guides.length || automatic}<div
    class="guide-host"
    class:vertical={position === "left" || position === "right"}
    data-guide-position={position}
  >
    <!-- The automatic legend explains the marks' encodings, then lists the labeled marks, as a
      bare Legend does (TODO 73.5). -->
    {#if automatic}<GuideView target={registry.handle} {position} explain {categorical} {legends} />{/if}
    {#each guides as guide}{@render guide.snippet()}{/each}
  </div>{/if}

<style>
  .guide-host {
    display: flex;
    gap: 12px;
    justify-content: center;
    padding: 8px;
    box-sizing: border-box;
    min-width: 0;
  }
  .vertical {
    flex-direction: column;
    max-width: 180px;
    justify-content: flex-start;
  }
</style>
