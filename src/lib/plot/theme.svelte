<script>
  import { getContext, setContext, onDestroy, untrack } from "svelte";
  import { OptionsNode, optionsRoot } from "../options/options.js";
  import { ensureHeatmapOptions } from "./objects/defaultOptions.js";
  import { FieldType } from "./objects/types.js";
  import {
    THEME_CONTEXT,
    mergeThemes,
    inheritText,
    partialLayer,
    resolveHostText,
    themeInherits,
    themeOptionValues,
    themeSnapshot,
  } from "./utils/theme.js";
  import { themes } from "./utils/themePresets.js";
  import { registerShapes } from "./utils/shapes.js";
  import { resolveColor } from "./utils/shade.js";
  import { ensureLegendOptions, ensureTitleOptions } from "./utils/themeText.svelte.js";

  let { value, children } = $props();
  const parentTheme = getContext(THEME_CONTEXT);
  const parentOptions = getContext("hmplot-plot-scope") ?? optionsRoot;
  ensureHeatmapOptions(parentOptions);
  // theme.title's options (TODO 132.1): the Plots and Facets below read them.
  ensureTitleOptions(parentOptions);
  ensureLegendOptions(parentOptions);
  // theme.numbers.format (TODO 132.4): ticks, legends and tooltips below read it (numberLabels.js).
  parentOptions.ensure("numberFormat", new FieldType({ defaultValue: "", ui: false }));
  // theme.animation's enter and exit (TODO 132.7): marks below read them where they set none.
  for (const key of ["enterEffect", "exitEffect"]) parentOptions.ensure(key, new FieldType({ defaultValue: null, ui: false }));
  const options = new OptionsNode(parentOptions, undefined, "Theme");
  options.isThemeScope = true;
  options.setPresentation({ kind: "theme", label: "Theme", type: "Theme" });
  setContext("hmplot-plot-scope", options);

  const inherited = () => parentTheme?.read?.() ?? themes.hmplot;
  // "inherit" fonts and text colors (TODO 132.5) take the host's, read once the anchor below
  // mounts (readHost); until then the parent theme's apply.
  let anchor = $state(), host = null, inherits = $state(false);
  // The theme before "inherit" is resolved: inputs keep their own host's font (TODO 132.3).
  let unresolved;
  // A theme with colors of its own and no vectorTile section does not take its parent's basemap
  // scheme: VectorTile derives one from its colors (a custom dark theme under the default
  // minimal must not get a light basemap). An inherited text color is not a scheme of its own.
  const compose = (parent, own) => {
    // A partial theme nested here changes only its section, not the page theme's name (TODO 132.7).
    own = partialLayer(own);
    const merged = mergeThemes(parent, own), textColor = own.typography?.color;
    if (own.vectorTile === undefined && (own.view?.background !== undefined || (textColor !== undefined && textColor !== "inherit")))
      delete merged.vectorTile;
    inheritText(merged);
    inherits = themeInherits(merged);
    unresolved = mergeThemes(parentTheme?.unresolved?.() ?? parent, own);
    return resolveHostText(merged, host, parent);
  };
  let current = untrack(() => compose(inherited(), themeSnapshot(value)));
  const listeners = new Set();
  const scope = {
    read: () => current,
    unresolved: () => unresolved,
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
  setContext(THEME_CONTEXT, scope);

  // The theme is a lazy layer (TODO 136.12; OptionsNode.setThemeValues): its values are read when
  // an option is, so a component that registers its keys after the theme applied (a Plot under
  // Theme > Data > Simulate, TODO 136.1) reads them without the theme publishing again.
  // The plot child is made here, so its values have a node before any Plot mounts.
  const plotOptions = options.ensureChild("plot");
  function publish() {
    current = compose(inherited(), themeSnapshot(value));
    options.isThemeScope = true;
  options.setPresentation({
      kind: "theme",
      label: current.name ? `Theme: ${current.name}` : "Theme",
      type: "Theme",
    });
    // Theme shapes join the page's shape vocabulary before marks read them.
    registerShapes(current.shapes ?? {});
    const values = themeOptionValues(current);
    options.setThemeValues(values.root);
    plotOptions.setThemeValues(values.plot);
    listeners.forEach((fn) => fn(current));
  }

  // The host's font is the page's, outside a scene's frame (SceneRenderer's .hmplot-notebook);
  // its text color is the frame's when the frame paints a background of its own (a notebook's),
  // so text stays readable on it. A color in any CSS space becomes hex, as GPU text reads it. A
  // tree mounted before its container joins the page reads once it has (a frame at a time).
  $effect(() => {
    if (!anchor) return;
    let frame = 0, tries = 0;
    const readHost = () => {
      if (!anchor?.isConnected) {
        if (anchor && tries++ < 600) frame = requestAnimationFrame(readHost);
        return;
      }
      const scene = anchor.closest(".hmplot-notebook");
      const outside = getComputedStyle(scene?.parentElement ?? anchor.parentElement ?? anchor);
      const color = scene?.classList.contains("framed") ? getComputedStyle(scene).color : outside.color;
      host = { fontFamily: outside.fontFamily || undefined, color: color ? resolveColor(color) : undefined };
      untrack(publish);
    };
    readHost();
    return () => cancelAnimationFrame(frame);
  });
  const stopParent = parentTheme?.subscribe?.(() => untrack(publish));
  let stopValue = () => {};
  $effect(() => {
    const source = value;
    stopValue();
    stopValue = source?.subscribe?.(() => untrack(publish)) ?? (() => {});
    untrack(publish);
    return () => stopValue();
  });
  onDestroy(() => {
    stopValue();
    stopParent?.();
    options.dispose();
    listeners.clear();
  });
</script>

{#if inherits}<span class="hm-theme-host" hidden bind:this={anchor}></span>{/if}
{@render children?.()}
