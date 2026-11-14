const o=`import hmplot as hm

data = {"x":[1,2,3,4,5,6],"y":[2,4,3,6,5,7],"group":["A","A","A","B","B","B"],"score":[10,25,40,60,75,95],"lower":[1.2,3.2,2.2,5.2,4.2,6.2],"upper":[2.8,4.8,3.8,6.8,5.8,7.8]}

with hm.Plot(data=data, height=340, axes2d=True) as plot:
    hm.Area(x="x", lower="lower", upper="upper", fill="#547ba2", opacity=0.2)
    hm.Line(x="x", y="y", color="#315878", width=2)
    hm.Points(x="x", y="y", fill="#315878", size=4)

plot
`;export{o as default};
