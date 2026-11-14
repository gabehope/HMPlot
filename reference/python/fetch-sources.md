# Fetch sources

fetchJSON, fetchCSV, fetchArrow and fetchParquet: a Provider's source that fetches a URL template.

JavaScript only.

## Example

```svelte
<script>
  import { Provider, Plot, Points, fetchCSV } from "hmplot";
  // init: fetch's options. A source with init shares its loads with no other source.
  const quakes = fetchCSV("/data/earthquakes/by-year/{year}.csv", { init: { headers: { Accept: "text/csv" } } });
</script>

<Provider source={quakes} params={{ year: 2024 }}>
  <Plot axes2d><Points x="lon" y="lat" /></Plot>
</Provider>
```

## Functions

- `fetchJSON(url, {path, init})` (`ProviderSource`): Fetches JSON: rows, columns or a GeoJSON FeatureCollection; path is a dot path to the rows in the response ("results", "data.items").
- `fetchCSV(url, {init})` (`ProviderSource`): Fetches CSV: a column whose non-empty cells all read as numbers is numeric (unless the Provider's schema says categorical, ordinal or boolean), the others text; an empty cell is missing.
- `fetchArrow(url, {init})` (`ProviderSource`): Fetches an Arrow IPC file or stream as an Arrow Table, whose columns keep their types (apache-arrow, loaded on first use).
- `fetchParquet(url, {columns, init})` (`ProviderSource`): Reads a Parquet file with HTTP range requests: the footer, then only the pages of columns when given (hyparquet, loaded on first use). The server must answer range requests.

## Usage

Each function returns a `source` for a [Provider](provider): an object with an id, a request key and a `load(context)` that fetches the URL with the Provider's `params` filled in and returns what Data reads. A Provider's `url`, `format`, `path` and `columns` props build the same sources, and Python's `hm.Provider(url=..., format=...)` is the only form Python has. Call a helper yourself to pass fetch options, or to share one source object between Providers.

The `url` is a template with `{name}` placeholders, filled from the Provider's `params` (URL-encoded), or a function of the params that returns the URL; the filled URL is the request key, so a param the URL does not use reloads nothing. `init` is fetch's options: headers, credentials, a method and a body. The Provider's own signal aborts the request when a newer one supersedes it.

A response that is not OK is an error naming the status and URL (`HTTP 404 Not Found: /data/2031.csv`). The helpers keep a response's ETag (or Last-Modified) as its version and send `If-None-Match` (or `If-Modified-Since`) when they refresh the result on screen, so an unchanged file publishes nothing; a Parquet source has no version and reads the file again. Two Providers share one load in flight when their sources are equal: the same URL template, format, path and columns, and no `init`. A source with `init` shares only with itself, since its headers can change the response and are never compared or written into a request key.

`fetchArrow` and `fetchParquet` load apache-arrow and hyparquet the first time they run, so a page that never reads those formats does not carry them. See docs/PROVIDERS.md for the load lifecycle, and docs/DATA.md, "Arrow and Parquet", for how their column types arrive.

## Related examples

- [Earthquakes by year, loaded on demand](/HMPlot/examples/provider-earthquakes.md)
- [Earthquakes from a Parquet file](/HMPlot/examples/parquet-earthquakes.md)
