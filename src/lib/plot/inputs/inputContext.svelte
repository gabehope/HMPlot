<script lang="ts">
  import { getContext, setContext, untrack } from "svelte";
  import { INPUT_CONTEXT } from "../utils/inputs.js";
  import { InputStore } from "../utils/inputStore.svelte.js";
  import { provideClockScope } from "../utils/clockScope.js";
  import type { InputContextProps } from "../publicTypes.js";
  // An input context (TODO 41): inputs under it send their values here, and everything under
  // it reads them by name, then the names of the contexts around it. A Python scene passes the
  // store it already filled with its inputs (SceneNode.svelte).
  let { store = undefined, children }: InputContextProps & { store?: InputStore } = $props();
  // The store is fixed for the context's lifetime.
  const own = untrack(() => store) ?? new InputStore(getContext(INPUT_CONTEXT) ?? null);
  setContext(INPUT_CONTEXT, own);
  // The outermost input context is a clock scope (TODO 50): its Plots share @time, and its
  // Playbacks play by that clock. Nested ones reuse it.
  provideClockScope();
  /** The context's values, by input name. */
  export const getValues = () => ({ ...own.values });
</script>

{@render children?.()}
