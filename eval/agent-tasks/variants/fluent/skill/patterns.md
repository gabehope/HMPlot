# HMPlot patterns

Generated from src/recipes (scripts/generate-patterns.mjs); edit the recipes, not this file. Each program is complete: it runs as a notebook cell (its last line displays the chart) and with `hmplot check program.py`, and the repository's tests render every one. Svelte takes the same components and options in camelCase; each component's `reference/svelte/<name>.md` page opens with a Svelte program.

## Before composing a chart

- Prefer explicit expression operands: `hm.col.delay` reads a field and `hm.literal("red")`
  is a constant. For example, `hm.where(hm.view.brushed, hm.literal("red"), hm.literal("gray"))`.
  State is `hm.view.any_brushed` or `"@any_brushed"`, never `hm.col("@any_brushed")`.
- A transform produces a new table; its siblings retain their input. Draw a saved output with
  `hm.Plot(data=output)` for all its descendant marks, a mark's `data=output` for that
  mark alone, or `hm.Data(value=output)` around a branch. Use a live Join to attach grouped
  statistics to geometry from another table; its right-side keys must be unique (`reference/python/join.md`).
- Put shared pipelines and their views in an explicit `hm.Scene() as chart`, and export
  `chart`. A Plot or Row export excludes pipelines outside its subtree, including detached
  chains adopted by its scene. See `reference/python/data.md` for the export boundary.
- Brush a source outside its own selection filter. Independent crossfilter controls need
  separate selections; each view filters by the other controls' selections. Keep repeated
  locations grouped before drawing; selection still refers to their contributing rows.
- To wrap sensor categories into six columns, use `hm.Facet(column="sensor", wrap=6)`.
  To cross regions with sensors use `row="region", column="sensor"`; for wide measurement
  columns use `fields=[...]` and the cell's `value` column. Use `hm.Panels` for separately
  authored plots aligned over one shared x (`reference/python/facet.md`, `panels.md`).
- Numeric Text accepts numeric columns directly, with `format=".2f"`. Use Title inside Data
  for live readouts, EndLabels for series endpoints, and RuleX/RuleY or BandX/BandY for
  references that follow the other axis without widening its domain.

## Data pipelines

- **Data pipelines are chains, as in polars.** Start from the data, `sales = hm.Data(df)` (a
  DataFrame, a dict of columns or an `hm.Table`), and
  chain steps; each returns a node that plots or marks draw with `data=`:

```python
import hmplot as hm

sales = hm.Data({"region": ["N", "S", "N", "S"], "revenue": [120, 80, 150, 60]})
by_region = sales.group_by("region").agg(revenue=hm.col.revenue.sum(), orders=hm.count())
large = sales.filter(hm.col.revenue > 70).with_columns(share=hm.col.revenue / hm.sum("revenue"))
with hm.Scene() as chart:
    with hm.Row():
        with hm.Plot(data=by_region):
            hm.charts.Bar(x="region", y="revenue")
        with hm.Plot(data=large):
            hm.Points(x="revenue", y="share")
chart
```

- **The steps:** `filter(*predicates, inactive=)` (an expression, `"@brushed"`, a selection or an
  input comparison; several must all hold), `with_columns(name=expression)`,
  `group_by(*keys).agg(name=reduction)` (`group_by()` with no keys is one row of totals;
  `.len()` counts rows), `join(other, on=, how="left" | "inner", fields=)` and
  `sort(*by, descending=False)`. Reductions are `hm.sum("x")` or `hm.col.x.sum()`: `sum`,
  `mean`, `min`, `max`, `count`, `median`, `std`, `var`, `first`, `last`; with `by=`,
  each row gets its group's value. `.alias("name")` names an output passed positionally.
- **A chain runs live in the browser, on the GPU.** It recomputes as brushes, selections and
  inputs change, so Python cannot read its rows (no `to_pandas`, no `len`): prepare static data
  with pandas or polars before `hm.Data`. Build chains anywhere (at the top of the program); the
  scene that draws one includes it. Plots can draw the same chain, and branches of one
  `hm.Data` share its interaction state: a brush on `data=sales` is the one
  `sales.filter("@brushed")` keeps. pandas' names (`groupby`, `assign`, `merge`, `query`)
  raise errors that name these.
- **Export the Scene, including its pipelines.** Use an explicit `with hm.Scene() as chart:`
  around the views and export `chart`. Exporting only a Plot or Row leaves out detached
  pipelines outside that subtree. `hm.Plot(data=chain)` supplies it to all marks inside;
  use a mark's `data=` to override it for that mark, or `hm.Data(value=...)` for a branch.

## 1. Scatter plot colored by category

Points colored by a column; legend=True on the Plot shows its key, and tooltip= lists fields on hover.

