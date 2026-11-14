# Linked views & minimap

Two views share a viewport. An external overview retains the full domain.

## Python

```python
import hmplot as hm
import numpy as np

x = np.linspace(0, 10, 100)
with hm.Scene() as scene:
    with hm.Row():
        with hm.Plot(x={"domain": [0, 10]}, y={"domain": [-1.1, 1.1]}, axes2d=True) as a:
            hm.Line(x=x, y=np.sin(x))
        with hm.Plot(x={"domain": [0, 10]}, y={"domain": [-1.1, 1.1]}, axes2d=True) as b:
            hm.Line(x=x, y=np.cos(x))
    hm.LinkViews(a, b, axes="x")
scene
```

## Svelte

```svelte
<Plot bind:this={first} {viewport}
  onviewportchange={(v) => viewport = v}>…</Plot>
<Plot {viewport}
  onviewportchange={(v) => viewport = v}>…</Plot>
<Minimap for={first} displayScale={0.35} />
```
