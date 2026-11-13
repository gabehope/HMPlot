"""Stacked panels over one shared x
hm.Panels stacks Plots over one x: one domain, panned and zoomed together, the axis and its title drawn once under the stack, the plot areas lined up. A rule in each panel marks the same day across them."""
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