```python
import numpy as np
import hmplot as hm

rng = np.random.default_rng(0)
data = {"height": rng.normal(170, 10, 300), "weight": rng.normal(70, 12, 300),
        "group": rng.choice(["A", "B", "C"], 300)}

with hm.Plot(data=data, height=360, legend=True, x={"label": "Height (cm)"}, y={"label": "Weight (kg)"}) as chart:
    hm.Points(x="height", y="weight", fill="group", size=6, tooltip=["group", "height", "weight"])
chart
```

## 2. Lines over time, one per series

A datetime column makes a time axis; series= draws one line per value and color= a legend.

```python
import numpy as np
import pandas as pd
import hmplot as hm

days = pd.date_range("2025-01-01", periods=120, freq="D")
df = pd.concat([pd.DataFrame({"date": days, "city": city,
                              "temp": base + 8 * np.sin(np.arange(120) / 19) + np.random.default_rng(i).normal(0, 1, 120)})
                for i, (city, base) in enumerate([("Oslo", 2), ("Rome", 12), ("Cairo", 20)])])

with hm.Plot(data=df, height=360, legend=True, x={"label": "Date"}, y={"label": "Temperature (°C)"}) as chart:
    hm.Line(x="date", y="temp", series="city", color="city", width=2)
chart
```

## 3. Grouped and stacked bars

Bars that share a category stack by default; arrange="group" sets them side by side.

```python
import hmplot as hm

data = {"region": ["North", "North", "South", "South", "West", "West"],
        "year": ["2024", "2025"] * 3, "sales": [12, 18, 9, 15, 21, 25]}

with hm.Row() as chart:
    with hm.Plot(data=data, height=320, title="Grouped", legend=True):
        hm.charts.Bar(x="region", y="sales", fill="year", arrange="group")
    with hm.Plot(data=data, height=320, title="Stacked", legend=True):
        hm.charts.Bar(x="region", y="sales", fill="year")
chart
```

## 4. Histogram

Histogram bins a column (30 bins by default); bins= sets a count, edges or a rule.

```python
import numpy as np
import hmplot as hm

values = np.random.default_rng(1).normal(50, 12, 2000)

with hm.Plot(data={"score": values}, height=320, x={"label": "Score"}) as chart:
    hm.charts.Histogram(x="score", bins=40, fill="#4c78a8")
chart
```

## 5. Box plots and violins by category

BoxPlot and Violin summarize a numeric column per category of the other axis.

```python
import numpy as np
import hmplot as hm

rng = np.random.default_rng(2)
data = {"species": np.repeat(["setosa", "versicolor", "virginica"], 200),
        "length": np.concatenate([rng.normal(m, 0.4, 200) for m in (5.0, 5.9, 6.6)])}

with hm.Row() as chart:
    with hm.Plot(data=data, height=320, title="Box plot"):
        hm.charts.BoxPlot(x="species", y="length", fill="species")
    with hm.Plot(data=data, height=320, title="Violin"):
        hm.charts.Violin(x="species", y="length", fill="species")
chart
```

## 6. Small multiples

Facet repeats its Plot once per value of a column; the cells share their axes.

```python
import numpy as np
import hmplot as hm

rng = np.random.default_rng(4)
data = {"x": rng.uniform(0, 10, 300), "region": rng.choice(["North", "South", "East"], 300)}
data["y"] = data["x"] * 2 + rng.normal(0, 3, 300)

with hm.Facet(data=data, column="region") as chart:
    with hm.Plot(height=260):
        hm.Points(x="x", y="y", size=4)
chart
```

## 7. Scatter with a fitted trend line and confidence band

Smooth fits y on x (a line by default; method="poly" with order=, "log", "exp", "pow").

```python
import numpy as np
import hmplot as hm

rng = np.random.default_rng(5)
x = rng.uniform(0, 10, 200)
data = {"x": x, "y": 3 + 1.5 * x + rng.normal(0, 2, 200)}

with hm.Plot(data=data, height=360) as chart:
    hm.Points(x="x", y="y", size=4, fill="#9aa5b1")
    hm.charts.Smooth(x="x", y="y", color="#d1495b")
chart
```

## 8. Annotations: reference lines, shaded spans and labels

Plot rules= and bands= mark values and ranges; a Text with its own data= labels chosen points.

```python
import numpy as np
import hmplot as hm

t = np.arange(60)
data = {"t": t, "v": 50 + 10 * np.sin(t / 6)}

with hm.Plot(data=data, height=340,
             rules=[{"axis": "y", "value": 55, "label": "target", "dash": [4, 3]}],
             bands=[{"axis": "x", "from": 20, "to": 35, "label": "campaign"}]) as chart:
    hm.Line(x="t", y="v", width=2)
    hm.Text(data={"t": [47], "v": [60], "note": ["peak"]}, x="t", y="v", text="note", dy=-14)
chart
```

## 9. Linked brushing across plots

brush=True lets a Shift-drag select rows (@brushed); points.filter("@brushed") keeps them for another plot.

