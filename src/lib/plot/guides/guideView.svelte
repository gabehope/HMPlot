<script>
  import { useReporter } from "../utils/reporter.js";
  import { untrack, onDestroy } from "svelte";
  import {
    guideObject,
    guideSymbol,
    guideFillRule,
    categoryEntries,
    explainedGuides,
    guideGroups,
    rampSamples,
    temporalFormat,
    markEntry,
    resolveGuide,
    seriesEntries,
    toggleSeries,
  } from "../utils/guides.js";
  import { guideBounds } from "../utils/guideBounds.js";
  import { markBinding } from "../utils/markBinding.js";
  import { claimLegend } from "../utils/legendClaims.js";
  import { withGenericFamily } from "../utils/defaultFont.js";
  import { LEGEND_KEYS } from "../utils/themeText.svelte.js";
  import { scaleFraction, scaleValueAt } from "../utils/scaleTransforms.js";
  import { missingColorOf } from "../utils/colormap.js";
  import { hasMissingValues } from "../utils/scaleBindings.js";
  import { trackPreparation } from '../rendering/viewSettlement.js';
  import { format } from "d3";
  import { groupsThousands, legendNumberFormat, roundedLabel, valueLabel } from "../utils/numberLabels.js";
  import Gradient from "./gradient.svelte";
  import Ramp from "./ramp.svelte";
  import GuideView from "./guideView.svelte";
  let {
    target,
    channel = undefined,
    label = undefined,
    position = "bottom",
    // A Legend without a channel (TODO 62.3): explain every encoding, then the labeled marks.
    explain = false,
    // With explain: only colors mapped from a category column, and no labeled marks (a Plot's
    // default legend, TODO 136.17); `legends`, explicit Legends whose channels it leaves out.
    categorical = false,
    legends = [],
    // The Legend's own reporters ({warning, lint}, TODO 136.13): a guide renders in its plot's
    // host, so a reporter found here names the plot. A guide inside a guide uses the host's.
    reporters = undefined,
    // A guide inside a guide (an explained or grouped legend's parts) takes its text style from
    // the outer one, so a host's relative --hm-legend-font-size (1.25em) applies once (TODO 132.7).
    nested = false,
  } = $props();
  let revision = $state(0),
    entries = $state.raw([]),
    error = $state(""),
    bounds = $state.raw([0, 1]);
  let previous = null,
    lastKey = "",
    boundsKey = "",
    busy = false,
    alive = true,
    nextBounds = 0,
    timer;
  onDestroy(() => clearTimeout(timer));
  onDestroy(() => (alive = false));
  const source = $derived(resolveGuide(target));
  // Several marks: one guide per distinct scale, so marks sharing a scale resource share a
  // colorbar (or ramp, or swatches) and marks with automatic scales keep their own. Groups
  // are titled apart: by scale resource label, else first mark label (see guideGroups).
  const groups = $derived.by(() => {
    revision;
    if (!channel || !(Array.isArray(source) || source?.kind === "plot")) return null;
    return guideGroups(seriesEntries(source), channel, label);
  });
  const mark = $derived(channel && !groups ? guideObject(source) : null);
  // A bare Legend: one guide per encoding of its marks (explainedGuides); the labeled marks'
  // entries follow in a view of their own.
  const explained = $derived.by(() => {
    revision;
    if (!explain || channel) return null;
    const guides = explainedGuides(seriesEntries(source).filter((entry) => entry.participates), label, { categorical, legends });
    return guides.length ? guides : null;
  });
  // The title: the Legend's label, else the display name of the column the mark's channel plots
  // (as an axis title; a NetCDF variable's long name and units, TODO 48.6).
  const title = $derived.by(() => { revision; return label ?? markBinding(mark)?.legend?.channelTitles?.[channel]; });
  const categories = $derived.by(() => { revision; return categoryEntries(mark, channel); });
  // A datetime column reaches the GPU as milliseconds from its origin; ticks map back.
  const temporal = $derived.by(() => { revision; return markBinding(mark)?.legend?.temporal?.[channel] ?? null; });
  const dateFormat = (span) => temporalFormat(temporal, mark?.options.get("legendTickFormat"), span);
  // Ramps label a handful of domain values; grouped digits read better than exponents.
  const numberFormat = $derived.by(() => {
    // A format the mark sets, else the theme's (TODO 132.4), else as a tooltip writes the value.
    const chosen = legendNumberFormat(mark?.options);
    const readable = (value) => valueLabel(value);
    if (!chosen) return readable;
    try { return format(chosen); }
    catch { return readable; }
  });
  const dataUnits = $derived(channel === "size" && mark?.options?.get?.("sizeUnits") === "data");
  let opacityExtent = $state.raw(null), opacityPending = $state(false);
  $effect(() => {
    revision;
    const read = channel === "opacity" && !categories ? markBinding(mark)?.legend?.readOpacityExtent : null;
    if (!read) { opacityExtent = null; opacityPending = false; return; }
    let canceled = false;
    opacityPending = true;
    const work = read().then((extent) => { if (!canceled) opacityExtent = extent; },
      () => { if (!canceled) opacityExtent = null; })
      .finally(() => { if (!canceled) opacityPending = false; });
    if (mark.view) trackPreparation(mark.view, work);
    return () => { canceled = true; };
  });
  // Continuous size/width read the normalization the shader uses; opacity columns are alphas.
  const ramp = $derived.by(() => {
    revision;
    if (!mark || categories || !["size", "width", "opacity"].includes(channel)) return null;
    const o = mark.options;
    if (channel === "opacity") {
      const extent = opacityExtent;
      if (!extent) return null;
      return rampSamples({ domain: extent, range: extent.map((v) => Math.min(1, Math.max(0, v))) });
    }
    if (!markBinding(mark)?.scales?.[channel]) return null;
    const prefix = channel === "size" ? "scale" : "width";
    const samples = rampSamples({ domain: o.get(prefix + "Bounds"), range: o.get(prefix + "Range"),
      transform: o.get(prefix + "Transform") ?? "linear", constant: o.get(prefix + "TransformConstant") ?? 1,
      midpoint: o.get(prefix + "Midpoint") ?? undefined });
    // sizeUnits="data": the mark is `size` data units wide (the pixel range is bypassed), so
    // the glyphs are proportional to the sample values, the largest drawn 20 px wide.
    if (dataUnits) {
      const largest = Math.max(...samples.map((s) => Math.abs(s.value)), 0);
      return samples.map((s) => ({ ...s, output: largest > 0 ? 20 * Math.abs(s.value) / largest : 0 }));
    }
    return samples;
  });
  const rampFormat = $derived.by(() => {
    if (!temporal || !ramp?.length) return numberFormat;
    return dateFormat(Math.abs(ramp.at(-1).value - ramp[0].value));
  });
  // Appearance arrives after the mark's first upload; re-read it with each revision.
  const rampStyle = $derived.by(() => { revision; return mark ? markEntry(mark) : null; });
  const rampMessages = {
    size: "A size legend needs size mapped from a data column or sizeScale.",
    width: "A width legend needs width mapped from a data column or widthScale.",
    opacity: "An opacity legend needs opacity mapped from a data column.",
  };
  const vertical = $derived(position === "left" || position === "right");
  // Hiding a category hides it in every mount of the mark (Facet cells, Partition groups):
  // the mark routes the toggle through its registry's shared state.
  function toggleCategory(value, isolate) {
    markBinding(mark)?.legend?.toggle(channel, value, isolate);
  }
  $effect(() => {
    const sources = Array.isArray(source) ? source.map(resolveGuide) : [source];
    const off = sources
      .filter(Boolean)
      .map((s) => s.subscribe?.(() => untrack(() => revision++)));
    untrack(() => revision++);
    return () => off.forEach((f) => f?.());
  });
  $effect(() => {
    revision;
    const next = seriesEntries(source, source?.kind === "plot"),
      key = JSON.stringify(next.map(({ handle, ...e }) => e));
    if (key !== lastKey) {
      lastKey = key;
      entries = next;
    }
  });
  // A guide drawn for a mark's channel explains it (legendClaims.js): a color no guide claims lints.
  $effect(() => (mark && channel ? claimLegend(mark, channel) : undefined));
  $effect(() => {
    revision;
    if (!channel || !source || groups) {
      error = "";
      return;
    }
    if (!mark) {
      error = `A ${channel} legend requires a mark.`;
      return;
    }
    if (markBinding(mark)?.legend?.categories?.[channel]) { error = ""; return; }
    if (rampMessages[channel]) {
      error = ramp || channel === "opacity" && opacityPending ? "" : rampMessages[channel];
      return;
    }
    if (!["fill", "color"].includes(channel)) {
      error = `A ${channel} legend needs ${channel} mapped from a category column.`;
      return;
    }
    const field =
      mark.fields.get(channel) ??
      (channel === "fill" && mark.band ? mark.fields.get("color") : null);
    if (!field?.data) {
      error = "";
      return;
    }
    if (
      !field.isBufferNode ||
      field.image ||
      (field.channels !== 1 && !field.buffer?.isTexture)
    ) {
      error = "This channel does not contain a scalar color mapping.";
      return;
    }
    error = "";
    const resolved = markBinding(mark)?.scales?.[channel];
    if (resolved?.isContinuous) {
      const domain = resolved.domain ?? [0, 1];
      const key = `${resolved.id}:${resolved.version}:${domain.join(",")}`;
      if (key !== boundsKey) {
        bounds = domain;
        boundsKey = key;
      }
      return;
    }
    const o = mark.options,
      normalization = field.buffer?.isTexture
        ? (o.get("normalization") ?? "auto")
        : "none";
    const key = JSON.stringify([
      field.version,
      field.animationVersion,
      o.get("valueBounds"),
      o.get("valueTransform"),
      scaleSpec(o, null).constant,
      scaleSpec(o, null).midpoint,
      normalization,
    ]);
    if (key === boundsKey || busy) return;
    if (performance.now() < nextBounds) {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (alive) untrack(() => revision++);
      }, nextBounds - performance.now());
      return;
    }
    nextBounds = performance.now() + 200;
    busy = true;
    const current = mark,
      sourceVersion = field.version;
    (async () => {
      await mark.manager.chain;
      let raw = [0, 1];
      if (normalization !== "none") {
        // Only two reduction scalars cross to the host, never the observations.
        raw = await guideBounds(current, field);
        if (normalization === "symmetric") {
          const m = Math.max(Math.abs(raw[0]), Math.abs(raw[1]), 1e-8);
          raw = [0, m];
        }
      }
      const b = o.get("valueBounds") ?? [0, 1];
      if (
        alive &&
        mark === current &&
        !current.isDisposed &&
        sourceVersion === field.version
      ) {
        bounds = b.map((v) =>
          normalization === "none" ? v : raw[0] + v * (raw[1] - raw[0]),
        );
        boundsKey = key;
      }
    })()
      .catch((e) => {
        if (alive && mark === current) {
          error = e.message;
          boundsKey = key;
        }
      })
      .finally(() => {
        busy = false;
        if (alive) untrack(() => revision++);
      });
  });
  // The theme's guide text, read where the guide's mark (or first entry) resolves it and followed
  // as a theme changes it: a channel's view re-rendered only for its mark and kept the first
  // theme's font (TODO 73.5, where the automatic legend's encodings showed it).
  // A guide of guides (a Plot's automatic legend) reads its first part's: its parts inherit its
  // text (`nested`), so the theme's reaches them through it (TODO 132.7).
  const textOptions = $derived(mark?.options ?? guideObject(entries[0]?.handle)?.options ??
    guideObject(explained?.[0]?.handle)?.options ?? guideObject(groups?.[0]?.handle)?.options);
  let textRevision = $state(0);
  $effect(() => {
    const options = textOptions;
    if (!options?.on) return;
    const stops = ["legendFontFamily", "legendFontSize", "legendTextColor", ...LEGEND_KEYS].map((key) => options.on(() => textRevision++, key));
    return () => stops.forEach((stop) => stop());
  });
  const text = $derived.by(() => {
    textRevision;
    const read = (key) => textOptions?.get(key);
    return { size: read("legendFontSize") ?? 12, family: withGenericFamily(read("legendFontFamily")),
      color: read("legendTextColor") ?? "#40505d",
      // theme.guides (TODO 132.2): unset ("auto", 0, a weight of 500) keeps the look before.
      layout: read("legendLayout") ?? "auto", swatch: (Number(read("legendSwatchSize")) || 12) / 12,
      shape: read("legendSwatchShape") ?? "auto", titleSize: Number(read("legendTitleFontSize")) || undefined,
      titleWeight: Number(read("legendTitleFontWeight")) || 500 };
  });
  // Entries flow in a row below or above a plot and stack beside it, unless the theme says.
  const stacked = $derived(text.layout === "auto" ? vertical : text.layout === "stacked");
  // A filled swatch in the theme's shape; a line or text entry keeps its own.
  const swatchShape = (shape) => text.shape === "auto" || shape === "line" || shape === "text" ? shape : text.shape;
  // The colorbar's scale: its transform, symlog constant and midpoint (TODO 39.1-39.2).
  // (Keys built from the prefix: the Python API generator reads literal option names as props.)
  const scaleSpec = (o, b, prefix = "value") => ({ domain: b, transform: o?.get("valueTransform") ?? "linear",
    constant: o?.get(prefix + "TransformConstant") ?? 1, midpoint: o?.get(prefix + "Midpoint") ?? undefined });
  const constant = $derived.by(() => {
    revision;
    if (bounds[0] !== bounds[1]) return undefined;
    const o = mark?.options,
      b = o?.get("valueBounds") ?? [0, 1];
    const input = (o?.get("normalization") ?? "auto") === "auto" ? 0 : b[0];
    const t = scaleFraction(input, scaleSpec(o, b));
    return Number.isFinite(t) ? t : 0.5;
  });
  // A colorbar whose mark holds a missing value (NaN or null) shows the color it draws them in
  // (TODO 73.3). Only a shown colorbar asks: one reduction and a one-value readback per version
  // of the column (hasMissingValues caches by column).
  let missingKey = "", missingFound = $state(false);
  $effect(() => {
    revision;
    const current = mark, scalar = ["fill", "color"].includes(channel) && !categories && !ramp;
    const field = scalar && current
      ? current.fields?.get(channel) ?? (channel === "fill" && current.band ? current.fields?.get("color") : null) : null;
    if (!field?.isBufferNode || field.image || !field.data || typeof field.data !== "object") { missingKey = ""; missingFound = false; return; }
    const version = field.version, key = `${current.id}:${channel}:${version}`;
    if (key === missingKey) return;
    missingKey = key;
    Promise.resolve(current.manager?.chain).then(() => hasMissingValues(field.data))
      .then((found) => { if (alive && mark === current && field.version === version) missingFound = found; })
      .catch(() => {});
  });
  const missingSwatch = $derived(missingFound && mark ? missingColorOf(mark) : null);
  // Five ticks evenly along the colormap; with a midpoint, the middle one is the midpoint.
  const ticks = $derived.by(() => {
    revision;
    const o = mark?.options,
      b = o?.get("valueBounds") ?? [0, 1],
      spec = scaleSpec(o, b);
    // A format the mark sets, else the theme's (TODO 132.4), else three significant digits as
    // decimals, grouped when a tick reaches 10,000 (TODO 133.6).
    const chosen = legendNumberFormat(o);
    const values = bounds[0] === bounds[1] ? [bounds[0]] : Array.from({ length: 5 }, (_, i) => {
      const v = scaleValueAt(i / 4, spec),
        s = b[1] === b[0] ? 0 : (v - b[0]) / (b[1] - b[0]);
      return bounds[0] + s * (bounds[1] - bounds[0]);
    });
    const grouped = groupsThousands(values);
    let f = (value) => roundedLabel(value, grouped);
    if (chosen)
      try {
        f = format(chosen);
      } catch {}
    if (temporal) f = dateFormat(Math.abs(bounds[1] - bounds[0]));
    if (values.length === 1) return [{ t: 0.5, label: f(values[0]) }];
    return values.map((value, i) => ({ t: i / 4, label: f(value) }));
  });
  // Its error is a diagnostic of its scene node too (TODO 136.6, utils/reporter.js). "Requires a
  // mark" is a warning: a legend reads it until its mark binds. A legend that cannot explain its
  // channel, or explains nothing, is a lint (TODO 136.13): the plot draws without it, and nothing
  // else says why.
  const reportWarning = reporters?.warning ?? useReporter("Legend", { severity: "warning" }),
    reportLint = reporters?.lint ?? useReporter("Legend", { severity: "lint" });
  const waiting = $derived(error === `A ${channel} legend requires a mark.`);
  const unexplained = $derived(
    groups?.length === 0
      ? `none of its marks maps ${channel} from data, so it shows nothing. Map ${channel} from a column (${channel}="column"), or remove the Legend.`
      : explain && !channel && !categorical && !explained && !entries.length
        ? "its marks map nothing from data and none has a label, so it shows nothing. Map fill, color, size or shape from a column, give a mark a label, or remove the Legend."
        : "",
  );
  $effect(() => {
    reportWarning(waiting ? error : "");
    return () => reportWarning("");
  });
  $effect(() => {
    const message = unexplained || (waiting ? "" : error);
    reportLint(message && { severity: "lint", code: unexplained ? "lint.legend-empty" : "lint.legend", message });
    return () => reportLint("");
  });
