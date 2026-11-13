import numpy as np
import hmplot as hm

# 25,000 points spread evenly over [-2, 2] x [-2, 2], with a little noise. Rows shows the first
# 2,000, 10,000 or all of them; Gain scales the last of three Calculate stages.
count = 25_000
row = np.arange(count, dtype=np.int64)  # int64: Pyodide's default int is 32-bit
data = {
    "row": row.astype(np.float32),
    "x": (4 * ((row * 7919 % 104729) / 104729) - 2).astype(np.float32),
    "y": (4 * ((row * 1543 % 104723) / 104723) - 2).astype(np.float32),
    "noise": (np.sin(row * 0.73) * 0.2).astype(np.float32),
}

with hm.Scene(gap=12) as matrix:
    hm.Markdown("Sixteen coordinated views of four calculated fields. Hover, select, and Shift-drag to brush across "
                "cells. Counts are per cell; 25,000 rows produces 400,000 plotted instances.")
    with hm.Row(wrap=True, min_width=0, gap=20):
        hm.Select(name="rows", label="Rows", options={"2,000": 2000, "10,000": 10000, "25,000": 25000})
        hm.Slider(name="gain", label="Gain", min=0.25, max=2, step=0.25, value=1)
    with hm.Data(data):
        with hm.Filter(where=hm.col.row < hm.input.rows):
            # Calculate assignments are simultaneous; nest scopes for dependencies.
            with hm.Calculate(energy=hm.square("x") + hm.square("y"), cross=hm.col.x * hm.col.y,
                              shifted=hm.col.x + hm.col.noise):
                with hm.Calculate(weight=hm.exp(hm.col.energy * -0.5), logEnergy=hm.log(hm.col.energy + 1),
                                  residual=hm.col.shifted - hm.col.cross / (hm.col.energy + 1)):
                    with hm.Calculate(score=hm.clip(hm.col.residual * hm.col.weight * hm.input.gain, -2, 2),
                                      magnitude=hm.sqrt(hm.square("residual") + 0.01)):
                        with hm.Facet(pairs=["shifted", "residual", "score", "logEnergy"], scales="field", link="grid",
                                      cache_size=64):
                            with hm.Plot(height=250, axes2d=True):
                                hm.Points(x="x", y="y", fill="score", size=hm.where("@hovered", 8, 1.5),
                                          hover=True, select=True, brush=True,
                                          respond=["hovered", "selected", "brushed"])
