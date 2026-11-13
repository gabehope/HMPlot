<script lang="ts">
  // A copy of the hand-written RuleY before it became a template (TODO 130.3), for parity.
  import Rule from "./Rule.svelte";
  import type { RuleYProps } from "$lib/plot/publicTypes.js";
  let { y, x0 = undefined, x1 = undefined, ...props }: RuleYProps = $props();
</script>
<Rule kind="RuleY" dimension="y" value={y} from={x0} to={x1} {...props} />
