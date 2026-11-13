"""Centered report with composable title and legend styles
Preset, partial list, own theme keys and explicit mark props apply in that order."""
import hmplot as hm

data = {"month": [1, 2, 3, 4], "value": [3, 5, 4, 7]}
theme = hm.create_theme(extends=["paper", "title/centered", "legend/inline-bottom", "marks/lines-medium"])
with hm.Theme(value=theme) as presentation:
    with hm.Plot(data=data, height=380, title="Quarterly observations",
                 subtitle="A centered report", caption="Source: example measurements",
                 x={"label": "Month", "tick_count": 4}, y={"label": "Value"}) as chart:
        hm.Line(x="month", y="value", label="Observed")
        hm.Points(x="month", y="value", size=9)
chart
