"""A live count and total of the brushed rows
A Title inside the Data is a readout: an f-string with hm.count(where="@brushed") follows the brush. trips.filter("@brushed").group_by() is one row of totals, and Text of its column writes the GPU total, with no category workaround."""
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
