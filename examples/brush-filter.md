# Draggable brush

Move a committed brush, clear it outside, and filter a sibling view through @brushed.

## Python

```python
with hm.Data(observations, key="id"):
    with hm.Row():
        with hm.Plot() as source:
            hm.Points(x="x", y="y", brush=True,
                             respond="brushed")
        with hm.Plot():
            with hm.Filter(where="@brushed", inactive="all"):
                hm.Points(x="x", y="y")
```

## Svelte

```svelte
<Data value={observations} key="id">
  <Plot><Points x="x" y="y" brush respond="brushed" /></Plot>
  <Plot><Filter where="@brushed" inactive="all">
    <Points x="x" y="y" />
  </Filter></Plot>
</Data>
```
