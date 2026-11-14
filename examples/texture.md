# Interactive textures

Points and paths painted into a heatmap texture remain clickable on its surface.

## Svelte

```svelte
<Heatmap fill={density} textureResolution={[1024, 512]}>
  <Line position={curve} width={2} />
  <Points position={points} onclick={inspect} />
</Heatmap>
```
