const n=`import numpy as np
import hmplot as hm

# 40 observations of three measurements in two groups. Facet pairs draws every pair of fields
# (cells mount as they come into view), with one domain per field on x and y; Shift-drag in a cell
# to brush its two fields, and the brushed rows stay lit in every cell.
i = np.arange(40)
data = {
    "length": i / 10,
    "width": np.sin(i * 0.4),
    "height": np.cos(i * 0.23) + i * 0.04,
    "group": np.where(i % 2 == 1, "A", "B"),
}

with hm.Scene() as pairs:
    with hm.Data(data):
        with hm.Facet(pairs=["length", "width", "height"], link="grid"):
            with hm.Plot(height=240, axes2d=True):
                hm.Points(x="x", y="y", fill="group", size=4, brush=True, respond="brushed")
`;export{n as default};
