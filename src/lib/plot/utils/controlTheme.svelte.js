// The input components' look from the theme around them (TODO 132.3): the style variables
// inputStyles.css reads (theme.js controlStyle). Outside any Theme it is the default theme's, as
// a Plot's is. A theme whose font is "inherit" sets none, so CSS inheritance gives the input its
// own host's font (the Theme resolves "inherit" against its own parent element).
import { getContext, onDestroy } from "svelte";
import { THEME_CONTEXT, controlStyle } from "./theme.js";
import { themes } from "./themePresets.js";

export function controlTheme() {
  const scope = /** @type {any} */ (getContext(THEME_CONTEXT));
  const read = () => [scope?.read?.() ?? themes.hmplot, scope?.unresolved?.() ?? scope?.read?.() ?? themes.hmplot];
  let current = $state.raw(read());
  const stop = scope?.subscribe?.(() => { current = read(); });
  if (stop) onDestroy(stop);
  return {
    /** The inline style of the input's outer element. */
    get style() { return controlStyle(current[0], current[1]); },
  };
}
