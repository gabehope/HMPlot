// TODO 32.7: mark capabilities in one table (utils/markKinds.js).
import test from "node:test";
import assert from "node:assert/strict";
import {
  MARK_CAPABILITIES,
  kindsWith,
} from "../../src/lib/plot/utils/markKinds.js";

const ALLOWED = {
  rows: [true, false],
  hiddenRows: ["scattered", "masked", "prefix", null],
  keyed: [true, false],
  endpoint: [true, false],
  connections: [true, false],
  curves: [true, false],
  points: [true, false],
  series: [true, false],
  seriesChannel: ["color", "fill", null],
  dodge: [true, false],
  endpointOffsets: [true, false],
  geometricWidth: [true, false],
  segmentRows: [true, false],
  xyzPosition: [true, false],
  rowColors: [true, false],
  symbols: [true, false],
  outlines: [true, false],
  frame: ["nested", "intervals", "patches", "flat", "warped", null],
  drag: [true, false],
  gridTable: [true, false],
  regions: [true, false],
  baseline: [true, false],
  strokeWidth: [true, false],
  frameEdges: [true, false],
  caps: [true, false],
  liveChannels: (value) => Array.isArray(value) && Object.isFrozen(value),
  liveWriter: ["position", "corners", "labels", null],
  retains: ["static", null],
  feedbackChannels: (value) => Array.isArray(value) && Object.isFrozen(value),
  labels: [true, false],
};

test("every mark kind declares every capability, with a known value", () => {
  for (const [kind, capabilities] of Object.entries(MARK_CAPABILITIES)) {
    assert.deepEqual(
      Object.keys(capabilities).sort(),
      Object.keys(ALLOWED).sort(),
      kind,
    );
    for (const [name, values] of Object.entries(ALLOWED))
      assert.ok(
        typeof values === "function"
          ? values(capabilities[name])
          : values.includes(capabilities[name]),
        `${kind}.${name}: ${capabilities[name]}`,
      );
  }
});
test("outline inheritance applies only to filled boundaries and flat point symbols", async () => {
  const {resolveMappings} = await import("../../src/lib/plot/utils/mapping.js");
  const style = {outlineColor:"red",outlineWidth:2,outlineOpacity:0.5};
  assert.deepEqual(resolveMappings("Rect",[style],{}).values,style);
  for (const kind of ["Text","Text3D","ErrorBars","Points3D","Prism","Line","Segments","Heatmap","Image","Surface"])
    assert.deepEqual(resolveMappings(kind,[style],{}).values,{},kind);
});

// The lists the table replaced, as they were (2026-09-26): the table must keep them.
const same = (name, value, expected) =>
  assert.deepEqual(
    new Set(kindsWith(name, value)),
    new Set(expected),
    `${name}${value === undefined ? "" : `=${value}`}`,
  );

