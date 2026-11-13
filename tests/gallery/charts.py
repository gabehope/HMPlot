"""The defaults gallery's charts (TODO 136.17): canonical charts drawn with HMPlot's defaults.

Each chart gives only its data and encodings, the way a first attempt would; nothing tunes the
look. `covers` names the TODO items whose defaults the chart shows; `known` names a problem a check
finds until an open item is fixed (the test is an xfail, and fails once the problem is gone).
"""

from dataclasses import dataclass, field
from typing import Callable

import numpy as np

import hmplot as hm

SIZE = dict(width=480, height=320, responsive=False)


def seeded():
    """The same random numbers for a chart however many charts run before it."""
    return np.random.default_rng(136)


@dataclass
class Chart:
    """A chart: its data and how HMPlot draws it."""

    name: str
    data: Callable[[], dict]
    draw: Callable[[dict], hm.Node]
    covers: list[str] = field(default_factory=list)
    #: {check: (text, item)}: the check finds a problem containing text until the item is fixed.
    known: dict[str, tuple[str, str]] = field(default_factory=dict)
    #: Polar and globe charts draw no Cartesian axes.
    curved: bool = False

    def build(self):
        return self.draw(self.data())


# Each chart's data: columns of numbers, strings or ISO dates, which render_references.py writes
# as JSON for the reference libraries.


def scatter_data():
    rng = seeded()
    x = rng.normal(0, 1, 200)
    return {"x": x, "y": 2 * x + rng.normal(0, 1, 200)}


def scatter(data):
    with hm.Plot(data=data, **SIZE) as plot:
        hm.Points(x="x", y="y")
    return plot


def scatter_categorical_data():
    rng = seeded()
    species = np.repeat(["setosa", "versicolor", "virginica"], 50)
    length = np.concatenate([rng.normal(m, 0.35, 50) for m in (5.0, 5.9, 6.6)])
    return {"length": length, "width": length * 0.6 + rng.normal(0, 0.25, 150), "species": species}


def scatter_categorical(data):
    with hm.Plot(data=data, **SIZE) as plot:
        hm.Points(x="length", y="width", fill="species")
    return plot


def bubbles_data():
    rng = seeded()
    return {"gdp": rng.lognormal(9, 1, 40), "life": rng.normal(70, 6, 40), "people": rng.lognormal(16, 1.2, 40)}


def bubbles(data):
    with hm.Plot(data=data, **SIZE) as plot:
        hm.Points(x="gdp", y="life", size="people")
    return plot


def line_time_data():
    rng = seeded()
    days = np.arange("2024-01-01", "2024-07-01", dtype="datetime64[D]")
    return {"date": days, "price": 100 + np.cumsum(rng.normal(0, 1, len(days)))}


def line_time(data):
    with hm.Plot(data=data, **SIZE) as plot:
        hm.Line(x="date", y="price")
    return plot


def lines_data():
    temp = [base + amp * np.sin(np.arange(24) / 24 * 2 * np.pi) for base, amp in ((4, 6), (16, 8), (19, 3))]
    return {"hour": np.tile(np.arange(24), 3), "temperature": np.concatenate(temp),
            "city": np.repeat(["Oslo", "Rome", "Lima"], 24)}


def lines(data):
    with hm.Plot(data=data, **SIZE) as plot:
        hm.Line(x="hour", y="temperature", color="city")
    return plot


def area_data():
    rng = seeded()
    x = np.arange(50)
    return {"week": x, "visits": 200 + 60 * np.sin(x / 6) + rng.normal(0, 10, 50)}


def area(data):
    with hm.Plot(data=data, **SIZE) as plot:
        hm.Area(x="week", upper="visits")
    return plot


def stacked_area_data():
    rng = seeded()
    return {"week": np.tile(np.arange(30), 3), "visits": rng.uniform(20, 60, 90),
            "source": np.repeat(["search", "social", "direct"], 30)}


def stacked_area(data):
    with hm.Plot(data=data, **SIZE) as plot:
        hm.Area(x="week", upper="visits", fill="source")
    return plot


def fruit_data():
    return {"fruit": ["apples", "pears", "plums", "figs", "dates", "limes"], "sold": [42, 28, 35, 12, 19, 31]}


def bars(data):
    with hm.Plot(data=data, **SIZE) as plot:
        hm.charts.Bar(x="fruit", y="sold")
    return plot


def bars_horizontal(data):
    with hm.Plot(data=data, **SIZE) as plot:
        hm.charts.Bar(x="sold", y="fruit")
    return plot


def sales_data():
    return {"region": ["North", "North", "South", "South", "West", "West"],
            "year": ["2024", "2025"] * 3, "sales": [12, 18, 9, 15, 21, 25]}


