# Unified x tooltip

Move the pointer along the dates: one tooltip lists every series' value at that date, with a marker on each line, beside a Crosshair's vertical rule.

## Python

```python
import hmplot as hm
import numpy as np
import pandas as pd

i = np.arange(90)
prices = pd.concat([pd.DataFrame({"date": pd.date_range("2026-01-01", periods=90, freq="D"),
                                  "price": 100 - k * 15 + np.sin(i / 7 + k) * 8 + i * 0.1, "ticker": ticker})
                    for k, ticker in enumerate(["North", "East", "West"])])
with hm.Plot(data=prices, height=340, axes2d=True, tooltip={"mode": "x"}, y={"label": "price"}) as plot:
    hm.Line(x="date", y="price", series="ticker", color="ticker", width=2)
    hm.charts.Crosshair(axes="x", readout=False)
plot
```

## Svelte

```svelte
<script>
  import { Plot, Line } from "hmplot";
import { Crosshair } from "hmplot/charts";
  const day = 86400000, start = Date.UTC(2026, 0, 1);
  const prices = { date: [], price: [], ticker: [] };
  ["North", "East", "West"].forEach((ticker, k) => {
    for (let i = 0; i < 90; i++) {
      prices.date.push(new Date(start + i * day));
      prices.price.push(100 - k * 15 + Math.sin(i / 7 + k) * 8 + i * 0.1);
      prices.ticker.push(ticker);
    }
  });
</script>
<Plot data={prices} responsive height={340} axes2d tooltip={{ mode: "x" }} y={{ label: "price" }}>
  <Line x="date" y="price" series="ticker" color="ticker" width={2} />
  <Crosshair axes="x" readout={false} />
</Plot>
```
