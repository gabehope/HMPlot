"""Reference: one source identity, two views, a height filter and linked brush."""
from pathlib import Path
import pandas as pd
import hmplot as hm

Path("output").mkdir(exist_ok=True)
stars = pd.read_parquet("data/stars.parquet")
stars["height"] = stars.z_kpc.abs()
span = float(stars[["x_kpc", "y_kpc", "z_kpc"]].abs().to_numpy().max())
age = hm.continuous(domain=[float(stars.age_gyr.min()), float(stars.age_gyr.max())],
                    colormap=["#2878d0", "#d94036"])
active = hm.view.any_brushed
chosen = hm.view.brushed
with hm.Scene(gap=16) as chart:
    hm.Slider(name="height", label="Maximum |z| (kpc)", min=0.1,
              max=float(stars.height.max()), value=float(stars.height.max()))
    with hm.Data(stars):
        with hm.Filter(where=hm.col.height <= hm.input.height):
            with hm.Row(widths=[1.2, 1], gap=20):
                with hm.Plot(type="3d", title="Galaxy", height=560,
                             camera_position=[110, -140, 100], legend=False,
                             x={"domain": [-span, span]}, y={"domain": [-span, span]},
                             z={"domain": [-span, span]}):
                    with hm.Filter(where=active & ~chosen):
                        hm.Points(x="x_kpc", y="y_kpc", z="z_kpc", size=1.2,
                                  fill="#b4bac5", opacity=0.035, blend="additive")
                    with hm.Filter(where=(~active) | chosen):
                        points = hm.Points(x="x_kpc", y="y_kpc", z="z_kpc", size=1.3,
                                           fill="age_gyr", fill_scale=age,
                                           opacity=0.35, blend="additive")
                    hm.Legend(target=points, channel="fill", label="Age (Gyr)")
                with hm.Plot(title="Face-on view", height=560, aspect="equal",
                             x={"label": "x (kpc)"}, y={"label": "y (kpc)"}):
                    hm.Points(x="x_kpc", y="y_kpc", fill="#3983be", size=1.2,
                              opacity=0.16, brush=True, respond="brushed",
                              selection_opacity=0.08)
hm.export_html(chart, "output/chart.html")
