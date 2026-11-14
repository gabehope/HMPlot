# Provider

A table loaded asynchronously, from a URL or a load function, for the components inside it.

## Example

```python
import hmplot as hm

# Palmer penguins, from vega-datasets on a CDN that allows any page to fetch it.
with hm.Provider(url="https://cdn.jsdelivr.net/npm/vega-datasets@2/data/penguins.json", format="json") as penguins:
    with hm.Plot(height=300, axes2d=True):
        hm.Points(x="Beak Length (mm)", y="Beak Depth (mm)")
penguins
```

## Options

Keywords are snake_case.

- `url` (`string | (params) => string`): The address to fetch, instead of `source`, with {name} placeholders filled from params. In Svelte markup write it as a string expression: url={"/data/{year}.csv"}.
- `format` (`"json" | "csv" | "arrow" | "parquet"`): How the fetched file is read: JSON rows, CSV, an Arrow IPC file, or Parquet read by byte ranges. Default: `"json"`.
- `path` (`string`): For JSON, a dot path to the rows in the response, such as "data.items".
- `columns` (`column[]`): For Parquet, the columns to read; the others are never downloaded.
- `params` (`object`): The load's inputs, as plain JSON values that fill the url's placeholders; a change that makes a new request loads again.
- `key` (`column | column[]`): The column (or columns) that identify a row, as on Data, so selections follow rows across loads.
- `schema` (`Record<string, type | {type, domain, unit, timezone}>`): Column types, as on Data.
- `initial` (`table`): A table shown until the first load completes, so the components inside mount at once.
- `debounce` (`number`): How long a change of params waits for the next one before loading. Default: `150` ms.
- `refresh_interval` (`number`): Loads again this long after the last load ended; it pauses while the page is hidden. In ms.
- `accumulate` (`boolean | {maxRows}`): Merge each completed load into the table on screen instead of replacing it: with key, a re-sent row updates in place and new keys append; without, rows append in arrival order. {maxRows} keeps the newest rows. New params start a fresh table, and a url's {version} placeholder asks for rows since the result on screen. Default: `False`.
- `refresh` (`number | string`): Each change of its value loads again with the same params (a Button's count works: refresh={input("reload")}).
- `snapshot` (`boolean`): Whether exported HTML embeds the last result and never fetches; false loads when the exported page opens. Default: `True`.
- `name` (`string`): The provider's name in its status.

## Usage

A `Provider` is a `Data` scope whose table is loaded asynchronously. Give it a `source` — a `load(context)` function, or `{ load, requestKey }` — or a `url` with `{name}` placeholders (`fetchJSON` and `fetchCSV` build the same sources), and the explicit `params` the load depends on. It loads when it mounts and whenever `params` change to a new request key, after `debounce` (150 ms) so a dragged slider loads once it pauses. Downstream, a new result is an ordinary Data value change: transforms re-run, keyed updates animate, and selections follow `key`.

While a load runs, the previous result stays on screen, and a newer request aborts the one in flight (its `signal` fires; a result that still arrives is dropped). Going back to the params on screen loads nothing. A failed load keeps the previous result, shows the error and calls `onerror`. `refreshInterval` polls: ticks never overlap a load, pause while the page is hidden, and a result with an unchanged version (an ETag for the fetch helpers) publishes nothing. The children mount with the first result, or at once with `initial`.

`whenSettled()` and every export of a Plot below wait for a load already requested, but not for future refresh ticks, and not for Providers elsewhere on the page. In Python scenes, assigning `provider.params` returns at once and the plot keeps rendering while the browser loads; `when_settled()` and the exports wait for it. Exported HTML embeds the last result (`snapshot`, the default) or loads when opened (`snapshot=False`).

`bind:this` gives a `ProviderHandle`: `refresh()` loads the same params again and resolves once the result is shown (or found unchanged), `whenSettled()` waits for the loads already requested, `subscribe(listener)` reports its status as a transform's (pending while it loads, and its error), and `getResult()` returns the `ProviderResult` on screen: `data` as the load returned it, its `version`, request `key` and `revision`. `getSelection()`, `getBrush()`, `getHover()`, `getOffsets()`, `resetOffsets()` and `applyOffsets()` act on its table as a Data's do. In Python, `await provider.refresh()` loads again.

In Svelte markup, pass a URL template as a JavaScript string, `url={"/data/{year}.csv"}`: in a quoted attribute Svelte would read `{year}` as an expression. See docs/PROVIDERS.md for the lifecycle, static sites, REST APIs and exports.

## Related examples

- [Earthquakes by year, loaded on demand](/HMPlot/examples/provider-earthquakes.md)
