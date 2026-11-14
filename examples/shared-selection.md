# Explicit shared selection

Name one reusable selection, expose it as a virtual column, and share it across views.

## Python

```python
focus = hm.selection()
with hm.Data(observations, key="id"):
    with hm.Interaction(columns={"@focus": focus}):
        with hm.Plot():
            hm.Points(x="x", y="y", select=focus,
                             respond=focus)
        with hm.Plot():
            with hm.Filter(where="@focus", inactive="all"):
                hm.Points(x="x", y="y")
```

## Svelte

```svelte
<script>const focus = selection();</script>
<Data value={observations} key="id">
  <Interaction columns={{ "@focus": focus }}>
    <Plot><Points x="x" y="y" select={focus} respond={focus} /></Plot>
    <Plot><Filter where="@focus" inactive="all">
      <Points x="x" y="y" />
    </Filter></Plot>
  </Interaction>
</Data>
```
