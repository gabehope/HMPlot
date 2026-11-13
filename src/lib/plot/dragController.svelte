<script lang="ts">
  import DragInteraction from "./dragInteraction.svelte";
  import ForceInteraction from "./forceInteraction.svelte";
  import type { DragController } from "./utils/dragController.svelte.js";

  let { controller, mark }: { controller: DragController; mark: any } =
    $props();
</script>

{#if controller.config}
  <DragInteraction {mark} config={() => controller.config} />
{/if}
{#if controller.force}
  <ForceInteraction {mark} force={controller.force} />
{/if}
