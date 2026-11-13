<script>
  import NumericInput from "./numericInput.svelte";
  import { light, readLights } from "../plot/utils/lights.js";
  let { value = [], onchange } = $props();
  let error = $state("");
  const entries = $derived(Array.isArray(value) ? value : []);
  function publish(next) {
    try {
      onchange(readLights(next));
      error = "";
    } catch (cause) {
      error = cause.message;
    }
  }
  const change = (index, key, next) =>
    publish(
      entries.map((entry, i) =>
        i === index ? { ...entry, [key]: next } : entry,
      ),
    );
  function kind(index, next) {
    const { color, intensity } = entries[index];
    publish(
      entries.map((entry, i) =>
        i === index ? light(next, { color, intensity }) : entry,
      ),
    );
  }
</script>

{#each entries as entry, index}
  <fieldset>
    <legend>Light {index + 1}</legend>
    <label
      >Kind <select
        value={entry.kind}
        onchange={(event) => kind(index, event.currentTarget.value)}
        aria-label={`Light ${index + 1} kind`}
      >
        {#each ["ambient", "directional", "hemisphere", "point"] as name}<option
            value={name}>{name}</option
          >{/each}
      </select></label
    >
    <label
      >Color <input
        value={entry.color ?? "#ffffff"}
        aria-label={`Light ${index + 1} color`}
        onchange={(event) => change(index, "color", event.currentTarget.value)}
      /></label
    >
    {#if entry.kind === "hemisphere"}<label
        >Ground color <input
          value={entry.groundColor ?? "#ffffff"}
          aria-label={`Light ${index + 1} ground color`}
          onchange={(event) =>
            change(index, "groundColor", event.currentTarget.value)}
        /></label
      >{/if}
    <label
      >Intensity <NumericInput
        value={entry.intensity ?? 1}
        spec={{ min: 0, step: 0.1, sliderMax: 5 }}
        label={`Light ${index + 1} intensity`}
        onchange={(next) => change(index, "intensity", next)}
      /></label
    >
    {#if entry.kind !== "ambient"}
      {@const position =
        entry.position ?? (entry.kind === "point" ? [0, 0, 0] : [0, 1, 0])}
      {#each ["X", "Y", "Z"] as axis, coordinate}
        <label
          >{axis}
          <NumericInput
            value={position[coordinate]}
            spec={{}}
            slider={false}
            label={`Light ${index + 1} ${axis}`}
            onchange={(next) =>
              change(
                index,
                "position",
                position.map((v, i) => (i === coordinate ? next : v)),
              )}
          /></label
        >
      {/each}
    {/if}
    {#if entry.kind === "point"}
      {#each [["distance", 0], ["decay", 2]] as [key, fallback]}
        <label
          >{key}
          <NumericInput
            value={entry[key] ?? fallback}
            spec={{ min: 0 }}
            slider={false}
            label={`Light ${index + 1} ${key}`}
            onchange={(next) => change(index, key, next)}
          /></label
        >
      {/each}
    {/if}
    <button
      type="button"
      onclick={() => publish(entries.filter((_, i) => i !== index))}
      >Remove light {index + 1}</button
    >
  </fieldset>
{/each}
<button type="button" onclick={() => publish([...entries, light("ambient")])}
  >Add light</button
>
{#if error}<small role="alert">{error}</small>{/if}

<style>
  fieldset {
    min-width: 0;
    margin: 6px 0;
    padding: 8px;
    border: 1px solid #8885;
    border-radius: 4px;
  }
  label {
    display: block;
    margin: 6px 0;
    font-size: 12px;
  }
  input,
  select {
    width: 100%;
    box-sizing: border-box;
  }
  button {
    margin: 4px 0;
  }
  small {
    display: block;
    color: #b33;
  }
</style>
