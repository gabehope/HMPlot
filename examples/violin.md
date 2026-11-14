# Violin plot

Grouped GPU density bands with categorical color.

## Python

```python
import numpy as np
import hmplot as hm

# 240 values in three groups, each group a little higher than the last. Violin estimates each
# group's density on the GPU and mirrors it into a band; the categorical scale keeps the groups'
# order.
groups = ["Alpha", "Beta", "Gamma"]
i = np.arange(240)
values = {
    "group": [groups[k % 3] for k in range(240)],
    "value": (i % 3) * 1.2 + np.sin(i * 2.17) * 0.7 + np.cos(i * 0.31) * 0.25,
}

with hm.Plot(data=values, x={"scale": hm.categorical(domain=groups)}, height=440, axes2d=True) as plot:
    hm.charts.Violin(x="group", y="value", fill="group", outline_color="#30343b")
plot
```

## Svelte

```svelte
<script>
  import { Plot, categorical } from "hmplot";
import { Violin } from "hmplot/charts";

  // 240 values in three groups, each group a little higher than the last. Violin estimates each
  // group's density on the GPU and mirrors it into a band; the categorical scale keeps the
  // groups' order.
  const groups = ["Alpha", "Beta", "Gamma"];
  const values = Array.from({ length: 240 }, (_, i) => ({
    group: groups[i % 3],
    value: (i % 3) * 1.2 + Math.sin(i * 2.17) * 0.7 + Math.cos(i * 0.31) * 0.25,
  }));
</script>

<Plot data={values} x={{ scale: categorical({ domain: groups }) }} height={440} axes2d>
  <Violin x="group" y="value" fill="group" outlineColor="#30343b" />
</Plot>
```
