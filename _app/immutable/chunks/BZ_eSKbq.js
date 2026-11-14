const a=`import hmplot as hm

with hm.Data(rows=8) as data:
    with hm.Plot(height=260, axes2d=True, x={"domain": [-1, 8]}, y={"domain": [0, 2]}):
        hm.Points(x=hm.row(), y=1, size=8)
data
`;export{a as default};
