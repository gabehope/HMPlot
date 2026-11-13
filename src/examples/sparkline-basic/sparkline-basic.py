import hmplot as hm

data = {"day": [1, 2, 3, 4, 5, 6], "value": [3, 4, float("nan"), 2, 5, float("nan")], "label": ["3", "4", "", "2", "5", ""]}
with hm.Plot(data=data, height=120, axes2d=False, x={"domain": [0, 7]}) as plot:
    hm.charts.Sparkline(x="day", y="value", lower=2, upper=4, text="label",
                        last={"color": "#20252b", "dx": 8})
plot
