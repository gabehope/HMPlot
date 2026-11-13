<script>
  // Bands (TODO 46): a shaded span of an axis, listed beside the reference lines.
  import { validateBands } from "../plot/utils/axes.js";
  let { value = [], onchange } = $props();
  let error = $state("");
  const parse = (text) => (text.trim() !== "" && Number.isFinite(Number(text)) ? Number(text) : text);
  const shown = (v) => (v instanceof Date ? v.toISOString() : v);
  function change(index, key, next) {
    const updated = value.map((b, i) => (i === index ? { ...b, [key]: next } : b));
    try {
      validateBands(updated);
      onchange(updated);
      error = "";
    } catch (e) {
      error = e.message;
    }
  }
</script>

{#each value as band, index}
  <fieldset>
    <legend>Band {index + 1}</legend>
    <select aria-label={`Band ${index + 1} direction`} value={band.axis}
      onchange={(e) => change(index, "axis", e.currentTarget.value)}
      ><option value="x">Vertical</option><option value="y">Horizontal</option></select>
    <input aria-label={`Band ${index + 1} label`} placeholder="Label" value={band.label ?? ""}
      oninput={(e) => change(index, "label", e.currentTarget.value)} />
    <input aria-label={`Band ${index + 1} from`} value={shown(band.from)}
      onchange={(e) => change(index, "from", parse(e.currentTarget.value))} />
    <input aria-label={`Band ${index + 1} to`} value={shown(band.to)}
      onchange={(e) => change(index, "to", parse(e.currentTarget.value))} />
    <input aria-label={`Band ${index + 1} color`} type="color" value={band.color ?? "#7a8392"}
      oninput={(e) => change(index, "color", e.currentTarget.value)} />
    <input aria-label={`Band ${index + 1} opacity`} type="number" min="0" max="1" step="0.05" value={band.opacity ?? 0.1}
      onchange={(e) => change(index, "opacity", Number(e.currentTarget.value))} />
    <button onclick={() => onchange(value.filter((_, i) => i !== index))}>Remove</button>
  </fieldset>
{/each}
<button onclick={() => onchange([...value, { axis: "x", from: 0, to: 1, opacity: 0.1 }])}>Add band</button>
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
