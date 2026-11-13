<script lang="ts">
  import { useReporter } from "../utils/reporter.js";
  import { getContext, untrack } from "svelte";
  import { INPUT_CONTEXT } from "../utils/inputs.js";
  import { inputControl } from "../utils/inputStore.svelte.js";
  import { inputValue } from "../utils/inputValues.js";
  import { dateTimeInputText, dateTimeInputValue } from "../utils/timeInputs.js";
  import { VIEW_CONTEXT } from "../utils/axisFrame.js";
  import type { DateTimeInputProps } from "../publicTypes.js";
  import "./inputStyles.css";
  import { controlTheme } from "../utils/controlTheme.svelte.js";
  let { name, value = $bindable(undefined), min = undefined, max = undefined, step = 60000,
    timezone = "UTC", label = undefined, inputOwner = undefined }: DateTimeInputProps & { inputOwner?: string } = $props();
  let error = $state("");
  const { store } = inputControl("DateTimeInput", () => ({ name, min, max, step, value }),
    { store: getContext(INPUT_CONTEXT), insidePlot: Boolean(getContext(VIEW_CONTEXT)), owner: untrack(() => inputOwner) });
  $effect(() => { void [timezone, store.values[name]]; error = ""; });
  const controls = controlTheme();
  export const getValue = () => store.values[name];
  export function setValue(next: Date | null) {
    const normalized = inputValue("DateTimeInput", { min, max, step, value: next });
    value = normalized;
    store.set(name, normalized);
    error = "";
  }
  function changed(event: Event) {
    const element = event.currentTarget as HTMLInputElement;
    if (!element.validity.valid) { error = `DateTimeInput: ${element.validationMessage}`; return; }
    try { setValue(dateTimeInputValue(element.value, timezone)); }
    catch (cause) { error = cause.message; }
  }
  // Its error is a diagnostic of its scene node too (TODO 136.6, utils/reporter.js).
  const reportError = useReporter("DateTimeInput");
  $effect(() => reportError(error));
</script>

<label class="hm-input hm-date-time-input" style={controls.style}><span class="hm-input-label">{label ?? name}</span><input type="datetime-local" aria-label={label ?? name}
  aria-invalid={!!error} min={min ? dateTimeInputText(min, timezone) : undefined}
  max={max ? dateTimeInputText(max, timezone) : undefined} step={step / 1000}
  value={dateTimeInputText(store.values[name], timezone)} oninput={changed} />
  <span>{timezone}</span>{#if error}<span role="alert">{error}</span>{/if}</label>
