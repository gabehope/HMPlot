# Spherical coordinates

Longitude–latitude data becomes a globe or a wrapping map, with a linked overview.

## Svelte

```svelte
<Plot coordinates="spherical" type={mode}
  projection="equirectangular" overview>
  <Heatmap fill={density} textureResolution={[1024, 512]}>
    <Points position={observations} onclick={inspect} />
  </Heatmap>
</Plot>
```
