import { isExpression } from "./expressions.js";
import { liveValues } from "./liveValues.svelte.js";

/**
 * DOMAINS READ FROM THE DATA (TODO 136.14, slice 4): a Plot's or Frame's x, y or z domain whose
 * ends are reductions, as extent(column, {where}) gives ([min, max] of the matching rows: "zoom
 * to the selection"). Each end is evaluated over the Data scope around the frame (scopeValue, as
 * an input's data-derived props are) and again when the data or an interaction state the
 * reductions read (where="@brushed") changes. While the ends are being read for the first time,
 * or when they span nothing (no row matches: the selection is empty; or one value), the domain is
 * automatic. One evaluation runs at a time: changes while it runs (a brush being dragged) are
 * read once it finishes, from the latest state. whenSettled waits for it (trackPreparation).
 */

/** Whether a domain has an end that reads the data (a reduction). */
export const readsData = (domain) => Array.isArray(domain) && domain.some(isExpression);

const key = (value) => (value instanceof Date ? value.getTime() : value);

/**
 * @param {() => Record<"x" | "y" | "z", any>} configs the frame's axis configs
 * @param {import("./internalTypes.js").ViewServices | null | undefined} view
 */
export function dataDomains(configs, view) {
  // A datetime axis keeps the origin it first counted from (axisFrame.js would take each new
  // domain's start, and rebind its columns on every brush move).
  const origins = {};
  const reading = $derived.by(() => {
    const current = configs();
    return Object.fromEntries(["x", "y", "z"].filter((a) => readsData(current[a]?.domain)).map((a) => [a, current[a].domain]));
  });
  const axes = $derived(Object.keys(reading));
  // Every axis's two ends, in order.
  const live = liveValues(() => axes.flatMap((a) => reading[a]), view, {
    where: (i) => `${axes[Math.floor(i / 2)]}.domain`,
    needsData: () => `${axes.map((a) => a + ".domain").join(" and ")} read the data (a reduction such as extent()), so the plot needs data.`,
  });
  /** Each reading axis's evaluated domain, or null while it is automatic: no value yet, or it
   * spans nothing (no row matches, or one value). */
  let last = {};
  const values = $derived.by(() => {
    const ends = live.values, inputs = live.inputs;
    /** @type {Record<string, any[] | null>} */
    const out = {};
    axes.forEach((a, i) => {
      // Values evaluated for an earlier set of axes or ends are not this axis's.
      const current = inputs?.[2 * i] === reading[a][0] && inputs?.[2 * i + 1] === reading[a][1];
      const pair = current ? ends?.slice(2 * i, 2 * i + 2) : null;
      out[a] = pair?.length === 2 && pair.every((end) => end !== null) && key(pair[0]) !== key(pair[1]) ? pair : null;
    });
    // The same ends keep the same object, so a brush that does not move them changes nothing.
    const same = Object.keys(out).length === Object.keys(last).length &&
      Object.entries(out).every(([a, v]) => String(v?.map(key)) === String(last[a]?.map(key)));
    if (!same) last = out;
    return last;
  });
  return {
    /** An error to report, or "". */
    get error() { return live.error; },
    /**
     * `config` with a domain that reads the data replaced by its values; "auto" until they are
     * known, so a Frame keeps a scale of its own meanwhile.
     */
    config(a, config) {
      if (!readsData(config?.domain)) return config;
      const value = values[a];
      if (!value) return { ...config, domain: "auto" };
      if (value.some((end) => end instanceof Date) && config.origin === undefined) {
        origins[a] ??= key(value[0]);
        return { ...config, domain: value, origin: origins[a] };
      }
      return { ...config, domain: value };
    },
  };
}
