const t=`import hmplot as hm

data = {
    "x": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    "y": [4, 7, 2, 9, 5, 3, 8, 6, 1, 10],
}
with hm.Plot(data=data, height=300, axes2d=True) as plot:
    with hm.Sample(size=5):
        hm.Points(x="x", y="y")
plot
`;export{t as default};
