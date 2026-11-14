# Market hours: an axis that skips weekends and nights

Half-hourly prices on an axis that leaves out weekends and the hours outside a 09:30 to 16:00 session in New York; the line runs on from each close to the next open, and a brush can span a break.

## Python

```python
with hm.Plot(data=prices, axes2d=True, x={"timezone": "America/New_York", "breaks": ["weekends", {"hours": [16, 9.5]}]}) as plot:
    hm.Line(x="t", y="price")
    hm.Points(x="t", y="price", size=2, brush=True, respond="brushed")
plot
```

## Svelte

```svelte
<Plot {data} axes2d x={{ timezone: "America/New_York", breaks: ["weekends", { hours: [16, 9.5] }] }}>
  <Line x="t" y="price" />
  <Points x="t" y="price" size={2} brush respond="brushed" />
</Plot>
```
