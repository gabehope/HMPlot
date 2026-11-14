const a=`import hmplot as hm

data = {"day": [0, 1, 2, 3, 4], "value": [2, 4, 3, 6, 5]}
with hm.Plot(data=data, height=300, x={"label": "Day"}, y={"label": "Value"}) as plot:
    with hm.Shift(field="day", interval=1):
        hm.Line(x="original", y="value", color="#2468a0", name="original")
        hm.Line(x="shifted", y="value", color="#d34b37", name="shifted")
plot
`;export{a as default};
