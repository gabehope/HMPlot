# Providers: data loaded asynchronously

A `Provider` is a `Data` scope whose table is loaded asynchronously: from a REST query that
follows a slider, a file chosen by a param, or a result computed elsewhere. Downstream nothing is
new: transforms, marks, keyed updates, animation and selections see an ordinary Data value
change each time a load completes.

```svelte
<script>
  import { Provider, Plot, Points } from "hmplot";
  let species = $state("Adelie");
  const penguins = {
    async load({ params, signal }) {
      const response = await fetch(`/api/penguins?species=${params.species}`, { signal });
      return response.json();
    },
    requestKey: ({ params }) => params.species, // optional; default: stable JSON of params
  };
</script>

<Provider source={penguins} params={{ species }} key="id" refreshInterval={30000}>
  <Plot axes2d><Points x="bill_length" y="bill_depth" fill="island" /></Plot>
</Provider>
```

```python
with hm.Provider(url="https://example.org/api/penguins?species={species}",
                 params={"species": "Adelie"}, key="id", refresh_interval=30_000) as penguins:
    with hm.Plot(axes2d=True):
        hm.Points(x="bill_length", y="bill_depth", fill="island")
penguins          # display it

penguins.params = {"species": "Gentoo"}   # the browser reloads
await penguins.refresh()                  # load the same params again
```

The gallery example "Earthquakes by year, loaded on demand" (`provider-earthquakes`) loads one
static CSV per year.

## Sources

- `source` (JavaScript): a function `load(context)`, or `{ load, requestKey?, id? }`. `load`
  returns (or resolves to) anything `Data` accepts: row objects, a column object of host,
  typed or JAX arrays, or a GeoJSON FeatureCollection. It may also return `{ data, version }`:
  a result whose version equals the one on screen (for the same request key) publishes nothing.
- `context` is `{ params, signal, revision, version, refresh, view }`:
  - `params`: a frozen copy of the params the load was requested with.
  - `signal`: an AbortSignal, aborted when a newer request supersedes this one or the Provider
    unmounts. Pass it to `fetch`.
  - `revision`: increases with every request.
  - `version`: on a refresh of the result on screen, that result's version, so a load can ask
    the server whether it changed.
  - `refresh`: true for `refresh()` and refresh ticks.
  - `view`: reserved for view-dependent sources; undefined. (VectorTile streams map tiles itself,
    TODO 35; a general view-dependent Provider is under Stage 35's "Later".)
- `url`, `format` (`"json"`, `"csv"`, `"arrow"` or `"parquet"`), `path` and `columns` build a
  fetch source, as `fetchJSON(url, { path, init })`, `fetchCSV(url, { init })`,
  `fetchArrow(url, { init })` and `fetchParquet(url, { columns, init })` do in JavaScript:
  - `url` is a string with `{name}` placeholders, filled from `params` (URL-encoded), or a
    function of `params`. The request key is the resolved URL, so a param the URL does not use
    reloads nothing. **In Svelte markup pass the template as a JavaScript string,
    `url={"/data/{year}.csv"}`**: in a quoted attribute, Svelte reads `{year}` as an expression.
  - `path` (JSON) is a dot path to the rows in the response: `"results"`, `"data.items"`.
  - `"arrow"` reads an Arrow IPC file or stream into an Arrow Table (apache-arrow, loaded on
    first use); the table's columns keep their types (docs/DATA.md, "Arrow and Parquet").
  - `"parquet"` reads a Parquet file with HTTP range requests (hyparquet with its codecs:
    snappy, zstd, gzip, brotli, lz4; loaded on first use): the footer, then only the pages of
    `columns` when they are given, so the other columns are never downloaded. The server must
    answer range requests (static hosts and object stores do). INT64 columns stay exact on the
    host, timestamps are datetimes, and missing values are missing. A Parquet source has no
    version: a refresh reads the file again.
  - CSV: a column whose non-empty cells all read as numbers is numeric; the others are strings;
    an empty cell is missing. Dates stay strings.
  - `init` (JavaScript) is fetch's options: headers, credentials, a method and body. The signal
    is always the context's. A source with `init` shares loads only with itself (see "Supersede"
    below): its options can change the response.
  - A response that is not OK is an error naming the status and URL
    (`HTTP 404 Not Found: /data/2031.csv`). The helpers keep a response's ETag (or
    Last-Modified) as its version and send `If-None-Match` (or `If-Modified-Since`) when they
    refresh the result on screen: a 304 publishes nothing. A refresh without a version asks
    the server to revalidate instead of reading the HTTP cache.
- `params` must be JSON-compatible plain values: numbers, strings, booleans, null, arrays and
  plain objects (pass a Date as a string). They are the load's explicit inputs: Svelte cannot
  track state read inside an async function, and explicit params give the default request key
  and map directly to Python.
- A param can read an input (docs/INPUTS.md): `params={{ year: input("year") }}`, Python
  `params={"year": hm.input.year}`. A moved input is a params change (see "Params changes"
  below).

