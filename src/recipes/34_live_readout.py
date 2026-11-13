"""A live count and total of the brushed rows
A Title inside the Data is a readout: an f-string with hm.count(where="@brushed") follows the brush. Text of a keyless Group's column writes a GPU total beside the data, with no category workaround."""
import numpy as np
import hmplot as hm

rng = np.random.default_rng(7)
trips = hm.Table({"distance": rng.gamma(2, 2.5, 2000), "fare": rng.gamma(3, 6, 2000)})

with hm.Scene() as chart:
    with hm.Data(trips):
        hm.Title(f"Selected trips: {hm.count(where='@brushed'):,} · mean fare "
                 f"{hm.mean('fare', where='@brushed'):$.2f}", size="subtitle")
        with hm.Plot(height=300, title="Shift-drag to brush trips",
                     x={"label": "Distance (km)"}, y={"label": "Fare (USD)"}):
            hm.Points(x="distance", y="fare", size=3, opacity=0.5, brush=True)
            with hm.Filter(where="@brushed"):
                # One row of totals: Group without by.
                with hm.Group(columns={"total": hm.sum("fare")}):
                    hm.Text(x=hm.view.view_x_max, y=hm.view.view_y_max, text="total", format="$,.0f",
                            align="right", dx=-8, dy=12)
chart