def grouped_bars(data):
    with hm.Plot(data=data, **SIZE) as plot:
        hm.charts.Bar(x="region", y="sales", fill="year", arrange="group")
    return plot


def stacked_bars(data):
    with hm.Plot(data=data, **SIZE) as plot:
        hm.charts.Bar(x="region", y="sales", fill="year")
    return plot


def histogram_data():
    return {"score": seeded().normal(50, 12, 2000)}


def histogram(data):
    with hm.Plot(data=data, **SIZE) as plot:
        hm.charts.Histogram(x="score")
    return plot


def species_data():
    rng = seeded()
    return {"species": np.repeat(["setosa", "versicolor", "virginica"], 200),
            "length": np.concatenate([rng.normal(m, 0.4, 200) for m in (5.0, 5.9, 6.6)])}


def boxplot(data):
    with hm.Plot(data=data, **SIZE) as plot:
        hm.charts.BoxPlot(x="species", y="length")
    return plot


def violin(data):
    with hm.Plot(data=data, **SIZE) as plot:
        hm.charts.Violin(x="species", y="length")
    return plot


def lollipop(data):
    with hm.Plot(data=data, **SIZE) as plot:
        hm.charts.Lollipop(x="fruit", y="sold")
    return plot


def heatmap_data():
    """A 12 by 16 grid, one row per cell."""
    row, column = np.mgrid[0:12, 0:16]
    return {"row": row.ravel(), "column": column.ravel(), "value": (np.sin(column / 3) + np.cos(row / 4)).ravel()}


def heatmap(data):
    with hm.Plot(**SIZE) as plot:
        hm.Heatmap(fill=np.asarray(data["value"]).reshape(12, 16))
    return plot


def browser_data():
    return {"browser": ["Chrome", "Safari", "Firefox", "Edge", "Other"], "share": [64, 19, 4, 5, 8]}


def pie(data):
    with hm.Plot(data=data, **SIZE) as plot:
        hm.charts.Pie(category="browser", value="share")
    return plot


def donut(data):
    with hm.Plot(data=data, **SIZE) as plot:
        hm.charts.Pie(category="browser", value="share", inner_radius=0.55)
    return plot


def wave_data():
    t = np.arange(60)
    return {"t": t, "v": 50 + 10 * np.sin(t / 6)}


def annotated_line(data):
    with hm.Plot(data=data, **SIZE) as plot:
        hm.Line(x="t", y="v")
        hm.charts.Callout(x=9.4, y=60, text="peak")
    return plot


def sites_data():
    rng = seeded()
    return {"x": rng.uniform(0, 10, 120), "y": rng.uniform(0, 10, 120), "site": np.repeat(["alpha", "beta", "gamma"], 40)}


def small_multiples(data):
    with hm.Data(data):
        with hm.Facet(column="site") as facet:
            with hm.Plot(width=200, height=200, responsive=False):
                hm.Points(x="x", y="y")
    return facet


def places_data():
    rng = seeded()
    return {"lon": rng.uniform(-180, 180, 120), "lat": rng.uniform(-60, 70, 120)}


def globe(data):
    with hm.Plot(data=data, coordinates="spherical", projection="orthographic", **SIZE) as plot:
        hm.Points(x="lon", y="lat")
    return plot


CHARTS = [
    Chart("scatter", scatter_data, scatter),
    Chart("scatter-categorical", scatter_categorical_data, scatter_categorical, covers=["134.9"]),
    Chart("bubbles", bubbles_data, bubbles),
    Chart("line-time", line_time_data, line_time),
    Chart("lines", lines_data, lines, covers=["134.9"]),
    Chart("area", area_data, area),
    Chart("stacked-area", stacked_area_data, stacked_area),
    Chart("bars", fruit_data, bars),
    Chart("bars-horizontal", fruit_data, bars_horizontal),
    Chart("grouped-bars", sales_data, grouped_bars),
    Chart("stacked-bars", sales_data, stacked_bars),
    Chart("histogram", histogram_data, histogram),
    Chart("boxplot", species_data, boxplot),
    Chart("violin", species_data, violin),
    Chart("lollipop", fruit_data, lollipop),
    Chart("heatmap", heatmap_data, heatmap, covers=["134.15"]),
    Chart("pie", browser_data, pie, covers=["134.8"], curved=True),
    Chart("donut", browser_data, donut, covers=["134.8"], curved=True),
    Chart("annotated-line", wave_data, annotated_line, covers=["134.29"]),
    Chart("small-multiples", sites_data, small_multiples),
    Chart("globe", places_data, globe, covers=["135.5"], curved=True),
]
