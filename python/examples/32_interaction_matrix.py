import math
import hmplot as hm

count = 256  # Try 256 or 4096 after the initial example is responsive.
records = [dict(
    id=f"row-{i}", group=["A", "B", "C", "D"][i % 4],
    x=0.08 + 0.84 * ((i * 37) % 997) / 996,
    y=0.5 + 0.38 * math.sin(i * 0.71),
    score=0.5 + 0.4 * math.cos(i * 0.29),
    response=0.5 + 0.38 * math.sin(i * 0.17 + 1),
) for i in range(count)]

with hm.Data(hm.Table(records, key="id")) as chart:
    with hm.Facet(pairs=["x", "y", "score", "response"], scales="field", link="grid", cache_size=64) as facets:
        with hm.Plot(height=260, axes2d=True):
            hm.Points(x="x", y="y", fill="group", hover=True, select=True, brush=True,
                size=hm.where("@hovered", 11, 5), respond=["hovered", "selected", "brushed"])
chart
