// The defaults gallery's reference charts (TODO 136.17): each gallery chart as Vega-Lite and
// Observable Plot draw it with their defaults, from the same data (<name>.json, written by
// render_references.py). Each entry gives only the data and encodings, as charts.py does; null
// where the library has no such chart.

import { chromium } from "@playwright/test";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const point = (x, y, extra = {}) => ({
  x: { field: x, type: "quantitative" },
  y: { field: y, type: "quantitative" },
  ...extra,
});
const nominal = (field) => ({ field, type: "nominal" });
const quantitative = (field) => ({ field, type: "quantitative" });

/** Vega-Lite specs (width and height are set by the renderer). */
export const vegaLite = {
  scatter: { mark: "point", encoding: point("x", "y") },
  "scatter-categorical": {
    mark: "point",
    encoding: point("length", "width", { color: nominal("species") }),
  },
  bubbles: {
    mark: "point",
    encoding: point("gdp", "life", { size: quantitative("people") }),
  },
  "line-time": {
    mark: "line",
    encoding: {
      x: { field: "date", type: "temporal" },
      y: quantitative("price"),
    },
  },
  lines: {
    mark: "line",
    encoding: point("hour", "temperature", { color: nominal("city") }),
  },
  area: { mark: "area", encoding: point("week", "visits") },
  "stacked-area": {
    mark: "area",
    encoding: point("week", "visits", { color: nominal("source") }),
  },
  bars: {
    mark: "bar",
    encoding: { x: nominal("fruit"), y: quantitative("sold") },
  },
  "bars-horizontal": {
    mark: "bar",
    encoding: { y: nominal("fruit"), x: quantitative("sold") },
  },
  "grouped-bars": {
    mark: "bar",
    encoding: {
      x: nominal("region"),
      xOffset: nominal("year"),
      y: quantitative("sales"),
      color: nominal("year"),
    },
  },
  "stacked-bars": {
    mark: "bar",
    encoding: {
      x: nominal("region"),
      y: quantitative("sales"),
      color: nominal("year"),
    },
  },
  histogram: {
    mark: "bar",
    encoding: { x: { field: "score", bin: true }, y: { aggregate: "count" } },
  },
  boxplot: {
    mark: "boxplot",
    encoding: { x: nominal("species"), y: quantitative("length") },
  },
  // Vega-Lite's own violin: a horizontal area per species, its density centred.
  violin: {
    transform: [{ density: "length", groupby: ["species"] }],
    mark: { type: "area", orient: "horizontal" },
    encoding: {
      y: { field: "value", type: "quantitative", title: "length" },
      x: {
        field: "density",
        type: "quantitative",
        stack: "center",
        axis: null,
      },
      column: nominal("species"),
    },
  },
  lollipop: {
    layer: [
      {
        mark: "rule",
        encoding: { x: nominal("fruit"), y: quantitative("sold") },
      },
      {
        mark: "point",
        encoding: { x: nominal("fruit"), y: quantitative("sold") },
      },
    ],
  },
  heatmap: {
    mark: "rect",
    encoding: {
      x: { field: "column", type: "ordinal" },
      y: { field: "row", type: "ordinal" },
      color: quantitative("value"),
    },
  },
  pie: {
    mark: "arc",
    encoding: { theta: quantitative("share"), color: nominal("browser") },
  },
  donut: {
    mark: { type: "arc", innerRadius: 60 },
    encoding: { theta: quantitative("share"), color: nominal("browser") },
  },
  "annotated-line": {
    layer: [
      { mark: "line", encoding: point("t", "v") },
      {
        data: { values: [{ t: 9.4, v: 60, text: "peak" }] },
        mark: "text",
        encoding: { ...point("t", "v"), text: { field: "text" } },
      },
    ],
  },
  "small-multiples": {
    mark: "point",
    encoding: point("x", "y", { column: nominal("site") }),
  },
  // As Plot's globe below: the sphere and graticule a globe is drawn with, then the points.
  globe: {
    projection: { type: "orthographic" },
    layer: [
      {
        data: { sphere: true },
        mark: { type: "geoshape", fill: "none", stroke: "#ccc" },
      },
      {
        data: { graticule: true },
        mark: { type: "geoshape", fill: "none", stroke: "#eee" },
      },
      {
        mark: "circle",
        encoding: {
          longitude: { field: "lon", type: "quantitative" },
          latitude: { field: "lat", type: "quantitative" },
        },
      },
    ],
  },
};

