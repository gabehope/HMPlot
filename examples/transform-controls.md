# Filter and bin inputs

A Select with multiple=true of the species column's categories filters the rows, and a Slider sets the histogram's bin count.

## Svelte

```svelte
<InputContext><Data value={observations}>
  <Select multiple name="species" options={categories("species")} value={["A"]} label="Species" />
  <Slider name="bins" min={1} max={64} step={1} value={12} label="Bins" />
  <Filter where={is_in(col("species"), input("species"))}><Plot>
    <Bin x="x" bins={input("bins")}><Rect x0="x0" x1="x1" y0={0} y1="count" /></Bin>
  </Plot></Filter>
</Data></InputContext>
```
