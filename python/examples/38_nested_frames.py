"""Nested frames: a child scale inside a log parent, an anchored frame, and marks inside both.

Script twin of 38_nested_frames.ipynb. Each block builds one Plot; in a notebook, end a cell
with the plot variable to display it.
"""
import hmplot as hm

# A child interval maps through its parent's logarithmic scale. A child that sets its own
# domain is linear (set "transform" to change that); its range places it in parent
# coordinates, through the parent's log.
positions = [[0, 0], [50, 50], [100, 100]]
with hm.Plot(axes2d=True, height=420,
             x={"domain": [1, 1000], "transform": "log"},
             y={"domain": [0, 100]}) as nested:
    with hm.Frame(x={"domain": [0, 100], "range": [10, 100]},
                  y={"domain": [0, 100], "range": [20, 80]}):
        hm.Line(position=positions, color="#547ba2", width=2)
        hm.Points(position=positions, fill="#7b9865", size=6)
        # Rects, ribbons, error bars, and links follow nonlinear parents too.
        hm.Rect(x0=[40], x1=[60], y0=[40], y1=[60], fill="#c0504d")
        hm.Area(x=[0, 50, 100], lower=[5, 5, 5], upper=[20, 20, 20], fill="#4f81bd", opacity=0.2)

# An anchored frame stays 160 by 100 CSS pixels at its parent data position while you pan
# and zoom. Use Text (not Text3D) for text inside anchored frames.
with hm.Plot(axes2d=True, height=420,
             x={"domain": [0, 100]}, y={"domain": [0, 100]}) as anchored:
    with hm.Frame(placement={"anchor": [35, 65], "size": [160, 100], "rotation": [0, 0, 20]},
                  x={"domain": [0, 10]}, y={"domain": [0, 10]}) as inset:
        inset_points = hm.Points(position=[[0, 0], [5, 5], [10, 10]], size=6, fill="#7b9865")
        hm.Rect(x0=[4], x1=[6], y0=[4], y1=[6], fill="#c0504d")


def report_frame(event):
    # event.frame is the nearest enclosing Frame (here `inset`), or the Plot for root marks,
    # and data_coordinates are in that frame's own 0..10 scale. In a notebook, show this in
    # an ipywidgets widget: print() in a callback is not reliably attached to a cell.
    print(event.frame is inset, event.data_coordinates)


inset_points.on_click(report_frame)


# Grid Dodge: each unit keeps its original source row for picking and selection.
data = {"category": ["A", "B", "C"], "count": [23, 35, 42]}
with hm.Plot(data=data, height=420, x={"domain": [0, 10]}, y={"domain": [0, 10]}) as waffle:
    with hm.Dodge(mode="grid", columns=10, count="count"):
        hm.Points(x="x", y="y", fill="category", shape="square", size=12)

# A Facet inside Plot creates local frames within one canvas.
data = {
    "region": ["North", "North", "South", "South", "West", "West"],
    "year": ["2024", "2025", "2024", "2025", "2024", "2025"],
    "total": [12, 18, 9, 15, 21, 25],
}
with hm.Plot(data=data, height=420, axes2d=True, y={"domain": [0, 30]}) as grouped:
    with hm.Facet(column="region", band_padding=0.2):
        hm.charts.Bar(x="year", y="total", fill="year")

nested
