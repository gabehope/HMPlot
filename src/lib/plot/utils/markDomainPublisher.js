// @ts-check
// A mark's domain publication (TODO 17.2, 26.5; a feature controller since Stage 118.3): which
// axes take its inferred domains, the one readback of their extents, and handing them to its
// frame, else its facet cell (ViewServices.domains.route). The extents it reads are the accepted
// binding's (`extents`), which the axes pad.
import { Array as JaxArray } from "@hmplot/jax";
import {
  domainFields as kindDomainFields,
  domainInputs,
  emptyDomain,
} from "./markDomains.js";
import { extentSummary } from "./extentSummary.js";
import { asArray } from "./data.js";
import { labelMetricFields, labelInsets } from "./labelBounds.js";
import { preparePhysicalDomains } from "./physicalDomains.js";
import { sameRows } from "./dataView.js";
import { isLiteral } from "./categorical.js";
import { isExpression } from "./expressions.js";
import { baselineAxes, capability } from "./markKinds.js";
import { viewStateReads } from "./viewState.js";
import { sameChannels } from "./markUpdatePlan.js";
import { coordinateView } from "./viewContext.js";
import { lintExtents } from "./lintMode.js";

/**
 * @typedef {import("../../options/options.js").OptionsNode} OptionsNode
 * @typedef {{ array: JaxArray, column: number | null }} ColumnField One column of a 2D array,
 *   or (column null) a whole one.
 * @typedef {JaxArray | ColumnField} DomainField
 * @typedef {{ axis: string, fields: DomainField[] }} AxisFields An axis's arrays (markDomains.js).
 * @typedef {number[] & { empty?: boolean }} Domain
 * @typedef {import("./markPlanTypes.js").PreparedAxisDomain} AxisDomain
 * @typedef {import("./markPlanTypes.js").MarkDataRequest} DomainRequest
 * @typedef {import("./internalTypes.js").FrameDomains & {
 *   options?: { categoryAxes?: Record<string, unknown> },
 *   parent?: unknown,
 *   domainRevision?: number,
 *   hasExplicitDomains?: (...axes: string[]) => boolean,
 * }} DomainFrame The frame the mark is in (AXIS_CONTEXT), as domain publication reads it.
 * @typedef {Pick<import("./internalTypes.js").PreparedMark, "props"> & Partial<Pick<
 *   import("./internalTypes.js").PreparedMark, "request" | "gridPlacement" | "iterative" |
 *   "connections" | "valid" | "domains" | "domainInputs" | "domainsRevision" |
 *   "appliedDomains" | "labelsReady" | "cause">>} DomainPreparation
 * @typedef {{
 *   options: OptionsNode,
 *   setCellExtent?: (axis: string, bounds: number[] | null) => void,
 * }} DomainMark The mark object drawing a preparation (a Heatmap places its cells, placeCells).
 */

/** @param {AxisDomain[]} domains */
const extentsOf = (domains) =>
  Object.fromEntries(domains.map(({ axis, domain }) => [axis, domain]));

/**
 * Whether a domain field is one column of an array, not a whole array.
 * @param {DomainField} field
 * @returns {field is ColumnField}
 */
const isColumn = (field) => Boolean(field && "array" in field && field.array);

/**
 * @param {{
 *   kind: string, options: OptionsNode, frame: DomainFrame | null | undefined,
 *   facet: object | null | undefined, renderer: import("./internalTypes.js").PlotRenderer,
 *   route: import("./internalTypes.js").DomainRoute, owner: string,
 *   selection: { hidden: object }, domainSelection: object,
 *   values: () => Record<string, unknown>, domainless: () => boolean,
 *   domainSource?: () => ({ scope: any, fields: Record<string, unknown> | null, reader?: string } | null),
 *   publish: (mark: object, extents: Record<string, number[]> | null) => void,
 * }} mount `values()` are the mark's authored channels; `publish` sets the binding's extents.
 */
