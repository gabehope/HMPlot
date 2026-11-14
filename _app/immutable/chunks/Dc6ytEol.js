const e=`import numpy as np
import hmplot as hm

# 80 keyed rows. Each frame shows 48 of them: the window starts 8 IDs further on every frame
# (wrapping around), so 8 IDs leave, 8 enter and the rest move to a new height. The frame and the
# row order are inputs: every step of the slider, and the checkbox, is one keyed update.
k = np.arange(80)
records = {
    "id": [f"row-{i}" for i in k],
    "k": k,
    "group": np.array(["A", "B", "C", "D"])[k % 4],
    "x": 0.1 + 0.8 * ((k * 17) % 79) / 78,
}
# Each row's place in this frame's window (48 or more: not shown), and its height.
start = hm.col.k - 8 * hm.input.frame
place = start - hm.floor(start / 80) * 80
height = 0.5 + 0.34 * hm.sin(hm.col.k * 0.6 + hm.input.frame * 0.12)

with hm.Scene(gap=12) as keyed:
    hm.Markdown("Select a few points, hover, then step the frame or reverse the rows. Surviving IDs retain selection; "
                "removed IDs disappear. Point fades last 500 ms and label fades last 200 ms. No automatic timer runs: "
                "every update is explicit (frame 0 is the starting data). Hover size is immediate unless the "
                "configured animation applies.")
    with hm.Row(wrap=True, min_width=0):
        hm.Slider(name="frame", label="Frame", min=0, max=20, step=1, value=0)
        hm.Checkbox(name="reverse", label="Reverse row order")
    with hm.Plot(data=records, key="id", height=480, axes2d=True, x={"domain": [0, 1]}, y={"domain": [0, 1]}):
        with hm.Calculate(place=place, y=height, order=hm.where(hm.input.reverse, -place, place)):
            with hm.Filter(where=hm.col.place < 48):
                with hm.Sort(by="order"):
                    hm.Points(x="x", y="y", fill="group", size=hm.where("@hovered", 12, 7), hover=True,
                              select=True, brush=True, respond=["hovered", "selected", "brushed"],
                              animation=True, animation_duration=500, enter_effect="fade", exit_effect="fade")
                    hm.Text(x="x", y="y", text="id", size=10, dy=-17, respond=["selected", "hovered"],
                            selection_opacity=0.15, animation=True, animation_duration=200, enter_effect="fade", exit_effect="fade")
`;export{e as default};