```python
import numpy as np
import hmplot as hm

rng = np.random.default_rng(6)
points = hm.Data({"x": rng.normal(size=2000), "y": rng.normal(size=2000), "value": rng.gamma(2, 2, 2000)})
brushed = points.filter("@brushed")

with hm.Scene() as chart:
    with hm.Row():
        with hm.Plot(height=320, title="Shift-drag to brush"):
            hm.Points(data=points, x="x", y="y", size=3, brush=True, respond="brushed")
        with hm.Plot(height=320, title="Brushed rows"):
            hm.charts.Histogram(data=brushed, x="value", bins=30)
chart
```

## 10. Hover to highlight and show a tooltip

hover=True marks the row under the pointer (@hovered); respond="hovered" fades the others.

```python
import numpy as np
import hmplot as hm

rng = np.random.default_rng(7)
data = {"x": rng.uniform(0, 1, 80), "y": rng.uniform(0, 1, 80), "name": [f"item {i}" for i in range(80)]}

with hm.Plot(data=data, height=340) as chart:
    hm.Points(x="x", y="y", hover=True, respond="hovered", tooltip=["name", "x", "y"],
              size=hm.where("@hovered", 12, 7))
chart
```

## 11. A slider that filters the data

An input is read by name (hm.input.name); a filter that reads it re-runs when the viewer moves it.

```python
import numpy as np
import hmplot as hm

rng = np.random.default_rng(8)
products = hm.Data({"price": rng.uniform(10, 500, 400), "rating": rng.uniform(1, 5, 400)})
affordable = products.filter(hm.col.price <= hm.input.max_price)

with hm.Scene() as chart:
    hm.Slider(name="max_price", label="Max price", min=10, max=500, step=10, value=250)
    with hm.Plot(height=320, x={"domain": [0, 500]}, y={"domain": [1, 5]}):
        hm.Points(data=affordable, x="price", y="rating", size=5)
chart
```

## 12. Animate over time with a play button

Playback moves a value over time; a filter keeps the rows of the current year.

```python
import numpy as np
import hmplot as hm

rng = np.random.default_rng(9)
years = np.repeat(np.arange(2000, 2021), 30)
countries = hm.Data({"year": years, "gdp": rng.lognormal(9, 1, years.size) * (1 + (years - 2000) / 20),
                     "life": rng.normal(65, 8, years.size) + (years - 2000) / 3})
this_year = countries.filter(hm.col.year == hm.input.year)

with hm.Scene() as chart:
    hm.Playback(name="year", label="Year", min=2000, max=2020, step=1, rate=2, loop=True)
    with hm.Plot(height=340, x={"transform": "log", "label": "GDP per capita"},
                 y={"domain": [40, 90], "label": "Life expectancy"}):
        hm.Points(data=this_year, x="gdp", y="life", size=8, fill="#2a9d8f")
chart
```

## 13. Regions on a map (a choropleth)

GeoJSON draws features in a spherical Plot, colored by a property; the map frames its features.

```python
import hmplot as hm

def region(value, ring):
    return {"type": "Feature", "properties": {"value": value}, "geometry": {"type": "Polygon", "coordinates": [ring]}}

regions = {"type": "FeatureCollection", "features": [
    region(3, [[-10, 36], [3, 36], [3, 44], [-10, 44], [-10, 36]]),
    region(7, [[3, 42], [8, 42], [8, 51], [3, 51], [3, 42]]),
    region(5, [[6, 47], [15, 47], [15, 55], [6, 55], [6, 47]])]}

with hm.Plot(coordinates="spherical", projection="mercator", height=340) as chart:
    shapes = hm.GeoJSON(data=regions, fill="value")
    hm.Legend(target=shapes, channel="fill", label="Value", position="right")
chart
```

## 14. Points on a globe

In coordinates="spherical", x is longitude and y latitude; projection= picks the map.

```python
import numpy as np
import hmplot as hm

rng = np.random.default_rng(10)
data = {"lon": rng.uniform(-180, 180, 500), "lat": rng.uniform(-60, 70, 500), "mag": rng.uniform(4, 8, 500)}

with hm.Plot(data=data, coordinates="spherical", projection="orthographic", height=380) as chart:
    hm.Points(x="lon", y="lat", size="mag", size_scale=hm.continuous(range=[2, 9]), fill="mag", tooltip=["mag"])
chart
```

## 15. 3D scatter

type="3d" gives a camera the viewer turns; x, y and z map to the three axes.

```python
import numpy as np
import hmplot as hm

rng = np.random.default_rng(11)
data = {"x": rng.normal(size=1000), "y": rng.normal(size=1000), "z": rng.normal(size=1000)}

with hm.Plot(data=data, type="3d", height=400) as chart:
    hm.Points(x="x", y="y", z="z", fill="z", size=4)
chart
```

## 16. A million points

Points draws every row on the GPU; set max_elements when a mark has more than 250,000 rows.

```python
import numpy as np
import hmplot as hm

rng = np.random.default_rng(12)
n = 1_000_000
data = {"x": rng.normal(size=n).astype(np.float32), "y": rng.normal(size=n).astype(np.float32)}

with hm.Plot(data=data, height=380) as chart:
    hm.Points(x="x", y="y", size=1, opacity=0.2, max_elements=n)
chart
```

