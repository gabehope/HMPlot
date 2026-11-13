import hmplot as hm

data = {"year": [2019, 2020, 2021, 2022] * 3,
        "index": [100, 104, 111, 118, 100, 97, 103, 109, 100, 101, 99, 102],
        "fund": ["Growth"] * 4 + ["Value"] * 4 + ["Bonds"] * 4}
colors = hm.categorical(domain=["Growth", "Value", "Bonds"], range=["#3477b4", "#df7253", "#52997a"])
with hm.Plot(data=data, height=260, legend=False) as plot:
    hm.Line(x="year", y="index", series="fund", color="fund", color_scale=colors)
    hm.charts.EndLabels(x="year", y="index", series="fund", color="fund", color_scale=colors)
plot
