# Faceted interaction state

Select, hover, and brush in linked facet cells while a detail plot consumes the shared keyed state.

## Python

```python
with hm.Data(observations, key="id"):
    with hm.Facet(column="region", wrap=3, scales="shared", link="xy"):
        with hm.Plot():
            hm.Points(x="x", y="y", select=True, hover=True,
                             brush=True, respond=True)
    with hm.Plot():
        with hm.Filter(where="@selected", inactive="none"):
            hm.Points(x="x", y="y")
            hm.Text(x="x", y="y", text="id")
```

## Svelte

```svelte
<Data value={observations} key="id">
  <Facet column="region" wrap={3} scales="shared" link="xy">
    <Plot><Points x="x" y="y" select hover brush respond={true} /></Plot>
  </Facet>
  <Plot><Filter where="@selected" inactive="none">
    <Points x="x" y="y" /><Text x="x" y="y" text="id" />
  </Filter></Plot>
</Data>
```
