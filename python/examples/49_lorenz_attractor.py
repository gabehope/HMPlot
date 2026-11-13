"""The Lorenz attractor: a glowing 3D orbit, sparks that run along it, and linked brushing.

Sixty thousand Runge-Kutta steps of the Lorenz system. The 3D orbit is colored by speed and
blended additively; sparks travel along it in time order, computed on the GPU from @time.
Shift-drag on the butterfly projection to brush: the 3D orbit keeps only those passes lit and
the histogram counts their speeds. Display `scene`, then call `set_rho(16)` to watch the chaos
collapse into a spiral toward a fixed point (it does below rho ~24.7). The row count never
changes, so an update reuses every GPU kernel.
"""
import math

import hmplot as hm

STEPS, DT = 60_000, 0.003
# Additive blending skips depth writes, so every overlapping point is shaded and blended. Once
# an orbit settles onto a fixed point, thousands of steps land on the same pixels. A step that
# moved less than MIN_STEP since the last drawn one gets a NaN position (drawn as nothing); its
# speed still counts in the histogram.
MIN_STEP = 0.05


def lorenz(rho):
    def f(x, y, z):
        return 10 * (y - x), x * (rho - z) - y, x * y - (8 / 3) * z

    xs, ys, zs, speed, t = [], [], [], [], []
    x, y, z = 1.0, 1.0, 20.0
    last = (math.inf, 0.0, 0.0)
    for i in range(STEPS):
        a = f(x, y, z)
        b = f(x + DT / 2 * a[0], y + DT / 2 * a[1], z + DT / 2 * a[2])
        c = f(x + DT / 2 * b[0], y + DT / 2 * b[1], z + DT / 2 * b[2])
        d = f(x + DT * c[0], y + DT * c[1], z + DT * c[2])
        x += DT / 6 * (a[0] + 2 * b[0] + 2 * c[0] + d[0])
        y += DT / 6 * (a[1] + 2 * b[1] + 2 * c[1] + d[1])
        z += DT / 6 * (a[2] + 2 * b[2] + 2 * c[2] + d[2])
        if math.dist((x, y, z), last) >= MIN_STEP:
            xs.append(x); ys.append(y); zs.append(z)
            last = (x, y, z)
        else:
            xs.append(math.nan); ys.append(math.nan); zs.append(math.nan)
        speed.append(math.hypot(*f(x, y, z)))
        t.append(i / (STEPS - 1))
    return {"x": xs, "y": ys, "z": zs, "speed": speed, "t": t}


orbit = hm.Table(lorenz(28))
# One ramp for every view: slow (deep violet) to fast (white-hot). Speeds past 320 clamp.
glow = hm.continuous(domain=[0, 320], colormap=["#3a2a80", "#7a36b4", "#e8457a", "#ffb347", "#fff6d8"])
# Additive blending adds nothing for black: the sparks fade from black to white-hot at a peak.
spark_ramp = hm.continuous(domain=[0, 1], colormap=["#000000", "#ff9d3c", "#fff8e8"])
# Forty sparks: exp(k (cos(phase) - 1)) is a narrow bump on every cycle of the phase, and @time
# moves the phase along the orbit.
phase = 6.283185 * (40 * hm.col.t - hm.view.time / 2500)
spark = hm.exp(400 * (hm.cos(phase) - 1))
edges = [i * 10 for i in range(57)]

with hm.Scene() as scene:
    with hm.Theme(value=hm.themes.dark):
        with hm.Data(orbit):
            with hm.Row(wrap=True):
                # The Lorenz z axis points up, so it maps to the plot's vertical y.
                with hm.Plot(type="3d", axes3d=True, height=500, antialias="off",
                             camera_position=[-70, 45, 160],
                             x={"domain": [-30, 30], "label": "x"}, y={"domain": [0, 65], "label": "z"},
                             z={"domain": [-35, 35], "label": "y"}):
                    hm.Points(x="x", y="z", z="y", fill="speed", fill_scale=glow, size=1.25,
                                     opacity=0.45, blend="additive", respond="brushed",
                                     label="Orbit", legend=False)
                    hm.Points(x="x", y="z", z="y", fill=spark, fill_scale=spark_ramp, size=2.5,
                                     blend="additive", respond=False, label="Sparks", legend=False)
                with hm.Column():
                    with hm.Plot(height=280, axes2d=True, antialias="off",
                                 x={"domain": [-30, 30], "label": "x"},
                                 y={"domain": [0, 65], "label": "z"}):
                        hm.Points(x="x", y="z", fill="speed", fill_scale=glow, size=0.75,
                                         blend="additive", brush=True, respond="brushed",
                                         label="Projection", legend=False)
                    with hm.Plot(height=210, axes2d=True, antialias="off",
                                 x={"domain": [0, 560], "label": "speed"}, y={"label": "steps"}):
                        # Dim: every step. Bright: the brushed steps (all of them with no brush).
                        with hm.stats.Bin(x="speed", bins=edges):
                            hm.Rect(x0="x0", x1="x1", y0=0, y1="count", fill="#3b3363", legend=False)
                        with hm.stats.Bin(x="speed", bins=edges, weight="@brushed"):
                            hm.Rect(x0="x0", x1="x1", y0=0, y1="count", fill="#ffb347", legend=False)

scene


def set_rho(rho):
    """Re-integrate at a new Rayleigh number; below ~24.7 the orbit spirals into a fixed point."""
    orbit.replace(lorenz(rho))
