# datetimeCoordinates

Turn dates into millisecond offsets from an origin, for a datetime axis.

## Example

```svelte
const { values, origin } = datetimeCoordinates(dates);
<Plot data={{ time: values, value }} x={{ type: "datetime", origin }}>…</Plot>
```

## Parameters

- `values` (`Date[] | number[]`): Dates or Unix milliseconds.
- `origin` (`number`): The epoch the offsets count from (default the first).

## Usage

Returns values and origin. Subtracting an epoch origin preserves float32 precision. Use that same origin in the datetime axis definition. Python can subtract the origin before supplying numerical columns.

## Related examples

- [Long time series](/HMPlot/examples/timeseries.md)
