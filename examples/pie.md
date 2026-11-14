# Pie chart

Each region's share of the sales, clockwise from 12 o'clock, labeled with its percentage. Pie is a built-in template: a PieGeometry transform and Rects in a polar Frame, which it places in a Cartesian Plot.

## Python

```python
import hmplot as hm

data = {"region": ["North", "East", "South", "West", "Central"],
        "sales": [42, 18, 27, 9, 14]}
with hm.Plot(data=data, height=380) as plot:
    pie = hm.charts.Pie(value="sales", category="region", sector_label="percent", hover=True,
                 respond="hovered")
    hm.Legend(target=pie, channel="fill", label="Region", position="right")
plot
```

## Svelte

```svelte
<script>
  import { Plot, Legend } from "hmplot";
import { Pie } from "hmplot/charts";
  let pie = $state();
  const data = {
    region: ["North", "East", "South", "West", "Central"],
    sales: [42, 18, 27, 9, 14],
  };
</script>
<Plot {data} responsive height={380}>
  <Pie bind:this={pie} value="sales" category="region" sectorLabel="percent" hover respond="hovered" />
  <Legend for={pie} channel="fill" label="Region" position="right" />
</Plot>
```
