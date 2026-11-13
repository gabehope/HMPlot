<script>
  import { untrack } from "svelte";
  import { validateNumber } from "./inspector.js";
  let {
    value,
    spec,
    label,
    id,
    disabled = false,
    slider = true,
    resetVersion = 0,
    onchange,
  } = $props();
  let draft = $state(""),
    editing = $state(false),
    error = $state("");
  const messageId = $props.id();
  const sliderMin = $derived(spec.sliderMin ?? spec.min ?? 0);
  const sliderMax = $derived(spec.sliderMax ?? spec.max ?? 1);
  $effect(() => {
    const current = value;
    if (!untrack(() => editing)) draft = String(current ?? "");
  });
  $effect(() => {
    resetVersion;
    editing = false;
    error = "";
    draft = String(untrack(() => value) ?? "");
  });
  function commit() {
    const result = validateNumber(draft, spec);
    error = result.error ?? "";
    if (!result.error) {
      editing = false;
      draft = String(result.value);
      onchange(result.value);
    }
  }
  function keydown(event) {
    if (event.key === "Enter") {
      event.preventDefault();
      commit();
    }
    if (event.key === "Escape" && (draft !== String(value) || error)) {
      event.preventDefault();
      event.stopPropagation();
      draft = String(value);
      error = "";
      editing = false;
    }
  }
</script>

<div class:with-slider={slider} class="number-editor">
  {#if slider}<input
      {id}
      type="range"
      aria-label={label}
      {disabled}
      value={Number.isFinite(Number(value))
        ? Math.max(sliderMin, Math.min(sliderMax, Number(value)))
        : sliderMin}
      min={sliderMin}
      max={sliderMax}
      step={spec.step ?? 0.01}
      oninput={(event) => {
        error = "";
        editing = false;
        draft = event.currentTarget.value;
        onchange(Number(draft));
      }}
    />{/if}
  <input
    id={slider ? undefined : id}
    type="text"
    inputmode={spec.integer || spec.type?.uniformType === "int"
      ? "numeric"
      : "decimal"}
    aria-label={slider ? `${label} value` : label}
    aria-invalid={!!error}
    aria-describedby={messageId}
    {disabled}
    placeholder={spec.auto ? "auto" : undefined}
    value={draft}
    onfocus={() => (editing = true)}
    oninput={(event) => {
      editing = true;
      draft = event.currentTarget.value;
      error = "";
    }}
    onblur={commit}
    onkeydown={keydown}
  />
  <span id={messageId} class="error" aria-live="polite"
    >{error || "\u00a0"}</span
  >
</div>

<style>
  .number-editor {
    display: grid;
    min-width: 0;
  }
  .with-slider {
    grid-template-columns: minmax(0, 1fr) 72px;
    column-gap: 10px;
    align-items: center;
  }
  input {
    min-width: 0;
    width: 100%;
    box-sizing: border-box;
    font: inherit;
    color: inherit;
    accent-color: var(--accent);
  }
  input[type="text"] {
    padding: 6px 8px;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--field);
  }
  .error {
    grid-column: 1 / -1;
    min-height: 15px;
    font-size: 10px;
    color: #bd394c;
  }
  input:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  input:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
</style>
