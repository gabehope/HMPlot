"""Pie and donut charts: a pie with percentages and a legend, a donut that tweens to new values,
and a row of pies in a Facet.

Display ``scene`` in a notebook. ``next_month()`` gives the donut new sales for the same regions:
its rows are keyed by region, so each sector grows or shrinks in place.

A Pie's angles follow d3.pie, in degrees: 0 at 12 o'clock, clockwise. In a Cartesian Plot (the
default) it places a polar Frame of its own, centered and across 90% of the plot's shorter side;
``placement={"anchor": [x, y], "size": [w, h]}`` puts it elsewhere, as an inset.
"""
import math

import hmplot as hm

REGIONS = ["North", "East", "South", "West", "Central"]
sales = {"region": REGIONS, "sales": [42, 18, 27, 9, 14]}

# One row per year and region.
years = {"year": [], "region": [], "sales": []}
for y, year in enumerate(["2023", "2024", "2025"]):
    for i, region in enumerate(REGIONS[:4]):
        years["year"].append(year)
        years["region"].append(region)
        years["sales"].append(10 + round(30 * abs(math.sin(1.7 * i + 2.3 * y))))

with hm.Scene() as scene:
    with hm.Row():
        with hm.Plot(data=sales, width=440, height=340):
            pie = hm.charts.Pie(value="sales", category="region", sector_label="percent", hover=True,
                         respond="hovered")
            hm.Legend(target=pie, channel="fill", label="Region", position="right")
        with hm.Plot(data=sales, key="region", width=340, height=340) as donut_plot:
            hm.charts.Pie(value="sales", category="region", inner_radius=0.55, pad_angle=1.5,
                   sector_label="category", animation=True, animation_duration=700)
    with hm.Facet(data=years, column="year"):
        with hm.Plot(height=240):
            hm.charts.Pie(value="sales", category="region", inner_radius=0.4, sector_label="percent")
            hm.Legend(channel="fill", label="Region", position="bottom")

month = 0


def next_month():
    """New sales for the same regions: the donut's sectors tween to them."""
    global month
    month += 1
    values = [8 + round(40 * abs(math.sin(3.1 * i + 1.9 * month))) for i in range(len(REGIONS))]
    donut_plot.update(data={"region": REGIONS, "sales": values})


scene