## 17. 2-D density as contours

DensityContour estimates the density of x and y and draws its contour lines over the points.

```python
import numpy as np
import hmplot as hm

rng = np.random.default_rng(13)
data = {"x": np.concatenate([rng.normal(-1, 0.6, 500), rng.normal(1.5, 0.8, 500)]),
        "y": np.concatenate([rng.normal(0, 0.6, 500), rng.normal(1, 0.5, 500)])}

with hm.Plot(data=data, height=360) as chart:
    hm.Points(x="x", y="y", size=2, fill="#b0b8c0")
    hm.charts.DensityContour(x="x", y="y")
chart
```

## 18. Two y axes over one x axis

Each Frame has a y scale of its own; side="right" puts the second axis on the right.

```python
import numpy as np
import hmplot as hm

hour = np.arange(25)
data = {"hour": hour, "temperature": 15 + 8 * np.sin(hour / 24 * 2 * np.pi), "rain": np.maximum(0, 12 * np.cos(hour / 5))}

with hm.Plot(data=data, height=340) as chart:
    with hm.Frame(x={"domain": [0, 24], "label": "Hour"}, y={"domain": "auto", "label": "Temperature (°C)"}):
        hm.Line(x="hour", y="temperature", color="#547ba2")
    with hm.Frame(x={"domain": [0, 24], "visible": False}, y={"domain": "auto", "label": "Rain (mm)", "side": "right"}):
        hm.Line(x="hour", y="rain", color="#cf8955")
chart
```

## 19. Pie and donut charts

Pie draws one sector per row (or category), sized by value; inner_radius makes a donut.

```python
import hmplot as hm

data = {"browser": ["Chrome", "Safari", "Firefox", "Edge", "Other"], "share": [64, 19, 4, 5, 8]}

with hm.Row() as chart:
    with hm.Plot(data=data, height=300, title="Pie", legend=True):
        hm.charts.Pie(category="browser", value="share")
    with hm.Plot(data=data, height=300, title="Donut", legend=True):
        hm.charts.Pie(category="browser", value="share", inner_radius=0.55)
chart
```

## 20. Save a chart: interactive HTML, PNG, SVG, or a check of what it drew

export_html writes a standalone interactive page; check renders headlessly and reports errors.

```python
import hmplot as hm

data = {"x": [1, 2, 3, 4], "y": [3, 1, 4, 2]}
with hm.Plot(data=data, height=300) as chart:
    hm.Line(x="x", y="y")

# hm.check(chart).summary()            errors, row counts, axes and a PNG, rendered headlessly
# hm.export_html(chart, "chart.html")   a standalone page that stays interactive
# hm.export_png(chart, "chart.png")     also export_svg and export_pdf
# From a shell: hmplot check program.py
chart
```

## 21. A simulation stepped on the GPU

Simulate keeps state columns on the GPU: initial= sets them, update= computes each step from hm.prev and hm.view.dt.

```python
import numpy as np
import hmplot as hm

n = 2000
rng = np.random.default_rng(8)
data = {"radius": rng.uniform(0.5, 4, n), "speed": rng.uniform(0.2, 1.5, n), "phase": rng.uniform(0, 6.28, n)}
angle = hm.prev.angle + hm.col.speed * hm.view.dt / 1000

with hm.Data(data) as chart:
    hm.Checkbox(name="running", label="Run", value=True)
    with hm.Simulate(initial={"angle": hm.col.phase}, update={"angle": angle}, running=hm.input.running):
        with hm.Plot(height=360, x={"domain": [-4.5, 4.5]}, y={"domain": [-4.5, 4.5]}):
            hm.Points(x=hm.col.radius * hm.cos(hm.col.angle), y=hm.col.radius * hm.sin(hm.col.angle), fill="speed")
chart
```

## 22. A network laid out by forces

GraphData builds a graph from source and target columns; Force lays it out; Edges and Nodes draw it.

```python
import hmplot as hm

edges = {"source": ["a", "a", "b", "c", "c", "d", "e", "f"], "target": ["b", "c", "c", "d", "e", "e", "f", "a"]}

with hm.Plot(data=edges, height=360) as chart:
    with hm.GraphData():
        with hm.Force(warmup=300):
            with hm.Edges():
                hm.Segments(start="start", end="end", color="#9aa5b1")
            with hm.Nodes():
                hm.Points(position="position", fill="#2f6f9f", size=10)
chart
```

## 23. Click drilldown with aggregate bars

Group each view from the source rows: sales.group_by("region") for the clickable bars, and sales.filter(focus).group_by("product") for the drilldown. Click a region to replace the selection, click it again or the background to restore all. Shift/Meta/Ctrl clicks toggle membership. Everything runs in standalone HTML without callbacks.

