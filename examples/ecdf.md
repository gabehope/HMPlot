# ECDFs by species

Each penguin species' body mass as steps: the fraction of its penguins at or below each mass.

## Svelte

```svelte
<Provider url="/data/penguins/penguins.csv" format="csv">
  <Plot axes2d>
    <Ecdf bind:this={chart} x="body_mass_g" by="species" />
    <Legend for={chart} channel="color" position="right" />
  </Plot>
</Provider>
```
