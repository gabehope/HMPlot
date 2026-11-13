<script lang="ts">
  // The settings pane and the export panel of a Plot or a Facet (TODO 60), bound to its chrome
  // (plotChrome.svelte.ts), which opens and closes them.
  import OptionsPane from "./optionsPane.svelte";
  import ExportPanel from "./exportPanel.svelte";
  import type { PlotChrome } from "./plotChrome.svelte.js";
  import type { OptionsNode } from "./options.js";
  type Export = (options?: object) => Promise<unknown>;
  let {
    chrome,
    options,
    label,
    allowSharedDefaults,
    exportPNG = undefined,
    exportSVG = undefined,
    exportPDF = undefined,
    exportHTML = undefined,
  }: {
    chrome: PlotChrome;
    options: OptionsNode;
    label: string | undefined;
    allowSharedDefaults: boolean;
    exportPNG?: Export;
    exportSVG?: Export;
    exportPDF?: Export;
    exportHTML?: Export;
  } = $props();
</script>

<OptionsPane
  bind:this={chrome.pane}
  bind:opened={chrome.settingsOpen}
  placement="drawer"
  {options}
  {label}
  {allowSharedDefaults}
/>
<ExportPanel
  bind:this={chrome.exportPanel}
  bind:opened={chrome.exportOpen}
  {label}
  {exportPNG}
  {exportSVG}
  {exportPDF}
  {exportHTML}
/>
