import math

import hmplot as hm

# Weekly plays of eight genres over a year: one row per genre and week.
genres = ["Ambient", "Blues", "Country", "Disco", "Electro", "Folk", "Gospel", "House"]
data = {"week": [], "genre": [], "plays": []}
for g, genre in enumerate(genres):
    for week in range(52):
        value = 0.3
        for k in range(3):
            peak = (g * 11 + k * 19) % 52
            spread = 3 + ((g + 2 * k) % 5) * 1.5
            height = 1 + ((g * 5 + k * 3) % 7)
            value += height * math.exp(-((week - peak) ** 2) / (2 * spread ** 2))
        data["week"].append(week)
        data["genre"].append(genre)
        data["plays"].append(math.floor(value * 100 + 0.5) / 100)

with hm.Scene(gap=12) as scene:
    hm.Markdown('A streamgraph: Stack with offset="wiggle" moves each week\'s stack so the layers '
                'change slope as little as they can, and order="insideOut" puts the biggest genres '
                'in the middle. Each Area draws one genre from y0 to y1. Try the other offsets: '
                'center stacks around zero, zero from zero, expand to 100%.')
    with hm.Row(wrap=True, min_width=0, gap=12):
        hm.Select(name="offset", label="Offset", value="wiggle", options=["wiggle", "center", "zero", "expand"])
        hm.Select(name="order", label="Order", value="insideOut",
                  options=["insideOut", "none", "appearance", "ascending", "descending", "reverse"])
        hm.Checkbox(name="animate", label="Animate", value=True)
    with hm.Plot(data=data, responsive=True, height=420, axes2d=True, animate_bounds=hm.input.animate,
                 bounds_duration=700, x={"label": "Week"}, y={"label": "Plays"}):
        with hm.Stack(x="week", y="plays", series="genre", offset=hm.input.offset, order=hm.input.order):
            hm.Area(x="week", upper="y1", lower="y0", fill="genre", series="genre", opacity=0.9,
                    animation=hm.input.animate, animation_duration=700)
        hm.Legend(channel="fill", label="Genre", position="right")
scene
