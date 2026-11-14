# Symlog axis and a diverging scale

Values that cross zero with a wide range: a symlog y axis is linear within ±10 and logarithmic beyond, so small days and large ones both read, and outflows are drawn (a log axis would drop them). The color scale's midpoint puts RdBu's white at 0 and uses both ends of the colormap.

## Python

```python
"""A symlog axis and a diverging color scale for values that cross zero.

Illustrative daily net flows of an account book: most days move a few units either way, a
few move tens of thousands. A linear axis squeezes the small days onto zero and a log axis
cannot show the outflows; ``transform="symlog"`` is linear within ±``constant`` and
logarithmic beyond, so both kinds stay readable. The color scale's ``midpoint=0`` puts
RdBu's white at zero and uses both ends of the colormap, however lopsided the extent.
"""
import hmplot as hm

n = 150
flow = []
for i in range(n):
    size = 10 ** (((i * 37) % 50) / 10)  # 1 to 100,000
    sign = -1 if i % 3 == 0 else 1
    flow.append(sign * round(size * (0.5 + ((i * 53) % 10) / 20)))
data = {"day": [i % 30 for i in range(n)], "flow": flow}

scale = hm.continuous(colormap="RdBu", transform="symlog", constant=10, midpoint=0)
with hm.Plot(data=data, height=420, axes2d=True,
             x={"label": "Day"},
             y={"transform": "symlog", "constant": 10, "label": "Net flow"}) as plot:
    points = hm.Points(x="day", y="flow", fill="flow", fill_scale=scale, size=3.5)
    hm.Legend(target=points, channel="fill", label="Net flow", position="right")
plot
```

## Svelte

```svelte
<script>
  import { Plot, Points, Legend, continuous } from "hmplot";
  // flow: daily net flows, a few units most days and tens of thousands on a few.
  const scale = continuous({ colormap: "RdBu", transform: "symlog", constant: 10, midpoint: 0 });
  let points = $state();
</script>
<Plot {data} responsive height={420} axes2d
  x={{ label: "Day" }} y={{ transform: "symlog", constant: 10, label: "Net flow" }}>
  <Points bind:this={points} x="day" y="flow" fill="flow" fillScale={scale} size={3.5} />
  <Legend for={points} channel="fill" label="Net flow" position="right" />
</Plot>
```
