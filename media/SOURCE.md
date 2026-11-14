# Media

Screen recordings of the gallery's three flagship demos (OPEN-SOURCE-PLAN.md, R2.11), for the
README and the announcement. Each was recorded from its gallery page (`/examples/<id>`) in Chrome
with WebGPU at a device pixel ratio of 2, driven by a script, by `scripts/record-demos.mjs`:

    npm run build:examples
    node scripts/record-demos.mjs [id ...] [--offline] [--tiles dir]

| File | What it shows |
|---|---|
| `ten-million-stars.mp4`, `.gif` | Ten million stars generated on the GPU, filtered by age as the sliders move, then zoomed into an arm |
| `double-gyre.mp4`, `.gif` | 45,000 particles in a double gyre; a brush drops dye, then the wobble rises |
| `globe-tiles.mp4`, `.gif` | The globe turned by hand, then flown down to Tokyo while vector tiles stream in |

The MP4s are the whole recordings (H.264); each GIF is a part of its recording, smaller, for the
README.

The globe's map tiles came from a local folder the script fills once from VersaTiles
(`https://tiles.versatiles.org/tiles/osm/{z}/{x}/{y}`), so a recording does not depend on the
network. Map data © OpenStreetMap contributors, available under the Open Database License (ODbL
1.0), and ESA WorldCover 2021 (© ESA WorldCover project / Copernicus Sentinel data, CC BY 4.0);
tiles: VersaTiles. The earthquakes: the U.S. Geological Survey's catalog (public domain).
