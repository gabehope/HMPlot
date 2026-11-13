"""An annotated chart with an explicit local card style
Box and leader styling use existing Callout props; anchor and pixel offsets remain explicit."""
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
