<script lang="ts">
  import { useReporter } from "../utils/reporter.js";
  import { getContext, untrack } from "svelte";
  import { INPUT_CONTEXT, playbackStep, sliderTrack } from "../utils/inputs.js";
  import { provideClockScope } from "../utils/clockScope.js";
  import { calendarStep, inputZone, playbackTimeStep, timeMs, timeStops, timeText, zonedDate } from "../utils/timeInputs.js";
  import { inputControl } from "../utils/inputStore.svelte.js";
  import { isExpression } from "../utils/expressions.js";
  import { VIEW_CONTEXT } from "../utils/axisFrame.js";
  import type { PlaybackProps } from "../publicTypes.js";
  import "./inputStyles.css";
  import { controlTheme } from "../utils/controlTheme.svelte.js";
  import { inputNumberLabel } from "../utils/numberLabels.js";
  // A slider that plays (TODO 41.4): play advances the value by `rate` (value units per second),
  // one move per displayed frame, or one `step` every step/rate seconds. At max it stops, or
  // wraps to min with `loop`. Reset returns to the initial value. Dragging moves the value, and
  // play continues from there. Code controls it through `playing` and `reset` (a change of
  // reset's value resets it, as a Button's count does). Its time is its clock scope's (TODO 50):
  // it moves on the scope's frames, holds while the scope is held or frozen, and a step of
  // setAnimationTime (a video's frame) moves it by that step.
  let { name, min = 0, max = 1, step = undefined, value = undefined, rate = 1, loop = false, autoplay = false,
    playing = undefined, reset = undefined, label = undefined, format = undefined, timezone = undefined, inputOwner = undefined,
    onplayingchange = undefined }: PlaybackProps & { inputOwner?: string; onplayingchange?: (playing: boolean) => void } = $props();
  const { store, fromData, owner } = inputControl("Playback", () => ({ name, min, max, value }),
    { store: getContext(INPUT_CONTEXT), insidePlot: Boolean(getContext(VIEW_CONTEXT)), owner: untrack(() => inputOwner) });
  const lo = $derived(isExpression(min) ? fromData.values.min : min),
    hi = $derived(isExpression(max) ? fromData.values.max : max);
  const pending = $derived(store.pending(name));
  const current = $derived(pending ? lo : store.values[name] ?? lo);
  // Over times (TODO 53.3): Dates, a calendar rate ("1 day" per second) and calendar steps.
  const time = $derived(lo instanceof Date || hi instanceof Date);
  const zone = $derived(inputZone(timezone, lo, hi));
  const stops = $derived(time && calendarStep(step) ? timeStops(timeMs(lo), timeMs(hi), step, zone) : null);
  // Its look is its theme's; its value reads to its step's decimals, or as tooltips do (TODO 132.3).
  const controls = controlTheme();
  const text = $derived((v) => typeof format === "function" ? format(v)
    : time ? timeText(v, { format, step, span: timeMs(hi) - timeMs(lo), zone })
    : inputNumberLabel(v, format, step));
  const handle = $derived(stops ? stops.reduce((best, stop, i) => (Math.abs(stop - timeMs(current)) < Math.abs(stops[best] - timeMs(current)) ? i : best), 0) : time ? timeMs(current) : current);
  const track = $derived(sliderTrack({ stops, time, lo, hi, position: handle }));
  const shown = $derived(pending ? "…" : text(current));
  // How it shows its value, for {$name} placeholders in text (TODO 46).
  $effect(() => {
    const n = name, show = text;
    return untrack(() => store.describe(n, show, owner));
  });
  const reduced = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  // autoplay starts it on mount, except under reduced motion; code's `playing` wins.
  let running = $state(untrack(() => playing ?? (autoplay && !reduced())));
  let seenPlaying = untrack(() => playing), seenReset = untrack(() => reset);
  $effect(() => {
    const next = playing;
    if (next !== undefined && next !== seenPlaying) {
      seenPlaying = next;
      untrack(() => (next ? play(false) : pause(false)));
    }
  });
  $effect(() => {
    const next = reset;
    if (next !== seenReset) {
      seenReset = next;
      untrack(restart);
    }
  });
  // The continuous position; the value is it, or the last step it passed.
  let position: number | null = null;
  const clock = provideClockScope();
  function advance(dt: number) {
    if (!running) return;
    if (time) {
      const moved = playbackTimeStep(position ?? timeMs(store.values[name] ?? lo), dt,
        { lo: timeMs(lo), hi: timeMs(hi), rate, step, loop, zone });
      position = moved.position;
      if (moved.stopped) pause();
      store.set(name, zonedDate(moved.value, zone));
      return;
    }
    const moved = playbackStep(position ?? Number(store.values[name] ?? lo), dt, { lo, hi, rate, step, loop });
    position = moved.position;
    if (moved.stopped) pause();
    store.set(name, moved.value);
  }
  $effect(() => {
    if (!running || pending) return;
    return clock.subscribe({ active: () => running && !pending, tick: advance });
  });
  /** Play from the current value (from min again after it stopped at max). */
  export function play(tell = true) {
    if (!loop && timeMs(store.values[name]) >= timeMs(hi)) {
      position = time ? timeMs(lo) : lo;
      store.set(name, lo);
    }
    running = true;
    if (tell) onplayingchange?.(true);
  }
  export function pause(tell = true) {
    running = false;
    position = null;
    if (tell) onplayingchange?.(false);
  }
  /** Back to the initial value (value, else min). */
  export function restart() {
    position = null;
    store.set(name, value !== undefined && value !== null && !isExpression(value) ? value : lo);
  }
  export const getValue = () => store.values[name];
  export const isPlaying = () => running;
  export function setValue(next: number | Date) {
    position = time ? timeMs(next) : (next as number);
    store.set(name, time && !(next instanceof Date) ? zonedDate(next, zone) : next);
  }
  // Its error is a diagnostic of its scene node too (TODO 136.6, utils/reporter.js).
  const reportError = useReporter("Playback");
  $effect(() => reportError(fromData.error));
</script>

<span class="hm-input hm-playback" style={controls.style}><button type="button" aria-label={running ? `Pause ${label ?? name}` : `Play ${label ?? name}`}
    disabled={pending} onclick={() => (running ? pause() : play())}>{running ? "❚❚" : "▶"}</button><button type="button"
    aria-label={`Reset ${label ?? name}`} disabled={pending} onclick={() => restart()}>↺</button><label><span class="hm-input-label">{label ?? name}</span><input
      type="range" aria-label={label ?? name} min={track.lowest} max={track.highest} style:--hm-fill={track.fill}
      disabled={pending} step={stops ? 1 : typeof step === "number" ? step : "any"} value={handle}
      oninput={(event) => {
        const next = Number(event.currentTarget.value);
        if (Number.isFinite(next)) setValue(stops ? stops[Math.round(next)] : next);
      }} /><output class="hm-input-value">{shown}</output></label>{#if fromData.error}<span role="alert">{fromData.error}</span>{/if}</span>
