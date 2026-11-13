<script>
  // TODO 130.1's RuleX lag check: a red RuleX across the frame (its ends @view_y_min and
  // @view_y_max) and a blue Plot rule laid out with the axes, for a test that pans and zooms and
  // reads where each reaches every frame. Their labels show where a rule's label sits (TODO 134.29).
  import { onMount } from "svelte";
  import { Plot } from "$lib/index";
import { RuleX } from "$lib/charts/index.js";
  let plot = $state();
  onMount(() => {
    window.ruleLag = { get plot() { return plot; } };
    return () => { delete window.ruleLag; };
  });
</script>
<Plot bind:this={plot} width={300} height={300} x={{ domain: [0, 10] }} y={{ domain: [0, 10] }}
  rules={[{ axis: "x", value: 3, color: "#0000ff", width: 3, label: "three" }, { axis: "y", value: 5, color: "#888888", label: "five, dashed", dash: [4, 3] }]}>
  <RuleX x={7} color="#ff0000" width={3} />
</Plot>
