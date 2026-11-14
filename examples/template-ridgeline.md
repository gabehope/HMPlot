# Portable ridgeline template

Grouped Gaussian densities in one shared frame, packaged as a downloadable template. Change the data, bandwidth and ridge height.

## Python

```python
import json
from pathlib import Path
from tempfile import TemporaryDirectory
import hmplot as hm

@hm.template
def ridges(value="value", group="group", bandwidth=0.4, gain=2.2):
    with hm.Density(x=value, by=group, bandwidth=bandwidth, resolution=128):
        with hm.Calculate(columns={"baseline": hm.multiply(group, 1),
                                   "ridge": hm.add(group, hm.multiply("density", gain))}):
            hm.Area(x="x", upper="ridge", lower="baseline", series=group, fill=group, opacity=0.65)
            hm.Line(x="x", y="ridge", series=group, color="#334155", width=1.1)
    hm.slot()

# Export and reload without changing the downloaded example files.
with TemporaryDirectory() as directory:
    ridges(hm.template_param("value", default="value"), hm.template_param("group", default="group"),
           bandwidth=hm.template_param("bandwidth", default=0.4),
           gain=hm.template_param("gain", default=2.2)).export_template(Path(directory) / "ridgeline.hmplot.json")
    pattern = hm.load_template(Path(directory) / "ridgeline.hmplot.json")

data = json.loads(Path("data.json").read_text())
with hm.Plot(data=data, responsive=True, height=420, x={'label': 'Measurement'}, y={'label': 'Group', 'step': 1, 'grid': 'off', 'domain': [-0.15, 5.7]}) as plot:
    pattern()
plot
```

## Svelte

```svelte
<script>
  import { Plot } from "hmplot";
  import { PortableTemplate } from "hmplot/templates";
  import { untrack } from "svelte";
  import definition from "./ridgeline.hmplot.json";
  import download from "./ridgeline.hmplot.json?url";
  import data from "./data.json";
  let { onready } = $props(), plot = $state();
  $effect(() => { const p = plot; untrack(() => onready?.(p)); });
</script>
<p>Simulated measurements for five ordered groups. value is numeric; group is a numeric baseline index (0, 1, …), not a category name. bandwidth uses value units and gain sets the vertical density multiplier. All groups share a measurement scale. <a href={download} download="ridgeline.hmplot.json">Download template</a></p>
<Plot bind:this={plot} {data} responsive height={420} x={{"label": "Measurement"}} y={{"label": "Group", "step": 1, "grid": "off", "domain": [-0.15, 5.7]}}>
  <PortableTemplate {definition} params={{}} />
</Plot>
<style>p {font-size:14px;line-height:1.5}</style>
```