test("the capabilities reproduce the kind lists they replaced", () => {
  same("hiddenRows", "scattered", [
    "Points",
    "Points3D",
    "Text",
    "Rect",
    "Prism",
    "Segments",
    "Arrows3D",
    // Polygon's triangles (TODO 47.4).
    "Polygon",
  ]);
  same("hiddenRows", "masked", ["ErrorBars", "Area"]);
  // namedData's lists: kinds whose x, y and z are not one position, kinds without per-row
  // colors, and flat point marks (shape and outline channels).
  same("xyzPosition", false, ["Rect", "Prism", "Area", "Heatmap", "Image", "Surface", "Polygon"]);
  same("rowColors", false, ["Heatmap", "Image", "Surface", "Text3D"]);
  same("symbols", undefined, ["Points"]);
  same("keyed", undefined, [
    "Anchor",
    "Points",
    "Points3D",
    "Segments",
    "Arrows3D",
    "Text",
    "ErrorBars",
    "Rect",
    "Prism",
  ]);
  // In order: ENDPOINT_KINDS and CONNECTION_KINDS reach the Python registry.
  assert.deepEqual(kindsWith("endpoint"), [
    "Anchor",
    "Points",
    "Points3D",
    "Text",
    "Rect",
    "Prism",
    "Segments",
    "Arrows3D",
  ]);
  assert.deepEqual(kindsWith("connections"), [
    "Line",
    "Segments",
    "Arrows3D",
  ]);
  same("curves", undefined, ["Line", "Segments", "Arrows3D"]);
  same("rows", false, ["Heatmap", "Image", "Surface"]);
  same("points", undefined, [
    "Points",
    "Points3D",
    "Text",
  ]);
  same("dodge", undefined, ["Points"]);
  same("endpointOffsets", undefined, [
    "Points",
    "Points3D",
  ]);
  same("geometricWidth", undefined, ["Prism", "Rect"]);
  same("segmentRows", undefined, ["Line", "Area"]);
  // TODO 62: the marks whose hover, selection and brush take whole series.
  same("series", undefined, ["Line", "Area"]);
  const frameSafe = ["nested", "intervals", "patches", "flat"].flatMap(
    (frame) => kindsWith("frame", frame),
  );
  assert.deepEqual(
    new Set(frameSafe),
    new Set([
      "Anchor",
      "Points",
      "Points3D",
      "Text",
      "Line",
      "Segments",
      "Arrows3D",
      "Rect",
      "Prism",
      "Area",
      "ErrorBars",
      "Text3D",
    ]),
  );
  same("frame", "nested", [
    "Anchor",
    "Points",
    "Text",
    "Text3D",
    "Line",
    "Segments",
    "Arrows3D",
  ]);
  same("frame", "intervals", ["Area", "ErrorBars"]);
  same("frame", "patches", ["Rect"]);
  same("frame", "warped", ["Heatmap", "Image"]);
  // TODO 118.5: namedMark's and namedData's grid-table pair (Heatmap or Image), tooltip.js's
  // AREA_KINDS (pickArea) and namedMark's WIDTH_LITERAL_KINDS (also scalarAppearance's width).
  same("gridTable", undefined, ["Heatmap", "Image"]);
  same("regions", undefined, ["Surface", "Heatmap", "Image", "Area"]);
  same("strokeWidth", undefined, ["Line", "Segments", "Arrows3D"]);
  same("frameEdges", undefined, ["Segments"]);
  // TODO 118.2: the update planner's kind lists (markUpdatePlan.js, preparationDependencies.js,
  // proceduralChannels.js and namedMark's size feedback, 2026-10-10).
  const live = (kind) => [...MARK_CAPABILITIES[kind].liveChannels].sort();
  assert.deepEqual(live("Points"), ["position", "x", "y", "z"]);
  assert.deepEqual(live("Points3D"), ["position", "x", "y", "z"]);
  assert.deepEqual(live("Rect"), ["x0", "x1", "y0", "y1", "z0", "z1"]);
  assert.deepEqual(live("Text"), ["dx", "dy", "opacity", "position", "size", "x", "y", "z"]);
  for (const kind of Object.keys(MARK_CAPABILITIES))
    if (!["Points", "Points3D", "Rect", "Text"].includes(kind))
      assert.deepEqual(live(kind), [], kind);
  same("liveWriter", "position", ["Points", "Points3D"]);
  same("liveWriter", "corners", ["Rect"]);
  same("liveWriter", "labels", ["Text"]);
  same("retains", "static", ["Text"]);
  assert.deepEqual(
    Object.keys(MARK_CAPABILITIES).filter((kind) => MARK_CAPABILITIES[kind].feedbackChannels.length),
    ["Points"],
  );
  assert.deepEqual(MARK_CAPABILITIES.Points.feedbackChannels, ["size"]);
});

