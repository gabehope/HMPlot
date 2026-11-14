# Density & surfaces

One GPU heatmap, fixed color bounds, contours, and an optional 3D surface.

## Python

```python
import hmplot as hm
import numpy as np

u, v = np.meshgrid(np.linspace(-1, 1, 24), np.linspace(-1, 1, 24))
with hm.Plot(type="3d", axes3d=True, overview=True, lights=[hm.light("ambient", intensity=1),
              hm.light("directional", position=[2, 3, 4], intensity=2)]) as plot:
    with hm.Heatmap(fill=np.exp(-3 * (u * u + v * v)), surface_mode=True, z_scale=25) as surface:
        points = hm.Points(
            position=[[-0.5, -0.5], [0, 0], [0.5, 0.5]], size=16, fill="white"
        )
points.on_click(lambda event: print(event.source_index, event.data_coordinates))
plot
```

## Svelte

```svelte
<Heatmap fill={density} fillScale={continuous({ domain: [0, 1] })}
  contour-enabled={true}
  surfaceMode={true} surface3d={mode === '3d'}
  zScale={20} />
```
