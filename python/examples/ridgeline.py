"""Lincoln's 2016 temperatures as monthly density ridges.

Run as a script, or paste into a notebook; `plot` displays the chart.
Requires pandas to load the same public CSV as the SveltePlot example.
"""
import hmplot as hm
import pandas as pd

weather = pd.read_csv("https://svelteplot.dev/data/lincoln_weather.csv")
weather["temperature"] = (weather["Mean Temperature [F]"] - 32) / 1.8
months = weather["Month"].drop_duplicates().tolist()
temperature_colors = {
    "colors": ["#0493cf", "#52a7db", "#a2cbe1", "#ffffe0", "#ffc173", "#ff7f26", "#f50000"],
    "positions": [(value + 23) / 53 for value in [-23, -16, -8, 0, 10, 20, 30]],
    "space": "srgb",
}

with hm.Plot(data=weather, width=800, height=600, axes2d=True,
             axis_mask=False, axis_frame=False,
             x={"domain": [-26, 33], "label": "Mean temperature (°C)", "grid": "off", "arrow": "none"},
             y={"domain": [-0.5, 12.2], "tickCount": 12, "labelOverlap": "show",
                "line": False, "ticks": False, "grid": "off", "arrow": "none"}) as plot:
    with hm.Facet(row="Month", row_order=months[::-1], band_padding=0):
        with hm.Frame(y={"domain": [0, 0.06], "visible": False}, axis_mask=False):
            hm.charts.RuleY(y=0, color="#64748b", opacity=0.5, width=0.6)
            with hm.Density(x="temperature", bandwidth=4 / 5**0.5,
                            resolution=256, bounds={"x": [-26, 33]}):
                hm.Area(x="x", upper="density", fill="x", fill_scale=hm.continuous(domain=[-23, 30], colormap=temperature_colors),
                        opacity=0.75, blend="multiply")
                hm.Line(x="x", y="density", color="#334155", width=1.2)
plot

# Optional outside a notebook:
# hm.export_png(plot, "ridgeline.png")