test("segment rows: each segment takes the larger of its rows' values, per drawn piece", async () => {
  const { numpy: np } = await import("@hmplot/jax");
  const { segmentValues, piecesPerSegment } = await import("../../src/lib/plot/utils/segmentRows.js");
  const values = () => np.array(Float32Array.from([0.2, 1, 0.5]));
  const read = async (a) => Array.from(await a.data(), (v) => Math.round(v * 10) / 10);
  assert.deepEqual(await read(segmentValues(values(), "Area", {})), [1, 1]);
  assert.deepEqual(await read(segmentValues(values(), "Line", { curve: "basis" })), [1, 1, 1, 1, 1, 1]);
  assert.equal((await read(segmentValues(values(), "Line", { curve: "basis", surface: true }))).length, 2 * 192);
  assert.deepEqual(await read(segmentValues(values(), "Points", {})), [0.2, 1, 0.5]);
  assert.deepEqual(await read(segmentValues(np.array(Float32Array.from([1])), "Area", {})), []);
  assert.equal(piecesPerSegment("Area", { curve: "basis" }), 1);
});

// TODO 32.6/32.7: which arrays bound which axis, by kind (utils/markDomains.js).
test("domain fields: each kind's extents per axis", async () => {
  const { numpy: np } = await import("@hmplot/jax");
  const { domainFields } = await import("../../src/lib/plot/utils/markDomains.js");
  const { finiteExtents } = await import("../../src/lib/plot/utils/dataView.js");
  const column = (values) => np.array(Float32Array.from(values));
  // domains() releases the props it is passed; domainFields borrows them.
  const domains = async (kind, props, skip) => {
    const collected = domainFields(kind, props, { skip });
    const extents = await finiteExtents(collected.flatMap((entry) => entry.fields));
    collected.flatMap((entry) => entry.fields).forEach((field) => (field.array ?? field).dispose());
    Object.values(props).forEach((value) => value?.dispose?.());
    let at = 0;
    return Object.fromEntries(collected.map(({ axis, fields }) => {
      const own = extents.slice(at, (at += fields.length));
      return [axis, [Math.min(...own.map((e) => e[0])), Math.max(...own.map((e) => e[1]))]];
    }));
  };
  // Points: position's columns; a skipped axis is left out.
  assert.deepEqual(await domains("Points", { position: np.array([[1, 5], [3, -2]]) }, (axis) => axis === "y"), { x: [1, 3] });
  // A band along y: x, then its lower, upper and baseline on y.
  assert.deepEqual(await domains("Area", { x: column([0, 4]), lower: column([2, 1]), upper: column([6, 7]) }),
    { x: [0, 4], y: [1, 7] });
  // A Area along x swaps them: lower and upper bound x, and x bounds y.
  assert.deepEqual(await domains("Area", { axis: "x", x: column([10, 20]), lower: column([-1, 0]), upper: column([3, 2]) }),
    { x: [-1, 3], y: [10, 20] });
  // ErrorBars at positions add their bounds on their axis.
  assert.deepEqual(await domains("ErrorBars", { position: np.array([[0, 1], [2, 2]]), lower: column([0.5, 1.5]), upper: column([1.5, 4]) }),
    { x: [0, 2], y: [0.5, 4] });
  // A Prism's footprint: centers +- half its width and depth, and its z extent.
  assert.deepEqual(await domains("Prism", { x: column([0, 10]), y: column([0, 0]), width: 2, depth: 4, z0: 0, z1: column([3, 5]) }),
    { x: [-1, 11], y: [-2, 2], z: [0, 5] });
  // TODO 67.1: an Area without a baseline fills to 0, so 0 bounds its values axis: positive,
  // negative and mixed values; a baseline of its own replaces it.
  for (const [y, expected] of [[[2, 4, 3], [0, 4]], [[-2, -4, -3], [-4, 0]], [[-2, 4, -3], [-3, 4]]])
    assert.deepEqual((await domains("Area", { x: column([1, 2, 3]), upper: column(y) })).y, expected);
  assert.deepEqual((await domains("Area", { x: column([1, 2, 3]), upper: column([2, 4, 3]), lower: 6 })).y, [2, 6]);
  // TODO 67.3: Points sized in data units bound each axis their size is a length on by the
  // center -+ half the size (a number or per row).
  const pack = { position: np.array([[0.5, 0.5], [0.25, 0.5]]), size: column([1, 0.5]) };
  assert.deepEqual(await (async () => {
    const collected = domainFields("Points", pack, { glyphs: { x: true, y: true } });
    const extents = await finiteExtents(collected.flatMap((entry) => entry.fields));
    collected.flatMap((entry) => entry.fields).forEach((field) => (field.array ?? field).dispose());
    return [Math.min(extents[0][0], extents[1][0]), Math.max(extents[0][1], extents[1][1]), Math.min(extents[2][0], extents[3][0]), Math.max(extents[2][1], extents[3][1])];
  })(), [0, 1, 0, 1]);
  assert.deepEqual(await domains("Points", { position: np.array([[0.5, 0.5]]), size: 1 }), { x: [0.5, 0.5], y: [0.5, 0.5] });
  pack.position.dispose(); pack.size.dispose();
});

