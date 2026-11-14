const t=`import hmplot as hm

data = {"city": ["Oslo", "Lima", "Pune", "Nice", "Kobe"], "y2015": [12, 30, 21, 18, 25], "y2025": [19, 26, 34, 22, 31]}
with hm.Plot(data=data, height=300, axes2d=True) as plot:
    hm.charts.Dumbbell(y="city", x0="y2015", x1="y2025")
    hm.Legend()
plot
`;export{t as default};
