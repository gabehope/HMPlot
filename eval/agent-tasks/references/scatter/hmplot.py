from pathlib import Path
import pandas as pd
import hmplot as hm

frame = pd.read_csv("data/penguins.csv").dropna(subset=["bill_length_mm", "bill_depth_mm"])
with hm.Plot(data=frame.to_dict(orient="list"), title="Penguin bills", height=500, axes2d=True,
             x={"label": "Bill length (mm)"}, y={"label": "Bill depth (mm)"}) as plot:
    points = hm.Points(x="bill_length_mm", y="bill_depth_mm", fill="species", size=8, label="Penguins")
    hm.Legend(target=points, channel="fill", label="Species")
hm.export_html(plot, "output/chart.html")
plot
