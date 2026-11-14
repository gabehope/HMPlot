const t=`import hmplot as hm

with hm.Plot(data={"x": [1, 2, 3], "y": [2, 1, 4]}) as plot:
    hm.Points(x="x", y="y")

plot
`;export{t as default};
