<script>
  import { Points } from "../plot/composition.js";
  import Plot from "../plot/plot.svelte";
  import { DataBoundary } from "../plot/composition.js";
  import Histogram from "../compound/histogram.svelte";
  import TemplateHost from "../templates/TemplateHost.svelte";
  import ViewGrid from "../templates/ViewGrid.svelte";
  import ViewCell from "../templates/ViewCell.svelte";
  import { exportSceneDocument, exportScenePNG } from "../plot/utils/sceneDocumentExport.js";
  import definition from "./marginals.js";
  import { describePlot } from "../plot/utils/describe.js";
  // A chart of three views (TODO 136.16; charts live apart from the compound marks, TODO 130.4),
  // a template (./marginals.js): the host expands it; this wrapper gives it its
  // data, the grid's sizes from height, its parts, and a handle whose exports compose the views.
  let { data = undefined, key = undefined, schema = undefined, height = 450, onviewportchange = undefined, children = undefined, ...props } = $props();
  // The space between the views, in CSS pixels.
  const GAP = 4;
  $effect.pre(() => {
    for (const axis of ["x", "y"])
      if (props[axis] === undefined || props[axis] === null)
        throw Error(`Marginals.${axis} is required: the column the scatter plots along ${axis} and its ${axis === "x" ? "top" : "right"} histogram bins.`);
    if (!(Number.isFinite(height) && height >= 160))
      throw Error(`Marginals.height is the figure's height in CSS pixels, at least 160; received ${JSON.stringify(height)}.`);
  });
  // The histograms take a fifth of the figure, at least 48 px, across the scatter's side.
  const margin = $derived(Math.max(48, Math.round(height / 5)));
  // A viewport given to the figure (an exported page's) opens each histogram on the scatter's
  // view of its axis; later changes reach them through the links.
  const shared = (viewport) => {
    if (!viewport) return {};
    const along = (axis) => ({ x: 0.5, y: 0.5, zoomX: 1, zoomY: 1,
      [axis]: viewport[axis] ?? 0.5, [`zoom${axis.toUpperCase()}`]: viewport[`zoom${axis.toUpperCase()}`] ?? viewport.zoom ?? 1 });
    return { topViewport: along("x"), rightViewport: along("y") };
  };
  const hosted = $derived({
    ...props, margin, gap: GAP, mainHeight: height - margin - GAP, ...shared(props.viewport),
    columns: `minmax(0, 1fr) ${margin}px`, rows: `${margin}px auto`,
  });
  let host = $state(), element = $state();
  const VIEWS = [["top", "top"], ["main", "main"], ["right", "right"]];
  const views = () => VIEWS.map(([id, area]) => ({
    element: element?.querySelector(`[data-view-area="${area}"]`), handle: host?.part(id),
  })).filter((view) => view.element && view.handle);
  /** A view's Plot handle: "top" (the x histogram), "main" (the scatter) or "right" (the y histogram). */
  export const view = (name) => host?.part(name);
  export const getLegendSource = () => host?.getLegendSource();
  export const getMark = () => host?.getMark();
  // The existing scene inspection contract sees the figure as one plot: shared scatter axes,
  // every part's marks and diagnostics. This lets hm.check inspect what its PNG actually draws.
  const plots = () => ["main", "top", "right"].map((id) => host?.part(id)).filter(Boolean);
  export const getDescriptionModel = () => {
    const main = host?.part("main")?.getDescriptionModel?.();
    return main ? { ...main, marks: plots().flatMap((plot) => plot.getDescriptionModel?.()?.marks ?? []) } : null;
  };
  export const getDescription = () => describePlot(getDescriptionModel() ?? {});
  export const getRenderError = () => plots().map((plot) => plot.getRenderError?.()).find(Boolean) ?? null;
  export const listDiagnostics = () => plots().flatMap((plot) => plot.listDiagnostics?.() ?? []);
  export const prepareLints = async () => { await Promise.all(plots().map((plot) => plot.prepareLints?.())); };

  export const subscribeSettings = (listener) => host?.subscribeSettings(listener) ?? (() => {});
  export const whenSettled = async () => { await host?.whenSettled(); };
  // The view is the scatter's (the histograms follow it): the scene's viewport and fit commands,
  // an exported page's remembered viewport and Python's viewport events reach it here.
  export const getViewport = () => host?.part("main")?.getViewport?.();
  export const setViewport = (...args) => host?.part("main")?.setViewport?.(...args) ?? Promise.resolve();
  export const fit = (...args) => host?.part("main")?.fit?.(...args);
  /** Holds every view's animations (for an export); the release lets them all go. */
  export const holdAnimations = () => {
    const releases = ["top", "main", "right"].map((id) => host?.part(id)?.holdAnimations?.()).filter(Boolean);
    return () => releases.forEach((release) => release());
  };
  const viewportChanged = (id, viewport) => { if (id === "main") onviewportchange?.(viewport); };
  /** The three views as one PNG, each at its place on the page. */
  export const exportPNG = async (options = {}) => {
    await whenSettled();
    return exportScenePNG(views(), options.scale ?? 2, "Marginals");
  };
  export const exportSVG = async (options = {}) => { await whenSettled(); return exportSceneDocument(views(), "svg", options); };
  export const exportPDF = async (options = {}) => { await whenSettled(); return exportSceneDocument(views(), "pdf", options); };
</script>

<!-- The figure is its own export host: a scene's export measures it whole. -->
<DataBoundary {data} {key} {schema}>
  <div bind:this={element} class="hm-marginals" data-export-host>
    <TemplateHost {definition} parts={{ ViewGrid, ViewCell, Plot, Points, Histogram }} props={hosted} onviewportchange={viewportChanged} bind:this={host}>
      {@render children?.()}
    </TemplateHost>
  </div>
</DataBoundary>

<style>
  .hm-marginals {
    width: 100%;
    min-width: 0;
  }
</style>
