<script>
  // A built-in template's slot (TODO 136.16): the caller's children are theirs, not the
  // template's parts, so they leave its template scope (an isolated host has no scope outside
  // it), as a scene's Slot returns to the scope around its template.
  import { setContext } from "svelte";
  import { TEMPLATE_SCOPE } from "./templateScope.svelte.js";
  let { children } = $props();
  setContext(TEMPLATE_SCOPE, null);
</script>

{@render children?.()}
