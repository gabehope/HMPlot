<script lang="ts">
  /**
   * Where a component's failure goes (2026-10-22): the plot's diagnostics (what hm.check, the
   * Python runtime's settle and a scene's reporter read) and, where no plot or scene collects
   * it, an accessible alert. An alert alone is not enough inside a Plot: there it is fallback
   * content of the canvas element, which the browser never draws and check skips, so a
   * Treemap's "no input named root" went unseen through three correction rounds of an eval.
   * Mount it unconditionally and pass the error, so clearing the error withdraws the report.
   */
  import { reportDataError } from "./utils/dataErrors.js";
  import { useReporter, currentSceneNode } from "./utils/reporter.js";
  import { useViewServices } from "./utils/viewServices";

  let { kind, error = "" }: { kind: string; error?: unknown } = $props();
  const viewServices = useViewServices();
  const owner = { sceneNode: currentSceneNode() };
  const report = useReporter(kind);
  const text = $derived(
    error ? String((error as { message?: unknown })?.message ?? error) : "",
  );
  // Named as every diagnostic is ("Treemap: ..."), once.
  const named = $derived(
    text && !new RegExp(`^${kind}\\b`).test(text) ? `${kind}: ${text}` : text,
  );
  // One path: inside a Plot its diagnostics (the Plot shows the error, hm.check and the Svelte
  // checker list it); outside one the nearest scene reporter, else the alert below.
  $effect(() => {
    if (viewServices) {
      reportDataError(viewServices, owner, named);
      return () => reportDataError(viewServices, owner, "");
    }
    report(text);
  });
</script>

{#if named && !viewServices}<p class="hm-component-error" role="alert">
    {named}
  </p>{/if}
