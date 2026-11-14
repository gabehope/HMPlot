# Custom colormaps

A diverging colormap from three colors and a positioned ramp that saves its strongest colors for the top of the domain. Legends and exports follow.

## Python

```python
import numpy as np
import hmplot as hm

x, y = np.meshgrid(np.linspace(-3, 3, 30), np.linspace(-3, 3, 30))
data = {"x": x.ravel(), "y": y.ravel(), "value": (np.sin(x) * np.cos(y)).ravel()}
diverging = hm.continuous(domain=[-1, 1], colormap=["#2166ac", "#f7f7f7", "#b2182b"])
alert = hm.continuous(domain=[-1, 1], colormap=hm.colormap(
    ["#e8eef4", "#9ab0c4", "#f2a900", "#d7301f"], positions=[0, 0.8, 0.9, 1]))
with hm.Scene() as scene:
    for scale, label in [(diverging, "Diverging"), (alert, "Alert levels")]:
        with hm.Plot(data=data, height=320, axes2d=True):
            points = hm.Points(x="x", y="y", fill="value", fill_scale=scale, shape="square", size=5)
            hm.Legend(target=points, channel="fill", label=label, position="right")
scene
```

## Svelte

```svelte
<script>
  import { Plot, Points, Legend, continuous } from "hmplot";
  let points = $state(), ranked = $state();
  const n = 900;
  const data = {
    x: Array.from({ length: n }, (_, i) => (i % 30) / 29 * 6 - 3),
    y: Array.from({ length: n }, (_, i) => Math.floor(i / 30) / 29 * 6 - 3),
  };
  data.value = data.x.map((x, i) => Math.sin(x) * Math.cos(data.y[i]));
  // A diverging map from three colors, interpolated in Lab.
  const diverging = continuous({ domain: [-1, 1], colormap: ["#2166ac", "#f7f7f7", "#b2182b"] });
  // Positions squeeze most of the ramp into the top tenth of the domain.
  const alert = continuous({ domain: [-1, 1], colormap: { colors: ["#e8eef4", "#9ab0c4", "#f2a900", "#d7301f"], positions: [0, 0.8, 0.9, 1] } });
</script>
<Plot data={data} responsive height={320} axes2d>
  <Points bind:this={points} x="x" y="y" fill="value" fillScale={diverging} shape="square" size={5} />
  <Legend for={points} channel="fill" label="Diverging" position="right" />
</Plot>
<Plot data={data} responsive height={320} axes2d>
  <Points bind:this={ranked} x="x" y="y" fill="value" fillScale={alert} shape="square" size={5} />
  <Legend for={ranked} channel="fill" label="Alert levels" position="right" />
</Plot>
```
