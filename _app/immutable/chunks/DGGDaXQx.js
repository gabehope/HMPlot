const t=`import hmplot as hm

data = {"x": [1, 2, 3], "y": [2, 3, 1], "word": ["one", "two", "three"]}
with hm.Plot(data=data, height=300, axes2d=True) as plot:
    hm.Text(x="x", y="y", text="word")
plot
`;export{t as default};
