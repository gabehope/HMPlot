const t=`import hmplot as hm

data = {"x":[1,2,3,4,5,6],"y":[2,4,3,6,5,7],"group":["A","A","A","B","B","B"],"score":[10,25,40,60,75,95]}

with hm.Plot(data=data, height=340, axes2d=True) as plot:
    hm.Points(x="x", y="y", size=4)

plot
`;export{t as default};
