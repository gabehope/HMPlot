// @ts-check
// A mark's tooltips (TODO 44; a feature controller since Stage 118.3): the box its picked row
// or cell shows in its view, the @tooltip rows that row is (a preview on its data's tooltip
// resource), and its series in a unified x tooltip. The accepted binding carries `series` and
// `clear` to the view's tooltip controller; a row's color comes from the binding's legend.
import { numpy as np } from "@hmplot/jax";
import { capability } from "./markKinds.js";
import { piecesPerSegment } from "./segmentRows.js";
import { shapeOf } from "./data.js";
import { interactionRows } from "./interaction.js";
import { markEntry } from "./guides.js";
import { markBinding } from "./markBinding.js";
import { cellAt } from "./gridModel.js";
import {
  tooltipMode,
  rowValues,
  tooltipLines,
  formatValue,
  axisValueText,
  gridCell,
  gridValues,
} from "./tooltip.js";
import { sourcePosition } from "../../picking/sourcePosition.js";
import { themeNumberFormat } from "./numberLabels.js";

/**
 * @typedef {import("@hmplot/jax").Array} JaxArray
 * @typedef {import("./viewControllerTypes.js").BrushResource} InteractionResource
 * @typedef {import("./internalTypes.js").TooltipSeriesEntry} TooltipSeriesEntry
 * @typedef {Parameters<typeof formatValue>[1]} ValueMeta A value's metadata, as formatValue
 *   writes it.
 * @typedef {{
 *   length?: number,
 *   columnName?: (field: string) => string | null | undefined,
 *   metadata?: (field: string) => ValueMeta | null,
 * }} TooltipScope The rows a tooltip reads (a data scope or view): rowValues reads the rest.
 * @typedef {{ resource: InteractionResource, owner: import("./viewControllerTypes.js").InteractionOwner, scope: import("./viewControllerTypes.js").MembershipScope }} TooltipTarget
 *   Where the rows a box shows are written as @tooltip: its data's tooltip resource.
 * @typedef {{ field?: string, plotted?: string, label?: string, format?: string }} TooltipField
 *   A listed column (`field`), or a plotted position (`plotted`: "x", "y" or "z").
 * @typedef {{ fields?: TooltipField[] | null,
 *   content?: import("svelte").Snippet<[unknown]> | null }} TooltipSettingValue
 *   A mark's tooltip setting (tooltip.js tooltipSetting).
 * @typedef {{ name: string, coords: ArrayLike<unknown>, stride: number, metadata?: ValueMeta }} GridDim
 * @typedef {{
 *   grid: { dims: readonly GridDim[] },
 *   layout: { columns: number, rows: number, curvilinear?: boolean },
 *   shifts: Record<string, number>,
 *   field?: string | null,
 * }} GridPlacement A grid table's placement of a Heatmap or Image (TODO 51).
 * @typedef {{ codes?: unknown, categories?: unknown[] }} GridChannel A grid mark's values: an
 *   array, or a categorical one's codes and categories.
 * @typedef {{
 *   props?: Record<string, unknown> & { data?: GridChannel, fill?: GridChannel },
 *   channels?: Record<string, unknown>,
 *   markScope?: TooltipScope | null,
 *   request?: { markScope?: TooltipScope | null } | null,
 *   interactionIndex?: JaxArray | null,
 *   gridPlacement?: GridPlacement | null,
 *   tooltipTarget?: TooltipTarget | null,
 * }} TooltipPreparation The displayed preparation (namedMark's entry), as tooltips read it.
 * @typedef {{
 *   rowIndex?: number,
 *   instanceId?: number,
 *   sourceRow?: number,
 *   aggregate?: Record<string, unknown> | null,
 *   axisValue?: { x: number, y: number, z?: number },
 *   dataPoint?: number[],
 *   uv?: { x: number, y: number },
 *   point?: { x: number, y: number, z: number },
 * }} TooltipEvent A pick of the mark (picking/setupInteractivity.svelte.js).
 * @typedef {{ drawn: number, field: string, index: number }} DrawnEnd
 */

/**
 * @param {{
 *   kind: string,
 *   view: import("./internalTypes.js").ViewServices,
 *   plotDefault: () => unknown,
 *   axisMeta: (axis: string) => { origin?: number } | undefined,
 *   axisConfig?: (axis: string) => Parameters<typeof axisValueText>[1],
 *   shown: () => TooltipPreparation | null,
 *   mark: () => object | null | undefined,
 * }} mount `shown()` is the displayed preparation, `mark()` the mark object drawing it.
 */