// TODO 67.1: a mark that draws no finite values (an empty Filter's) reports a flagged [0, 1]
// that counts only where no mark draws anything.
test("empty marks widen no domain, unless every mark is empty", async () => {
  const { emptyDomain, unionDomains } = await import("../../src/lib/plot/utils/markDomains.js");
  const { finiteExtents } = await import("../../src/lib/plot/utils/dataView.js");
  const { numpy: np } = await import("@hmplot/jax");
  assert.deepEqual(unionDomains([[10, 13], emptyDomain(), [11, 12]]), [10, 13]);
  assert.deepEqual(unionDomains([emptyDomain(), emptyDomain()]), [0, 1]);
  assert.equal(unionDomains([]), null);
  const empty = np.array(Float32Array.from([NaN, NaN])), none = np.zeros([0]);
  assert.deepEqual(await finiteExtents([empty, none]), [[0, 1], [0, 1]]);
  assert.deepEqual(await finiteExtents([empty, none], null, { missing: null }), [null, null]);
  empty.dispose(); none.dispose();
});

test("automatic label bounds fit asymmetric pixel footprints in transformed units", async () => {
  const { labelInsets, screenPaddedDomain } = await import("../../src/lib/plot/utils/labelBounds.js");
  const { unionDomains, emptyDomain } = await import("../../src/lib/plot/utils/markDomains.js");
  const insets = labelInsets([[10, 60], [12, 20], [4, 8], [-16, -16]], { align: "left", box: { padding: 5 } });
  assert.deepEqual(insets.x, [2, 74]);
  assert.deepEqual(insets.y, [2, 34]);
  // align="auto" (TODO 130.1): a label offset left ends at its offset, one offset right starts there.
  const spread = [[10, 60], [12, 20], [-30, 30], [0, 0]], side = (align) => labelInsets(spread, { align }).x;
  assert.deepEqual(side("auto"), [side("right")[0], side("left")[1]]);
  const domain = Object.assign([10, 20], { screen: [20, 40] });
  const fit = screenPaddedDomain(domain, { pixels: 200, padding: 0.04 });
  assert.ok(Math.abs((10 - fit[0]) / (fit[1] - fit[0]) * 200 - 20) < 1e-8);
  assert.ok(Math.abs((fit[1] - 20) / (fit[1] - fit[0]) * 200 - 40) < 1e-8);
  assert.deepEqual(screenPaddedDomain(domain, { pixels: 200, inverted: true }), screenPaddedDomain(Object.assign([10,20], { screen: [40,20] }), { pixels: 200 }));
  const log = screenPaddedDomain(Object.assign([1,100], { screen: [10,30] }), { pixels: 200, transform: "log" });
  assert.ok(Math.abs(Math.log(1/log[0])/Math.log(log[1]/log[0])*200-10)<1e-8);
  assert.deepEqual(screenPaddedDomain([10,20],{pixels:200,padding:0.04}),[9.6,20.4]);
  assert.ok(screenPaddedDomain(domain,{pixels:1}).every(Number.isFinite));
  const ignored = Object.assign(emptyDomain(), { screen:[1000,1000] });
  const merged = unionDomains([domain,[5,30],ignored]);
  assert.deepEqual(Array.from(merged),[5,30]);assert.deepEqual(merged.screen,[20,40]);
});

