<script>
  import { getContext, setContext, untrack } from "svelte";
  import { MAPPING_CONTEXT } from "./utils/mapping.js";
  import { THEME_CONTEXT, markTheme } from "./utils/theme.js";
  import { COMPOUND_DESCRIPTION_CONTEXT } from "./utils/describe.js";

  // `only` keeps just those keys of the layer and `except` drops some, so a compound mark can
  // route one theme entry to its parts (Lollipop: color and width to the stems, size to the heads).
  // `beneath` puts the layer under the enclosing ones, as a primitive mark's own theme entry is:
  // a template that was one (ErrorBars) keeps the look a compound around it gives it.
  let { kind, defaults = {}, values = {}, aliases = {}, only = undefined, except = undefined, beneath = false, children } = $props();
  const parent = getContext(MAPPING_CONTEXT), theme = getContext(THEME_CONTEXT);
  // A compound mark's parts describe themselves as the compound (TODO 49); the outermost wins.
  if (!getContext(COMPOUND_DESCRIPTION_CONTEXT)) setContext(COMPOUND_DESCRIPTION_CONTEXT, { kind: untrack(() => kind), owner: {} });
  setContext(MAPPING_CONTEXT, {
    read() {
      const layer = {
        ...defaults,
        ...markTheme(theme?.read?.() ?? {}, kind),
        ...Object.fromEntries(Object.entries(values).filter(([, value]) => value !== undefined)),
        __mappingSource: { kind: "theme", label: theme?.read?.()?.name ?? "Theme" },
      };
      for (const [source, target] of Object.entries(aliases))
        if (layer[source] !== undefined) layer[target] = layer[source];
      for (const key of Object.keys(layer))
        if (key !== "__mappingSource" && ((only && !only.includes(key)) || except?.includes(key))) delete layer[key];
      return beneath ? [layer, ...(parent?.read?.() ?? [])] : [...(parent?.read?.() ?? []), layer];
    },
  });
</script>

{@render children?.()}
