// @ts-check
// View metadata (docs/REFACTOR-PLAN-2026-10-09.md, P4b): what a table view carries beside its
// columns, which its projections (a padded view's physical and prefixed rows) report as the view
// does. A feature that keeps metadata of its own on views (graphData.js: the graph a view's table
// belongs to) registers a view extension here, so the core imports no feature.

/**
 * @typedef {object} Scope
 * @typedef {object} ViewMetadata
 * @property {object} [identity] The table's data identity (selection, brush, offsets).
 * @property {Record<string, unknown>} [constants] Columns with one value for every row (a Partition group's key).
 * @property {unknown[]} [pipeline] The transforms that made the view, for a Facet's replay.
 * @property {number} [interactionRevision] Moves when an "@" column of the table may change.
 * @property {boolean} [followsMask] The rows or values depend on which input rows are visible.
 * @property {boolean} [live] The values move with the view clock.
 * @property {Set<string>} [liveColumns] The columns that move with it.
 * @property {number} [liveUntil] When they stop moving.
 * @property {boolean} [repeatsRows] Rows share a source row (Fold).
 * @property {number} [sourceLength] The length of the space sourceIndices() index.
 * @property {number} [revalidatedGeneration] The data generation the rows were last confirmed for.
 * @property {string} [gridDropped] Why an upstream Calculate dropped the rows' grid.
 */

/** @type {(keyof ViewMetadata)[]} */
export const VIEW_METADATA = [
  "identity",
  "constants",
  "pipeline",
  "interactionRevision",
  "followsMask",
  "live",
  "liveColumns",
  "liveUntil",
  "repeatsRows",
  "sourceLength",
  "revalidatedGeneration",
  "gridDropped",
];

/**
 * @typedef {object} ViewExtension
 * @property {(parent: Scope, view: Scope) => void} derive Sets a new view's metadata from its parent's.
 * @property {string[]} forward The properties a view's projections report as the view does.
 * @property {(source: Scope) => Scope} snapshot The properties a snapshot of `source` keeps.
 */

/** @type {ViewExtension[]} */
const extensions = [];

/** @param {ViewExtension} extension */
export function registerViewExtension(extension) {
  extensions.push(extension);
}

/**
 * Each extension's metadata for a new view of `parent`.
 * @param {Scope} parent
 * @param {Scope} view
 */
export function deriveViewMetadata(parent, view) {
  for (const extension of extensions) extension.derive(parent, view);
}

/**
 * `projection` with getters reporting `view`'s metadata (and the extensions'), as the view's at
 * the time of each read.
 * @template {object} T
 * @param {T} projection
 * @param {Scope} view
 * @returns {T}
 */
export function forwardViewMetadata(projection, view) {
  const keys = [
    ...VIEW_METADATA,
    ...extensions.flatMap((extension) => extension.forward),
  ];
  for (const key of keys)
    Object.defineProperty(projection, key, {
      get: () => Reflect.get(view, key),
      enumerable: true,
      configurable: true,
    });
  return projection;
}

/**
 * The extensions' metadata a snapshot of `source` keeps.
 * @param {Scope} source
 * @returns {Scope}
 */
export function snapshotViewMetadata(source) {
  return Object.assign(
    {},
    ...extensions.map((extension) => extension.snapshot(source)),
  );
}
