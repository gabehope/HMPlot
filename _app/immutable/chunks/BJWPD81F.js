const t=`import hmplot as hm

data = {"x":[1,2,3,4,5,6],"y":[2,4,3,6,5,7],"group":["A","A","A","B","B","B"],"score":[10,25,40,60,75,95],"id":["point-1","point-2","point-3","point-4","point-5","point-6"]}

with hm.Plot(data=data, key="id", height=340, axes2d=True) as plot:
    points = hm.Points(x="x", y="y", fill="group", size=6,
                              select=True, respond="selected", hover=True)

plot
`;export{t as default};
