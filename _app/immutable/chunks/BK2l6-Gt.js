const t=`import hmplot as hm

data = {
    "fruit": ["apple", "pear", "apple", "plum", "pear", "apple"],
    "amount": [3, 5, 2, 4, 1, 6],
}
with hm.Plot(data=data, height=300, axes2d=True) as plot:
    with hm.Group(by="fruit", columns={"total": hm.sum("amount")}):
        hm.charts.Bar(x="fruit", y="total")
plot
`;export{t as default};
