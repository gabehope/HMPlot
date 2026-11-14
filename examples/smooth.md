# A fitted curve that refits under a brush

Smooth fits a curve (linear, polynomial, log, exp or power) with its 95% confidence band on the GPU: penguins' body mass against flipper length. Brush some penguins and the fit follows them.

## Svelte

```svelte
<InputContext>
  <Select name="method" options={["linear", "poly", "log", "exp", "pow"]} value="linear" label="Fit" />
  <Provider url="/data/penguins/penguins.csv" format="csv">
    <Plot axes2d legend x={{ domain: [170, 235] }} y={{ domain: [2500, 6500] }}>
      <Points x="flipper_length_mm" y="body_mass_g" fill="species" brush respond="brushed" />
      <Filter where="@brushed" inactive="all">
        <Smooth x="flipper_length_mm" y="body_mass_g" method={input("method")} />
      </Filter>
    </Plot>
  </Provider>
</InputContext>
```
