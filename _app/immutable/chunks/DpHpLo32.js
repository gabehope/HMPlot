const t=`import hmplot as hm

data = {"hour":[0,3,6,9,12,15,18,21,24],"activity":[1,0.6,1.4,2.4,2.8,2.5,2.2,1.6,1]}

with hm.Plot(data=data, coordinates="polar", angle_unit="custom", angle_period=24,
             x={"domain":[0,24]}, y={"domain":[0,3]}, height=340, axes2d=True) as plot:
    hm.Line(x="hour", y="activity", color="#547ba2")
    hm.Points(x="hour", y="activity", size=5)

plot
`;export{t as default};
