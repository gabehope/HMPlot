# Portable parallel coordinates

Fold and Normalize turn a wide table into comparable dimensions. A portable Line template draws one profile per observation.

## Python

```python
import json
from pathlib import Path
from tempfile import TemporaryDirectory
import hmplot as hm

@hm.template
def parallel(fields, observation="id", color="group", opacity=0.55):
    with hm.Fold(fields=fields):
        with hm.stats.Normalize(field="value", by="key", method="extent", as_="scaled"):
            with hm.Sort(by=[observation, "key"]):
                hm.Line(x="key", y="scaled", series=observation, color=color, opacity=opacity, width=1.6)
    hm.slot()

# Export and reload without changing the downloaded example files.
with TemporaryDirectory() as directory:
    parallel(hm.template_param("fields"), hm.template_param("observation", default="id"),
             hm.template_param("color", default="group"),
             opacity=hm.template_param("opacity", default=0.55)).export_template(Path(directory) / "parallel.hmplot.json")
    pattern = hm.load_template(Path(directory) / "parallel.hmplot.json")

data = json.loads(Path("data.json").read_text())
with hm.Plot(data=data, responsive=True, height=380, x={'label': 'Measure'}, y={'label': 'Relative value', 'domain': [0, 1]}) as plot:
    pattern(fields=['speed', 'range', 'comfort', 'efficiency'])
    hm.Legend(channel="color", label="Group", position="bottom")
plot
```

## Svelte

```svelte
<script>
  import { Plot, Legend } from "hmplot";
  import { PortableTemplate } from "hmplot/templates";
  import { untrack } from "svelte";
  import definition from "./parallel.hmplot.json";
  import download from "./parallel.hmplot.json?url";
  import data from "./data.json";
  let { onready } = $props(), plot = $state();
  $effect(() => { const p = plot; untrack(() => onready?.(p)); });
</script>
<p>Simulated product profiles. Supply one row per observation with a unique id, categorical group, and numeric measure columns. fields determines dimension order. Each measure is normalized across visible rows to 0–1; this is not a shared physical unit scale. <a href={download} download="parallel.hmplot.json">Download template</a></p>
<Plot bind:this={plot} {data} responsive height={380} x={{"label": "Measure"}} y={{"label": "Relative value", "domain": [0, 1]}}>
  <PortableTemplate {definition} params={{"fields": ["speed", "range", "comfort", "efficiency"]}} />
  <Legend channel="color" label="Group" position="bottom" />
</Plot>
<style>p {font-size:14px;line-height:1.5}</style>
```
