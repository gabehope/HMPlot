<script>
  import { validateRules } from "../plot/utils/axes.js";
  let { value = [], onchange } = $props();
  let error = $state("");
  function change(index, key, next) {
    const updated = value.map((r, i) =>
      i === index ? { ...r, [key]: next } : r,
    );
    try {
      validateRules(updated);
      onchange(updated);
      error = "";
    } catch (e) {
      error = e.message;
    }
  }
</script>

{#each value as rule, index}
  <fieldset>
    <legend>Line {index + 1}</legend>
    <select
      aria-label={`Line ${index + 1} direction`}
      value={rule.axis}
      onchange={(e) => change(index, "axis", e.currentTarget.value)}
      ><option value="x">Vertical</option><option value="y">Horizontal</option
      ></select
    >
    <input
      aria-label={`Line ${index + 1} value`}
      value={rule.value instanceof Date ? rule.value.toISOString() : rule.value}
      onchange={(e) =>
        change(
          index,
          "value",
          e.currentTarget.value.trim() !== "" &&
            Number.isFinite(Number(e.currentTarget.value))
            ? Number(e.currentTarget.value)
            : e.currentTarget.value,
        )}
    />
    <input
      aria-label={`Line ${index + 1} label`}
      placeholder="Label"
      value={rule.label ?? ""}
      oninput={(e) => change(index, "label", e.currentTarget.value)}
    />
    <input
      aria-label={`Line ${index + 1} color`}
      type="color"
      value={rule.color ?? "#7a8392"}
      oninput={(e) => change(index, "color", e.currentTarget.value)}
    />
    <input
      aria-label={`Line ${index + 1} width`}
      type="number"
      min="0"
      step="0.5"
      value={rule.width ?? 1}
      onchange={(e) => change(index, "width", Number(e.currentTarget.value))}
    />
    <select
      aria-label={`Line ${index + 1} dash`}
      value={rule.dash ? "dashed" : "solid"}
      onchange={(e) =>
        change(
          index,
          "dash",
          e.currentTarget.value === "solid" ? undefined : [4, 3],
        )}
      ><option value="solid">Solid</option><option value="dashed">Dashed</option
      ></select
    >
    <button onclick={() => onchange(value.filter((_, i) => i !== index))}
      >Remove</button
    >
  </fieldset>
{/each}
<button
  onclick={() =>
    onchange([...value, { axis: "y", value: 0, color: "#7a8392", width: 1 }])}
  >Add reference line</button
>
{#if error}<small role="alert">{error}</small>{/if}

<style>
  fieldset {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px;
    border: 1px solid var(--border);
    border-radius: 6px;
    margin: 0;
    padding: 8px;
  }
  legend,
  small {
    font-size: 11px;
  }
  input,
  select,
  button {
    min-width: 0;
    width: 100%;
    box-sizing: border-box;
    font: inherit;
    font-size: 12px;
    padding: 5px;
    background: var(--field);
    color: inherit;
    border: 1px solid var(--border);
    border-radius: 5px;
  }
  input[type="color"] {
    height: 28px;
  }
  button {
    cursor: pointer;
  }
  :focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
  small {
    color: #b13b38;
  }
</style>
