/**
 * The rules that turn an axis's votes and labels into its title (TODO 21 Part T). No imports:
 * frames (axis.svelte) use these without the channel tables of utils/axisTitles.js.
 */

/** An axis's automatic title from its marks' votes: the one name, or "". */
export function combineTitles(votes) {
  let name;
  for (const vote of votes) {
    if (vote === undefined) continue;
    if (vote === null) return "";
    if (name !== undefined && name !== vote) return "";
    name = vote;
  }
  return name ?? "";
}

/** The title an axis shows and where it came from. */
export function resolveAxisTitle({
  label = "",
  scaleTitle = "",
  automatic = "",
} = {}) {
  if (label) return { title: label, source: "label" };
  if (scaleTitle) return { title: String(scaleTitle), source: "scale" };
  if (automatic) return { title: automatic, source: "column" };
  return { title: "", source: "none" };
}

/**
 * The explicit label of `axis` on a frame's appearance options (`styles`, the frame's "plot"
 * child): inherited from the frames and defaults above it when `inherit`, else only its own.
 * "" when there is none (empty, null and undefined mean automatic); numbers become strings.
 */
export function explicitAxisLabel(styles, axis, { inherit = true } = {}) {
  const key = "axisLabel" + axis.toUpperCase();
  const value = inherit
    ? styles?.get?.(key)
    : styles?.values?.has?.(key)
      ? styles.values.get(key)
      : undefined;
  return value === undefined || value === null ? "" : String(value);
}

export const isInternalColumnName = (name) =>
  typeof name === "string" && (name.startsWith("__") || name.startsWith("@"));

/**
 * The display name of column `field` of `scope`: through aliases (a Facet's `value`, a pairs
 * cell's `x`) to the column they are, and through transform outputs that declare a name. null
 * for internal columns and outputs declared unnamed.
 */
export function columnTitle(scope, field) {
  if (typeof field !== "string") return null;
  const name = scope?.columnName ? scope.columnName(field) : field;
  if (name === undefined) return isInternalColumnName(field) ? null : field;
  return name === null || isInternalColumnName(name) ? null : String(name);
}
