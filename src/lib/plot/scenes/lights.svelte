<script>
  import { T } from "@threlte/core";
  import { untrack, onDestroy } from "svelte";
  import { FieldType } from "../objects/types.js";
  import { readLights } from "../utils/lights.js";
  import { useViewServices } from "../utils/viewServices.js";
  import { reportDataError } from "../utils/dataErrors.js";
  let { value, options } = $props();
  const view = useViewServices(),
    owner = {};
  const local = untrack(() => options);
  local.ensure(
    "lights",
    new FieldType({ defaultValue: [], ui: { ui: "lights" } }),
  );
  const configured = local.store("lights");
  let applied = false;
  $effect(() => {
    const authored = value;
    untrack(() => {
      if (authored !== undefined) local.set("lights", authored);
      else if (applied) local.clear("lights");
      applied = authored !== undefined;
    });
  });
  const parsed = $derived.by(() => {
    try {
      return { entries: readLights($configured), error: "" };
    } catch (error) {
      return { entries: [], error: error.message };
    }
  });
  $effect(() => reportDataError(view, owner, parsed.error));
  onDestroy(() => reportDataError(view, owner, ""));
</script>

{#each parsed.entries as { kind, color = "#ffffff", intensity = 1, position, groundColor = "#ffffff", distance = 0, decay = 2 }, i (i)}
  {#if kind === "ambient"}<T.AmbientLight {color} {intensity} />
  {:else if kind === "directional"}<T.DirectionalLight
      {color}
      {intensity}
      position={position ?? [0, 1, 0]}
    />
  {:else if kind === "hemisphere"}<T.HemisphereLight
      {color}
      {groundColor}
      {intensity}
      position={position ?? [0, 1, 0]}
    />
  {:else if kind === "point"}<T.PointLight
      {color}
      {intensity}
      position={position ?? [0, 0, 0]}
      {distance}
      {decay}
    />{/if}
{/each}
