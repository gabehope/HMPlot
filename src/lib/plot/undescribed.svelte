<script lang="ts">
  // A compound's helper part that draws nothing a reader sees (Histogram's brush carrier): it is
  // left out of its Plot's description, which counts the compound's drawn rows (TODO 49).
  import { setContext } from "svelte";
  import type { Snippet } from "svelte";
  import { DESCRIPTION_CONTEXT } from "./utils/describe.js";
  let { children }: { children?: Snippet } = $props();
  setContext(DESCRIPTION_CONTEXT, undefined);
</script>

{@render children?.()}
