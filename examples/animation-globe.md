# Animated globe

Change targets during a transition. Data and appearance interpolate on the GPU.

## Svelte

```svelte
<Plot animationDuration={700} animationEasing="cubic-in-out">
  <Heatmap animation={true} fill={density} surfaceMode zScale={height} />
</Plot>
```
