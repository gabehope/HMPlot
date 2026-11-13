// @ts-check
// Endpoint registration (Stage 15; a feature controller since Stage 118.3): every mount of an
// endpoint-capable mark registers one entry in its view's endpoint registry
// (endpointRegistry.js): the mark, the frame on screen and the frame-chain revision. Connection
// consumers resolve their endpoints through it. namedMark hands this controller each accepted
// binding with the displayed preparation it describes.
import { endpointRegistry } from "./endpointRegistry.js";
import { coordinateKeys } from "./coordinates.js";
import { resolveCoordinateOperations } from "./coordinateOperations.js";
import { frameMappingSnapshot } from "./frameMapping.js";
import { placedFrame } from "./framePlacement.js";
import { onCoordinateView } from "./viewContext.js";

/** The context a compound mark (Bar, Histogram, BoxPlot, Pie) sets for the primitive it mounts. */
export { ENDPOINT_COMPOUND_CONTEXT } from "./connections.js";

/**
 * @typedef {import("./internalTypes.js").MarkBinding} MarkBinding
 * @typedef {import("./internalTypes.js").PlotRenderer} PlotRenderer
 * @typedef {import('./coordinateOperations.js').CoordinateOptions & { on(listener: () => void, key: string): () => void, presentation?: { label?: string } }} MarkOptions
 * @typedef {{ options: MarkOptions, isDisposed?: boolean }} EndpointMark
 * @typedef {Pick<import("./internalTypes.js").PreparedMark, "props"> & Partial<Pick<
 *   import("./internalTypes.js").PreparedMark,
 *   "keyTokens" | "tokensRequested" | "markScope">>} ShownPreparation
 * @typedef {import("./facetService.js").FacetService} FacetService
 * @typedef {import("./facetService.js").PartitionGroup} PartitionGroup
 */

// Options whose change can move the frame chain that maps a mark's data.
const FRAME_KEYS = [
  ...new Set([
    "_frameTopology",
    ...coordinateKeys,
    ...["x", "y", "z"].flatMap((axis) => [
      axis + "bounds",
      axis + "range",
      axis + "Transform",
      "_frame" + axis.toUpperCase() + "Range",
    ]),
  ]),
];

/** @param {EndpointMark} mark */
function frameRevision(mark) {
  try {
    return JSON.stringify([
      resolveCoordinateOperations(mark.options, { includePlacement: false }),
      frameMappingSnapshot(mark.options),
      placedFrame(mark.options)?.placement ?? null,
    ]);
  } catch (error) {
    return "error: " + /** @type {Error} */ (error).message;
  }
}

/**
 * One mark mount's endpoint registration, or none for a kind that cannot be an endpoint.
 * @param {{
 *   kind: string,
 *   renderer: PlotRenderer,
 *   endpoint: boolean,
 *   facet?: Pick<FacetService, "cell" | "scope"> | null,
 *   partitionGroup?: PartitionGroup | null,
 *   compoundSpec?: { kind?: string, name?: () => string | undefined } | null,
 *   frame?: { options?: object, key?: string } | null,
 *   name: () => string | undefined,
 *   connectionBacked: () => boolean,
 *   lifecycleUnion: (entry: ShownPreparation) => string[] | null,
 *   isAlive: () => boolean,
 *   refresh: () => void,
 * }} mount
 */
export function createEndpointController(mount) {
  const { kind, renderer, facet, partitionGroup, compoundSpec, frame } = mount;
  const endpoints = mount.endpoint ? endpointRegistry(renderer) : null;
  /** @type {(Record<string, unknown> & { mark: EndpointMark }) | null} */
  let registered = null;
  /** @type {(() => void)[]} */
  let stops = [];
  // The Facet cell, then the enclosing Partition groups (SceneNode's runtime key), read live
  // so a reordered Facet re-sorts its cells without re-registering.
  const cell =
    facet || partitionGroup
      ? {
          get key() {
            return [facet?.cell().key ?? "", partitionGroup?.runtimeKey ?? ""]
              .filter(Boolean)
              .join("/");
          },
          get ordinal() {
            return [
              ...(facet ? [facet.cell().ordinal] : []),
              ...(partitionGroup?.ordinalPath ?? []),
            ];
          },
          get facet() {
            return facet?.cell() ?? null;
          },
          get partition() {
            return partitionGroup
              ? {
                  key: partitionGroup.key,
                  values: partitionGroup.values,
                  label: partitionGroup.label,
                  depth: partitionGroup.depth,
                }
              : null;
          },
        }
      : null;

  function release() {
    stops.forEach((stop) => stop());
    stops = [];
    registered = null;
  }

  /**
   * The rows on screen: while a keyed lifecycle runs, the union (departing rows kept).
   * @param {ShownPreparation} entry
   * @param {MarkBinding} binding
   */
  function shown(entry, binding) {
    const union = mount.lifecycleUnion(entry);
    const owner = /** @type {{ id?: string } | null} */ (
      binding.interaction?.owner ?? null
    );
    return {
      keyTokens: union ?? entry.keyTokens ?? null,
      tokensRequested: !!entry.tokensRequested,
      owner,
      ownerId: owner?.id ?? null,
      aggregate: !!entry.markScope?.aggregate,
      scope: entry.markScope ?? null,
      props: entry.props,
      lifecycle: !!union,
    };
  }

  return {
    /** Whether a connection consumer demands this mount's rows (it then asks for key tokens). */
    demanded() {
      return Boolean(registered && endpoints?.demanded(registered));
    },
    /**
     * The accepted binding of `mark`, for the displayed preparation `entry` (null: none yet).
     * @param {EndpointMark | null | undefined} mark
     * @param {ShownPreparation | null} entry
     * @param {MarkBinding | undefined} binding
     */
    accept(mark, entry, binding) {
      if (registered && registered.mark !== mark) release();
      if (!endpoints || !mark || mark.isDisposed || !mount.isAlive()) return;
      if (!registered) {
        const entry = {
          kind,
          name: compoundSpec?.name?.() ?? mount.name(),
          label: mark.options.presentation?.label ?? kind,
          compound: compoundSpec?.kind,
          compoundSpec,
          mark,
          options: mark.options,
          frameOptions: frame?.options ?? null,
          frameKey: frame?.key ?? null,
          cell,
          scopes: [facet?.scope()].filter(Boolean),
          renderer,
          connectionBacked: mount.connectionBacked(),
          refresh: () => {
            if (mount.isAlive()) mount.refresh();
          },
          revision: { data: 0, frame: frameRevision(mark) },
        };
        let queued = false;
        const refreshFrame = () => {
          if (queued) return;
          queued = true;
          queueMicrotask(() => {
            queued = false;
            if (registered === entry && !mark.isDisposed)
              endpoints.update(entry, { frame: frameRevision(mark) });
          });
        };
        registered = entry;
        stops = [
          endpoints.register(entry),
          ...FRAME_KEYS.map((key) => mark.options.on(refreshFrame, key)),
          onCoordinateView(mark.options, refreshFrame),
        ];
      }
      // A mark that starts or stops drawing from connections changes whether it can be an endpoint.
      registered.connectionBacked = mount.connectionBacked();
      if (entry && binding)
        endpoints.update(registered, { shown: shown(entry, binding) });
    },
    release,
  };
}
