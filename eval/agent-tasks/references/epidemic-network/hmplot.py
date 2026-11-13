"""Reference: derive state from a continuous shared clock; stable person identity."""
from pathlib import Path
import numpy as np
import pandas as pd
import hmplot as hm

Path("output").mkdir(exist_ok=True)
people = pd.read_csv("data/people.csv", dtype={"person": str, "infected_by": str})
contacts = pd.read_csv("data/contacts.csv", dtype=str)
lookup = people.set_index("person")
people["infection"] = people.infected_day.fillna(1e9)
def endpoints(source, target):
    return {"start": lookup.loc[source, ["x", "y"]].to_numpy(),
            "end": lookup.loc[target, ["x", "y"]].to_numpy()}
edges = endpoints(contacts.source, contacts.target)
transmitted = people[people.infected_by.isin(lookup.index)]
arrows = endpoints(transmitted.infected_by, transmitted.person)
arrows["day"] = transmitted.infected_day.to_numpy()
last = int(people.infected_day.max()) + 8
days = np.arange(last + 1)
infection = people.infected_day.dropna().to_numpy()
curve = {"day": days, "new": [(infection == d).sum() for d in days],
         "active": [((infection <= d) & (infection > d - 7)).sum() for d in days]}
colors = hm.categorical(domain=[0, 1, 2], range=["#b9c6d4", "#df433d", "#404851"])
with hm.Scene(gap=14) as chart:
    hm.Playback(name="day", label="Day", min=0, max=last, value=0,
                step=0.1, rate=2, loop=False)
    with hm.Row(widths=[1.2, 1], gap=24):
        with hm.Plot(title="Spread through a contact network", height=520,
                     aspect="equal", axes2d=False):
            hm.Segments(data=edges, start="start", end="end", color="#b2bac4", width=0.6, opacity=0.4)
            with hm.Data(arrows):
                with hm.Filter(where=hm.col.day <= hm.input.day):
                    hm.charts.Arrows(start="start", end="end", color="#bc3b35", width=1,
                                     head_length=5, head_width=4, opacity=0.65)
            with hm.Data(people, key="person"):
                with hm.Calculate(columns={"state": hm.as_category(
                        hm.where(hm.col.infection > hm.input.day, 0,
                                 hm.where(hm.col.infection > hm.input.day - 7, 1, 2)), domain=[0, 1, 2])}):
                    hm.Points(x="x", y="y", fill="state", fill_scale=colors, size=5.5,
                              animation=True, animation_duration=250,
                              tooltip=["person", "community", "infected_day"])
        with hm.Plot(data=curve, title="Infected per day", height=520,
                     x={"domain": [0, last], "label": "Day"}, y={"label": "People"}):
            hm.Area(x="day", upper="active", fill="#df433d", opacity=0.18)
            hm.Line(x="day", y="new", color="#c03c37", width=2.5)
            hm.charts.RuleX(x=hm.input.day, color="#26384a", width=1.5)
hm.export_html(chart, "output/chart.html")
