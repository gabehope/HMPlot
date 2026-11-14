# Donut chart

innerRadius opens the hole and padAngle separates the sectors. Keyed rows tween each sector's angles when the values change.

## Python

```python
import hmplot as hm

data = {"region": ["North", "East", "South", "West", "Central"],
        "sales": [42, 18, 27, 9, 14]}
with hm.Plot(data=data, key="region", height=380) as plot:
    hm.charts.Pie(value="sales", category="region", inner_radius=0.55, pad_angle=1.5, sector_label="category",
           animation=True, animation_duration=700)
plot
# plot.update(data={"region": [...], "sales": [...]}) tweens the sectors to the new values.
```

## Svelte

```svelte
<script>
  import { Plot } from "hmplot";
import { Pie } from "hmplot/charts";
  const regions = ["North", "East", "South", "West", "Central"];
  let sales = $state([42, 18, 27, 9, 14]);
  // Next month: new values for the same keys tween each sector's angles.
  const next = () => (sales = sales.map(() => 8 + Math.round(40 * Math.random())));
</script>
<button onclick={next}>Next month</button>
<Plot data={{ region: regions, sales }} key="region" responsive height={380}>
  <Pie value="sales" category="region" innerRadius={0.55} padAngle={1.5} sectorLabel="category"
    animation animationDuration={700} />
</Plot>
```
