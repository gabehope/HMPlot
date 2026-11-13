"""Connections: draw between marks with hm.connect.

A Line, Segments, Arrows3D, or Arrows with connections= takes its positions from other
marks instead of from its own columns. hm.connect(before, after, key="country") pairs the row
of `before` and the row of `after` that share a country, wherever each is drawn. An Anchor is a
mark that holds a position and draws nothing.

A mark written inside an embedded Facet is repeated in every cell, and passing it alone,
hm.connect(values), connects its cells in facet order: parallel coordinates, one Line per
penguin through a y scale per measurement. A Frame in every cell sets x from 0 to 1 (and
keeps the cell's y), so the points at x=0 sit on the cell's axis. hm.Facet(fields=[...])
gives every cell the same penguins (its "value" column is the cell's measurement), so the rows
match without a key, and Shift-drag on a measurement's axis brushes that measurement (brushes
on several axes combine).

Click an arrow or a line: event.connection holds the matched key and, per endpoint, its row
and scene node id. See docs/CONNECTIONS.md.
"""
import math

import hmplot as hm

# 1. Before and after: gray points for 2000, an invisible Anchor for 2021, one arrow per
# country colored by the shared table's region.
life = {
    "country": ["Nigeria", "Kenya", "South Africa", "India", "Russia", "Brazil", "United States", "Chile", "Norway", "Japan"],
    "region": ["Africa", "Africa", "Africa", "Asia", "Europe", "Americas", "Americas", "Americas", "Europe", "Asia"],
    # Illustrative life expectancy at birth (years).
    "y2000": [46.3, 52.2, 55.9, 62.7, 65.3, 70.1, 76.6, 76.9, 78.7, 81.1],
    "y2021": [52.7, 61.4, 62.3, 67.2, 69.4, 72.8, 76.4, 78.9, 83.2, 84.5],
}
with hm.Plot(data=life, height=440, axes2d=True,
             x={"label": "Life expectancy at birth (years)", "domain": [40, 90]}, y={"visible": False}) as arrows_plot:
    before = hm.Points(x="y2000", y="country", size=5.5, fill="#9aa3ad")
    hm.Text(x="y2000", y="country", text="country", align="right", dx=-10, size=12, color="#39424d")
    after = hm.Anchor(x="y2021", y="country")
    arrows = hm.charts.Arrows(connections=hm.connect(before, after, key="country"),
                                color="region", width=2.5, head_length=11, head_width=9)
    hm.Legend(target=arrows, channel="color", label="Region", position="right")


def report_arrow(event):
    # source/target are the first and last endpoints; `row` is the row in that endpoint and
    # `node` its scene node id. In a notebook, show this in an ipywidgets widget: print() in a
    # callback is not reliably attached to a cell.
    connection = event.connection
    start = life["y2000"][connection["source"]["row"]]
    end = life["y2021"][connection["target"]["row"]]
    print(f"{connection['key']}: {start} -> {end}", connection["source"]["node"] == before.id)


arrows.on_click(report_arrow)

arrows_plot


# 2. Parallel coordinates: one Facet cell per measurement (fields=), each with its own y scale,
# and connect the points repeated in each cell.
SPECIES = {  # mean and spread of bill length, bill depth, flipper length, body mass
    "Adelie": ((38.8, 2.7), (18.3, 1.2), (190.0, 6.5), (3700.0, 460.0)),
    "Chinstrap": ((48.8, 3.3), (18.4, 1.1), (196.0, 7.1), (3730.0, 380.0)),
    "Gentoo": ((47.5, 3.1), (15.0, 1.0), (217.0, 6.5), (5080.0, 500.0)),
}
FIELDS = ["bill_length", "bill_depth", "flipper", "mass"]


def noise(i, k):
    value = math.sin(i * 12.9898 + k * 78.233) * 43758.5453
    return value - math.floor(value)


penguins = {"id": [], "species": [], **{field: [] for field in FIELDS}}
for i in range(90):
    species = list(SPECIES)[i % 3]
    penguins["id"].append(i)
    penguins["species"].append(species)
    for k, (field, (mean, spread)) in enumerate(zip(FIELDS, SPECIES[species])):
        gauss = (noise(i, 3 * k + 1) + noise(i, 3 * k + 2) + noise(i, 3 * k + 3) - 1.5) * 2
        penguins[field].append(round(mean + gauss * spread, 1))

colors = hm.categorical(domain=["Adelie", "Chinstrap", "Gentoo"], range=["#e07b39", "#7b5ea7", "#2a9d8f"])
with hm.Plot(data=penguins, height=420, axes2d=False) as parallel:
    with hm.Facet(fields=FIELDS):
        # x runs from 0 to 1 across each cell (hidden); y is the cell's measurement.
        with hm.Frame(x={"domain": [0, 1], "visible": False}):
            # Each cell's y axis is titled by its measurement (the column `value` is).
            values = hm.Points(x=0, y="value", size=2.5, fill="#5d6773", brush={"axis": "y"})
    # The Line is a sibling of the Facet: its frame (the Plot) contains every cell.
    lines = hm.Line(connections=hm.connect(values),
                    color="species", color_scale=colors, width=1.5, opacity=0.7, respond="brushed")
    hm.Legend(target=lines, channel="color", label="Species", position="right")


def report_line(event):
    # For a Line, `pair` is the two endpoints of the piece under the pointer; `cell` names
    # each endpoint's facet cell, and every cell's slot has the same node (the repeated points).
    connection = event.connection
    left, right = connection.get("pair") or (connection["source"], connection["target"])
    print(f"penguin row {left['row']}: {left['cell']} -> {right['cell']}")


lines.on_click(report_line)

parallel
