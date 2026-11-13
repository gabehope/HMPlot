"""Titles, Markdown and callouts: text beside plots and in them.

A Plot's `title`, `subtitle` and `caption` are part of the plot: its own PNG, SVG and PDF exports
keep them as text. `hm.Title` is plain text in a layout, drawn as SVG text, so a scene's SVG and
PDF exports keep it vector and searchable: use it for publications. `hm.Markdown` is rich text
for dashboards (tables, lists, $math$), exported as an image of how it looks. `{$name}` shows an
input's value in any of them and follows it (in an f-string, `{{$name}}`). `bands=` shades a span
of an axis, and `hm.charts.Callout` points at a value with a note.
"""
import numpy as np

import hmplot as hm

month = np.arange(96)
noise = np.random.default_rng(3).normal(0, 0.1, 96)
anomaly = 0.012 * month + 0.35 * np.sin(month / 7) + noise
anomaly += np.where((month >= 40) & (month < 52), 0.45, 0) - np.where((month >= 70) & (month < 76), 0.5, 0)
warmest = int(np.argmax(anomaly))

with hm.Scene() as scene:
    with hm.Column():
        hm.Title("Temperature anomaly, window of {$window} months")
        hm.Title("Relative to the 1991-2020 mean, °C. Made-up data.", size="subtitle")
        with hm.Row():
            hm.Markdown(f"""**How to read it.** Each point is one month; the line is a
running mean over the last `{{$window}}` months.

| Spell | Months | Shift |
|---|---|---:|
| Warm | 40-51 | +0.45 °C |
| Cold | 70-75 | -0.50 °C |

The trend is about $0.14\\,°\\mathrm{{C}}$ per decade.""", width=320)
            with hm.Plot(data={"month": month, "anomaly": anomaly}, height=320, axes2d=True,
                         title="Monthly anomaly", caption="Source: a made-up series for this example.",
                         bands=[{"axis": "x", "from": 40, "to": 52, "label": "Warm spell", "color": "#d9824b", "opacity": 0.16},
                                {"axis": "x", "from": 70, "to": 76, "label": "Cold spell", "color": "#4f86c6", "opacity": 0.16}],
                         rules=[{"axis": "y", "value": 0, "color": "#7a8392"}]):
                hm.Points(x="month", y="anomaly", size=2, fill="#3d5a80")
                hm.charts.Callout(x=warmest, y=float(anomaly[warmest]), text="Warmest month", dx=-36, dy=34)
        hm.Slider(name="window", min=1, max=24, step=1, value=12, label="Running mean (months)")
scene
