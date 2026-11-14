const e=`import hmplot as hm

data = {"x":[1,2,3,4,5,6],"y":[2,4,3,6,5,7],"group":["A","A","A","B","B","B"],"score":[10,25,40,60,75,95]}

with hm.Theme(value=hm.themes.paper) as themed:
    with hm.Plot(data=data, height=340, axes2d=True):
        points = hm.Points(x="x", y="y", fill="group", shape="group", size="score")
        hm.Legend(target=points, channel="fill", label="Group")
        hm.Legend(target=points, channel="size", label="Score", position="right")

themed
`;export{e as default};