```python
import hmplot as hm

sales = hm.Data({"region": ["North"] * 6 + ["South"] * 6,
                 "product": ["Hardware", "Software", "Services"] * 4,
                 "revenue_k": [10, 20, 30, 4, 5, 6, 40, 50, 60, 7, 8, 9]})
focus = hm.selection()
by_region = sales.group_by("region").agg(revenue=hm.col.revenue_k.sum())
by_product = sales.filter(focus, inactive="all").group_by("product").agg(revenue=hm.col.revenue_k.sum())

with hm.Scene() as chart:
    with hm.Row():
        with hm.Plot(height=320, title="Revenue by region",
                     x={"scale": hm.categorical(domain=["North", "South"])}):
            hm.charts.Bar(data=by_region, x="region", y="revenue", select=focus, respond=False)
        with hm.Plot(height=320, title="Revenue by product",
                     x={"scale": hm.categorical(domain=["Hardware", "Software", "Services"])}):
            hm.charts.Bar(data=by_product, x="product", y="revenue")
    # hm.export_html(chart, "chart.html") also keeps this interaction, without a Python kernel.
chart
```

## 24. Many events, one point per location

Group repeated coordinates before drawing; brushes still select the contributing events. Separate selections let the map filter delays while a delay brush highlights locations.

```python
import numpy as np
import hmplot as hm

rng = np.random.default_rng(24)
# Join location metadata onto the events first. There are 200,000 events, but only 40 points.
origin = np.arange(200_000) % 40
flights = hm.Data({"origin": origin, "lon": -120 + (origin % 8) * 6,
                   "lat": 28 + (origin // 8) * 5,
                   "name": np.array([f"Airport {i}" for i in origin]),
                   "delay": rng.normal(origin * 2, 15)})
airports, delays = hm.selection(), hm.selection()
locations = flights.group_by("origin", "lon", "lat", "name").agg(departing_flights=hm.count())
from_brushed = flights.filter(airports, inactive="all")

with hm.Scene() as chart:
    with hm.Row():
        with hm.Plot(height=320, title="Brush airports", x={"label": "Longitude"}, y={"label": "Latitude"}):
            hm.Points(data=locations, x="lon", y="lat", size=8, brush={"selection": airports},
                      respond=[airports, delays], tooltip=["name", "departing_flights"])
        with hm.Plot(height=320, title="Delays from brushed airports", x={"label": "Delay (minutes)"}, y={"label": "Flights"}):
            hm.charts.Histogram(data=from_brushed, x="delay", bins=30, brush={"selection": delays})
chart
```

## 25. Scatter with marginal distributions

Marginals aligns the panels and fits histogram counts; never set count domains to [0, 1] unless normalized.

```python
import numpy as np
import hmplot as hm

rng = np.random.default_rng(25)
data = {"Bill length (mm)": rng.normal(45, 5, 300),
        "Bill depth (mm)": rng.normal(17, 2, 300),
        "Species": rng.choice(["Adelie", "Chinstrap", "Gentoo"], 300)}
colors = hm.categorical(domain=["Adelie", "Chinstrap", "Gentoo"],
                        range=["#4477aa", "#ee6677", "#228833"])
with hm.Scene() as chart:
    hm.Title("Penguin bill measurements")
    with hm.charts.Marginals(data=data, x="Bill length (mm)", y="Bill depth (mm)",
                             fill="Species", fill_scale=colors, bins=20, height=500):
        hm.Legend(channel="fill", label="Species")
chart
```

## 26. Ordered gene heatmap with a condition strip

Supply a leaf order (or scipy.cluster.hierarchy.leaves_list(linkage(matrix))); reorder values and labels together. Categorical axes measure label margins.

```python
import numpy as np
import hmplot as hm

genes = np.array([f"GENE_LONG_{i + 1:02}" for i in range(40)])
samples = ["Control 1", "Control 2", "Treated 1", "Treated 2"]
matrix = np.sin(np.arange(40)[:, None] + np.arange(4)) * 2
order = np.argsort(matrix[:, 0])  # Replace with supplied clustering leaf order.
ordered = matrix[order].copy()  # Keep the original matrix in its original row order.
x = {"scale": hm.categorical(domain=samples), "label": "Sample"}
colors = hm.continuous(domain=[-2, 2], colormap="RdBu")
conditions = hm.categorical(domain=["Control", "Treated"], range=["#4477aa", "#ee6677"])
with hm.Plot(height=960, x=x, y={"scale": hm.categorical(domain=["Condition", *genes[order]])}) as chart:
    heatmap = hm.Heatmap(fill=np.vstack([np.zeros((1, 4)), ordered]), fill_scale=colors, pixelated=True)
    strip = hm.Rect(x0=[-0.5, 0.5, 1.5, 2.5], x1=[0.5, 1.5, 2.5, 3.5], y0=-0.5, y1=0.5,
                fill=["Control", "Control", "Treated", "Treated"], fill_scale=conditions)
    hm.Legend(target=heatmap, channel="fill", label="Expression (z score)")
    hm.Legend(target=strip, channel="fill", label="Condition")
chart
```

