import { examples } from "./catalog.js";
import { guideSections } from "./guide.js";
import { apiEntries, apiGroups } from "./api.js";
export const curatedIds = ["ten-million-stars", "double-gyre", "globe-tiles", "lorenz-attractor", "earthquakes", "calculate-matrix", "calculate-large", "interaction-dashboard", "interaction-matrix", "interaction-keyed-updates", "data-shortcut", "scale-resources", "layered-signal", "histograms", "violin", "twin-axes", "strip-brushing", "facets", "scatterplot-matrix", "coordinated-explorer", "enter-exit", "transform-force", "timeseries", "polar-radius", "polar-inset", "solar-system", "earth", "manhattan-flyover", "sunburst", "large-graph", "themes"];
export const curatedExamples = curatedIds.map((id) => examples.find((item) => item.id === id)).filter(Boolean);
// The home page's gallery (TODO 69.19): a few examples that show the range, two rows of four
// cards: 3D, statistics, linked views, a graph, a globe, stacked layers, a clustered heatmap, a map.
export const homeIds = ["lorenz-attractor", "density-contours", "brushed-distributions", "large-graph", "earthquakes", "streamgraph", "clustermap", "map-projections"];
export const homeExamples = homeIds.map((id) => examples.find((item) => item.id === id)).filter(Boolean);
export const additionalExamples = examples.filter((item) => !curatedIds.includes(item.id));
export const apiDocs = apiEntries;
export { guideSections, apiGroups };