</script>

<div
  role="group"
  aria-label={groups || explained ? undefined : title ?? "Legend"}
  class="guide"
  class:stacked
  data-plot-guide={groups || explained ? undefined : true}
  style:font-size={nested ? "inherit" : `var(--hm-legend-font-size, ${text.size}px)`}
  style:font-family={nested ? "inherit" : `var(--hm-legend-font, ${text.family})`}
  style:color={nested ? "inherit" : `var(--hm-legend-color, ${text.color})`}
  style:--guide-title-size={text.titleSize ? `${text.titleSize}px` : undefined}
  style:--guide-title-weight={text.titleWeight}
  onpointerdown={(e) => e.stopPropagation()}
  onwheel={(e) => e.stopPropagation()}
>
  {#if explained}
    {#each explained as guide}<GuideView target={guide.handle} channel={guide.channel} label={guide.label} {position} nested />{/each}
    {#if entries.length && !categorical}<GuideView {target} {position} nested />{/if}
  {:else if groups}
    {#each groups as group}<GuideView target={group.handle} {channel} label={group.label} {position} nested />{/each}
  {:else if error}<small role="status">{error}</small>
  {:else if categories}
    {#if title}<span class="guide-title">{title}</span>{/if}
    {#each categories as entry}
      {@const scale = entry.size ? Math.min(1.6, Math.max(0.35, entry.size / 12)) : 1}
      {@const box = Math.max(18, 12 * scale + 6)}
      {@const shape = swatchShape(entry.shape)}
      <button type="button" class:hidden={!entry.visible} aria-pressed={entry.visible} aria-label={`Toggle ${entry.label}`} title="Click to toggle; Shift-click to isolate" onclick={e=>toggleCategory(entry.value,e.shiftKey)}>
        <svg width={26 * text.swatch} height={box * text.swatch} viewBox={`0 0 26 ${box}`} aria-hidden="true" style:opacity={entry.opacity ?? 1}>
          <g transform={`translate(13 ${box / 2}) scale(${scale}) translate(-13 -9)`}>
          {#if shape==='line'}<line x1="2" x2="24" y1="9" y2="9" stroke={entry.color} stroke-width={(entry.width ?? 2) / scale} stroke-linecap="round"/>
          {:else if shape==='square'}<rect x="7" y="3" width="12" height="12" fill={entry.color} stroke={entry.outline} stroke-width={entry.outlineWidth}/>
          {:else if shape!=='circle' && guideSymbol(shape)}<path d={guideSymbol(shape)} fill-rule={guideFillRule(shape)} fill={entry.color} stroke={entry.outline} stroke-width={entry.outlineWidth} transform={shape==='cross'?'rotate(45 13 9)':undefined}/>
          {:else}<circle cx="13" cy="9" r="5" fill={entry.color} stroke={entry.outline} stroke-width={entry.outlineWidth}/>{/if}
          </g>
        </svg><span>{entry.label}</span>
      </button>
    {/each}
  {:else if ramp}
    <Ramp samples={ramp} {channel} {vertical} label={dataUnits ? `${title ?? "size"} (data units)` : title} format={rampFormat}
      color={rampStyle?.color} shape={rampStyle?.shape} />
  {:else if channel && mark}
    <div class="colorbar" class:vertical>
      {#if title}<span class="guide-title">{title}</span>{/if}
      <div class="scale">
        <Gradient
          {mark}
          flatValue={constant}
          {vertical}
          width={vertical ? 18 : 180}
          height={vertical ? 160 : 18}
          {revision}
        />
        <svg
          width={vertical ? 64 : 180}
          height={vertical ? 176 : 22}
          aria-label={title ?? "Color scale"}
        >
          {#each ticks as tick}<text
              x={vertical ? 4 : tick.t * 180}
              y={vertical ? 8 + (1 - tick.t) * 160 : 15}
              text-anchor={vertical
                ? "start"
                : tick.t === 0
                  ? "start"
                  : tick.t === 1
                    ? "end"
                    : "middle"}>{tick.label}</text
            >{/each}
        </svg>
      </div>
      {#if missingSwatch}<div class="missing"><svg width="12" height="12" aria-hidden="true"><rect width="12" height="12"
        fill={missingSwatch} /></svg><span>Missing</span></div>{/if}
    </div>
  {:else if !categorical}
    {#each entries as entry (entry.id)}
      <button
        type="button"
        class:hidden={!entry.visible}
        aria-pressed={entry.visible}
        aria-label={`Toggle ${entry.label}`}
        title="Click to toggle; Shift-click to isolate"
        onclick={(e) =>
          (previous = toggleSeries(entries, entry.id, e.shiftKey, previous))}
      >
        {#if entry.scalar}<Gradient
            mark={guideObject(entry.handle)}
            width={24}
            height={10}
            {revision}
          />
        {:else}{@const shape = swatchShape(entry.shape)}<svg
            width={26 * text.swatch}
            height={18 * text.swatch}
            viewBox="0 0 26 18"
            aria-hidden="true"
            style:opacity={entry.opacity}
          >
            {#if shape === "text"}<text x="6" y="13" fill={entry.color}
                >T</text
              >
            {:else if shape === "line"}<line
                x1="2"
                x2="24"
                y1="9"
                y2="9"
                stroke={entry.color}
                stroke-width="2"
                stroke-dasharray={entry.dashed ? "4 2" : undefined}
              />
            {:else if shape === "square" || shape === "area"}<rect
                x="7"
                y="3"
                width="12"
                height="12"
                fill={entry.color}
              />
            {:else if shape !== "circle" && guideSymbol(shape)}<path
                d={guideSymbol(shape)}
                fill-rule={guideFillRule(shape)}
                transform={`rotate(${entry.rotation + (shape === "cross" ? 45 : 0)} 13 9)`}
                fill={entry.color}
                stroke={entry.outline}
                stroke-width={entry.outlineWidth}
              />
            {:else}<circle
                cx="13"
                cy="9"
                r="5"
                fill={entry.color}
                stroke={entry.outline}
                stroke-width={entry.outlineWidth}
              />{/if}
          </svg>{/if}<span>{entry.label}</span>
      </button>
    {/each}
  {/if}
</div>

<style>
  .guide {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px 14px;
    flex-wrap: wrap;
    font: 12px "Source Sans 3", system-ui, sans-serif;
    color: #40505d;
    max-width: 100%;
  }
  .guide.stacked {
    flex-direction: column;
    align-items: flex-start;
  }
  .guide button {
    display: flex;
    align-items: center;
    gap: 5px;
    border: 0;
    background: transparent;
    color: inherit;
    font: inherit;
    padding: 3px;
    border-radius: 4px;
    cursor: pointer;
  }
  /* A tint of the legend's text color, so it shows on a theme's dark background too. */
  .guide button:hover {
    background: color-mix(in srgb, currentColor 12%, transparent);
  }
  .guide button:focus-visible {
    outline: 2px solid #547ba2;
    outline-offset: 2px;
  }
  .hidden {
    opacity: 0.4;
    text-decoration: line-through;
  }
  .scale {
    display: flex;
    flex-direction: column;
    position: relative;
  }
  .vertical .scale {
    flex-direction: row;
    align-items: flex-start;
    padding-top: 8px;
  }
  .vertical .scale svg {
    margin-top: -8px;
  }
  .colorbar {
    display: flex;
    flex-direction: column;
    gap: 5px;
  }
  .missing {
    display: flex;
    align-items: center;
    gap: 5px;
  }
  /* A host stylesheet's --hm-legend-* win over the theme's (TODO 132.7). */
  .guide-title {
    font-size: var(--hm-legend-title-font-size, var(--guide-title-size, inherit));
    font-weight: var(--hm-legend-title-font-weight, var(--guide-title-weight, 500));
  }
  svg {
    overflow: visible;
    font: 10px "Source Sans 3", system-ui, sans-serif;
    fill: currentColor;
  }
</style>
