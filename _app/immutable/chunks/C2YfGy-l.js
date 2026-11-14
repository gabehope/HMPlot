const o=`import hmplot as hm

data = {"x":[1,2,3,4,5,6],"y":[2,4,3,6,5,7],"group":["A","A","A","B","B","B"],"score":[10,25,40,60,75,95]}

norm = hm.normalization(domain=[0, 100])
colors = hm.continuous(normalization=norm, colormap=hm.colormap(["#fdd49e", "#ef6548", "#7f0000"]))
sizes = hm.continuous(normalization=norm, range=[8, 22])

with hm.Plot(data=data, height=340, axes2d=True) as plot:
    hm.Points(x="x", y="y", fill="score", size="score",
                     fill_scale=colors, size_scale=sizes)

plot
`;export{o as default};
