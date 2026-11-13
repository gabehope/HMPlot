"""Statistical band and a local reference rule
The supplied interval bounds retain their meaning; opacity does not imply a confidence level."""
import hmplot as hm

data = {"x": [0, 1, 2, 3], "y": [2, 4, 3, 6], "lo": [1, 3, 2, 5], "hi": [3, 5, 4, 7]}
with hm.Theme(value={"extends": ["paper", "marks/lines-fine", "marks/intervals-crisp"]}) as presentation:
    with hm.Plot(data=data, height=380, title="Estimate and supplied interval",
                 x={"label": "Time"}, y={"label": "Response"}) as chart:
        hm.Area(x="x", lower="lo", upper="hi", opacity=0.15)
        hm.charts.ErrorBars(x="x", lower="lo", upper="hi")
        hm.Line(x="x", y="y", label="Estimate")
        hm.charts.RuleY(y=4, color="#64748b", width=1, dash=[5, 3])
chart