/** Observable Plot: each returns Plot.plot's options (width and height set by the renderer). */
export const observablePlot = {
  scatter: (Plot, data) => ({ marks: [Plot.dot(data, { x: "x", y: "y" })] }),
  "scatter-categorical": (Plot, data) => ({
    marks: [Plot.dot(data, { x: "length", y: "width", stroke: "species" })],
  }),
  bubbles: (Plot, data) => ({
    marks: [Plot.dot(data, { x: "gdp", y: "life", r: "people" })],
  }),
  "line-time": (Plot, data) => ({
    marks: [Plot.line(data, { x: (d) => new Date(d.date), y: "price" })],
  }),
  lines: (Plot, data) => ({
    marks: [Plot.line(data, { x: "hour", y: "temperature", stroke: "city" })],
  }),
  area: (Plot, data) => ({
    marks: [Plot.areaY(data, { x: "week", y: "visits" })],
  }),
  "stacked-area": (Plot, data) => ({
    marks: [Plot.areaY(data, { x: "week", y: "visits", fill: "source" })],
  }),
  bars: (Plot, data) => ({
    marks: [Plot.barY(data, { x: "fruit", y: "sold" })],
  }),
  "bars-horizontal": (Plot, data) => ({
    marks: [Plot.barX(data, { y: "fruit", x: "sold" })],
  }),
  "grouped-bars": (Plot, data) => ({
    fx: { label: "region" },
    x: { type: "band" },
    color: { type: "categorical" },
    marks: [
      Plot.barY(data, { fx: "region", x: "year", y: "sales", fill: "year" }),
    ],
  }),
  "stacked-bars": (Plot, data) => ({
    color: { type: "categorical" },
    marks: [Plot.barY(data, { x: "region", y: "sales", fill: "year" })],
  }),
  histogram: (Plot, data) => ({
    marks: [Plot.rectY(data, Plot.binX({ y: "count" }, { x: "score" }))],
  }),
  boxplot: (Plot, data) => ({
    marks: [Plot.boxY(data, { x: "species", y: "length" })],
  }),
  violin: null,
  lollipop: (Plot, data) => ({
    marks: [
      Plot.ruleX(data, { x: "fruit", y: "sold" }),
      Plot.dot(data, { x: "fruit", y: "sold", fill: "currentColor" }),
    ],
  }),
  heatmap: (Plot, data) => ({
    marks: [Plot.cell(data, { x: "column", y: "row", fill: "value" })],
  }),
  pie: null,
  donut: null,
  "annotated-line": (Plot, data) => ({
    marks: [
      Plot.line(data, { x: "t", y: "v" }),
      Plot.tip([{ t: 9.4, v: 60, text: "peak" }], {
        x: "t",
        y: "v",
        title: "text",
      }),
    ],
  }),
  "small-multiples": (Plot, data) => ({
    marks: [Plot.dot(data, { x: "x", y: "y", fx: "site" })],
  }),
  globe: (Plot, data) => ({
    projection: "orthographic",
    marks: [
      Plot.sphere(),
      Plot.graticule(),
      Plot.dot(data, { x: "lon", y: "lat" }),
    ],
  }),
};

// Draw every reference into references/<library>/<name>.png: `node tests/gallery/references.mjs
// <data folder>` (render_references.py writes the data and runs this).

const here = dirname(fileURLToPath(import.meta.url)),
  modules = join(here, "../../node_modules");
const WIDTH = 480,
  HEIGHT = 320;

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const folder = process.argv[2];
  if (!folder)
    throw Error(
      "Pass the folder of chart data render_references.py writes (npm run gallery:references).",
    );
  const browser = await chromium.launch({ channel: "chrome" });
  // UTC, as the data's dates are: Vega-Lite's time axis otherwise follows the machine's zone.
  const page = await browser.newPage({
    viewport: { width: 900, height: 700 },
    timezoneId: "UTC",
  });
  await page.setContent(
    `<!doctype html><body style="margin:0;background:#fff"><style>#chart svg,#chart canvas{display:block}</style><div id="chart" style="display:inline-block"></div>`,
  );
  for (const script of [
    "d3/dist/d3.min.js",
    "@observablehq/plot/dist/plot.umd.min.js",
    "vega/build/vega.min.js",
    "vega-lite/build/vega-lite.min.js",
  ])
    await page.addScriptTag({ path: join(modules, script) });
  for (const file of readdirSync(folder)
    .filter((f) => f.endsWith(".json"))
    .sort()) {
    const name = file.replace(/\.json$/, ""),
      data = JSON.parse(readFileSync(join(folder, file), "utf8"));
    const rows = Object.keys(data).length
      ? data[Object.keys(data)[0]].map((_, i) =>
          Object.fromEntries(Object.entries(data).map(([k, v]) => [k, v[i]])),
        )
      : [];
    const draws = {
      "vega-lite": vegaLite[name] && {
        spec: {
          $schema: "https://vega.github.io/schema/vega-lite/v5.json",
          ...(vegaLite[name].encoding?.column
            ? { width: (WIDTH - 90) / 3, height: HEIGHT - 90 }
            : {
                width: WIDTH,
                height: HEIGHT,
                autosize: { type: "fit", contains: "padding" },
              }),
          data: { values: rows },
          ...vegaLite[name],
        },
      },
      plot: observablePlot[name] && { options: String(observablePlot[name]) },
    };
    for (const [library, draw] of Object.entries(draws)) {
      if (!draw) continue;
      await page.evaluate(
        async ({ library, draw, rows, WIDTH, HEIGHT }) => {
          const chart = document.getElementById("chart");
          chart.replaceChildren();
          if (library === "plot") {
            const options = (0, eval)(`(${draw.options})`)(Plot, rows);
            chart.append(
              Plot.plot({ width: WIDTH, height: HEIGHT, ...options }),
            );
          } else {
            const view = new vega.View(
              vega.parse(vegaLite.compile(draw.spec).spec),
              { renderer: "svg", container: chart },
            );
            await view.runAsync();
          }
        },
        { library, draw, rows, WIDTH, HEIGHT },
      );
      mkdirSync(join(here, "references", library), { recursive: true });
      writeFileSync(
        join(here, "references", library, `${name}.png`),
        await page.locator("#chart").screenshot(),
      );
      console.log(`${library}/${name}.png`);
    }
  }
  await browser.close();
}
