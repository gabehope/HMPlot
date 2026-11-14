# Density estimation

Grouped 1D and raster 2D Gaussian kernel density estimates.

## Python

```python
import hmplot as hm
import numpy as np

values = hm.Table({"group": ["A", "B"] * 120, "value": np.sin(np.arange(240) * 1.7) + np.tile([-1, 1], 120)})
with hm.Scene() as scene:
    with hm.Controls():
        hm.Slider(name="bandwidth", min=0.02, max=0.5, step=0.01, value=0.15, label="Bandwidth")
    with hm.Plot(data=values, axes2d=True, height=420):
        with hm.Density(x="value", by="group", resolution=256, bandwidth=hm.input.bandwidth):
            hm.Line(x="x", y="density", color="group", width=2)
scene
```

## Svelte

```svelte
<Density x="value" by="group"><Line x="x" y="density" /></Density>
```
