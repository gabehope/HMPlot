const n=`import hmplot as hm

# A warped chart and a rigid tangent inset on an orthographic sphere, and a polar dial inside the
# inset with a 24-unit turn. The slider turns the globe (its projection center); dragging the plot
# turns it too.
latitudes = [-90 + 6 * i for i in range(31)]
longitudes = [-180 + 6 * i for i in range(61)]
graticule = ([[lon, lat] for lon in (-120, -60, 0, 60, 120, 180) for lat in latitudes]
             + [[lon, lat] for lat in (-60, -30, 0, 30, 60) for lon in longitudes])
# The horizon: the meridians 90 degrees either side of the center, which follow the slider.
horizon = {"lat": latitudes * 2, "side": [-90] * 31 + [90] * 31}
hidden = {"visible": False}

with hm.Scene(gap=12) as scene:
    with hm.Row(wrap=True, min_width=0):
        hm.Slider(name="center", label="Globe center", min=-60, max=60, value=0, format=".0f")
    with hm.Plot(type="2d", height=440, background="#f7f9fc"):
        with hm.Frame(name="Globe", coordinates="spherical", projection="orthographic",
                      projection_center=[hm.input.center, 0],
                      x={"domain": [-180, 180], **hidden}, y={"domain": [-90, 90], **hidden}):
            hm.Points(position=graticule, size=1.5, fill="#b7c9dc")
            with hm.Data(horizon):
                with hm.Calculate(lon=hm.input.center + hm.col.side):
                    hm.Points(x="lon", y="lat", size=2, fill="#8faac5")
            # Parent-data ranges: the chart covers 0 to 45 degrees east and 20 degrees either side
            # of the equator, and bends with the sphere.
            with hm.Frame(name="Warped chart", coordinates="cartesian",
                          x={"domain": [-1, 1], "range": [0, 45], **hidden},
                          y={"domain": [-1, 1], "range": [-20, 20], **hidden}):
                hm.Points(position=[[-1, -1], [1, -1], [-1, 1], [1, 1], [0, 0]], size=9, fill="#3679b7")
            # A placement: a rigid 100-pixel square on the surface at 35 degrees west, facing out.
            with hm.Frame(name="Tangent inset", coordinates="cartesian",
                          placement={"anchor": [-35, 0], "size": [100, 100], "orientation": "tangent"},
                          x={"domain": [-1, 1], **hidden}, y={"domain": [-1, 1], **hidden}):
                hm.Points(position=[[-1, -1], [1, -1], [-1, 1], [1, 1]], size=6.5, fill="#d4773e")
                with hm.Frame(name="Polar dial", coordinates="polar", angle_unit="custom", angle_period=24,
                              placement={"anchor": [0, 0], "size": [42, 42]},
                              x={"domain": [0, 24], **hidden}, y={"domain": [0, 1], **hidden}):
                    hm.Points(position=[[0, 1], [6, 1], [12, 1], [18, 1]], size=5.5, fill="#26364b")
    hm.Markdown("Blue points use parent-data ranges and bend with the orthographic sphere. Orange points form a "
                "rigid tangent inset. Its inner polar dial has a custom 24-unit turn: 6 units are a quarter "
                "turn. Move the slider or drag the plot to rotate the globe.", font_size=13, color="#667085")
`;export{n as default};
