<script lang="ts">
  import { useReporter } from "../utils/reporter.js";
  import { getContext, untrack } from "svelte";
  import { INPUT_CONTEXT, sliderTrack } from "../utils/inputs.js";
  import { isExpression } from "../utils/expressions.js";
  import { inputControl } from "../utils/inputStore.svelte.js";
  import { inputValue } from "../utils/inputValues.js";
  import { VIEW_CONTEXT } from "../utils/axisFrame.js";
  import { calendarStep, inputZone, timeMs, timeStops, timeText, zonedDate } from "../utils/timeInputs.js";
  import type { SliderProps } from "../publicTypes.js";
  import "./inputStyles.css";
  import { controlTheme } from "../utils/controlTheme.svelte.js";
  import { inputNumberLabel } from "../utils/numberLabels.js";
  let { name, min = 0, max = 1, step = undefined, value = $bindable(undefined), label = undefined,
    format = undefined, timezone = undefined, inputOwner = undefined }: SliderProps & { inputOwner?: string } = $props();
  const { store, fromData, owner } = inputControl("Slider", () => ({ name, min, max, step, value }),
    { store: getContext(INPUT_CONTEXT), insidePlot: Boolean(getContext(VIEW_CONTEXT)), owner: untrack(() => inputOwner) });
  // Bounds may read the data (min={min("x")}, TODO 41.2): their values once read.
  const lo = $derived(isExpression(min) ? fromData.values.min : min),
    hi = $derived(isExpression(max) ? fromData.values.max : max);
  const pending = $derived(store.pending(name));
  const current = $derived(pending ? lo : store.values[name] ?? lo);
  const interval = $derived(Array.isArray(current));
  $effect(() => { if (interval && !pending) value = current; });
  // Over times (TODO 53.3): Dates, shown as an axis would, stepping in calendar terms ("1 month"
  // lands on month starts; a number is milliseconds). The range input then works in epoch ms, or
  // in the calendar steps' indices.
  const time = $derived(lo instanceof Date || hi instanceof Date || current instanceof Date || current?.[0] instanceof Date);
  const zone = $derived(inputZone(timezone, lo, hi, interval ? current[0] : current));
  const stops = $derived(time && Number.isFinite(timeMs(lo)) && Number.isFinite(timeMs(hi)) && calendarStep(step)
    ? timeStops(timeMs(lo), timeMs(hi), step, zone) : null);
  const at = (v) => !time ? v : stops ? nearest(stops, timeMs(v)) : timeMs(v);
  const positions = $derived(interval ? current.map(at) : [at(current)]);
  function nearest(list: number[], ms: number) {
    let best = 0;
    for (let i = 1; i < list.length; i++) if (Math.abs(list[i] - ms) < Math.abs(list[best] - ms)) best = i;
    return best;
  }
  // Its look is its theme's; its value reads to its step's decimals, or as tooltips do (TODO 132.3).
  const controls = controlTheme();
  const text = $derived((v) => typeof format === "function" ? format(v)
    : time ? timeText(v, { format, step, span: timeMs(hi) - timeMs(lo), zone })
    : inputNumberLabel(v, format, step));
  const track = $derived(sliderTrack({ stops, time, lo, hi, position: positions[0] }));
  const percent = (position) => track.highest === track.lowest ? 0 : 100 * (position - track.lowest) / (track.highest - track.lowest);
  const show = $derived((v) => Array.isArray(v) ? v.map(text).join(" – ") : text(v));
  const shown = $derived(show(current));
  // How it shows its value, for {$name} placeholders in text (TODO 46).
  $effect(() => {
    const n = name, describe = show;
    return untrack(() => store.describe(n, describe, owner));
  });
  /** The slider's value. */
  export const getValue = () => store.values[name];
  /** Set the value, as the viewer would. */
  export function setValue(next: number | Date | [number, number] | [Date, Date]) {
    const normalized = inputValue("Slider", { value: next, min: lo, max: hi, step });
    value = normalized;
    store.set(name, normalized);
  }
  /** The range input moved: a number, a time in epoch ms, or a calendar step's index. */
  function moved(raw: number, endpoint?: number) {
    if (!Number.isFinite(raw)) return;
    if (endpoint !== undefined) raw = endpoint === 0 ? Math.min(raw, positions[1]) : Math.max(raw, positions[0]);
    const next = !time ? raw : zonedDate(stops ? stops[Math.round(raw)] : raw, zone);
    if (endpoint === undefined) setValue(next);
    else setValue((endpoint === 0 ? [next, current[1]] : [current[0], next]) as [number, number] | [Date, Date]);
  }
  // Its error is a diagnostic of its scene node too (TODO 136.6, utils/reporter.js).
  const reportError = useReporter("Slider");
  $effect(() => reportError(fromData.error));
</script>

{#if interval}
<div class="hm-input hm-range-slider" style={controls.style} role="group" aria-label={label ?? name}>
  <span class="hm-input-label">{label ?? name}</span>
  <div class="hm-range" style:--lower={`${percent(positions[0])}%`} style:--upper={`${percent(positions[1])}%`}>
    {#each [0, 1] as endpoint}
      <input type="range" aria-label={`${label ?? name}: ${endpoint === 0 ? 'lower' : 'upper'}`}
        min={track.lowest} max={track.highest} step={stops ? 1 : typeof step === "number" ? step : "any"}
        disabled={pending} value={positions[endpoint]} oninput={(event) => moved(Number(event.currentTarget.value), endpoint)} />
    {/each}
  </div>
  <output class="hm-input-value">{pending ? "…" : shown}</output>
  {#if fromData.error}<span role="alert">{fromData.error}</span>{/if}
</div>
{:else}
<label class="hm-input hm-slider" style={controls.style}><span class="hm-input-label">{label ?? name}</span><input
    type="range" aria-label={label ?? name} min={track.lowest} max={track.highest} style:--hm-fill={track.fill}
    disabled={pending} step={stops ? 1 : typeof step === "number" ? step : "any"} value={positions[0]}
    oninput={(event) => moved(Number(event.currentTarget.value))} /><output class="hm-input-value">{pending ? "…" : shown}</output>{#if fromData.error}<span role="alert">{fromData.error}</span>{/if}</label>
{/if}
