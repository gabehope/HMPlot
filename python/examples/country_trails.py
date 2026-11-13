"""Country trails, with a playable 20-year window.

Adapted from https://svelteplot.dev/examples/trail/countries.
Paste into a notebook; `scene` displays the chart. Requires pandas.
The exported HTML plays without a Python process.
"""
import hmplot as hm
import pandas as pd

countries = {"bra": "Brazil", "chn": "China", "fra": "France", "ind": "India",
             "irq": "Iraq", "ken": "Kenia", "usa": "USA"}
data = pd.read_csv("https://svelteplot.dev/data/gapminder.csv")
data = data[data["Code"].isin(countries)].sort_values(["Code", "Year"]).copy()
data["Country"] = data["Code"].map(countries)
colors = hm.categorical(domain=list(countries.values()),
                        range=["#4269d0", "#efb118", "#ff725c", "#6cc5b0",
                               "#3ca951", "#ff8ab7", "#a463f2"])
year = hm.col.Year
end = hm.input.year
start = hm.maximum(1960, end - 20)
diameter = 20 * hm.sqrt((year - start + 1) / (end - start + 1))
position = {"x": "Fertility rate", "y": "Life expectancy"}

with hm.Scene() as scene:
    with hm.Column():
        hm.Playback(name="year", min=1962, max=2023, step=1, value=2023,
                    rate=6, label="End year")
        with hm.Plot(data=data, width=800, height=500, axes2d=True, axis_frame=False,
                     title="Country trails — ending {$year}",
                     x={"label": "Fertility rate", "padding": 0.15, "grid": "major", "arrow": "none"},
                     y={"label": "Life expectancy", "padding": 0.1, "step": 5, "grid": "major", "arrow": "none"}):
            # Capture one selected year for the window, widths, dots and labels.
            # Descendants read these columns rather than a newer input mid-update.
            with hm.Calculate(diameter=diameter, visible=(year >= start) & (year <= end),
                              latest=year == end,
                              dot=(year == end) | (year / 5 == hm.floor(year / 5))):
                with hm.Filter(where="visible"):
                    hm.Line(**position, series="Country", color="Country", color_scale=colors,
                            width="diameter", width_scale=hm.continuous(domain=[0, 20], range=[0, 20]),
                            curve="catmull-rom", curve_alpha=0,
                            opacity=0.7, blend="multiply")
                with hm.Filter(where=hm.col.visible & hm.col.dot):
                    hm.Points(**position, fill="Country", fill_scale=colors,
                              size="diameter", size_scale=hm.continuous(domain=[0, 20], range=[0, 20]))
                with hm.Filter(where="latest"):
                    hm.Text(**position, text="Country", color="Country", color_scale=colors,
                            size=14, align="right", dx=-12, dy=-12)
scene

# Optional outside a notebook:
# hm.export_html(scene, "country-trails.html", snapshot=False)