export function createMarkDomainPublisher(mount) {
  const {
    kind,
    options,
    frame,
    facet,
    renderer,
    route,
    owner,
    selection,
    domainSelection,
  } = mount;

  // A channel over the pointer or the visible domain (a Text at y="@view_y_max", TODO 45)
  // follows the axis; it never sets it.
  /** @param {string} axis */
  function tracksView(axis) {
    const values = mount.values(),
      at = "xyz".indexOf(axis);
    return [
      values[axis],
      ...["start", "end"].map((key) =>
        Array.isArray(values[key]) ? values[key][at] : undefined,
      ),
    ].some((value) => value !== undefined && viewStateReads(value).tracked);
  }
  // An axis ignores this mark's inferred domain, where reading it back is wasted (17.2a): a
  // domainless mark, mark bounds, a view-following axis, explicit or categorical frame bounds.
  // hm.check reads it on an explicit axis too, to lint a domain far wider than the data.
  /** @param {string} axis */
  const takesNoDomain = (axis) =>
    mount.domainless() ||
    mount.values()[axis + "bounds"] !== undefined ||
    tracksView(axis) ||
    Boolean(
      (frame?.hasExplicitDomains?.(axis) && !lintExtents()) ||
      frame?.options?.categoryAxes?.[axis],
    );
  /**
   * The axes where this mark's sizes are lengths (TODO 67.3): Points with sizeUnits="data" in a
   * Cartesian plot's root frame are `size` x units wide, and as tall in y units when the plot keeps
   * a data unit equal on both (aspect="equal"); under "auto" their height in y units follows the
   * final scales, so y keeps the centers.
   * @param {OptionsNode | null | undefined} markOptions
   * @returns {{ x: boolean, y: boolean } | null}
   */
  function glyphAxes(markOptions) {
    if (
      kind !== "Points" ||
      frame?.parent ||
      markOptions?.get("sizeUnits") !== "data" ||
      options.get("coordinates") !== "cartesian"
    )
      return null;
    /** @param {string} axis */
    const linear = (axis) =>
      (options.get(axis + "Transform") ?? "linear") === "linear";
    let aspect;
    for (let node = options; node && aspect === undefined; node = node.parent)
      if (node.children?.has("plot"))
        aspect = node.children.get("plot").get("aspect");
    return {
      x: linear("x"),
      y: linear("x") && linear("y") && aspect === "equal",
    };
  }
  /**
   * The arrays whose extents set this mark's automatic axis domains, per axis (17.2a/b): none for
   * an axis with explicit bounds or a categorical one. `apply`: a Heatmap's own bounds are
   * applied here (they need no readback). The caller reads them with readDomains. A field is an
   * owned array, or { array, column } for one column of a 2D one: readDomains' one program
   * takes the column (TODO 33.4), where each was sliced here before.
   * @param {Pick<DomainPreparation, "props" | "gridPlacement">} p
   * @param {OptionsNode | null | undefined} markOptions
   * @returns {AxisFields[]}
   */
  function domainFields(p, markOptions, apply = false) {
    return kindDomainFields(kind, p.props, {
      markOptions,
      glyphs: glyphAxes(markOptions),
      skip: (axis) => {
        if (takesNoDomain(axis)) return true;
        // A Heatmap placed by bounds (an Image too when a grid table places it, TODO 51), or a
        // plain grid's cells on their indices (TODO 134.15; namedData.js).
        const cells = /** @type {Record<string, number[]> | undefined} */ (
          p.props._cellBounds
        );
        if (
          (kind === "Heatmap" || (kind === "Image" && p.gridPlacement)) &&
          (p.props[axis + "bounds"] ?? cells?.[axis]) !== undefined
        ) {
          // Its xbounds or ybounds: [min, max] (Heatmap, Image).
          const bounds = /** @type {number[]} */ (
            p.props[axis + "bounds"] ?? cells?.[axis]
          );
          // Padded, not rounded to ticks (TODO 136.17): the bounds place the grid.
          if (apply)
            route.set(
              axis,
              Object.assign([...bounds], {
                anchored: /** @type {any} */ (bounds).anchored,
                exact: [true, true],
              }),
            );
          return true;
        }
        return false;
      },
    });
  }
  /**
   * Every collected axis's [min, max] in one readback (a padded view's valid rows only).
   * @param {AxisFields[]} collected
   * @param {JaxArray | null | undefined} valid
   * @param {Record<string, unknown> | null} [props]
   * @param {OptionsNode | null} [markOptions]
   * @returns {Promise<AxisDomain[]>}
   */
  async function readDomains(
    collected,
    valid,
    props = null,
    markOptions = null,
  ) {
    // Values outside an axis transform's domain are missing: they do not widen it (TODO 39.1).
    const arrays = collected.flatMap(({ axis, fields }) =>
      fields.map((field) => ({
        ...(isColumn(field) ? field : { array: field, column: null }),
        transform: options.get(axis + "Transform"),
      })),
    );
    const { fields: metrics, valid: labelRows } =
      kind === "Text" && props && collected.length
        ? labelMetricFields(props, markOptions, valid)
        : { fields: [], valid: null };
    // A label's metrics are read whole, on a linear scale.
    const requests = [
      ...arrays,
      ...metrics.map((array) => ({ array, column: null, transform: "linear" })),
    ];
    try {
      // A padded view's invalid rows are not shown: they do not widen the domain (17.3b).
      const extents = await Promise.all(
        requests.map((field) =>
          extentSummary.request(field.array, {
            transform: field.transform ?? "linear",
            column: field.column ?? null,
            valid: labelRows ?? valid,
            batch: frame ?? facet ?? renderer,
          }),
        ),
      );
      const screenMetrics = metrics.length
        ? extents.slice(arrays.length)
        : null;
      let at = 0;
      return collected.map(({ axis, fields }) => {
        // An axis the mark draws nothing on (an empty Filter's rows) widens no other mark's.
        const own = extents.slice(at, (at += fields.length)).filter(Boolean);
        return {
          axis,
          domain: own.length
            ? [
                Math.min(...own.map((e) => e[0])),
                Math.max(...own.map((e) => e[1])),
              ]
            : emptyDomain(),
          screenMetrics,
        };
      });
    } finally {
      arrays.forEach((a) => a.array.dispose());
      metrics.forEach((a) => a.dispose());
      labelRows?.dispose();
    }
  }
  /**
   * A view-derived binning transform's input columns in place of the mark's own fields (TODO
   * 136.8, transform.svelte domainSource): the domain follows the data, not the bins, so the view
   * no longer moves the domain that moves the view.
   * @param {AxisFields[]} collected
   * @returns {AxisFields[]}
   */
  function fromInput(collected) {
    const source = mount.domainSource?.();
    if (!source) return collected;
    const values = mount.values();
    return collected.map(({ axis, fields }) => {
      // The transform's input column for this axis, else (a Filter) the mark's own column.
      const column = source.fields ? source.fields[axis] : values[axis];
      if (typeof column !== "string") return { axis, fields };
      let array;
      try {
        array = asArray(source.scope.get(column));
      } catch {
        return { axis, fields };
      }
      for (const field of fields)
        (isColumn(field) ? field.array : field)?.dispose?.();
      return { axis, fields: [array] };
    });
  }
  /**
   * The axes whose domains come from a view-reading transform's output, which its input cannot
   * stand in for (a column it computed from the view): the loop guard counts their publications
   * (TODO 136.8, utils/viewLoopGuard.js).
   * @param {AxisDomain[]} domains
   */
  function reportDerived(domains) {
    const source = mount.domainSource?.();
    if (!source?.reader) return;
    const values = mount.values();
    const axes = domains
      .map(({ axis }) => axis)
      .filter((axis) => {
        const column = source.fields ? source.fields[axis] : values[axis];
        // An expression or an array: unknown, so not counted (a false cycle would stop readers).
        if (typeof column !== "string") return false;
        const scope = source.scope;
        return !(scope?.has
          ? scope.has(column)
          : scope?.keys?.().includes(column));
      });
    if (axes.length) route.derived(source.reader, kind, axes);
  }
  /**
   * Share resolution/footprint semantics; only certified physical rows replace compaction.
   * @param {DomainPreparation} entry
   * @param {OptionsNode} markOptions
   */
  async function readEntryDomains(entry, markOptions, apply = false) {
    const physical = preparePhysicalDomains(
      kind,
      entry.request?.channels,
      entry.request?.markScope,
      options,
      domainSelection,
      frame,
      selection.hidden,
    );
    const source = physical ?? entry;
    try {
      return await readDomains(
        fromInput(domainFields(source, markOptions, apply)),
        source.valid,
        source.props,
        markOptions,
      );
    } finally {
      physical?.dispose();
    }
  }
  /**
   * Hand the read domains to the frame, facet or plot (an axis made explicit since is skipped).
   * @param {AxisDomain[]} domains
   * @param {Record<string, unknown> | null} [props]
   * @param {OptionsNode | null} [markOptions]
   * @param {number} [cause] the change they serve (the frame's hold, TODO 143.2)
   */
  function applyDomains(
    domains,
    props = null,
    markOptions = null,
    cause = undefined,
  ) {
    for (const { axis, domain, screenMetrics } of domains) {
      if (takesNoDomain(axis)) continue;
      const insets = props && labelInsets(screenMetrics, props, markOptions),
        screen = insets?.[axis];
      // A bar's or area's end at 0 is its baseline: the axis is not padded past it (TODO 134.27).
      const anchored =
        (domain[0] === 0 || domain[1] === 0) &&
        props &&
        baselineAxes(kind, props).includes(axis)
          ? [domain[0] === 0, domain[1] === 0]
          : null;
      // A curvilinear grid's corners place a Heatmap or Image: not rounded to ticks (TODO 136.17).
      const exact = capability(kind, "gridTable") ? [true, true] : null;
      const bounds =
        screen || anchored || exact
          ? Object.assign([...domain], {
              empty: domain.empty,
              ...(exact ? { exact } : {}),
              ...(screen
                ? { screen, crossScreen: insets?.[axis === "x" ? "y" : "x"] }
                : {}),
              ...(anchored ? { anchored } : {}),
            })
          : domain;
      route.set(axis, bounds, cause);
    }
  }
  /** The axes a plain Heatmap grid's cell bounds were last applied on (placeCells). */
  const cellAxes = new Set();
  /**
   * A plain Heatmap grid's cells on their indices (TODO 134.15; namedData.js): where its cell
   * bounds set an axis's automatic domain (domainFields), the grid spans them within that domain
   * (Heatmap.setCellExtent), so beside other marks or a larger grid its cells stay on their
   * indices instead of stretching over the axis. An authored xbounds or ybounds, or an explicit
   * domain, places it as before. Where they no longer apply, they are withdrawn from the mark
   * and from the axis.
   * @param {DomainMark} mark @param {Record<string, unknown> | null | undefined} props
   * @param {boolean} collects
   */
  function placeCells(mark, props, collects) {
    // Only a plain Heatmap grid has cell bounds (namedData.js).
    const cells = /** @type {Record<string, number[]> | undefined} */ (
      props?._cellBounds
    );
    // A preparation whose domains are not collected (an iterative layout) leaves them as they are.
    if (!collects || (!cells && !cellAxes.size)) return;
    for (const axis of ["x", "y"]) {
      const own = props?.[axis + "bounds"] !== undefined;
      // Categories label cell indices, including their reversed y order. Retain that
      // placement even though categorical domains do not collect numeric extents.
      const bounds =
        !own &&
        cells?.[axis] &&
        (frame?.options?.categoryAxes?.[axis] ||
          (!takesNoDomain(axis) && !frame?.hasExplicitDomains?.(axis)))
          ? cells[axis]
          : null;
      mark.setCellExtent?.(axis, bounds);
      if (bounds) cellAxes.add(axis);
      // The axis's automatic domain no longer counts the cells (the fill is no grid now, or
      // authored bounds place it).
      else if (cellAxes.delete(axis))
        route.set(
          axis,
          /** @type {number[]} */ (/** @type {unknown} */ (null)),
        );
    }
  }
  const domainRevision = () => frame?.domainRevision ?? 0;
  /** Whether this mark's axis domains do not depend on which rows it shows. */
  function fixed() {
    const axes =
      coordinateView(options) === "3d" ? ["x", "y", "z"] : ["x", "y"];
    return frame
      ? !frame.collect() || Boolean(frame.hasExplicitDomains?.(...axes))
      : !route.collects();
  }

  return {
    fixed,
    /**
     * Start reading a preparation's extents beside the rest of its work, so the data and its
     * axes appear together (TODO 26.5); null where they are read after publishing instead.
     * Paint and CSS-sized point changes do not change position summaries: the previous
     * preparation's host summary is reused while its inputs certify the same geometry.
     * @param {DomainPreparation & { request: DomainRequest }} next
     * @param {{
     *   mark: DomainMark | null | undefined,
     *   previous: DomainPreparation | null | undefined,
     *   markScope: { has?: (name: string) => boolean, get(name: string): unknown }
     *     | null | undefined,
     *   connection: unknown,
     * }} context
     * @returns {Promise<AxisDomain[]> | null}
     */
    prepare(next, { mark, previous, markScope, connection }) {
      if (
        !mark ||
        connection ||
        kind === "Heatmap" ||
        (kind === "Image" && next.gridPlacement) ||
        next.iterative ||
        mount.domainless()
      )
        return null;
      // Published options still describe the previous footprint. Changing authored units
      // (including clearing them) waits for the child to publish its next effective units.
      if (
        kind === "Points" &&
        !Object.is(
          previous?.request?.channels?.sizeUnits,
          next.request.channels.sizeUnits,
        )
      )
        return null;
      if (!route.collects()) return null;
      // Current immutable column identities invalidate the summary when a live producer changes
      // geometry. Expressions remain conservative here.
      const inputs = domainInputs(kind, next.request.channels, {
        glyphs: glyphAxes(mark.options),
        resolve: (value, channel) => {
          const reads = viewStateReads(value);
          if (
            isExpression(value) ||
            reads.live ||
            reads.stepped ||
            reads.tracked
          )
            return null;
          // Geometry options are literals even when a table happens to have that name.
          if (
            ["axis", "shape", "curve", "curveAlpha", "font"].includes(channel)
          )
            return value;
          if (typeof value === "string" && markScope?.has?.(value))
            return markScope.get(value);
          // Source generations certify named host columns; directly authored mutable arrays
          // have no revision and may be edited without changing their object identity.
          if (
            value &&
            typeof value === "object" &&
            !(value instanceof JaxArray) &&
            !isLiteral(value)
          )
            return null;
          if (
            isLiteral(value) &&
            value.value &&
            typeof value.value === "object"
          )
            return null;
          return value;
        },
      });
      if (inputs)
        for (const axis of "xyz")
          inputs[axis + "Transform"] = options.get(axis + "Transform");
      const prior = previous?.request;
      const reuse =
        inputs &&
        previous?.domainInputs &&
        previous?.domains &&
        previous.domainsRevision === domainRevision() &&
        prior?.generation === next.request.generation &&
        prior?.revision === next.request.revision &&
        sameRows(prior?.markScope, next.request.markScope) &&
        previous.valid === next.valid &&
        sameChannels(previous.domainInputs, inputs);
      const work =
        reuse && previous?.domains
          ? previous.domains
          : next.labelsReady
            ? // Label room is measured from the labels: after a GPU text's read (TODO 143.6).
              next.labelsReady.then(() => readEntryDomains(next, mark.options))
            : readEntryDomains(next, mark.options);
      work.catch(() => {});
      next.domains = work;
      next.domainInputs = inputs;
      next.domainsRevision = domainRevision();
      return work;
    },
    /**
     * Publish the domains of an accepted preparation once `mark` draws `shown`: a connection's
     * count in its endpoints' frames; otherwise the accepted target's (`accepted`, not a
     * transition's union rows) are read (or taken from its preparation) and applied. Returns the
     * release of a Text's label-bound watch.
     * @param {DomainMark} mark
     * @param {Pick<DomainPreparation, "connections" | "iterative">} shown
     * @param {DomainPreparation} accepted
     * @param {() => boolean} canceled
     * @returns {Promise<(() => void) | null>}
     */
    async publish(mark, shown, accepted, canceled) {
      return publishDomains(mark, shown, accepted, canceled);
    },
    /**
     * A live write moved the accepted preparation's geometry: read and apply its domains again,
     * unless `accepted()` says the write was superseded.
     * @param {DomainPreparation} entry
     * @param {Record<string, unknown>} props The channels as written.
     * @param {DomainMark} mark
     * @param {() => boolean} accepted
     */
    async write(entry, props, mark, accepted) {
      if (fixed() || mount.domainless()) return;
      const collected = domainFields({ ...entry, props }, mark.options);
      if (!collected.length) return;
      const domains = await readDomains(
        collected,
        entry.valid,
        props,
        mark.options,
      );
      if (!accepted()) return;
      mount.publish(mark, extentsOf(domains));
      // Later bounds passes and Text's align/displayScale updates apply these, not the preparation's.
      entry.domains = Promise.resolve(domains);
      entry.domainsRevision = domainRevision();
      entry.appliedDomains = domains;
      reportDerived(domains);
      applyDomains(domains, props, mark.options);
    },
  };
  /**
   * publish's work (above).
   * @param {DomainMark} mark
   * @param {Pick<DomainPreparation, "connections" | "iterative">} shown
   * @param {DomainPreparation} accepted
   * @param {() => boolean} canceled
   * @returns {Promise<(() => void) | null>}
   */
  async function publishDomains(mark, shown, accepted, canceled) {
    if (shown.connections) {
      mount.publish(mark, null);
      route.clear();
      return null;
    }
    placeCells(mark, accepted.props, route.collects() && !shown.iterative);
    if (!route.collects() || shown.iterative) {
      mount.publish(mark, null);
      return null;
    }
    // Fit the accepted target once; Frame's bounds animation advances it on the shared clock.
    const domains =
      accepted.domains && accepted.domainsRevision === domainRevision()
        ? await accepted.domains
        : await readEntryDomains(accepted, mark.options, true);
    if (canceled()) return null;
    accepted.domains = Promise.resolve(domains);
    accepted.domainsRevision = domainRevision();
    accepted.appliedDomains = domains;
    // The mark keeps its own extents, which the axes pad: a Line with sampling="uniform-x"
    // places its first and last rows at x's (sampledBuffers.js).
    mount.publish(mark, extentsOf(domains));
    reportDerived(domains);
    // The change these serve: the frame applies one domain for all it moves (TODO 143.2).
    applyDomains(domains, accepted.props, mark.options, accepted.cause);
    if (kind !== "Text") return null;
    // A Text's insets follow its alignment and display scale.
    // The domains applied last: these, or a later live write's.
    const update = () =>
      applyDomains(
        accepted.appliedDomains ?? domains,
        accepted.props,
        mark.options,
      );
    const stops = ["align", "displayScale"].map((key) =>
      mark.options.on(update, key),
    );
    return () => stops.forEach((stop) => stop());
  }
}
