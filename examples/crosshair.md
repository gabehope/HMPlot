# Crosshair and rules

Move the pointer over a time series: the crosshair follows it with a readout of each value. A dashed rule marks a threshold and gray rules mark events from a second table, labeled at the top of the frame.

## Python

```python
import hmplot as hm
import numpy as np
import pandas as pd

dates = pd.date_range("2026-01-01", periods=120, freq="D")
i = np.arange(120)
series = pd.DataFrame({"date": dates, "load": 60 + np.cumsum(np.sin(i * 0.9) * 1.5 + np.cos(i * 0.23))})
events = pd.DataFrame({"date": pd.to_datetime(["2026-02-03", "2026-03-18"]), "name": ["Release", "Outage"]})
with hm.Plot(data=series, height=340, axes2d=True, y={"label": "load (%)"}) as plot:
    hm.Line(x="date", y="load", color="#547ba2", width=2)
    hm.charts.RuleY(y=75, color="#cf8955", dash=True)
    with hm.Data(events):
        hm.charts.RuleX(x="date", color="#8a949e")
        hm.Text(x="date", y="@view_y_max", text="name", dx=4, dy=10, align="left", legend=False)
    hm.charts.Crosshair()
plot
```

## Svelte

```svelte
<script>
  import { Data, Plot, Line, Text } from "hmplot";
import { RuleX, RuleY, Crosshair } from "hmplot/charts";
  const day = 86400000, start = Date.UTC(2026, 0, 1);
  const series = { date: [], load: [] };
  for (let i = 0, level = 60; i < 120; i++) {
    level += Math.sin(i * 0.9) * 1.5 + Math.cos(i * 0.23);
    series.date.push(new Date(start + i * day));
    series.load.push(level);
  }
  const events = { date: [new Date(start + 33 * day), new Date(start + 76 * day)], name: ["Release", "Outage"] };
</script>
<Plot data={series} responsive height={340} axes2d y={{ label: "load (%)" }}>
  <Line x="date" y="load" color="#547ba2" width={2} />
  <RuleY y={75} color="#cf8955" dash />
  <Data value={events}>
    <RuleX x="date" color="#8a949e" />
    <Text x="date" y="@view_y_max" text="name" dx={4} dy={10} align="left" legend={false} />
  </Data>
  <Crosshair />
</Plot>
```
