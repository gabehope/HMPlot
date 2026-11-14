# Embedded facets

Facets inside a Plot partition its frame and share its renderer and camera. For grouped bars, use Bar with arrange="group".

## Python

```python
import hmplot as hm

data = {
    "region": ["North", "North", "South", "South", "West", "West"],
    "year": ["2024", "2025", "2024", "2025", "2024", "2025"],
    "total": [12, 18, 9, 15, 21, 25],
}
with hm.Plot(data=data, height=420, axes2d=True, y={"domain": [0, 30]}) as plot:
    with hm.Facet(column="region", band_padding=0.2):
        hm.charts.Bar(x="year", y="total", fill="year")
plot
```

## Svelte

```svelte
<script>
  import { Plot, Facet } from "hmplot";
import { Bar } from "hmplot/charts";
  const data = {
    region: ["North", "North", "South", "South", "West", "West"],
    year: ["2024", "2025", "2024", "2025", "2024", "2025"],
    total: [12, 18, 9, 15, 21, 25],
  };
</script>
<Plot {data} responsive height={420} axes2d y={{domain:[0,30]}}>
  <Facet column="region" bandPadding={0.2}>
    <Bar x="year" y="total" fill="year" />
  </Facet>
</Plot>
```