export function createMarkTooltip({
  kind,
  view,
  plotDefault,
  axisMeta,
  axisConfig = () => undefined,
  shown,
  mark: currentMark,
}) {
  const owner = {};
  let version = 0;
  // A value as the box writes it, in the theme's number format if it sets one (TODO 132.4).
  /** @param {unknown} value @param {ValueMeta | null} [meta] */
  const valueText = (value, meta = undefined) =>
    formatValue(
      value,
      meta,
      undefined,
      themeNumberFormat(/** @type {any} */ (currentMark())?.options),
    );
  // The rows the box shows, as @tooltip: the target they were written to.
  /** @type {TooltipTarget | null} */
  let written = null;
  // The cell a grid mark's box shows (read once per cell).
  /** @type {string | null} */
  let gridKey = null;

  // The drawn rows a pick instance stands for, with where their plotted positions are: a
  // segment's two ends on a Line, Area (its "start" and "end"; the pieces a curve
  // draws for a segment are one segment), else the instance ("position").
  /**
   * @param {number} instance
   * @returns {DrawnEnd[]}
   */
  function instanceRows(instance) {
    if (!capability(kind, "segmentRows"))
      return [{ drawn: instance, field: "position", index: instance }];
    const segment = Math.floor(
      instance / piecesPerSegment(kind, shown()?.props),
    );
    return [
      { drawn: segment, field: "start", index: instance },
      { drawn: segment + 1, field: "end", index: instance },
    ];
  }
  /**
   * @param {object} mark
   * @param {DrawnEnd} end
   */
  const plottedAt = (mark, end) => sourcePosition(mark, end.index, end.field);
  // A row's color: its category's among the mark's legend entries, else the mark's own.
  /**
   * @param {object | null | undefined} mark
   * @param {Record<string, unknown>} values
   * @returns {string | undefined}
   */
  function rowColor(mark, values) {
    const categories = markBinding(mark)?.legend?.categories;
    for (const channel of ["fill", "color"]) {
      const meta = categories?.[channel],
        field = meta?.field;
      if (!field || !(field in values)) continue;
      const entry = meta?.entries?.find((item) =>
        Object.is(item.value, values[field]),
      );
      if (entry?.color) return entry.color;
    }
    try {
      return mark ? markEntry(mark).color : undefined;
    } catch {
      return undefined;
    }
  }
  // The columns a row's color comes from (the mark's categorical fill or color).
  /** @param {object | null | undefined} mark */
  const colorFields = (mark) => {
    const categories = markBinding(mark)?.legend?.categories;
    return ["fill", "color"]
      .map((channel) => categories?.[channel]?.field)
      .filter((field) => typeof field === "string");
  };
  // A drawn row's row in the mark's scope: a series line regroups its rows (interactionIndex).
  /**
   * @param {number} drawn
   * @returns {Promise<number>}
   */
  async function scopeRow(drawn) {
    const index = shown()?.interactionIndex;
    if (!index) return drawn;
    if (drawn < 0 || drawn >= index.shape[0]) return -1;
    const at = np.array([drawn], { dtype: np.int32 });
    return Number((await np.take(index.ref, at, 0).data())[0]);
  }
  /** Withdraw the @tooltip rows, and supersede reads in flight. */
  function clear() {
    version++;
    written?.resource.cancelPreview(written.owner);
    written = null;
  }
  function hide() {
    clear();
    view.navigation.tooltip.current?.hide(owner);
  }

  /**
   * A mark without rows (Heatmap, Image, Surface): the value at the pointer. A Heatmap's or an
   * Image's cell (read once per cell), a Surface's point; x and y as the axes write them.
   * @param {TooltipEvent} event
   * @param {Record<string, unknown>} props
   */
  async function showGrid(event, props) {
    const box = view.navigation.tooltip.current,
      entry = shown();
    if (!box || !entry || tooltipMode(plotDefault()) === "x") return;
    const grid =
      kind === "Image"
        ? entry.props?.data
        : kind === "Heatmap"
          ? entry.props?.fill
          : null;
    const shape = shapeOf(grid?.codes ?? grid);
    // A grid table's cell (TODO 51): found by its dimensions' edges (uneven ones too), or by the
    // mesh's uv over a curvilinear grid's own cells.
    const placement = entry.gridPlacement;
    /** @type {number[] | null} */
    let cell = null;
    // A pick without an axis value reads NaN there, as arithmetic on its absence does.
    if (placement && !placement.layout.curvilinear) {
      const xdim = placement.grid.dims[placement.layout.columns],
        ydim = placement.grid.dims[placement.layout.rows];
      const at = event.dataPoint ?? [
        Number(event.axisValue?.x) - (axisMeta("x")?.origin ?? 0),
        Number(event.axisValue?.y) - (axisMeta("y")?.origin ?? 0),
      ];
      const i = cellAt(ydim, at[1] - placement.shifts.y),
        j = cellAt(xdim, at[0] - placement.shifts.x);
      cell = i >= 0 && j >= 0 ? [i, j] : null;
    } else
      cell =
        grid && event.uv && shape?.length >= 2
          ? gridCell(shape, event.uv)
          : null;
    const key = cell
      ? cell.join(",")
      : `${event.point?.x},${event.point?.y},${event.point?.z}`;
    if (key === gridKey && box.current?.owner === owner) return;
    gridKey = key;
    const read = ++version;
    const point = event.dataPoint ?? [
      event.axisValue?.x,
      event.axisValue?.y,
      event.axisValue?.z,
    ];
    /** @type {{ label: string, text: string }[]} */
    const lines = [];
    /** @param {string} axis */
    const origin = (axis) => axisMeta(axis)?.origin ?? 0;
    // A Heatmap's dataPoint is in its axes' units; a pick's axisValue counts datetimes as epoch ms.
    lines.push({
      label: "x",
      // The axis's own format first (TODO 132.4).
      text: axisValueText(
        event.dataPoint ? point[0] : Number(point[0]) - origin("x"),
        axisConfig("x"),
        themeNumberFormat(/** @type {any} */ (currentMark())?.options),
      ),
    });
    lines.push({
      label: "y",
      // The axis's own format first (TODO 132.4).
      text: axisValueText(
        event.dataPoint ? point[1] : Number(point[1]) - origin("y"),
        axisConfig("y"),
        themeNumberFormat(/** @type {any} */ (currentMark())?.options),
      ),
    });
    if (cell && placement) {
      // The cell's coordinates and its row's value (hidden or missing: none).
      const { grid: model, layout, field } = placement,
        xdim = model.dims[layout.columns],
        ydim = model.dims[layout.rows];
      const scope = entry.request?.markScope;
      /** @param {string} column */
      const name = (column) => scope?.columnName?.(column) ?? column;
      if (!layout.curvilinear) {
        lines.length = 0;
        lines.push({
          label: name(xdim.name),
          text: valueText(xdim.coords[cell[1]], xdim.metadata),
        });
        lines.push({
          label: name(ydim.name),
          text: valueText(ydim.coords[cell[0]], ydim.metadata),
        });
      }
      const texel = await gridValues(grid, cell);
      if (read !== version) return;
      const visible = texel && (kind === "Image" ? texel[3] > 0 : texel[1] > 0);
      if (kind === "Image")
        lines.push({
          label: "rgba",
          text:
            visible && texel
              ? texel.map((v) => formatValue(v)).join(", ")
              : "missing",
        });
      else if (field && scope) {
        const row = cell[0] * ydim.stride + cell[1] * xdim.stride,
          value = visible
            ? (await rowValues(scope, [field], row))[field]
            : null;
        if (read !== version) return;
        lines.push({
          label: name(field),
          text:
            value === null || value === undefined
              ? "missing"
              : valueText(value, scope.metadata?.(field)),
        });
      }
    } else if (cell) {
      const values = await gridValues(grid, cell);
      if (read !== version) return;
      if (kind === "Image" && values && values.length > 1)
        lines.push({
          label: "rgba".slice(0, values.length),
          text: values.map((v) => formatValue(v)).join(", "),
        });
      else
        lines.push({
          label: typeof props.fill === "string" ? props.fill : "value",
          text: valueText(
            grid?.categories
              ? values
                ? grid.categories[values[0]]
                : undefined
              : values?.[0],
          ),
        });
    } else if (kind === "Surface")
      lines.push({ label: "z", text: valueText(point[2]) });
    box.show(owner, {
      row: key,
      title: typeof props.label === "string" ? props.label : undefined,
      lines,
      content: null,
      context: null,
    });
  }

  /**
   * The row of the mark's scope a pick names, and what was drawn there: the picked row, or for a
   * segment the end nearer the pointer in x (a line's row), in the scope's order. null when the
   * pick names no row. A tooltip and an input a click writes (TODO 145.2) read the same row.
   * @param {TooltipEvent} event
   * @returns {Promise<{ row: number, drawn: number | DrawnEnd } | null>}
   */
  async function pickedRow(event) {
    /** @type {number | undefined} */
    let row = event.rowIndex ?? event.instanceId;
    /** @type {number | DrawnEnd | undefined} */
    let drawn = row;
    if (row === undefined || !Number.isInteger(row) || row < 0) return null;
    if (
      !event.aggregate &&
      (capability(kind, "segmentRows") || shown()?.interactionIndex)
    ) {
      const candidates = instanceRows(row),
        mark = currentMark();
      let end = candidates[0];
      const x = Number(event.axisValue?.x) - (axisMeta("x")?.origin ?? 0);
      if (candidates.length > 1 && mark && Number.isFinite(x)) {
        const ends = await Promise.all(
          candidates.map((candidate) => plottedAt(mark, candidate)),
        );
        if (
          ends.every(Boolean) &&
          Math.abs(ends[1][0] - x) < Math.abs(ends[0][0] - x)
        )
          end = candidates[1];
      }
      drawn = end;
      row = await scopeRow(end.drawn);
      if (row < 0) return null;
    }
    return { row, drawn: /** @type {number | DrawnEnd} */ (drawn) };
  }
  /**
   * Show the picked row's values (the event carries its row: namedData's handler wrapper).
   * @param {TooltipEvent} event
   * @param {TooltipSettingValue} setting
   * @param {TooltipField[]} fields The columns listed when the setting lists none.
   * @param {TooltipScope | null | undefined} scope
   * @param {Record<string, unknown>} props
   * @param {TooltipTarget | null} target
   */
  async function show(event, setting, fields, scope, props, target) {
    const box = view.navigation.tooltip.current,
      read = ++version;
    if (!box || tooltipMode(plotDefault()) === "x") return;
    const picked = await pickedRow(event);
    if (!picked) return;
    const { row, drawn } = picked;
    // An aggregate's row (a Histogram bar, a Group row): its provenance fields when none are given.
    const provenance = event.aggregate
      ? Object.fromEntries(
          Object.entries(event.aggregate).filter(
            ([key]) => key !== "index" && key !== "kind",
          ),
        )
      : null;
    /** @type {TooltipField[]} */
    const listedFields =
      setting.fields ??
      (provenance
        ? Object.keys(provenance).map((field) => ({ field }))
        : fields);
    const mark = currentMark();
    const reads = [
      ...new Set([
        ...listedFields.flatMap((item) => (item.field ? [item.field] : [])),
        ...colorFields(mark),
      ]),
    ].filter((field) => !(provenance && field in provenance));
    /** @type {Record<string, unknown>} */
    const values = {
      ...provenance,
      ...(reads.length && scope ? await rowValues(scope, reads, row) : {}),
    };
    /** @type {Record<string, unknown>} */
    const plotted = {};
    if (listedFields.some((item) => item.plotted) && mark) {
      const position = await (typeof drawn === "object"
        ? plottedAt(mark, drawn)
        : sourcePosition(mark, drawn));
      ["x", "y", "z"].forEach((axis, i) => (plotted[axis] = position?.[i]));
    }
    if (read !== version) return;
    // The title: the mark's legend label, or the category its fill (or color) names.
    const category = [props.fill, props.color]
      .filter((field) => typeof field === "string")
      .find((field) => typeof values[field] === "string");
    const title =
      typeof props.label === "string"
        ? props.label
        : category
          ? // A string: the category was found by it.
            /** @type {string} */ (values[category])
          : undefined;
    const listed =
      category && typeof props.label !== "string"
        ? listedFields.filter((item) => item.field !== category)
        : listedFields;
    const lines = tooltipLines(listed, values, {
      meta: (field) => scope?.metadata?.(field),
      name: (field) => scope?.columnName?.(field) ?? field,
      plotted,
      axisMeta,
      numberFormat: themeNumberFormat(/** @type {any} */ (mark)?.options),
    });
    const sourceRow = event.sourceRow ?? row;
    if (target) {
      // The table's rows: the event's own, else the view's (an aggregate row's contributors).
      const own =
        !event.aggregate &&
        row === (event.rowIndex ?? event.instanceId) &&
        event.sourceRow !== undefined;
      const rows = own
        ? [/** @type {number} */ (event.sourceRow)]
        : await interactionRows(target.scope, [row]);
      if (read !== version) return;
      target.resource.replace(target.owner, rows, { phase: "preview" });
      written = target;
    }
    box.show(owner, {
      row: sourceRow,
      title,
      swatch: rowColor(mark, values),
      lines,
      content: setting.content,
      context: { values, row: sourceRow, mark: kind, lines },
    });
  }

  /**
   * Unified x (TODO 44.4): the rows of pick instances in a strip at the pointer's x (the view's
   * strip read), each series' row nearest `x` (the x axis's value, as the marks draw it): its
   * series' name, y value and plotted x, and the strip pixel it was found at.
   * @param {{ instanceId: number, pixel: number[] }[]} instances
   * @param {number} x
   * @returns {Promise<TooltipSeriesEntry[]>}
   */
  async function series(instances, x) {
    const mark = currentMark(),
      entry = shown(),
      props = entry?.channels ?? {},
      scope = entry?.markScope;
    if (!mark || !entry) return [];
    const read = ++version,
      current = () => read === version && entry === shown();
    /** @type {Map<number, DrawnEnd & { hit: { instanceId: number, pixel: number[] } }>} */
    const hits = new Map();
    for (const hit of instances)
      for (const end of instanceRows(hit.instanceId))
        if (end.drawn >= 0 && !hits.has(end.drawn))
          hits.set(end.drawn, { ...end, hit });
    // In the order drawn rows were found (a Map keeps its insertion order).
    const drawnHits = [...hits.values()];
    const ends = await Promise.all(
      drawnHits.map((end) => plottedAt(mark, end)),
    );
    if (!current()) return [];
    const seriesField = typeof props.series === "string" ? props.series : null;
    const yField = typeof props.y === "string" ? props.y : null;
    /**
     * @type {Map<unknown, { distance: number, row: number, x: number, value: unknown,
     *   series: unknown, pixel: number[], swatch: string | undefined }>}
     */
    const best = new Map();
    for (let i = 0; i < drawnHits.length; i++) {
      if (!ends[i]) continue;
      const row = await scopeRow(drawnHits[i].drawn);
      if (!current()) return [];
      if (row < 0) continue;
      /** @type {Record<string, unknown>} */
      const values = scope
        ? await rowValues(
            scope,
            [
              ...new Set(
                [seriesField, yField, ...colorFields(mark)].filter(Boolean),
              ),
            ],
            row,
          )
        : {};
      if (!current()) return [];
      const name = seriesField ? values[seriesField] : null,
        distance = Math.abs(ends[i][0] - x);
      const found = best.get(name);
      if (!found || distance < found.distance)
        best.set(name, {
          distance,
          row,
          x: ends[i][0],
          value: yField ? values[yField] : ends[i][1],
          series: name,
          pixel: drawnHits[i].hit.pixel,
          swatch: rowColor(mark, values),
        });
    }
    // Each listed row is @tooltip, in the table's rows.
    const target = entry.tooltipTarget;
    if (target) {
      const rows = (
        await Promise.all(
          [...best.values()].map((found) =>
            interactionRows(target.scope, [found.row]),
          ),
        )
      ).flat();
      if (!current()) return [];
      target.resource.replace(target.owner, rows, { phase: "preview" });
      written = target;
    }
    return [...best.values()].map((found) => ({
      name:
        found.series != null
          ? String(found.series)
          : typeof props.label === "string"
            ? props.label
            : (yField ?? kind),
      text: valueText(
        found.value,
        yField ? scope?.metadata?.(yField) : axisMeta("y"),
      ),
      x: found.x,
      pixel: found.pixel,
      swatch: found.swatch,
    }));
  }

  return {
    showGrid,
    show,
    series,
    /**
     * The value of `field` at the row a pick names, in `scope` (TODO 145.2: an input a click or a
     * hover writes); undefined when the pick names no row.
     * @param {TooltipEvent} event @param {TooltipScope} scope @param {string} field
     */
    async valueAt(event, scope, field) {
      const picked = await pickedRow(event);
      if (!picked) return undefined;
      return (await rowValues(scope, [field], picked.row))[field];
    },
    clear,
    hide,
    /**
     * The tolerant pick left the mark: a grid mark reads its next cell again; hide its box.
     * @param {boolean} hasTooltip
     */
    leave(hasTooltip) {
      gridKey = null;
      if (hasTooltip) hide();
    },
  };
}
