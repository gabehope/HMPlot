const n=`import hmplot as hm

data = {"x":[1,2,3,4,5,6],"y":[2,4,3,6,5,7],"x2":[1.6,2.7,3.5,4.8,5.3,6.6],"y2":[3.1,4.6,4.2,6.5,6.4,7.8],"group":["A","A","A","B","B","B"]}

with hm.Plot(data=data, height=340) as plot:
    with hm.Frame(x={"label": "Measurement X"}, y={"label": "Measurement Y"}):
        first = hm.Points(x="x", y="y", fill="group")
        second = hm.Anchor(x="x2", y="y2")
        hm.charts.Arrows(connections=hm.connect(first, second), color="group")

plot
`;export{n as default};
