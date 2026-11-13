import pandas as pd
import hmplot as hm

# Palmer penguins (CC0): https://allisonhorst.github.io/palmerpenguins/
# Two penguins have no bill measurements: skip them.
penguins = pd.read_csv("penguins.csv").dropna(subset=["bill_length_mm", "bill_depth_mm"])

with hm.Plot(data=penguins, height=420, axes2d=True,
             x={"label": "Bill length (mm)", "grid": "major"},
             y={"label": "Bill depth (mm)", "grid": "major"}) as plot:
    hm.Points(x="bill_length_mm", y="bill_depth_mm", fill="species", opacity=0.75)
    hm.Legend(channel="fill")
plot
