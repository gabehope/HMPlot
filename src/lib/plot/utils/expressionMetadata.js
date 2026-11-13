// @ts-check
/**
 * Column metadata as the expression compiler sees it (Stage 116.3). Semantic metadata (type,
 * origin, timezone, unit, calendar, domain, and any key not classified here) decides plan
 * eligibility, the plan key and what a traced program reads. Descriptive metadata (a column's
 * name and label, which title axes and legends) never reaches a plan: programs are shared
 * across it, and results get it back from the column their metadata came from, as the eager
 * evaluator passes it through.
 */
/** @type {readonly (string | symbol)[]} */
const DESCRIPTIVE = ["name", "label"];
const SOURCE = Symbol("metadata source");

/**
 * A column's metadata, as its table or an evaluated result carries it; a traced program's view
 * of it is marked with the field it came from.
 * @typedef {{ [key: string | symbol]: unknown, [SOURCE]?: string }} ColumnMetadata
 */

// Only a plain object's own enumerable values are descriptive, so unusual metadata (accessors,
// prototypes) stays whole and as conservative as before.
/**
 * @param {ColumnMetadata} metadata
 * @param {string | symbol} key
 */
const describes = (metadata, key) => {
  const descriptor = Object.getOwnPropertyDescriptor(metadata, key);
  return Boolean(descriptor?.enumerable && Object.hasOwn(descriptor, "value"));
};
/**
 * @param {ColumnMetadata | null | undefined} metadata
 * @returns {metadata is ColumnMetadata}
 */
const descriptive = (metadata) =>
  !!metadata &&
  Object.getPrototypeOf(metadata) === Object.prototype &&
  DESCRIPTIVE.some((key) => describes(metadata, key));

/**
 * `metadata` without its descriptive keys; itself when it has none.
 * @param {ColumnMetadata | null | undefined} metadata
 * @returns {ColumnMetadata | null | undefined}
 */
export function semanticMetadata(metadata) {
  if (!descriptive(metadata)) return metadata;
  /** @type {ColumnMetadata} */
  const semantic = {};
  for (const key of Reflect.ownKeys(metadata)) {
    // Every own key of a plain object has its descriptor.
    const descriptor = Object.getOwnPropertyDescriptor(metadata, key);
    if (descriptor && (!DESCRIPTIVE.includes(key) || !describes(metadata, key)))
      Object.defineProperty(semantic, key, descriptor);
  }
  return semantic;
}

/** A traced program's view of `field`'s semantic metadata, marked with the field it came from.
 * The mark is a symbol, so JSON drops it and object spread (casts, calendars) keeps it.
 * @param {ColumnMetadata | null | undefined} metadata
 * @param {string} field
 * @returns {ColumnMetadata | null | undefined}
 */
export const tracedMetadata = (metadata, field) =>
  metadata && { ...metadata, [SOURCE]: field };

/** The field whose metadata a traced result passed through, if any.
 * @param {ColumnMetadata | null | undefined} metadata
 */
export const metadataSource = (metadata) => metadata?.[SOURCE];

/** A result's semantic `metadata` with the descriptive keys of `source`, the full metadata of
 * the column it came from.
 * @param {ColumnMetadata | null | undefined} metadata
 * @param {ColumnMetadata | null | undefined} source
 * @returns {ColumnMetadata | null | undefined}
 */
export function describedMetadata(metadata, source) {
  if (!metadata || !descriptive(source)) return metadata;
  const out = { ...metadata };
  for (const key of DESCRIPTIVE)
    if (!Object.hasOwn(out, key) && describes(source, key))
      out[key] = source[key];
  return out;
}