## Lifecycle

- **First load.** The Provider loads when it mounts. Its children mount with the first result,
  or at once with `initial`, which is shown until then. `schema` alone only declares column
  types. There is no placeholder element.
- **Params changes.** A change waits `debounce` milliseconds (default 150) for the next one, so
  a dragged slider loads once it pauses. The new request key is compared with the request
  pending (waiting or loading), if any, else with the result on screen: an equal key does
  nothing, and going back to the key on screen drops the pending request (A to B to A loads
  nothing). A new `source` or `url` loads at once.
- **Supersede.** A newer request aborts the one in flight: its signal fires, and a result that
  still arrives is dropped. Two Providers with the same source and request key share one load
  while it is in flight; it is aborted only when both have given it up. The same source is the
  same `source` object, or fetch sources with the same format, URL template, `path` and
  `columns` and no `init`; a url function is the same source only under the same format, path
  and columns, and a fetch source with `init` only as the same object (one made per Provider
  never shares, so two accounts' headers never meet in one load). Loads share under one
  `schema` only. `refresh()` and
  refresh ticks never join a load already running: they ask for new data. There is no cache of
  completed results (A to B to A, with B shown, loads A again).
- **While loading**, the last complete result stays on screen: nothing flashes empty.
  `status.pending` is true.
- **Errors.** A load that rejects, a result Data cannot read, or bad params keep the previous
  result on screen, set `status.error`, call `onerror({ error, revision })` and show an alert
  after the children (inside a Plot, on the plot's error surface). The next successful load
  clears it.
- **Published.** `onload({ revision, rows, ms })` runs after each published result (not after an
  unchanged one). Keyed data keeps selections, brushes and hover on their keys, and keyed
  marks animate their rows as on any Data update. A result with a new row count compiles new
  GPU kernels where a Data update would (docs/RENDERING.md, "What recompiles"); a same-length
  result compiles nothing.
- **`key` and `schema`** apply to the result on screen without a reload, as on Data.

## Refreshing

- `refresh()` loads again with the same params, even though the request key is unchanged. It
  supersedes a load in flight, resolves when the result is shown (or unchanged) and rejects
  with the load's error.
- `refresh` (a prop, Python `refresh=`) is a trigger: each change of its value refreshes, and
  the first value does nothing. Read a Button in it (`refresh={input("reload")}`, Python
  `refresh=hm.input.reload`) for a Reload button; see docs/INPUTS.md.
- `refreshInterval` (Python `refresh_interval`) refreshes every so many milliseconds, counted
  from the end of the last load. A tick while a request is pending is skipped, so loads never
  overlap. Ticks pause until the first result, while the page is hidden and while an enclosing
  Facet cell is inactive; when they resume, a tick that is due runs at once.
- A failed tick keeps the previous result, and the next tick retries. Backoff, retry counts and
  push sources (server-sent events, WebSockets) are later work.

## Accumulating a feed

Some feeds return only what is new ("events since X", "the last 100 readings"). `accumulate`
(Python `accumulate=`) merges each completed load into the table on screen instead of replacing
it, so the plot shows a growing table:

- With `key`, a row whose key is on screen updates in place (its selection and keyed animation
  follow it) and new keys append. Without `key`, rows append in arrival order.
- `accumulate={{ maxRows: 500 }}` (Python `{"max_rows": 500}`) keeps the newest 500 rows; plain
  `true` keeps every row, so a long-running page grows without bound. Order is arrival; a Sort
  below the Provider orders by a column.
- The cursor: the `version` a load returned reaches the next load as `context.version`, and a
  `{version}` placeholder in `url` asks a url source for rows since it
  (`/events?since={version}`); the first request has none, so `{version}` is empty. A param
  named `version` fills the placeholder instead.
- Refresh ticks, `refresh()` and the `refresh` trigger merge. New params (a new request key)
  start a fresh table. A failed load keeps the accumulated rows, as an error keeps today's
  result, and a superseded load merges nothing.
- Each load must have the columns on screen; a load that lacks or adds one is a load error that
  names them, and the table stays. Results are rows, columns or an Arrow table (a GeoJSON
  FeatureCollection is not merged).
- `initial` counts as the table on screen: the first load merges into it.

```svelte
<script>
  import { Plot, Provider, Line } from "hmplot";
</script>

<!-- The endpoint returns the readings after `since`, with an ETag naming the newest. -->
<Provider url={"/api/readings?since={version}"} key="id" refreshInterval={5000}
  accumulate={{ maxRows: 2000 }}>
  <Plot height={300} axes2d>
    <Line x="time" y="value" />
  </Plot>
</Provider>
```

```python
with hm.Provider(url="/api/readings?since={version}", key="id", refresh_interval=5000,
                 accumulate={"max_rows": 2000}):
    with hm.Plot(height=300, axes2d=True):
        hm.Line(x="time", y="value")
```

A url source's version is the response's ETag (or Last-Modified), so the endpoint sends the
cursor as its ETag; a `source` returns `{ data, version }` itself. In an exported page,
`snapshot` (the default) embeds the accumulated table as it was on screen; with
`snapshot={false}` the page polls and accumulates from empty when it opens.

## Settling and exports

- A Plot's `whenSettled()` and its exports wait for the loads of the Providers above it (and a
  Provider inside the Plot) that were requested before the call, including one still in its
  debounce, then for what the new result starts downstream. They do not wait for later refresh
  ticks, nor for Providers elsewhere on the page: a slow API in one part of a page does not
  hold every plot.
- `provider.whenSettled()` resolves the same way; it does not reject on a load error.
- A Plot inside a Provider mounts with the first result, and a Plot around a Provider reveals
  once the first load inside it completes.
- In Python scenes, a scene update is acknowledged once the tree is mounted: assigning
  `provider.params` returns at once and the plot keeps rendering while the browser loads.
  Commands (`when_settled()`, `export_png()`, `set_time()`, ...) wait for loads in flight. A
  failed load never fails a command (the previous result is still a consistent scene);
  `await provider.refresh()` raises it, and `provider.on_event("error", callback)` reports it
  (`event.message`, `event.load_revision`). `on_event("load", ...)` gets `event.load_revision`,
  `event.rows` and `event.ms`.

### Exported HTML

- `snapshot` (default true): the exported page embeds the Provider's last result (as JSON,
  rows or columns as the fetch helpers parsed them) and never fetches: it works offline and
  shows what was on screen. url, params and `refreshInterval` are left out.
