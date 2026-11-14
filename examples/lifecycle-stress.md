# Interrupted keyed transitions

Interrupt keyed updates while points, halos, and labels use different fade timings and preserve interaction state.

## Python

```python
with hm.Plot(data=observations, key="id") as plot:
    hm.Points(x="x", y="y", animation=True,
        animation_duration=520, enter_effect="fade", exit_effect="fade",
        select=True, hover=True, brush=True, respond=True)
    hm.Text(x="x", y="y", text="label", animation=True,
        animation_duration=240, enter_effect="fade", exit_effect="fade")

observations.replace(next_frame)
await plot.when_animations_finished()
```

## Svelte

```svelte
<Plot data={observations} key="id">
  <Points x="x" y="y" animation animationDuration={900}
    enterEffect="fade" exitEffect="fade" respond="selected" />
  <Points x="x" y="y" animation animationDuration={520}
    enterEffect="fade" exitEffect="fade" select hover brush respond={true} />
  <Text x="x" y="y" text="label" animation animationDuration={240}
    enterEffect="fade" exitEffect="fade" respond={["selected", "hovered"]} />
</Plot>
```
