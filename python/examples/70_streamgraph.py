import hmplot as hm
import numpy as np

# Weekly plays of eight genres over a year, each a few bumps: one row per genre and week.
genres = ["Ambient", "Blues", "Country", "Disco", "Electro", "Folk", "Gospel", "House"]
weeks = np.arange(52)
data = {"week": [], "genre": [], "plays": []}
for g, name in enumerate(genres):
    plays = np.full(52, 0.3)
    for k in range(3):
        peak = (g * 11 + k * 19) % 52
        spread = 3 + ((g + 2 * k) % 5) * 1.5
        height = 1 + ((g * 5 + k * 3) % 7)
        plays += height * np.exp(-((weeks - peak) ** 2) / (2 * spread ** 2))
    data["week"] += weeks.tolist()
    data["genre"] += [name] * 52
    data["plays"] += np.round(plays, 2).tolist()

# offset="wiggle" moves each week's stack so the layers change slope as little as they can;
# order="insideOut" puts the biggest genres in the middle. Each Area draws a genre from y0 to y1.
with hm.Plot(data=data, height=420, axes2d=True, x={"label": "Week"}, y={"label": "Plays"}) as plot:
    with hm.Stack(x="week", y="plays", series="genre", offset="wiggle", order="insideOut"):
        hm.Area(x="week", upper="y1", lower="y0", fill="genre", series="genre", opacity=0.9)
    hm.Legend(channel="fill", label="Genre", position="right")
plot
