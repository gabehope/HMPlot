const t=`import hmplot as hm

data = {"x":[1,2,3,4,5,6],"y":[2,4,3,6,5,7],"group":["A","A","A","B","B","B"],"score":[10,25,40,60,75,95]}

def trend(data):
    with hm.Plot(data=data, height=340, axes2d=True, background="white") as plot:
        hm.Line(x="x", y="y", color="#547ba2")
        hm.Points(x="x", y="y", fill="#547ba2")
    return plot

plot = trend(data)
plot
`;export{t as default};
