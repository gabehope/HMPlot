const t=`import hmplot as hm

data = {"x":[1,2,3,4,5,6],"y":[2,4,3,6,5,7],"group":["A","A","A","B","B","B"],"score":[10,25,40,60,75,95]}

with hm.Facet(data=data, column="group", wrap=2) as facet:
    with hm.Plot(height=280, axes2d=True):
        hm.Points(x="x", y="y", fill="group", size=6)

facet
`;export{t as default};
