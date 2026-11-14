# Waffle grid

Integer counts expand into source-identified unit squares, ordered left to right and bottom to top.

## Python

```python
import hmplot as hm

data = {"category": ["A", "B", "C"], "count": [23, 35, 42]}
with hm.Plot(data=data, height=420,
             x={"domain": [0, 10]}, y={"domain": [0, 10]}) as plot:
    with hm.Dodge(mode="grid", columns=10, count="count"):
        hm.Points(x="x", y="y", fill="category", shape="square", size=12)
plot
```

## Svelte

```svelte
<script>
  import { Plot, Dodge, Points } from "hmplot";
  const data = { category: ["A", "B", "C"], count: [23, 35, 42] };
</script>
<Plot {data} responsive height={420} x={{domain:[0,10]}} y={{domain:[0,10]}}>
  <Dodge mode="grid" columns={10} count="count">
    <Points x="x" y="y" fill="category" shape="square" size={12} />
  </Dodge>
</Plot>
```