## 27. Centered report with composable title and legend styles

Preset, partial list, own theme keys and explicit mark props apply in that order.

```python
import hmplot as hm

data = {"month": [1, 2, 3, 4], "value": [3, 5, 4, 7]}
theme = hm.create_theme(extends=["paper", "title/centered", "legend/inline-bottom", "marks/lines-medium"])
with hm.Theme(value=theme) as presentation:
    with hm.Plot(data=data, height=380, title="Quarterly observations",
                 subtitle="A centered report", caption="Source: example measurements",
                 x={"label": "Month", "tick_count": 4}, y={"label": "Value"}) as chart:
        hm.Line(x="month", y="value", label="Observed")
        hm.Points(x="month", y="value", size=9)
chart
```

## 28. Forest plot

Supply estimates and confidence endpoints; interval and reference_line style the named parts.

```python
import hmplot as hm

data = {"study": ["Trial A", "Trial B", "Trial C"], "estimate": [0.8, 1.1, 1.3],
        "low": [0.6, 0.9, 1.0], "high": [1.0, 1.4, 1.6]}
with hm.Plot(data=data, height=300, axes2d=True, x={"label": "Risk ratio"}) as chart:
    hm.charts.ForestPlot(x="estimate", y="study", lower="low", upper="high", reference=1,
                         interval={"color": "#5b6470", "cap_size": 8})
chart
```

## 29. Bullet chart

Supply actuals, targets and qualitative bound columns. Named ranges and tick parts style the background and target.

```python
import hmplot as hm

data = {"metric": ["Revenue", "Renewals"], "actual": [65, 82], "goal": [80, 90],
        "poor": [50, 60], "fair": [70, 80], "good": [100, 100]}
with hm.Plot(data=data, height=250, axes2d=True, x={"label": "Percent of plan"}) as chart:
    hm.charts.BulletChart(x="actual", y="metric", target="goal", fields=["poor", "fair", "good"],
                          tick={"fill": "#20252b"})
chart
```

## 30. Dense scatter with a local point partial

The palette and fill encoding survive; tick density and grid preferences belong to individual axes.

```python
import numpy as np
import hmplot as hm

i = np.arange(400)
data = {"x": np.sin(i * 1.3), "y": np.cos(i * 1.7), "station": np.array(["North", "South"])[i % 2]}
with hm.Theme(value={"extends": ["notebook", "marks/points-dense", "legend/compact"]}) as presentation:
    with hm.Plot(data=data, height=360, title="Station observations",
                 x={"label": "Horizontal displacement", "tick_count": 4, "grid": "off"},
                 y={"label": "Vertical displacement", "tick_count": 4, "grid": "major"}) as chart:
        hm.Points(x="x", y="y", fill="station")
chart
```

## 31. Statistical band and a local reference rule

The supplied interval bounds retain their meaning; opacity does not imply a confidence level.

```python
import hmplot as hm

data = {"x": [0, 1, 2, 3], "y": [2, 4, 3, 6], "lo": [1, 3, 2, 5], "hi": [3, 5, 4, 7]}
with hm.Theme(value={"extends": ["paper", "marks/lines-fine", "marks/intervals-crisp"]}) as presentation:
    with hm.Plot(data=data, height=380, title="Estimate and supplied interval",
                 x={"label": "Time"}, y={"label": "Response"}) as chart:
        hm.Area(x="x", lower="lo", upper="hi", opacity=0.15)
        hm.charts.ErrorBars(x="x", lower="lo", upper="hi")
        hm.Line(x="x", y="y", label="Estimate")
        hm.charts.RuleY(y=4, color="#64748b", width=1, dash=[5, 3])
chart
```

## 32. Interval timeline

Use x0/x1 for interval endpoints and y for task rows; milestones styles optional diamond points.

```python
from datetime import datetime, timedelta, timezone
import hmplot as hm

day = datetime(2024, 10, 1, tzinfo=timezone.utc)
at = lambda n: day + timedelta(days=n)
data = {"task": ["Design", "Build", "Review"], "start": [at(0), at(2), at(6)], "end": [at(3), at(7), at(9)],
        "milestone": [at(2), None, at(8)]}
with hm.Plot(data=data, height=280, axes2d=True, x={"label": "Date", "type": "datetime", "origin": day}) as chart:
    hm.charts.IntervalTimeline(y="task", x0="start", x1="end", milestone="milestone",
                               milestones={"fill": "#20252b"})
chart
```

## 33. An annotated chart with an explicit local card style

Box and leader styling use existing Callout props; anchor and pixel offsets remain explicit.

