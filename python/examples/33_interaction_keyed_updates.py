import math
import hmplot as hm

def make_frame(frame, reverse=False):
    rows = []
    for i in range(48):
        ident = (i + frame * 8) % 80
        rows.append(dict(id=f"row-{ident}", group=["A", "B", "C", "D"][ident % 4],
            x=0.1 + 0.8 * ((ident * 17) % 79) / 78,
            y=0.5 + 0.34 * math.sin(ident * 0.6 + frame * 0.12)))
    return rows[::-1] if reverse else rows

frame = 0
reverse = False
table = hm.Table(make_frame(frame), key="id")
with hm.Plot(data=table, height=480, axes2d=True,
             x={"domain": [0, 1]}, y={"domain": [0, 1]}) as chart:
    hm.Points(x="x", y="y", fill="group", size=hm.where("@hovered", 12, 7),
        hover=True, select=True, brush=True, respond=["hovered", "selected", "brushed"],
        animation=True, animation_duration=500, enter_effect="fade", exit_effect="fade")
    hm.Text(x="x", y="y", text="id", size=10, dy=-17,
        respond=["selected", "hovered"], selection_opacity=0.15,
        animation=True, animation_duration=200, enter_effect="fade", exit_effect="fade")
chart
