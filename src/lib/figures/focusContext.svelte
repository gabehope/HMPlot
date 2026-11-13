<script>
  import { Line } from "../plot/composition.js";
  import Plot from "../plot/plot.svelte";
  import { DataBoundary } from "../plot/composition.js";
  import TemplateHost from "../templates/TemplateHost.svelte";
  import ViewGrid from "../templates/ViewGrid.svelte";
  import ViewCell from "../templates/ViewCell.svelte";
  import { exportSceneDocument, exportScenePNG } from "../plot/utils/sceneDocumentExport.js";
  import definition from "./focusContext.js";
  import { describePlot } from "../plot/utils/describe.js";
  // A focus over a context strip (TODO 136.16 slice 2), a template (./focusContext.js): the host
  // expands it; this wrapper gives it its data, the grid's sizes from height, its parts, and a
  // handle whose exports compose the two views.
  let { data = undefined, key = undefined, schema = undefined, height = 360, onviewportchange = undefined, children = undefined, ...props } = $props();
  // The space between the views, in CSS pixels.
  const GAP = 8;
  $effect.pre(() => {
    for (const axis of ["x", "y"])
      if (props[axis] === undefined || props[axis] === null)
        throw Error(`FocusContext.${axis} is required: the column the lines plot along ${axis}${axis === "x" ? ", which the strip's brush zooms the focus to" : ""}.`);
    if (!(Number.isFinite(height) && height >= 160))
      throw Error(`FocusContext.height is the figure's height in CSS pixels, at least 160; received ${JSON.stringify(height)}.`);
  });
  // The strip takes a fifth of the figure, at least 48 px.
  const strip = $derived(Math.max(48, Math.round(height / 5)));
  const hosted = $derived({ ...props, gap: GAP, contextHeight: strip, mainHeight: height - strip - GAP, rows: `auto ${strip}px` });
  let host = $state(), element = $state();
  const VIEWS = [["main", "main"], ["context", "context"]];
  const views = () => VIEWS.map(([id, area]) => ({
    element: element?.querySelector(`[data-view-area="${area}"]`), handle: host?.part(id),
  })).filter((view) => view.element && view.handle);
  /** A view's Plot handle: "main" (the focus) or "context" (the strip). */
  export const view = (name) => host?.part(name);
  export const getLegendSource = () => host?.getLegendSource();
  export const getMark = () => host?.getMark();
  // The scene inspection contract sees the figure as one plot: the focus's axes, every part's
  // marks and diagnostics, so hm.check inspects what its PNG draws.
  const plots = () => ["main", "context"].map((id) => host?.part(id)).filter(Boolean);
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
  // The view is the focus's: the scene's viewport and fit commands, an exported page's remembered
  // viewport and Python's viewport events reach it here.
  export const getViewport = () => host?.part("main")?.getViewport?.();
  export const setViewport = (...args) => host?.part("main")?.setViewport?.(...args) ?? Promise.resolve();
  export const fit = (...args) => host?.part("main")?.fit?.(...args);
  /** Holds every view's animations (for an export); the release lets them all go. */
  export const holdAnimations = () => {
    const releases = ["main", "context"].map((id) => host?.part(id)?.holdAnimations?.()).filter(Boolean);
    return () => releases.forEach((release) => release());
  };
  const viewportChanged = (id, viewport) => { if (id === "main") onviewportchange?.(viewport); };
  /** The two views as one PNG, each at its place on the page. */
  export const exportPNG = async (options = {}) => {
    await whenSettled();
    return exportScenePNG(views(), options.scale ?? 2, "FocusContext");
  };
  export const exportSVG = async (options = {}) => { await whenSettled(); return exportSceneDocument(views(), "svg", options); };
  export const exportPDF = async (options = {}) => { await whenSettled(); return exportSceneDocument(views(), "pdf", options); };
</script>

<!-- The figure is its own export host: a scene's export measures it whole. -->
<DataBoundary {data} {key} {schema}>
  <div bind:this={element} class="hm-focus-context" data-export-host>
    <TemplateHost {definition} parts={{ ViewGrid, ViewCell, Plot, Line }} props={hosted} onviewportchange={viewportChanged} bind:this={host}>
      {@render children?.()}
    </TemplateHost>
  </div>
</DataBoundary>

<style>
  .hm-focus-context {
    width: 100%;
    min-width: 0;
  }
</style>
