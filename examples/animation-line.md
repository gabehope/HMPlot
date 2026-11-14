# Animated line

Change targets during a transition. Data and appearance interpolate on the GPU.

## Svelte

```svelte
<Plot animationDuration={700} animationEasing="cubic-in-out">
  <Line animation={true} position={points} />
</Plot>
```
