<script lang="ts">
  // A copy of the hand-written RuleX before it became a template (TODO 130.3), for parity.
  import Rule from "./Rule.svelte";
  import type { RuleXProps } from "$lib/plot/publicTypes.js";
  let { x, y0 = undefined, y1 = undefined, ...props }: RuleXProps = $props();
</script>
<Rule kind="RuleX" dimension="x" value={x} from={y0} to={y1} {...props} />
