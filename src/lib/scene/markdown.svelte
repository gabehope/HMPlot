<script lang="ts">
  import { useReporter } from "../plot/utils/reporter.js";
  // Markdown (TODO 46): a text block for dashboards in any layout container: CommonMark with
  // GitHub's extensions and $math$ (MathJax), in the theme's font and text color, with {$name}
  // placeholders showing input values. It exports as an image of how it looks (a DOM capture),
  // so its exported text is not searchable: publications use Title.
  import { getContext, tick } from "svelte";
  import { optionsRoot } from "../options/options.js";
  import { INPUT_CONTEXT, placeholderText } from "../plot/utils/inputs.js";
  import { themeText } from "../plot/utils/themeText.svelte.js";
  import { DEFAULT_FONT_FAMILY, defaultFontCSS, fontReady, parseFontStack, withGenericFamily } from "../plot/utils/defaultFont.js";
  import { renderMarkdown } from "../plot/utils/markdown.js";
  import { blobDataURL } from "../plot/utils/exportDocument.js";
  import { composedDocument } from "../plot/utils/sceneDocumentExport.js";
  import { pngScale } from "../plot/utils/documentExport.js";
  import type { MarkdownProps } from "../plot/publicTypes.js";
  let { text = "", width = undefined, fontSize = undefined, color = undefined, font = undefined, align = "left",
    name = undefined }: MarkdownProps = $props();
  const theme = themeText(getContext<any>("hmplot-plot-scope") ?? optionsRoot);
  const inputs = getContext<any>(INPUT_CONTEXT) ?? null;
  const family = $derived(font ? withGenericFamily(font) : theme.family);
  const rendered = $derived.by(() => {
    try {
      return { html: renderMarkdown(placeholderText(text, inputs, "Markdown.text")), error: "" };
    } catch (error) {
      return { html: "", error: error.message };
    }
  });
  let host: HTMLElement | undefined = $state();
  let math: Promise<void> = Promise.resolve();
  // Math placeholders become MathJax SVG after each render (MathJax loads with the first).
  $effect(() => {
    rendered.html;
    const element = host;
    if (!element) return;
    let cancelled = false;
    math = (async () => {
      await tick();
      const blocks = [...element.querySelectorAll<HTMLElement>(".hm-math")];
      if (!blocks.length) return;
      const { texSVG } = await import("../plot/utils/tex.js");
      for (const block of blocks) {
        if (cancelled) return;
        try {
          block.innerHTML = await texSVG(block.dataset.tex ?? "", { display: block.dataset.display === "true" });
          block.classList.add("rendered");
        } catch (error) {
          block.classList.add("invalid");
          block.title = error.message;
        }
      }
    })();
    return () => { cancelled = true; };
  });
  /** Resolves when the block's math has rendered. */
  export const whenSettled = async () => { await tick(); await math; await fontReady(`${fontSize ?? theme.size + 1}px ${family}`); };
  // A DOM capture cannot reach the page's fonts: it carries the default font's faces when the
  // block uses them (others it finds in the page's stylesheets itself).
  async function capture(scale: number) {
    await whenSettled();
    if (!host) throw Error("Markdown is not mounted.");
    const { domToBlob } = await import("modern-screenshot");
    const usesDefault = parseFontStack(family).some((entry) => entry.toLowerCase() === DEFAULT_FONT_FAMILY.toLowerCase());
    return domToBlob(host, { scale, type: "image/png", backgroundColor: null,
      ...(usesDefault ? { font: { cssText: await defaultFontCSS() } } : {}) });
  }
  /** The block as a PNG at `scale` output pixels per CSS pixel: how it looks on screen. */
  export const exportPNG = (options = {}) => capture(pngScale(options));
  async function exportDocument(format: "svg" | "pdf", options: any = {}) {
    if (options.mode === "vector") throw Error('Markdown exports as an image; use mode="auto" (or Title for vector text).');
    const dpi = Number(options.rasterDpi ?? 300), rect = host!.getBoundingClientRect(),
      href = await blobDataURL(await capture(Math.max(0.1, dpi / 96)));
    const report = { mode: options.mode ?? "auto", vectorPrimitives: 0, rasterLayers: [{ kind: "markdown", dpi, marks: [name ?? "Markdown"] }],
      markOutcomes: [{ mark: name ?? "Markdown", kind: "markdown", rendering: "raster" }], warnings: [] };
    return composedDocument([{ svg: `<image x="0" y="0" width="${rect.width}" height="${rect.height}" preserveAspectRatio="none" href="${href}"/>`, report }],
      Math.max(1, rect.width), Math.max(1, rect.height), format, options);
  }
  /** The block as SVG: an image of it at rasterDpi (default 300). */
  export const exportSVG = (options = {}) => exportDocument("svg", options);
  /** The block as PDF: an image of it at rasterDpi (default 300). */
  export const exportPDF = (options = {}) => exportDocument("pdf", options);
  export const exportable = () => true;
  // Its error is a diagnostic of its scene node too (TODO 136.6, utils/reporter.js).
  const reportError = useReporter("Markdown");
  $effect(() => reportError(rendered.error));
