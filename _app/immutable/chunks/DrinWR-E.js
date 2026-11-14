const e=`import hmplot as hm

cars = {"model": ["Civic", "Corolla", "Golf", "Model 3", "Prius", "Mustang"],
        "mpg": [36.0, 34.0, 31.0, 132.0, 52.0, 18.0], "weight": [1250, 1300, 1350, 1610, 1380, 1700]}
with hm.Scene() as scene:
    with hm.Data(cars):
        with hm.Plot(height=260, axes2d=True):
            hm.Points(x="weight", y="mpg", brush=True)
        with hm.Filter(where="@brushed", inactive="all"):
            with hm.Sort(by="mpg", order="desc"):
                hm.TableView(columns=["model", {"field": "mpg", "format": ".0f"}], limit=5, title="Most efficient")
scene
`;export{e as default};
