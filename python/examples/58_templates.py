"""Templates: reusable patterns of components that still take children."""
import numpy as np

import hmplot as hm

rng = np.random.default_rng(58)
days = np.arange(60, dtype=float)
sites = {
    name: {"day": days, "value": np.cumsum(rng.normal(0.2, 1.0, days.size)) + offset}
    for name, offset in (("North", 10.0), ("South", 4.0), ("East", 7.0))
}


class Panel(hm.Template):
    """One site's plot: the caller's marks go in the slot, a zero line is drawn over them."""

    def build(self, data, *, title):
        with hm.Data(data):
            with hm.Plot(title=title, height=240, axes2d=True) as self.plot:
                hm.slot()
                hm.Line(data={"day": [0.0, 59.0], "value": [0.0, 0.0]}, x="day", y="value",
                        color="#6b7782", width=1)

    def highlight(self, color):
        self.plot.update(background=color)


@hm.template
def trend(x, y, color):
    """A line with its points: two marks and no slot."""
    hm.Line(x=x, y=y, color=color, width=2)
    hm.Points(x=x, y=y, size=2, fill=color)


with hm.Scene() as scene:
    with hm.Row(wrap=True, min_width=280):
        panels = {}
        for name, data in sites.items():
            with Panel(data, title=name) as panel:
                trend("day", "value", "#2f6f9f")
            panels[name] = panel

# A template is a node: add to its slot later, or call its own methods.
latest = {"day": [59.0], "value": [float(sites["South"]["value"][-1])]}
panels["South"].add(hm.Points(data=latest, x="day", y="value", size=5, fill="#d1495b"))
panels["East"].highlight("#f4f8fb")
scene