</script>

{#if rendered.error}<p role="alert" class="hm-markdown-error">{rendered.error}</p>
{:else}
  <div class="hm-markdown" bind:this={host} data-name={name} style:max-width={typeof width === "number" ? `${width}px` : width}
    style:font-family={family} style:font-size={`${fontSize ?? theme.size + 1}px`} style:color={color ?? theme.color}
    style:text-align={align}>{@html rendered.html}</div>
{/if}

<style>
  .hm-markdown { line-height: 1.5; overflow-wrap: anywhere; }
  .hm-markdown :global(:first-child) { margin-top: 0; }
  .hm-markdown :global(:last-child) { margin-bottom: 0; }
  .hm-markdown :global(h1) { font-size: 1.6em; margin: 0.6em 0 0.3em; line-height: 1.25; }
  .hm-markdown :global(h2) { font-size: 1.35em; margin: 0.6em 0 0.3em; line-height: 1.25; }
  .hm-markdown :global(h3) { font-size: 1.15em; margin: 0.6em 0 0.3em; }
  .hm-markdown :global(h4), .hm-markdown :global(h5), .hm-markdown :global(h6) { font-size: 1em; margin: 0.6em 0 0.3em; }
  .hm-markdown :global(p), .hm-markdown :global(ul), .hm-markdown :global(ol), .hm-markdown :global(blockquote),
  .hm-markdown :global(table), .hm-markdown :global(pre) { margin: 0 0 0.7em; }
  .hm-markdown :global(ul), .hm-markdown :global(ol) { padding-left: 1.5em; }
  .hm-markdown :global(li.task) { list-style: none; margin-left: -1.3em; }
  .hm-markdown :global(blockquote) { padding-left: 0.8em; border-left: 3px solid currentColor; opacity: 0.8; }
  .hm-markdown :global(code) { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.9em; }
  .hm-markdown :global(pre) { overflow-x: auto; padding: 0.6em 0.8em; background: color-mix(in srgb, currentColor 7%, transparent); border-radius: 4px; }
  .hm-markdown :global(table) { border-collapse: collapse; }
  .hm-markdown :global(th), .hm-markdown :global(td) { padding: 0.25em 0.6em; border-bottom: 1px solid color-mix(in srgb, currentColor 25%, transparent); }
  .hm-markdown :global(a) { color: inherit; text-decoration: underline; }
  .hm-markdown :global(img) { max-width: 100%; }
  .hm-markdown :global(.hm-math[data-display="true"]) { text-align: center; margin: 0.5em 0; }
  .hm-markdown :global(.hm-math.invalid) { color: #9d3535; }
  .hm-markdown :global(.footnotes) { font-size: 0.85em; opacity: 0.85; }
  .hm-markdown-error { margin: 0; font: 12px system-ui, sans-serif; color: #9d3535; }
</style>
