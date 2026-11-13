<script>
  import { onDestroy, untrack } from "svelte";
  import { shapeNames } from "../plot/utils/shapes.js";
  import { numericCategoryValue } from "../plot/utils/namedData.js";
  let { value } = $props();
  let revision = $state(0);
  $effect(() => value?.scale.subscribe(() => untrack(() => revision++)));
  const entries = $derived.by(() => {
    revision;
    return value?.scale.domain ?? [];
  });
  const numeric = $derived(["size", "width", "opacity"].includes(value?.channel));
  const current = (index) => numeric ? numericCategoryValue(value.scale, index, value.channel) : value.scale.value(index, value.channel);
  function change(index, next) {
    const s = value.scale,
      range = s.domain.map((_, i) => current(i));
    range[index] = next;
    s.setRange(range);
  }
</script>

{#if value?.scale}
  <div class="categories">
    {#each entries as entry, index}
      <div>
        <input
          aria-label={`Label for ${entry}`}
          value={value.scale.label(entry)}
          onchange={(e) => value.scale.setLabel(entry, e.currentTarget.value)}
        />
        {#if value.channel === "shape"}<select
            aria-label={`Symbol for ${entry}`}
            value={value.scale.value(index, "shape")}
            onchange={(e) => change(index, e.currentTarget.value)}
            >{#each shapeNames() as shape}<option>{shape}</option
              >{/each}</select
          >
        {:else if numeric}<input
            type="number"
            aria-label={`${value.channel} for ${entry}`}
            min="0"
            max={value.channel === "opacity" ? 1 : undefined}
            step={value.channel === "opacity" ? 0.05 : 0.5}
            value={current(index)}
            onchange={(e) => change(index, Number(e.currentTarget.value))}
          />
        {:else}<input
            type="color"
            aria-label={`Color for ${entry}`}
            value={value.scale.value(index)}
            oninput={(e) => change(index, e.currentTarget.value)}
          />{/if}
      </div>{/each}
    {#if value.channel !== "shape" && !numeric}<label
        >Unknown<input
          type="color"
          aria-label="Unknown category color"
          value={value.scale.unknown}
          oninput={(e) => value.scale.setUnknown(e.currentTarget.value)}
        /></label
      >{/if}
  </div>
{/if}

<style>
  .categories {
    display: grid;
    gap: 6px;
  }
  .categories > div,
  .categories > label {
    display: flex;
    gap: 6px;
    align-items: center;
  }
  .categories input:not([type="color"]) {
    min-width: 0;
    flex: 1;
    width: 120px;
  }
  .categories input[type="color"] {
    width: 36px;
    height: 28px;
    padding: 2px;
  }
  .categories input,
  .categories select {
    border: 1px solid var(--border, #dbe0e4);
    border-radius: 4px;
    background: white;
  }
</style>
