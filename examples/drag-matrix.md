# Dragging points

Drag a point in a scatterplot matrix: the drag writes offsets on the table's rows, and every cell that reads moved() of the dragged column follows.

## Python

```python
import hmplot as hm

penguins = hm.Table(rows, key="id")  # rows: id, species, bill, depth, mass
with hm.Scene() as scene:
    with hm.Plot(data=penguins, axes2d=True):
        with hm.Facet(pairs=["bill", "depth", "mass"], triangle="lower"):
            points = hm.Points(x=hm.moved("x"), y=hm.moved("y"), color="species", drag=True)
points.on_event("dragend", lambda event: print(event.keys, event.changes))
scene
# After dragging: penguins.offsets (key, column, delta); penguins.apply_offsets() is a new Table.
```

## Svelte

```svelte
<Data value={penguins} key="id">
  <Plot axes2d>
    <Facet pairs={["bill", "depth", "mass"]} triangle="lower">
      <Points x={moved("x")} y={moved("y")} fill="species" select drag
        ondragend={(event) => console.log(event.keys, event.changes)} />
    </Facet>
  </Plot>
</Data>
```