- `snapshot={false}` (Python `snapshot=False`): the exported page loads, and polls, when it
  opens. That needs an API the page can reach (see CORS below); a relative URL resolves against
  the exported file's location.
- Python: `await scene.export_html()` on a displayed scene embeds the browser's result.
  `hm.export_html(scene)` runs no browser, so it has no loaded result: a snapshot Provider is
  exported live, with a warning naming it. `ExportSession` (PNG, SVG, PDF) loads in its
  headless browser and waits for the first load; its pages are served from a local server, so
  use absolute URLs there.

## Where the data comes from

**Static sites with no backend** (for example this project's documentation, built with
adapter-static). A load fetches files hosted next to the page. Params cannot filter on a
server, so either:

- pre-split files chosen by name: `url={"/data/earthquakes/by-year/{year}.csv"}` (the gallery
  example; `scripts/build-earthquakes.py` writes one file per year), or
- load everything once with a `Data` (or a Provider with no params) and filter in the browser
  with `Filter` and the other transforms. For data that fits in memory this is usually better:
  one load, and every interaction stays on the GPU.

Large data suits range-readable formats: `format="parquet"` with `columns` reads only those
columns (the gallery's `parquet-earthquakes` reads 3 of a file's 5), and PMTiles for map tiles
is later work (Stage 35's "Later"). In-browser SQL over Parquet (for example DuckDB-wasm) can sit
behind a `load` function; it is not built in. For a basemap from vector tiles, see `VectorTile`
(docs/VECTOR-TILES.md): the tiles you name, and in a 2D view the tiles the camera shows.

**REST APIs.** Params become the query string: `url="https://api.example.org/quakes?year={year}"`.
The server must allow the page's origin (CORS: `Access-Control-Allow-Origin`), or be reached
same-origin through a proxy. A JavaScript `load` (or `init` on the fetch helpers) can add
headers or send cookies (`credentials: "include"`).

**Secrets.** Never put an API key in `url`, `params` or Python-side headers: a Python scene's
props are embedded in exported HTML and saved with notebooks. Use a cookie session or a proxy
that adds the key on the server.

**Kernel-side data.** A Provider loads in the browser. Data that only the Python kernel can
reach goes through `hm.Table(...)` and `table.replace(...)` (a Python callback can call it); a
kernel-side load callback would only help when the inputs live in the browser, and is deferred.

## Implementation notes

- `src/lib/plot/provider.svelte` owns a data scope like `data.svelte`; a completed load writes
  the result into it (a result Data cannot read throws there and is an error) and publishes it
  with `publishWithCause`, so the work downstream is the load's follow-up for `whenSettled()`
  (utils/lifecycle.js, TODO 17.15).
- `src/lib/plot/utils/providers.js` holds the sources, request keys, the fetch helpers,
  in-flight sharing and `createScheduler`: one stream of requests where the newest wins
  (debounce, abort, a superseded request's settle cause passed on, latest complete result).
  `VectorTile` (TODO 24, docs/VECTOR-TILES.md) loads its tiles through it.
- Loads are tracked as load jobs (`trackPreparation(..., { load: true })`): only in the plot
  they sit in, never in the cross-plot map. Plots below a Provider find its loads through the
  `UPSTREAM_LOADS` context. `settlePreparations(..., { loads: false })` and
  `whenSettled({ loads: false })` leave loads out; the scene runtime applies updates that way.
