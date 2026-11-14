# Inputs

A Select, a Playback and a Slider drive a Filter and a Bin by name; the options and a range are read from the data.

## Python

```python
import math
import hmplot as hm

data = {"x": [math.sin(i * 0.4) + i % 3 for i in range(120)], "species": ["ABC"[i % 3] for i in range(120)]}
# Inputs send their values up to the Scene; everything in it reads them by name. The Species
# options and the range of Minimum x are read from the data around them, and Minimum x plays.
with hm.Scene() as scene:
    with hm.Data(data):
        with hm.Controls():
            hm.Select(name="species", options=hm.categories("species"), label="Species")
            hm.Playback(name="start", min=hm.min("x"), max=hm.max("x"), step=0.1, rate=0.5, loop=True, label="Minimum x")
            hm.Slider(name="bins", min=4, max=40, step=1, value=12, label="Bins")
        with hm.Filter(where=(hm.col.species == hm.input.species) & (hm.col.x >= hm.input.start)):
            with hm.Plot(axes2d=True, x={"domain": [-1.1, 3.1]}, y={"domain": [0, 20]}):
                with hm.stats.Bin(x="x", bins=hm.input.bins):
                    hm.Rect(x0="x0", x1="x1", y0=0, y1="count", fill="#547ba2")
scene
```

## Svelte

```svelte
<InputContext><Data value={observations}>
  <Select name="species" options={categories("species")} />
  <Playback name="start" min={min("x")} max={max("x")} rate={0.5} loop />
  <Slider name="bins" min={4} max={40} step={1} value={12} />
  <Filter where={logical_and(equal(col("species"), input("species")), greater_equal(col("x"), input("start")))}><Plot>
    <Bin x="x" bins={input("bins")}><Rect x0="x0" x1="x1" y0={0} y1="count" /></Bin>
  </Plot></Filter>
</Data></InputContext>
```
