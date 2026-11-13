import numpy as np
import hmplot as hm

# Three series of twelve observations and a trend line, drawn in any of the 32 built-in theme
# presets: the theme sets the background, axes, text, mark defaults, the categorical palette and
# the legend.
i = np.arange(36)
x = 0.35 + (i % 12) * 0.64
series = i // 12
observations = {
    "x": x,
    "y": 0.45 + 0.23 * x + 0.45 * np.sin(x * 1.35 + series * 0.75) + series * 0.22,
    "group": np.array(["North", "Central", "South"])[series],
}
t = np.arange(81) * 0.1
trend = np.column_stack([t, 0.65 + 0.23 * t + 0.38 * np.sin(t * 1.35 + 0.7)])

# Every preset by its display name. The Theme extends the chosen one.
presets = {hm.themes[name]["name"]: name for name in hm.themes.names()}

with hm.Scene(gap=12) as scene:
    with hm.Row(wrap=True, min_width=0):
        hm.Select(name="theme", label="Theme preset", options=presets, value="hmplot")
    with hm.Theme(value={"extends": hm.input.theme}):
        with hm.Plot(data=observations, height=440, axes2d=True, legend=True, x={"domain": [0, 8.2], "label": "Time"},
                     y={"domain": [0, 3.5], "label": "Value"}):
            hm.Line(position=trend, label="Trend")
            hm.Points(x="x", y="y", fill="group", label="Observations")
scene
