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
