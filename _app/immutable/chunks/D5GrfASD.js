const t=`import hmplot as hm

data = {"x0": [0, 2, 4], "x1": [1, 3, 5], "y0": [0, 1, 0], "y1": [2, 3, 1]}
with hm.Plot(data=data, height=300, axes2d=True) as plot:
    hm.Rect(x0="x0", x1="x1", y0="y0", y1="y1")
plot
`;export{t as default};
