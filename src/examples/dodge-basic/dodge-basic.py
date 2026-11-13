import hmplot as hm

data = {"value": [1, 1.1, 1.2, 2, 2.05, 2.1, 2.15, 3, 3.1, 4]}
with hm.Plot(data=data, height=300, axes2d=True) as plot:
    with hm.Dodge(x="value"):
        hm.Points(x="value", y=0)
plot
