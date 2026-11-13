import math
import hmplot as hm

count = 1024  # Try 256 or 4096 after the initial example is responsive.
records = [dict(
    id=f"row-{i}", group=["A", "B", "C", "D"][i % 4],
    x=0.08 + 0.84 * ((i * 37) % 997) / 996,
    y=0.5 + 0.38 * math.sin(i * 0.71),
    score=0.5 + 0.4 * math.cos(i * 0.29),
    response=0.5 + 0.38 * math.sin(i * 0.17 + 1),
) for i in range(count)]

shared = hm.Table(records, key="id")
independent = hm.Table([dict(row) for row in records], key="id")
with hm.Scene() as scene:
    with hm.Row(wrap=True, min_width=320):
        with hm.Data(shared):
            with hm.Plot(title="Shared rows: position", height=340, axes2d=True,
                         x={"domain": [0, 1]}, y={"domain": [0, 1]}) as source:
                hm.Points(x="x", y="y", fill="group", hover=True, select=True, brush=True,
                    size=hm.where("@hovered", 11, 6), respond=["hovered", "selected", "brushed"])
                with hm.Filter(where="@hovered", inactive="none"):
                    hm.Text(x="x", y="y", text="id", size=12, dy=-16)
            with hm.Plot(title="Shared rows: another projection", height=340, axes2d=True,
                         x={"domain": [0, 1]}, y={"domain": [0, 1]}):
                hm.Points(x="score", y="response", fill="group", hover=True, select=True, brush=True,
                    size=hm.where("@hovered", 11, 6), respond=["hovered", "selected", "brushed"])
            with hm.Plot(title="Live brush filter", height=340, axes2d=True,
                         x={"domain": [0, 1]}, y={"domain": [0, 1]}):
                with hm.Filter(where="@brushed", inactive="none"):
                    # @any_selected is 1 on every row while anything is selected: fade the others only then.
                    hm.Points(x="x", y="score", fill="group", size=hm.where("@hovered", 11, 6), respond="hovered",
                        opacity=hm.where("@any_selected", hm.where("@selected", 1.0, 0.3), 1.0))
        with hm.Plot(data=independent, title="Independent table", height=340, axes2d=True,
                     x={"domain": [0, 1]}, y={"domain": [0, 1]}):
            # nearby grows every row within 24 px of the pointer, overplotted ones included.
            hm.Points(x="x", y="y", fill="group", hover=True, select=True, nearby=True,
                             size=hm.where("@nearby", 7, 3))
scene
