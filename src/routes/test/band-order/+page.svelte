<script>
  // A band y axis lists its first category at the top (TODO 136.15); invert turns it bottom-up.
  import { Plot } from "$lib/index";
import { Bar } from "$lib/charts/index.js";
  const rows = { name: ["first", "second", "third"], value: [3, 1, 2] };
</script>

<div data-fixture="top"><Plot data={rows} width={300} height={200} axes2d>
  <Bar x="value" y="name" orientation="horizontal" />
</Plot></div>
<div data-fixture="bottom"><Plot data={rows} width={300} height={200} axes2d y={{ invert: true }}>
  <Bar x="value" y="name" orientation="horizontal" />
</Plot></div>
