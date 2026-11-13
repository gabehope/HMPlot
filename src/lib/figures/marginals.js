// @ts-check
// A scatter plot with a histogram of each of its columns along its sides (TODO 136.16), as
// seaborn's jointplot and ggExtra's marginal plots draw it: three Plots in a ViewGrid, which lines
// up their plot areas (an alignment group), the histograms' Plots linked to the scatter's on the
// axis they share (one domain, panned and zoomed together). The caller's other props go to the
// scatter's Points (the main part) and its children into the scatter's Plot, over the points.
// The histograms' own axes are hidden: they share the scatter's, and their counts are a shape.
import { defineTemplate, node, param, rest, slot } from "../templates/define.js";

// The grid owns each panel's width, including image exports where ordinary Plots cap at 800 px.
const hidden = { visible: false, grid: "off" };
/** A marginal histogram's Plot: no axes of its own, and no pan or zoom but its link's. */
const margin = (/** @type {string} */ id, /** @type {string} */ area, /** @type {Record<string, unknown>} */ histogram, /** @type {unknown} */ height) =>
  node("ViewCell", { area }, [
    node("Plot", { height, responsive: true, interactive: false, x: hidden, y: hidden, legend: false, viewport: param(`${id}Viewport`) }, [
      node("Histogram", { ...histogram, bins: param("bins") }),
    ], { id }),
  ]);

export default defineTemplate({
  kind: "Marginals",
  // The wrapper (marginals.svelte) turns height into the grid's tracks, gap and each Plot's height;
  // viewport is the scatter's; the histograms open on its shared axis (topViewport, rightViewport)
  // and follow it from there through the links.
  params: { x: undefined, y: undefined, bins: 30, viewport: undefined, topViewport: undefined, rightViewport: undefined, columns: undefined, rows: undefined, gap: undefined, margin: undefined, mainHeight: undefined },
  links: [{ parts: ["top", "main"], axes: "x" }, { parts: ["main", "right"], axes: "y" }],
  root: node("ViewGrid", { columns: param("columns"), rows: param("rows"), areas: '"top ." "main right"', gap: param("gap") }, [
    margin("top", "top", { x: param("x") }, param("margin")),
    node("ViewCell", { area: "main" }, [
      node("Plot", { height: param("mainHeight"), responsive: true, viewport: param("viewport") }, [
        node("Points", { x: param("x"), y: param("y"), ...rest() }),
        slot(),
      ], { id: "main" }),
    ]),
    margin("right", "right", { y: param("y") }, param("mainHeight")),
  ]),
});