```python
import hmplot as hm

data = {"x": [0, 1, 2, 3], "y": [2, 4, 3, 6]}
with hm.Theme(value={"extends": ["bureau", "title/editorial"]}) as presentation:
    with hm.Plot(data=data, height=400, title="A notable observation",
                 x={"domain": [-1, 5], "label": "Time"}, y={"domain": [0, 9], "label": "Response"}) as chart:
        hm.charts.BandY(y0=3, y1=5, fill="#64748b", opacity=0.1)
        hm.Points(x="x", y="y", size=9)
        hm.charts.Callout(x=1, y=4, text="Observed response", dx=30, dy=-45, color="#172033",
                         box={"fill": "#f8fafc", "outline_color": "#64748b", "outline_width": 1, "padding": 7, "radius": 5},
                         leader={"color": "#64748b", "width": 1})
chart
```

## 34. Sparkline

The host Plot sets compact size and axes. Band and last parts style the reference band and final finite-row label.

```python
import hmplot as hm

data = {"day": [1, 2, 3, 4, 5, 6], "value": [3, 4, float("nan"), 2, 5, float("nan")], "label": ["3", "4", "", "2", "5", ""]}
with hm.Plot(data=data, height=120, axes2d=False, x={"domain": [0, 7]}) as chart:
    hm.charts.Sparkline(x="day", y="value", lower=2, upper=4, text="label",
                        last={"color": "#20252b", "dx": 8})
chart
```

## 35. Compact colorbar text and horizontal placement

The current colorbar has fixed geometry: this styles its heading and placement, not ramp dimensions.

```python
import numpy as np
import hmplot as hm

colors = hm.continuous(domain=[-1, 1], colormap="RdBu")
with hm.Theme(value={"extends": ["notebook", "legend/compact", "legend/inline-bottom"]}) as presentation:
    with hm.Plot(height=340, title="Correlation matrix", legend=False,
                 x={"scale": hm.categorical(domain=["Temperature", "Moisture", "Growth"]), "tick_label_angle": 30},
                 y={"scale": hm.categorical(domain=["Temperature", "Moisture", "Growth"])}) as chart:
        cells = hm.Heatmap(fill=np.array([[1, 0.2, -0.4], [0.2, 1, 0.5], [-0.4, 0.5, 1]]),
                           fill_scale=colors, pixelated=True)
        hm.Legend(target=cells, channel="fill", label="Correlation", position="bottom")
chart
```

## 36. Hover a gene in one table to highlight its rows in another

hm.selection(by="gene") selects values: a gene hovered on the left fades the other genes' samples on the right (respond=) and enlarges its own (an expression reads the selection per row).

```python
import numpy as np
import hmplot as hm

rng = np.random.default_rng(3)
names = ["BRCA1", "TP53", "EGFR", "MYC", "KRAS"]
genes = hm.Table({"gene": names, "length": [81, 19, 188, 5, 46], "expression": [4.1, 6.3, 2.2, 7.5, 3.8]})
samples = hm.Table({"gene": np.repeat(names, 30), "sample": np.tile(np.arange(30), 5),
                    "value": rng.normal(np.repeat([4.1, 6.3, 2.2, 7.5, 3.8], 30), 0.6)})
focus = hm.selection(by="gene")

with hm.Scene() as chart:
    with hm.Row():
        with hm.Plot(data=genes, height=320, title="Genes: hover one"):
            hm.Points(x="length", y="expression", size=12, hover=focus, respond=focus)
        with hm.Plot(data=samples, height=320, title="Samples of the hovered gene"):
            hm.Points(x="sample", y="value", fill="gene", size=hm.where(focus, 8, 4), respond=focus)
chart
```

## 37. Live statistics per route from brushed flights

flights.filter("@brushed").group_by("route").agg(...) computes each route's count and mean delay; routes.join(stats, on="route") gives them to the routes' own rows, so brushing resizes and recolors the routes.

```python
import numpy as np
import hmplot as hm

rng = np.random.default_rng(4)
names = ["SFO-JFK", "LAX-ORD", "SEA-ATL", "BOS-DEN", "MIA-PHX"]
flights = hm.Data({"route": rng.choice(names, 600), "delay": rng.gamma(2, 12, 600),
                   "distance": rng.uniform(300, 2600, 600)})
routes = hm.Data({"route": names, "x": [0, 1, 2, 3, 4], "y": [1, 0, 1, 0, 1]})
stats = flights.filter("@brushed").group_by("route").agg(flights=hm.count(), delay=hm.col.delay.mean())

with hm.Scene() as chart:
    with hm.Row():
        with hm.Plot(height=300, title="Shift-drag to brush flights"):
            hm.Points(data=flights, x="distance", y="delay", size=3, brush=True, respond="brushed")
        with hm.Plot(height=300, title="Brushed flights per route"):
            hm.Points(data=routes.join(stats, on="route", fields=["flights", "delay"]),
                      x="x", y="y", size="flights", fill="delay", tooltip=["route", "flights", "delay"])
chart
```

## 38. A live count and total of the brushed rows

A Title inside the Data is a readout: an f-string with hm.count(where="@brushed") follows the brush. trips.filter("@brushed").group_by() is one row of totals, and Text of its column writes the GPU total, with no category workaround.

