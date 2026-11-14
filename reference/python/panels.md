# Panels

Stacks Plots over one shared x: one domain, panned and zoomed together, its axis drawn once under the stack.

## Example

```python
import math
import hmplot as hm

days = list(range(120))
data = {"day": days, "price": [100 + 10 * math.sin(d / 8) + d / 6 for d in days],
        "volume": [50 + 30 * abs(math.cos(d / 5)) for d in days]}
# Two Plots over one x: zooming or panning either moves both; the axis is drawn once.
with hm.Scene() as chart:
    with hm.Data(data):
        with hm.Panels(x={"label": "Day"}):
            with hm.Plot(height=220, y={"label": "Price"}):
                hm.Line(x="day", y="price")
            with hm.Plot(height=120, y={"label": "Volume"}):
                hm.charts.Bar(x="day", y="volume", orientation="vertical")
chart
```

## Options

Keywords are snake_case.

- `x` (`{domain, transform, label, ...}`): Settings for the shared x axis (label, format, domain, ...), under each Plot's own x settings. Only the last Plot draws the axis; the others show their data over the same domain.
- `gap` (`number`): Space between the Plots. Default: `6` px.

## Usage

Panels stacks Plots over one shared x, as matplotlib's `sharex` does: its Plots show one x domain (the union of their data, or the domain given in `x`), pan and zoom together along x, and line up their plot areas, so the panels' data share one time line however wide each one's y labels are. Only the last Plot draws the x axis and its title; `x` holds that axis's settings (label, format, domain, ...), under each Plot's own `x`. Each Plot keeps its own y axis, height, title and marks.

```python
with hm.Data(prices):
    with hm.Panels(x={"label": "Trading day"}):
        with hm.Plot(height=240, y={"label": "Price"}):
            hm.Line(x="day", y="price")
        with hm.Plot(height=140, y={"label": "Volume"}):
            hm.charts.Bar(x="day", y="volume", orientation="vertical")
```

A rule at the same x in each panel ([RuleX](rule-x)) marks one moment across them. Use Panels rather than separate Plots in a Column with LinkViews: those link navigation but repeat the axis and leave the plot areas to their own gutters. For a brush on an overview strip that zooms a chart, use [FocusContext](focus-context).
