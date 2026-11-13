<script lang="ts">
  import { getContext, setContext } from "svelte";
  import { DATA_CONTEXT } from "./utils/categorical.js";
  import { interactionScope } from "./utils/interaction.js";
  import type { Snippet } from "svelte";
  let { columns = {}, children }: { columns?: Record<string, any>; children?: Snippet } = $props();
  const parent: any = getContext(DATA_CONTEXT);
  if (!parent) throw Error("Interaction requires a Data scope.");
  setContext(DATA_CONTEXT, { read: () => interactionScope(parent.read(), columns) });
</script>

{@render children?.()}