```python
import numpy as np
import hmplot as hm

rng = np.random.default_rng(7)
trips = hm.Data({"distance": rng.gamma(2, 2.5, 2000), "fare": rng.gamma(3, 6, 2000)})
# One row of totals: group_by() without keys.
totals = trips.filter("@brushed").group_by().agg(total=hm.col.fare.sum())

with hm.Scene() as chart:
    with hm.Data(value=trips):
        hm.Title(f"Selected trips: {hm.count(where='@brushed'):,} · mean fare "
                 f"{hm.mean('fare', where='@brushed'):$.2f}", size="subtitle")
    with hm.Plot(height=300, title="Shift-drag to brush trips",
                 x={"label": "Distance (km)"}, y={"label": "Fare (USD)"}):
        hm.Points(data=trips, x="distance", y="fare", size=3, opacity=0.5, brush=True)
        hm.Text(data=totals, x=hm.view.view_x_max, y=hm.view.view_y_max, text="total", format="$,.0f",
                align="right", dx=-8, dy=12)
chart
```

## 39. Zoom a line chart with a brush on an overview strip

hm.charts.FocusContext draws the series twice: drag across the strip below to zoom the chart above to those days; clear the brush (Escape) to see them all.

```python
import numpy as np
import hmplot as hm

rng = np.random.default_rng(3)
days = np.arange(730)
series = hm.Table({"day": days, "visits": 400 + 120 * np.sin(days / 15) + days / 3 + rng.normal(0, 25, len(days))})

with hm.Scene() as chart:
    hm.charts.FocusContext(data=series, x="day", y="visits", height=380, color="#2a6f97",
                           tooltip=["day", "visits"])
chart
```

## 40. Stacked panels over one shared x

hm.Panels stacks Plots over one x: one domain, panned and zoomed together, the axis and its title drawn once under the stack, the plot areas lined up. A rule in each panel marks the same day across them.

```python
import numpy as np
import hmplot as hm

rng = np.random.default_rng(11)
days = np.arange(250)
prices = hm.Table({"day": days, "price": 100 + np.cumsum(rng.normal(0, 1.2, len(days))),
                   "volume": rng.gamma(4, 250_000, len(days))})

with hm.Scene() as chart:
    with hm.Data(prices):
        with hm.Panels(x={"label": "Trading day"}):
            with hm.Plot(height=240, y={"label": "Price (USD)"}):
                hm.Line(x="day", y="price")
                hm.charts.RuleX(x=180, color="#c44e52")
            with hm.Plot(height=140, y={"label": "Volume"}):
                hm.charts.Bar(x="day", y="volume", orientation="vertical")
                hm.charts.RuleX(x=180, color="#c44e52")
chart
```

## 41. A pipeline as a layered graph

DAG lays the steps out in layers, left to right, and Routes draws each edge around the boxes between its ends; Text names each step.

```python
import hmplot as hm

edges = {"source": ["Ingest", "Ingest", "Parse", "Parse", "Validate", "Enrich", "Validate"],
         "target": ["Parse", "Validate", "Enrich", "Archive", "Report", "Report", "Archive"]}

with hm.Scene() as chart:
    with hm.Data(edges):
        with hm.GraphData(source="source", target="target"):
            with hm.DAG(node_width=1.3, node_height=0.65):
                with hm.Plot(height=420):
                    with hm.Edges():
                        hm.Routes(color="#7b9865", width=2)
                    with hm.Nodes():
                        hm.Points(position="position", size=8, fill="#2f6f9f")
                        hm.Text(x="x", y="y", text="id", dy=-15)
chart
```

## 42. Where a budget goes, as a Sankey diagram

Sankey stacks each node's flows by value; Flow draws each link as a band as wide as its value, Rect the nodes, colored by their group, and Text names them.

```python
import hmplot as hm

edges = {"source": ["Budget", "Budget", "Budget", "Staff", "Staff", "Services"],
         "target": ["Staff", "Services", "Equipment", "Salaries", "Training", "Hosting"],
         "value": [60, 25, 15, 52, 8, 25]}
nodes = {"id": ["Budget", "Staff", "Services", "Equipment", "Salaries", "Training", "Hosting"],
         "group": ["total", "area", "area", "item", "item", "item", "item"]}

with hm.Scene() as chart:
    with hm.Data(edges):
        with hm.GraphData(nodes=nodes, edges=edges, node_key="id", source="source", target="target"):
            with hm.Sankey(value="value"):
                with hm.Plot(height=420, x={"domain": [-0.05, 1.25]}, y={"domain": [-0.05, 1.05]}):
                    with hm.Edges():
                        hm.Flow(start_lower="startLower", end_lower="endLower",
                                start_upper="startUpper", end_upper="endUpper",
                                fill="#7b9865", opacity=0.55)
                    with hm.Nodes():
                        hm.Rect(x0="x0", x1="x1", y0="y0", y1="y1", fill="group")
                        hm.Text(x="x1", y="y", text="id", dx=6, align="left")
chart
```