test("label footprint reductions omit empty, missing and filtered rows without reading coordinates", async () => {
  const { labelMetricFields } = await import("../../src/lib/plot/utils/labelBounds.js");
  const { finiteExtents } = await import("../../src/lib/plot/utils/dataView.js");
  const { numpy: np } = await import("@hmplot/jax"), previous = globalThis.document;
  globalThis.document = { createElement: () => ({getContext: () => ({measureText: text => ({width:text.length*64})})}) };
  const position=np.array([[1,1],[100,100],[50,50],[NaN,0]]), rows=np.array([1,1,0,1]), size=np.array([12,99,100,40]);
  try {
    const metrics=labelMetricFields({position,text:['A','','very wide','Missing'],size,dy:-16},null,rows);
    assert.deepEqual(await finiteExtents(metrics.fields,metrics.valid,{missing:null}),[[12,12],[12,12],[0,0],[-16,-16]]);
    assert.deepEqual(Array.from(await metrics.valid.ref.data(),Number),[1,0,0,0]);
    metrics.fields.forEach(field=>field.dispose());metrics.valid.dispose();
    const codes=np.array([0,-1,100,1],{dtype:np.int32});
    const dictionary=labelMetricFields({position,text:{codes,categories:['A','BBBB']},size:12});
    assert.deepEqual(Array.from(await dictionary.valid.ref.data(),Number),[1,0,0,0]);
    dictionary.fields.forEach(field=>field.dispose());dictionary.valid.dispose();codes.dispose();
  } finally { position.dispose();rows.dispose();size.dispose();globalThis.document=previous; }
});

test("label widths share bounded host metrics and invalidate for text, document and font changes", async () => {
  const { measureLabelWidths, labelFontRevision } = await import("../../src/lib/plot/utils/labelAtlas.js");
  const previous=globalThis.document,listeners=new Map(),faces=[];
  let measured=0,created=0,multiplier=64;
  const fonts={status:"loaded",get size(){return faces.length;},[Symbol.iterator]:()=>faces.values(),
    addEventListener:(event,listener)=>listeners.set(event,listener),removeEventListener:(event)=>listeners.delete(event)};
  const makeDocument=()=>({fonts,createElement:()=>{created++;return {getContext:()=>({measureText:text=>{measured++;return {width:text.length*multiplier};}})};}});
  globalThis.document=makeDocument();
  try {
    const labels=["A","BBBB",""];
    assert.deepEqual(measureLabelWidths(labels,"test-font"),[64,256,0]);
    const copy=measureLabelWidths([...labels],"test-font");copy[0]=999;
    assert.deepEqual(measureLabelWidths(labels,"test-font"),[64,256,0]);
    assert.equal(measured,2);assert.equal(created,1);
    labels[0]="CC";
    assert.deepEqual(measureLabelWidths(labels,"test-font"),[128,256,0]);
    assert.equal(measured,4,"in-place text edits are observed");
    measureLabelWidths(labels,"another-font");assert.equal(measured,6);
    let revision=labelFontRevision();
    multiplier=32;listeners.get("loadingdone")();
    assert.notEqual(labelFontRevision(),revision);
    assert.deepEqual(measureLabelWidths(labels,"test-font"),[64,128,0]);
    revision=labelFontRevision();faces.push({family:"test-font",status:"loaded"});
    assert.notEqual(labelFontRevision(),revision,"loaded face additions invalidate without an event");
    measureLabelWidths(labels,"test-font");revision=labelFontRevision();
    faces[0]={family:"test-font",status:"loaded"};multiplier=16;
    assert.notEqual(labelFontRevision(),revision,"same-size face replacement invalidates");
    assert.deepEqual(measureLabelWidths(labels,"test-font"),[32,64,0]);
    fonts.status="loading";const before=measured;
    measureLabelWidths(labels,"test-font");measureLabelWidths(labels,"test-font");
    assert.equal(measured-before,4,"fallback metrics are not cached during font loading");
    fonts.status="loaded";measureLabelWidths(["first"],"test-font");
    for(let i=0;i<64;i++)measureLabelWidths([`label-${i}`],"test-font");
    const evicted=measured;measureLabelWidths(["first"],"test-font");
    assert.equal(measured,evicted+1,"old metrics are evicted rather than growing without bound");
    globalThis.document=makeDocument();multiplier=8;
    assert.deepEqual(measureLabelWidths(labels,"test-font"),[16,32,0],"documents do not share font metrics");
  } finally {globalThis.document=previous;}
});

