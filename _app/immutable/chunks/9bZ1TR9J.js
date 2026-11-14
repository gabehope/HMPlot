const e=`import json
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
`;export{e as default};
