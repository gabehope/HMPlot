import hmplot as hm

# Three keyed states of a few observations. Each press of the button moves to the next state:
# observations whose id stays move, new ids fade in and removed ids fade out.
states = [
    {"A": (0.18, 0.28), "B": (0.39, 0.65), "C": (0.65, 0.32)},
    {"B": (0.27, 0.55), "C": (0.58, 0.56), "D": (0.82, 0.72)},
    {"A": (0.24, 0.72), "C": (0.53, 0.25), "E": (0.75, 0.48)},
]
# One row per id, with its position in each state (missing where the state leaves it out).
ids = ["A", "B", "C", "D", "E"]
observations = {"id": ids}
for s, state in enumerate(states):
    observations[f"x{s}"] = [state.get(i, (None, None))[0] for i in ids]
    observations[f"y{s}"] = [state.get(i, (None, None))[1] for i in ids]
# The status line of each state, drawn in the plot's corner.
labels = {"state": [0, 1, 2], "text": [f"State {s + 1}: {', '.join(state)}" for s, state in enumerate(states)]}

# The button counts its presses: the state is that count modulo 3.
stage = hm.input.next - hm.floor(hm.input.next / 3) * 3
def at_stage(column):
    return hm.where(stage == 0, hm.col[f"{column}0"], hm.where(stage == 1, hm.col[f"{column}1"], hm.col[f"{column}2"]))

with hm.Scene(gap=12) as scene:
    hm.Markdown("`animation` moves retained IDs; `enter_effect=\"fade\"` and `exit_effect=\"fade\"` animate opacity. "
                "Press the button for the next keyed update; click a point to select it, and the selection "
                "follows its id.")
    with hm.Row(wrap=True, min_width=0):
        hm.Button(name="next", label="Next keyed update")
    with hm.Plot(height=420, axes2d=True, animation_duration=550, x={"domain": [0, 1]}, y={"domain": [0, 1]}):
        with hm.Data(observations, key="id"):
            with hm.Calculate(x=at_stage("x"), y=at_stage("y")):
                with hm.Filter(where=hm.is_finite(hm.col.x)):
                    hm.Points(x="x", y="y", size=10, fill="#547ba2", outline_color="#263545", outline_width=0.4,
                              animation=True, enter_effect="fade", exit_effect="fade", select=True, respond="selected")
                    hm.Text(x="x", y="y", text="id", dy=-20, size=14, color="#40505d",
                            animation=True, enter_effect="fade", exit_effect="fade")
        with hm.Data(labels):
            with hm.Filter(where=hm.col.state == stage):
                hm.Text(x=0.02, y=0.97, text="text", align="left", size=13, color="#40505d")
