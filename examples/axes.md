# Axes & datetime

Calendar-aware labels, major/minor grids, reference rules, and axis-specific zoom.

## Svelte

```svelte
const { values, origin } = datetimeCoordinates(dates);
<Plot axes2d x={{ type: 'datetime', origin,
  timezone: 'America/New_York', format: '%H:%M' }} axisMarginZoom>…</Plot>
```