test("hidden-rows form: the kind's, unless something needs the rows compacted", async () => {
  const { hiddenRowsForm } = await import("../../src/lib/plot/utils/markKinds.js");
  const physical = { capacity: 100 }, none = { channels: {}, procedural: {}, stepped: {}, tweened: {} };
  const form = (kind, props = {}, options = {}) => hiddenRowsForm(kind, props, { physical, animation: none, limit: 1000, ...options });
  assert.equal(form("Points"), "scattered");
  assert.equal(form("Area"), "masked");
  assert.equal(form("Line"), "prefix");
  assert.equal(form("Line", { curve: "basis" }), null);
  assert.equal(form("Points", {}, { physical: null }), null);
  for (const options of [{ animates: true }, { placement: true }, { endpoint: true }, { limit: 50 },
    { animation: { ...none, channels: { y: {} } } }])
    assert.equal(form("Points", {}, options), null, JSON.stringify(options));
  assert.equal(form("Points", { series: "g" }), null);
  assert.equal(form("Points", { enterEffect: "fade" }), null);
  // The animation switch alone keeps the form over a table's own rows (TODO 32.12), except a
  // straight Line, whose valid-first rows reorder with the mask.
  assert.equal(form("Points", {}, { animates: true, rowIdentity: true }), "scattered");
  assert.equal(form("Area", {}, { animates: true, rowIdentity: true }), "masked");
  assert.equal(form("Line", {}, { animates: true, rowIdentity: true }), null);
  assert.equal(form("Points", { enterEffect: "fade" }, { animates: true, rowIdentity: true }), null);
});

test("hidden rows allow row-independent scalar appearance, not geometry or membership dependencies", async () => {
  const { hiddenRowsForm } = await import("../../src/lib/plot/utils/markKinds.js");
  const { divide, view, mean, add } = await import("../../src/lib/plot/utils/expressions.js");
  const form = (procedural, props = {}) => hiddenRowsForm("Points", props, {
    physical: { capacity: 100 }, limit: 100, animation: { procedural },
  });
  assert.equal(form({ opacity: divide(view.view_x_max, 10) }), "scattered");
  assert.equal(form({ size: divide(view.time, 10) }), "scattered");
  assert.equal(form({ x: view.view_x_max }), null);
  assert.equal(form({ opacity: add(mean("age"), view.time) }), null);
  assert.equal(form({ opacity: add("age", view.time) }), null);
  assert.equal(form({ opacity: view.time }, { opacityScale: { isCategorical: true } }), null);
});

test("drag: the point marks, whose picks name a row (TODO 38.3)", () => {
  assert.deepEqual(kindsWith("drag"), ["Points", "Points3D", "Text"]);
});

test("a bar's or area's 0 baseline is not padded past; its other end and other marks' are (TODO 134.27)", async () => {
  const { unionDomains } = await import("../../src/lib/plot/utils/markDomains.js");
  const { screenPaddedDomain } = await import("../../src/lib/plot/utils/labelBounds.js");
  const bars = Object.assign([0, 100], { anchored: [true, false] }), points = [10, 90];
  const union = unionDomains([bars, points]);
  assert.deepEqual(union.anchored, [true, false]);
  const padded = screenPaddedDomain(union, { padding: 0.05 });
  assert.equal(padded[0], 0);
  assert.ok(padded[1] > 100);
  // A point below the baseline: the union's end is the point's, so it is padded.
  const below = unionDomains([bars, [-5, 50]]);
  assert.ok(!below.anchored?.[0]);
  assert.ok(screenPaddedDomain(below, { padding: 0.05 })[0] < -5);
  // Label room at the baseline (screen insets) is still kept.
  const labelled = Object.assign([0, 100], { anchored: [true, false], screen: [20, 0] });
  assert.ok(screenPaddedDomain(labelled, { padding: 0.05, pixels: 400 })[0] < 0);
});
