<script>
  import { useReporter } from "./utils/reporter.js";
  // A Plot's or Facet's title and subtitle (part="heading", above it) or caption (part="caption",
  // below it) (TODO 46): HTML in the theme's text font and color, the title larger. Exports write
  // them as text where the page laid them out (utils/textExport.js reads [data-plot-text]).
  import { getContext, untrack } from "svelte";
  import { INPUT_CONTEXT, placeholderText } from "./utils/inputs.js";
  import { themeText } from "./utils/themeText.svelte.js";
  let { options, part = "heading", title = undefined, subtitle = undefined, caption = undefined, id = undefined } = $props();
  // The options scope is the owner's, fixed for its life.
  const style = themeText(untrack(() => options));
  // {$name} placeholders show an input's value, as the input shows it, and follow it.
  const inputs = getContext(INPUT_CONTEXT) ?? null;
  const texts = $derived.by(() => {
    try {
      return { title: placeholderText(title, inputs, "title"), subtitle: placeholderText(subtitle, inputs, "subtitle"),
        caption: placeholderText(caption, inputs, "caption"), error: "" };
    } catch (error) {
      return { title: "", subtitle: "", caption: "", error: error.message };
    }
  });
  // Its error is a diagnostic of its scene node too (TODO 136.6, utils/reporter.js).
  const reportError = useReporter();
  // A host stylesheet restyles the title block with --hm-title-*, --hm-subtitle-font-size and
  // --hm-caption-font-size on any element around the plot, over the theme (TODO 132.7). Exports
  // read the laid-out elements' computed style, so they follow.
  const css = (property, value, element = "title") => `var(--hm-${element}-${property}, ${value})`;
  $effect(() => reportError(part === "heading" ? texts.error : ""));
</script>

{#if texts.error && part === "heading"}<p role="alert" class="plot-text-error">{texts.error}</p>
{:else if part === "heading" && (texts.title || texts.subtitle)}
  <header class="plot-heading" style:font-family={css("font", style.family)} style:color={css("color", style.color)}
    style:text-align={css("align", style.align)} style:padding-bottom={css("spacing", `${style.spacing}px`)}>
    {#if texts.title}<h2 class="plot-title" {id} data-plot-text style:font-size={css("font-size", `${style.titleSize}px`)}
      style:font-weight={css("font-weight", style.titleWeight)}>{texts.title}</h2>{/if}
    {#if texts.subtitle}<p class="plot-subtitle" data-plot-text style:font-size={css("font-size", `${style.subtitleSize}px`, "subtitle")}>{texts.subtitle}</p>{/if}
  </header>
{:else if part === "caption" && texts.caption}
  <p class="plot-caption" data-plot-text style:font-family={css("font", style.family)} style:color={css("color", style.color)}
    style:text-align={css("align", style.align)} style:font-size={css("font-size", `${style.captionSize}px`, "caption")}>{texts.caption}</p>
{/if}

<style>
  .plot-heading { padding: 2px 4px 8px; }
  .plot-title { margin: 0; line-height: 1.25; }
  .plot-subtitle { margin: 2px 0 0; font-weight: 400; line-height: 1.3; opacity: 0.75; }
  .plot-caption { margin: 0; padding: 6px 4px 2px; line-height: 1.3; opacity: 0.7; }
  .plot-text-error { margin: 0; padding: 4px; font: 12px system-ui, sans-serif; color: #9d3535; }
</style>
