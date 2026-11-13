<script lang="ts">
  import { useReporter } from "./utils/reporter.js";
  // Title (TODO 46): plain text for layouts, drawn as SVG text laid out on the host (lines broken
  // at "\n" and, with wrap, at the block's width), so its SVG and PDF exports are the same text,
  // vector and searchable. For publications; Markdown is for dashboards. Its text can hold live
  // values (TODO 136.16 slice 4, a readout): reductions over the Data around it, such as
  // count({where: "@brushed"}), written as tooltips write numbers or in their own format.
  import { getContext } from "svelte";
  import { optionsRoot } from "../options/options.js";
  import { INPUT_CONTEXT, placeholderText } from "./utils/inputs.js";
  import { themeText } from "./utils/themeText.svelte.js";
  import { withGenericFamily, fontReady } from "./utils/defaultFont.js";
  import { breakLines, titleSize } from "./utils/textLayout.js";
  import { composedDocument } from "./utils/sceneDocumentExport.js";
  import { pngScale } from "./utils/documentExport.js";
  import { liveValues } from "./utils/liveValues.svelte.js";
  import { isExpression } from "./utils/expressions.js";
  import { formatValue } from "./utils/tooltip.js";
  import { themeNumberFormat } from "./utils/numberLabels.js";
  import { textFormat } from "./utils/numericText.js";
  import { useViewServices } from "./utils/viewServices.js";
  import type { TitleProps } from "./publicTypes.js";
  let { text = "", size = "title", weight = undefined, align = "left", color = undefined, font = undefined, wrap = true,
    name = undefined }: TitleProps = $props();
  const scope = getContext<any>("hmplot-plot-scope") ?? optionsRoot;
  const theme = themeText(scope);
  const inputs = getContext<any>(INPUT_CONTEXT) ?? null;
  let width = $state(0), loaded = $state(0);
  const style = $derived.by(() => {
    const px = titleSize(size, theme.size);
    return {
      px, family: font ? withGenericFamily(font) : theme.family, color: color ?? theme.color,
      weight: weight ?? (size === "title" || size === undefined ? 600 : 400),
      opacity: size === "subtitle" ? 0.75 : size === "caption" ? 0.7 : 1,
    };
  });
  const fontString = $derived(`${style.weight} ${style.px}px ${style.family}`);
  // Words are measured in the loaded face, so the lines break once.
  $effect(() => {
    const current = fontString;
    fontReady(current).then(() => { if (current === fontString) loaded++; });
  });
  let context: CanvasRenderingContext2D | null = null;
  // The text's parts: strings, and live values (an expression, or { value, format }).
  const parts = $derived(Array.isArray(text) ? text : [text]);
  const live = liveValues(() => parts.map((part: any) => (isExpression(part?.value) ? part.value : part)),
    useViewServices(), {
      where: () => "Title.text",
      needsData: () => "Title.text has a live value (a reduction such as count()), so the Title needs data around it: put it inside a Data.",
    });
  /** A live value as text: "—" until it is read, or when no row has one. */
  function written(value: unknown, format: string | undefined) {
    if (value === null || value === undefined) return "—";
    // In the column's zone (scopeValue's zonedDate), not UTC.
    if (value instanceof Date)
      return formatValue(value.getTime(), { type: "datetime", origin: 0, timezone: (value as any).timezone ?? "UTC" }, format);
    return formatValue(value, undefined, format, themeNumberFormat(scope));
  }
  const resolved = $derived.by(() => {
    try {
      const values = live.values;
      const value = parts.map((part: any, i) => {
        if (typeof part === "string" || part === undefined || part === null) return placeholderText(part, inputs, "Title.text");
        const format = part?.format === undefined ? undefined : textFormat(part.format);
        // A value evaluated for an earlier text is not this part's: "—" until it is read.
        const expression = isExpression(part) ? part : isExpression(part?.value) ? part.value : null;
        if (expression) return written(live.inputs?.[i] === expression ? values?.[i] : null, format);
        throw Error(`Title.text parts are strings and live values, an expression or { value, format }; received ${JSON.stringify(part)}.`);
      }).join("");
      return { value, error: live.error };
    } catch (error) {
      return { value: "", error: error.message };
    }
  });
  const layout = $derived.by(() => {
    loaded;
    if (typeof document === "undefined") return { lines: [], height: 0, baseline: 0, line: 0 };
    context ??= document.createElement("canvas").getContext("2d");
    context.font = fontString;
    const lines = breakLines(resolved.value, width, (value) => context.measureText(value).width, wrap);
    const metrics = context.measureText("Hg"), ascent = metrics.fontBoundingBoxAscent || style.px * 0.8,
      descent = metrics.fontBoundingBoxDescent || style.px * 0.2, line = Math.round(style.px * 1.25 * 100) / 100;
    return { lines, line, height: lines.length * line, baseline: (line - ascent - descent) / 2 + ascent };
  });
  const anchor = $derived(align === "center" ? "middle" : align === "right" ? "end" : "start");
  const x = $derived(align === "center" ? width / 2 : align === "right" ? width : 0);
  const escape = (value) => String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[c]));
  // The same lines as the page draws them, as SVG text.
  const textSVG = () => layout.lines.map((value, i) =>
    `<text x="${x}" y="${i * layout.line + layout.baseline}" text-anchor="${anchor}" fill="${escape(style.color)}" font-family="${escape(style.family)}" font-size="${style.px}" font-weight="${style.weight}"${style.opacity < 1 ? ` opacity="${style.opacity}"` : ""}>${escape(value)}</text>`).join("");
  const report = () => ({ mode: "vector", vectorPrimitives: 0, rasterLayers: [], markOutcomes: [], warnings: [] });
  const exportDocument = async (format, options = {}) => {
    await fontReady(fontString);
    return composedDocument([{ svg: textSVG(), report: report() }], Math.max(1, width), Math.max(1, layout.height), format, options);
  };
  /** The title as SVG (its lines as text): { blob, report }. */
  export const exportSVG = (options = {}) => exportDocument("svg", options);
  /** The title as PDF (its lines as text, in the embedded default font where it uses it). */
  export const exportPDF = (options = {}) => exportDocument("pdf", options);
  /** The title as a PNG at `scale` output pixels per CSS pixel. */
  export async function exportPNG(options = {}) {
    const scale = pngScale(options);
    await fontReady(fontString);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.ceil(width * scale));
    canvas.height = Math.max(1, Math.ceil(layout.height * scale));
    const ctx = canvas.getContext("2d");
    ctx.font = `${style.weight} ${style.px * scale}px ${style.family}`;
    ctx.fillStyle = style.color;
    ctx.globalAlpha = style.opacity;
    ctx.textAlign = align === "center" ? "center" : align === "right" ? "right" : "left";
    layout.lines.forEach((value, i) => ctx.fillText(value, x * scale, (i * layout.line + layout.baseline) * scale));
    return new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(Error("PNG encoding failed."))), "image/png"));
  }
  export const exportable = () => true;
  /** The text as shown (placeholders read), for export metadata. */
  export const getTitle = () => resolved.value.replace(/\s*\n\s*/g, " ").trim();
  /** The laid-out lines (for tests and callers that place the text themselves). */
  export const getLines = () => [...layout.lines];
  // Its error is a diagnostic of its scene node too (TODO 136.6, utils/reporter.js).
  const reportError = useReporter("Title");
  $effect(() => reportError(resolved.error));
</script>

<div class="hm-title-block" bind:clientWidth={width} data-name={name}>
  {#if resolved.error}<p role="alert" class="hm-title-error">{resolved.error}</p>
  {:else}
    <svg role="heading" aria-level={size === "title" || size === undefined ? 2 : 3} aria-label={resolved.value}
      width="100%" height={layout.height} style:overflow="visible">
      {#each layout.lines as value, i}
        <text x={x} y={i * layout.line + layout.baseline} text-anchor={anchor} fill={style.color} font-family={style.family}
          font-size={style.px} font-weight={style.weight} opacity={style.opacity < 1 ? style.opacity : undefined}>{value}</text>
      {/each}
    </svg>
  {/if}
</div>

<style>
  .hm-title-block { width: 100%; min-width: 0; }
  svg { display: block; }
  .hm-title-error { margin: 0; font: 12px system-ui, sans-serif; color: #9d3535; }
</style>
