const e=`import json
from pathlib import Path
from tempfile import TemporaryDirectory
import hmplot as hm

@hm.template
def radar(index="dimension", value="score", series="profile", count=5):
    with hm.Calculate(columns={"angle": hm.subtract(1.5707963267948966, hm.multiply(index, 6.283185307179586 / count))}):
        with hm.Calculate(columns={"px": hm.multiply(value, hm.cos("angle")),
                                   "py": hm.multiply(value, hm.sin("angle"))}):
            hm.Polygon(x="px", y="py", series=series, fill=series, opacity=0.18,
                       outline_width=0)
            hm.Line(x="px", y="py", series=series, color=series, width=2)
    hm.slot()

# Export and reload without changing the downloaded example files.
with TemporaryDirectory() as directory:
    radar(hm.template_param("index", default="dimension"), hm.template_param("value", default="score"),
          hm.template_param("series", default="profile"),
          count=hm.template_param("count", default=5)).export_template(Path(directory) / "radar.hmplot.json")
    pattern = hm.load_template(Path(directory) / "radar.hmplot.json")

data = json.loads(Path("data.json").read_text())
with hm.Plot(data=data, responsive=True, height=440, axes2d=False, aspect='equal', x={'domain': [-1.3, 1.3]}, y={'domain': [-1.3, 1.3]}) as plot:
    guides = json.loads(Path("guides.json").read_text())
    with hm.Data(guides["rings"]):
        hm.Line(x="x", y="y", series="ring", color="#cbd5e1", width=0.8, legend=False)
    with hm.Data(guides["spokes"]):
        hm.Line(x="x", y="y", series="spoke", color="#cbd5e1", width=0.8, legend=False)
    with hm.Data(guides["labels"]):
        hm.Text(x="x", y="y", text="text", size=13)
    pattern()
    hm.Legend(channel="color", label="Profile", position="bottom")
plot
`;export{e as default};
