# Images

Grayscale and RGB tensors retain their original colors, with nearest-neighbor pixels.

## Svelte

```svelte
<Plot toneMapping={0}>
  <Image data={rgb} pixelated={true} />
</Plot>
```
