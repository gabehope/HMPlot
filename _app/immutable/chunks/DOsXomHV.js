const a=`import hmplot as hm


class Panel(hm.Template):
    def build(self, data):
        with hm.Plot(data=data, height=300, axes2d=True):
            hm.slot()


data = {"x": [1, 2, 3, 4], "y": [3, 1, 4, 2]}
with Panel(data) as panel:
    hm.Points(x="x", y="y")
panel
`;export{a as default};
