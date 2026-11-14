# Hover and click selection

Highlight hovered rows, toggle keyed selections, and update selection state from code.

## Python

```python
with hm.Plot(data=observations, key="id") as plot:
    hm.Points(x="x", y="y", select=True,
                     hover=True, respond="selected",
                     size=hm.where("@hovered", 10, 7))
    hm.Text(x="x", y="y", text="name")

await plot.selection.replace([0, 4, 8])
```

## Svelte

```svelte
<script>import { where } from "hmplot";</script>
<Plot data={observations} key="id">
  <Points x="x" y="y" select hover respond="selected"
    size={where("@hovered", 10, 7)} />
  <Text x="x" y="y" text="name" />
</Plot>
```
