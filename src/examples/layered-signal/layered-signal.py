import numpy as np
import hmplot as hm

# A signal and its uncertainty: 512 estimates with a band that widens and narrows, and 32 noisy
# observations with error bars. "New target" moves the signal's phase on by 0.8 (a Button counts
# its presses, and Calculate reads the count on the GPU); the plot animates each change over
# 700 ms while "Animate" is on.
x = np.arange(512) / 16
estimates = {"x": x, "band": 0.12 + 0.25 * np.sin(x * 0.35) ** 2}
k = np.arange(32.0)
observations = {"x": k, "noise": 0.08 * np.sin(k * 7)}

phase = 0.8 * hm.input.target
signal = hm.sin(hm.col.x + phase) + 0.3 * hm.cos(hm.col.x * 2.7 - phase)

with hm.Scene(gap=12) as scene:
    with hm.Row(wrap=True, min_width=0):
        hm.Button(name="target", label="New target")
        hm.Checkbox(name="animate", label="Animate", value=True)
    with hm.Plot(x={"domain": [0, 32]}, y={"domain": [-2, 2]}, height=420, axes2d=True, zoom_axis="x", legend=True,
                 animation=hm.input.animate, animation_duration=700) as plot:
        with hm.Data(estimates):
            with hm.Calculate(y=signal, lower=signal - hm.col.band, upper=signal + hm.col.band):
                hm.Area(x="x", lower="lower", upper="upper", fill="#577eac", label="Interval", opacity=0.2)
                hm.Line(x="x", y="y", width=1.5, color="#325b83",
                        label="Estimate")
        with hm.Data(observations):
            with hm.Calculate(y=signal + hm.col.noise, lower=signal - 0.18, upper=signal + 0.18):
                hm.charts.ErrorBars(x="x", y="y", lower="lower", upper="upper", color="#754331", cap_size=5)
                hm.Points(x="x", y="y", fill="#b77450", size=7,
                          outline_color="#fffaf0", outline_width=0.7, label="Observations")
    # As wide as the docs' column (narrower screens shrink it): drag its window to move the view.
    hm.Minimap(target=plot, width=818, height=100, axes={"x": True, "y": False})
    hm.Markdown("Brush the view with the overview, zoom along X, toggle series, and interrupt animated updates.",
                font_size=12, color="#697785")
scene
