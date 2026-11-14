const a=`import hmplot as hm

data = {"x": [1, 2, 3, 4], "y": [3, 1, 4, 2]}
with hm.Data(data) as table:
    with hm.Plot(height=300, axes2d=True):
        hm.Points(x="x", y="y")
table
`;export{a as default};
