"""Box plots and violins by category
BoxPlot and Violin summarize a numeric column per category of the other axis."""
import numpy as np
import hmplot as hm

rng = np.random.default_rng(2)
data = {"species": np.repeat(["setosa", "versicolor", "virginica"], 200),
        "length": np.concatenate([rng.normal(m, 0.4, 200) for m in (5.0, 5.9, 6.6)])}

with hm.Row() as chart:
    with hm.Plot(data=data, height=320, title="Box plot"):
        hm.charts.BoxPlot(x="species", y="length", fill="species")
    with hm.Plot(data=data, height=320, title="Violin"):
        hm.charts.Violin(x="species", y="length", fill="species")
chart
