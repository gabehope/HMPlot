# Point symbols

Eight flat symbols, inward outlines, rotation, and GPU picking.

## Svelte

```svelte
<Points position={points} shape={shape}
  size={12}
  outlineWidth={0.95}
  outlineColor="#30343b" fill="#e9b873"
  onclick={(event) => select(event.instanceId)} />
```
