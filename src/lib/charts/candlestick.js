// @ts-check
// A candlestick chart (TODO 130.4): per row, a wick from its low to its high and a body from its
// open to its close, filled by whether the price rose or fell. As in Waterfall, Calculate puts the
// close in a "Rising" or a "Falling" column (a close equal to its open rises), Fold makes them
// rows and Filter keeps the one with a value, so the Bar's fill is the direction and a Legend
// names it; inside the chart those two columns hide data columns of the same names. The wicks
// are a named part, wick={...}, and follow the chart's opacity, selection, animation and axes (following()).
import { dataExpression, defineChart, following, node, option, param, rest } from "../templates/define.js";

const when = (/** @type {string} */ op) => dataExpression("where", dataExpression(op, param("close"), param("open")), param("close"), NaN);

export default defineChart({
  kind: "Candlestick",
  summary: "Prices over time as candles: a wick from each period's low to its high, and a body from its open to its close.",
  use: ["mark", "markSettings", "transparent"],
  omit: ["y", "z", "position", "rows", "color", "colorScale", "colormap", "size", "sizeScale", "width", "widthScale", "brush", "drag", "nearby", "ondrag", "ondragend"],
  usage: "Each row is one period: its `x` (a number, a date or a category) and its `open`, `high`, `low` and `close` columns. On a numeric or date axis a body's width is `bandFraction` in the axis's units: for daily dates, milliseconds, so `bandFraction={0.7 * 86400000}`. The body is filled by direction, so a Legend names the rising and falling periods, and `fillScale` picks their colors.",
  params: {
    data: option("table", "A table for this mark alone: a mark with data displays on its own, in a Plot of its own.", { languages: "python" }),
    x: option("column", "The column of the periods along x, one candle each.", { input: true, required: true }),
    open: option("column", "The column of each period's opening price.", { input: true, required: true }),
    high: option("column", "The column of each period's highest price.", { input: true, required: true }),
    low: option("column", "The column of each period's lowest price.", { input: true, required: true }),
    close: option("column", "The column of each period's closing price.", { input: true, required: true }),
    bandFraction: option("number", "The share of its period's band each body fills, 0 to 1; on a numeric or date axis, the body's width in the axis's units (milliseconds for dates).", { default: 0.7 }),
    wick: option("object", "The wicks' own props, as one object: {color: \"black\", width: 2}. They are a Segments, gray and 1 px wide by default."),
  },
  label: "Candlestick",
  parts: ["wick"],
  root: node("Mapping", {}, [
    node("Segments", { start: [param("x"), param("low")], end: [param("x"), param("high")], color: "#5b6470", width: 1,
      ...following() }, [], { id: "wick" }),
    node("Calculate", { columns: { Rising: when("greater_equal"), Falling: when("less") } }, [
      node("Fold", { fields: ["Rising", "Falling"], as: { key: "__candleDirection", value: "__candleClose" } }, [
        node("Filter", { where: { field: "__candleClose", op: "finite" } }, [
          node("Bar", { x: param("x"), y: "__candleClose", baseline: param("open"), fill: "__candleDirection",
            orientation: "vertical", bandFraction: param("bandFraction"), ...rest() }),
        ]),
      ]),
    ]),
  ]),
});
