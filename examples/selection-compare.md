# Multiple selection sets

Build two named selection sets in separate projections and inspect their overlap in a third view.

## Python

```python
primary, comparison = hm.selection(), hm.selection()
with hm.Data(observations, key="id"):
    with hm.Interaction(columns={"@primary": primary, "@comparison": comparison}):
        with hm.Row():
            with hm.Plot():
                hm.Points(x="x", y="y", select=primary, hover=True)
            with hm.Plot():
                hm.Points(x="u", y="v", select=comparison, hover=True)
```

## Svelte

```svelte
<script>
  const primary = selection(), comparison = selection();
</script>
<Data value={observations} key="id">
  <Interaction columns={{ "@primary": primary, "@comparison": comparison }}>
    <Plot><Points x="x" y="y" select={primary} hover /></Plot>
    <Plot><Points x="u" y="v" select={comparison} hover /></Plot>
    <Plot><Filter where={["@primary", "@comparison"]} inactive="none">
      <Text x="x" y="y" text="id" />
    </Filter></Plot>
  </Interaction>
</Data>
```
