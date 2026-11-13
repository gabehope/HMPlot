import numpy as np
import hmplot as hm

count = 10000  # 10000, 100000, 250000; counts are per cell for the matrix.
gain = 1.0
index = np.arange(count, dtype=np.int64)
data = {
    "x": (4 * ((index * 7919 % 104729) / 104729) - 2).astype(np.float32),
    "y": (4 * ((index * 1543 % 104723) / 104723) - 2).astype(np.float32),
    "noise": (np.sin(index * 0.73) * 0.2).astype(np.float32),
}

# Each stage reads the preceding scope, not its sibling assignments.
with hm.Data(data) as chart:
    with hm.Calculate(energy=hm.square("x") + hm.square("y"),
                      cross=hm.col.x * hm.col.y, shifted=hm.col.x + hm.col.noise):
        with hm.Calculate(weight=hm.exp(hm.col.energy * -0.5),
                          logEnergy=hm.log(hm.col.energy + 1),
                          residual=hm.col.shifted - hm.col.cross / (hm.col.energy + 1)):
            with hm.Calculate(score=hm.clip(hm.col.residual * hm.col.weight * gain, -2, 2),
                              magnitude=hm.sqrt(hm.square("residual") + 0.01)):
                with hm.Plot(height=520, axes2d=True, x={"domain": [-2.3, 2.3]}, y={"domain": [-2.3, 2.3]}):
                    hm.Points(x="shifted", y="score", fill="magnitude", size=hm.where("@hovered", 9, 2),
                        hover=True, select=True, brush=True, respond=["hovered", "selected", "brushed"],
                        max_instances=count, max_elements=count)
chart
