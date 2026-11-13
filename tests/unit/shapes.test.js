import test from "node:test";
import assert from "node:assert/strict";
import { optionsRoot } from "../../src/lib/options/options.js";
import { readFileSync, readdirSync, statSync } from "node:fs";
import {
  BUILTIN_SHAPES, MAX_SHAPE_SEGMENTS, EXACT_SHAPE_VERTICES, MAX_SHAPES, registerShape, registerShapes, shapeNames, shapeCode,
  shapeVertices, shapeOutline, isShape, isCustomShape, validateShape, validateShapeName,
  onShapeRegistered, shapesVersion,
} from "../../src/lib/plot/utils/shapes.js";
import { parsePath, normalizeShape } from "../../src/lib/plot/utils/shapePaths.js";
import { signedDistanceField, FIELD_SIZE, FIELD_EXTENT } from "../../src/lib/plot/utils/shapeFields.js";
import { flatSymbols, symbolVertices } from "../../src/lib/plot/utils/symbols.js";
import { CATEGORY_SHAPES } from "../../src/lib/plot/utils/categorical.js";
import { prepareNamed, shapeChannelProps } from "../../src/lib/plot/utils/namedData.js";
import { guideSymbol } from "../../src/lib/plot/utils/guides.js";
import { validateTheme } from "../../src/lib/plot/utils/theme.js";
import { literal, createDataScope } from "../../src/lib/plot/utils/categorical.js";
import { col } from "../../src/lib/plot/utils/expressions.js";
import { symbolPath } from "../../src/lib/plot/utils/vectorExport.js";
import { prepareDodge } from "../../src/lib/plot/utils/dodge.js";

const pentagon = [[0, 1], [0.95, 0.31], [0.59, -0.81], [-0.59, -0.81], [-0.95, 0.31]];
const options = optionsRoot.splitUnique("Shape unit tests");
const values = async (array) => Array.from(await array.ref.data());
// prepareNamed keeps each categorical channel's last values in the mark's state; the mark releases them.
const releaseState = (state) => { for (const entry of state.categoryValues?.values() ?? []) entry.values.dispose(); };

test("one shape vocabulary: flat symbols, category shapes, and codes agree", () => {
  assert.deepEqual([...flatSymbols], [...CATEGORY_SHAPES]);
  assert.deepEqual(shapeNames().slice(0, BUILTIN_SHAPES.length), [...BUILTIN_SHAPES]);
  BUILTIN_SHAPES.forEach((name, code) => assert.equal(shapeCode(name), code));
  assert.equal(shapeVertices("circle"), null);
  assert.deepEqual(symbolVertices("nope"), symbolVertices("square"), "unknown names draw as squares");
});

test("registerShape assigns stable codes and notifies listeners", () => {
  const seen = [];
  const stop = onShapeRegistered((name) => seen.push(name));
  const before = shapesVersion();
  const code = registerShape("penta", pentagon);
  assert.ok(code >= 8);
  assert.equal(registerShape("penta", pentagon.map((p) => [...p])), code, "same vertices, same code");
  assert.equal(shapesVersion(), before + 1, "re-registration does not bump the version");
  assert.deepEqual(seen, ["penta"]);
  assert.equal(isShape("penta"), true);
  assert.equal(isCustomShape("penta"), true);
  assert.equal(isCustomShape("star"), false);
  assert.throws(() => registerShape("penta", [[0, 1], [1, -1], [-1, -1]]), /Shape penta is already registered with a different outline/);
  stop();
});

test("registerShape validates polygons", () => {
  assert.throws(() => registerShape("star", pentagon), /star is a built-in shape and cannot be redefined/);
  assert.throws(() => registerShape("sphere", pentagon), /sphere is a 3D shape name/);
  assert.throws(() => registerShape("9lives", pentagon), /Shape names must start with a letter/);
  assert.throws(() => registerShape("two", [[0, 0], [1, 1]]), /Shape two needs at least 3 vertices/);
  assert.throws(() => registerShape("big", Array.from({ length: MAX_SHAPE_SEGMENTS + 1 }, (_, i) =>
    [Math.cos(i), Math.sin(i)])), { code: "limit.shapeSegments",
    message: "Points: shape big's outline needs 4,097 segments; the limit is 4,096 segments. Use fewer vertices." });
  assert.throws(() => registerShape("out", [[0, 2], [1, -1], [-1, -1]]), /must lie in the unit square/);
  assert.throws(() => registerShape("nan", [[0, NaN], [1, -1], [-1, -1]]), /pairs of finite numbers/);
  // Crossing edges are allowed: the fill rule decides what is inside (TODO 55).
  registerShape("bowtie", [[-1, -1], [1, 1], [1, -1], [-1, 1]]);
  assert.equal(shapeVertices("bowtie"), null, "a crossing polygon draws from the distance field");
  const many = Array.from({ length: EXACT_SHAPE_VERTICES + 1 }, (_, i) => [Math.cos(2 * Math.PI * i / 17), Math.sin(2 * Math.PI * i / 17)]);
  registerShape("seventeen", many);
  assert.equal(shapeVertices("seventeen"), null, "more than 16 vertices draw from the distance field");
});

test("SVG paths: lines, curves, arcs and subpaths in shape space; straight simple paths stay exact", () => {
  assert.deepEqual(normalizeShape("M0 1 L1 -1 L-1 -1 Z").vertices, [[0, 1], [1, -1], [-1, -1]]);
  assert.deepEqual(normalizeShape("m0,1 l1,-2 h-2 z").rings, [[[0, 1], [1, -1], [-1, -1]]], "relative and H");
  assert.deepEqual(normalizeShape("M0 1 1 -1 -1 -1").rings, [[[0, 1], [1, -1], [-1, -1]]], "implicit line pairs");
  // A circle of two arcs: cubics in the outline, flattened within 1e-3 for the field.
  const circle = normalizeShape("M1 0 A1 1 0 1 1 -1 0 A1 1 0 1 1 1 0 Z");
  assert.equal(circle.vertices, null);
  assert.ok(circle.contours[0].segments.every((s) => s[0] === "C"));
  const ring = circle.rings[0], area = ring.reduce((sum, [x0, y0], i) => sum + x0 * ring[(i + 1) % ring.length][1] - ring[(i + 1) % ring.length][0] * y0, 0) / 2;
  assert.ok(Math.abs(Math.abs(area) - Math.PI) < 2e-3, `area ${area}`);
  assert.ok(ring.every(([x, y]) => Math.abs(Math.hypot(x, y) - 1) < 1e-3));
  // Quadratics, smooth curves and several subpaths.
  assert.deepEqual(parsePath("M0 0 Q1 1 2 0 T4 0").map((c) => c.segments.length), [2]);
  assert.deepEqual(parsePath("M0 0 C0 1 1 1 1 0 S2 -1 2 0").at(0).segments[1].slice(1, 3), [1, -1], "S reflects the previous control");
  assert.equal(normalizeShape("M-1 -1 H1 V1 H-1 Z M-.5 -.5 H.5 V.5 H-.5 Z").rings.length, 2);
  // A viewBox fits an icon's own coordinates (y down) into the unit square.
  const fitted = normalizeShape({ path: "M0 0 L24 0 L12 24 Z", viewBox: [0, 0, 24, 24] });
  assert.deepEqual(fitted.rings[0], [[-1, 1], [1, 1], [0, -1]]);
  assert.deepEqual(fitted.definition, { path: "M0 0 L24 0 L12 24 Z", viewBox: [0, 0, 24, 24] });
  assert.equal(registerShape("wedge", "M0 1 L1 -1 L-1 -1 Z"), shapeCode("wedge"));
  assert.equal(validateShape("M0 1 L1 -1 L-1 -1 Z"), "M0 1 L1 -1 L-1 -1 Z", "a path's canonical form is its string");
});

test("legend symbols draw custom polygons around the swatch center", () => {
  registerShape("penta", pentagon);
  const d = guideSymbol("penta");
  assert.match(d, /^M13,3 L/);
  assert.equal(d.match(/ L/g).length, 4);
});

test("shape is a channel for columns and per-row values, a symbol option for names", async () => {
  const scope = { has: (name) => name === "island" };
  assert.deepEqual(shapeChannelProps({ shape: "island" }, scope, "Points"), { shapeField: "island" });
  assert.deepEqual(shapeChannelProps({ shape: "circle" }, scope, "Points"), { shape: "circle" });
  assert.deepEqual(shapeChannelProps({ shape: ["circle", "star"] }, undefined, "Points"), { shapeField: ["circle", "star"] });
  assert.throws(() => shapeChannelProps({ shape: ["a", "b"] }, undefined, "Points3D"), /Points3D shapes are geometry/);
  const literal = prepareNamed({ position: [[0, 0], [1, 1], [2, 2]], shape: ["circle", "penta", "star"] }, undefined, options, "Points", { hidden: {}, auto: {} });
  assert.deepEqual(await values(literal.props.symbolCode), [0, shapeCode("penta"), 7]);
  assert.deepEqual(literal.metadata, {}, "literal per-row shapes have no legend");
  literal.dispose();
  const rowsState = { hidden: {}, auto: {} };
  const categoryRows = prepareNamed({ position: [[0, 0], [1, 1]], shape: ["Biscoe", "Dream"] }, undefined, options, "Points", rowsState);
  assert.deepEqual(await values(categoryRows.props.symbolCode), [0, 1], "categories get automatic symbols");
  assert.deepEqual(categoryRows.metadata.shape.entries.map((e) => e.shape), ["circle", "triangle"]);
  categoryRows.dispose();
  releaseState(rowsState);
  assert.throws(() => prepareNamed({ position: [[0, 0], [1, 1]], shape: ["a", "b"] }, undefined, options, "Line", { hidden: {}, auto: {} }),
    /Line does not support a shape channel; shape channels require flat point marks/);
});

test("themes validate custom shapes", () => {
  assert.deepEqual(validateTheme({ shapes: { kite: [[0, 1], [0.5, 0], [0, -1], [-0.5, 0]] } }).shapes.kite[0], [0, 1]);
  assert.throws(() => validateTheme({ shapes: { bad: [[0, 0]] } }), /theme\.shapes\.bad: Shape bad needs at least 3 vertices/);
});

// Capture console.warn while `fn` runs; returns [result, warnings].
async function warnings(fn) {
  const seen = [], warn = console.warn;
  console.warn = (...args) => seen.push(args.join(" "));
  try { return [await fn(), seen]; } finally { console.warn = warn; }
}
const state = () => ({ hidden: {}, auto: {} });
const scopeOf = (columns) => { const scope = createDataScope(); scope.update(columns); return scope; };

test("path parsing: errors, exponents and bare decimals (8C A9, TODO 55)", () => {
  const rule = (d) => { try { normalizeShape(d, "p"); } catch (error) { return error.message; } };
  assert.equal(rule("M0 1 L1 -1 X-1 -1 Z"), 'Shape paths use SVG path commands (M, L, H, V, C, S, Q, T, A, Z); found "X".');
  assert.equal(rule("M0 1 L1 -1 L-1 -1 Z 0 0"), "Shape path numbers after Z need a command.");
  assert.equal(rule("0 0 1 1"), "A shape path must start with M.");
  assert.equal(rule("L0 0 1 1"), "A shape path must start with M.");
  assert.equal(rule("M0 1 L1"), "Shape path command L needs 2 numbers per segment.");
  assert.equal(rule("M0 0 C1 1 1 1"), "Shape path command C needs 6 numbers per segment.");
  assert.equal(rule("M0 0 A1 1 0 2 1 1 1"), "Shape path arc flags must be 0 or 1.");
  assert.equal(rule(42), "Shape p must be a list of [x, y] vertices or SVG path data.");
  assert.equal(rule("M0 0 L3 0 L0 3 Z"), "Shape p must lie in the unit square [-1, 1]; give a viewBox to fit a path drawn in other coordinates.");
  assert.equal(rule("M0 0 L1 0 L.5 0 Z"), "Shape p has zero area.");
  assert.equal(rule({ path: "M0 0 L1 0 L0 1 Z", fillRule: "odd" }), 'Shape p fillRule must be "nonzero" or "evenodd".');
  assert.equal(rule({ vertices: [[0, 0], [1, 0], [0, 1]], viewBox: [0, 0, 1, 1] }), "Shape p viewBox applies to a path, not vertices.");
  assert.equal(rule({ path: "M0 0 L1 0 L0 1 Z", viewBox: [0, 0, 0, 1] }), "Shape p viewBox must be [minX, minY, width, height] with a positive width and height.");
  assert.equal(rule({ path: "M0 0 L1 0 L0 1 Z", fill: "red" }), "Shape p has unknown properties: fill. Use path or vertices, fillRule and viewBox.");
  assert.deepEqual(normalizeShape("M0 1e0 L1E+0 -1 L-1 -1e-0 Z").rings[0], [[0, 1], [1, -1], [-1, -1]], "exponents");
  assert.deepEqual(normalizeShape("M.5,.5 L-.5,.5 L0,-.5z").rings[0], [[0.5, 0.5], [-0.5, 0.5], [0, -0.5]], "bare decimals and lowercase z");
  assert.equal(rule(""), "Shape p needs at least 3 vertices.");
});

test("polygon validation: duplicates dropped, degenerate polygons rejected, crossings drawn from the field (8C A9)", () => {
  const triangle = [[0, 1], [1, -1], [-1, -1]];
  assert.deepEqual(validateShape("M0 1 L1 -1 L-1 -1 L0 1 Z"), "M0 1 L1 -1 L-1 -1 L0 1 Z");
  assert.deepEqual(normalizeShape("M0 1 L1 -1 L-1 -1 L0 1 Z").vertices, triangle, "closing vertex equal to the first is dropped");
  assert.deepEqual(validateShape([[0, 1], [0, 1], [1, -1], [1, -1], [-1, -1]]), triangle, "consecutive duplicates are dropped");
  assert.throws(() => validateShape([[0, 1], [0, 1], [1, -1], [0, 1]], "dup"), { message: "Shape dup needs at least 3 distinct vertices." });
  assert.throws(() => validateShape([[0, 0], [0.5, 0.5], [1, 1]], "flat"), { message: "Shape flat has zero area; its vertices are collinear." });
  // Polygons that touch or cross themselves are valid; only simple ones get the exact distance.
  for (const polygon of [[[0, 0], [1, 0], [0.5, 0], [0, 1]], [[0, 0], [1, 1], [1, 0], [0, 0], [-1, -1], [-1, 0]]])
    assert.equal(normalizeShape(polygon).vertices, null);
  const clockwise = [[-1, -1], [-1, 1], [1, 1], [1, -1]];
  assert.deepEqual(validateShape(clockwise), clockwise, "winding order does not matter");
  assert.deepEqual(validateShape([...clockwise].reverse()), [...clockwise].reverse());
});

test("distance fields: exact near a polygon's edges, holes by the fill rule, the circle in closed form (TODO 55)", () => {
  const step = (2 * FIELD_EXTENT) / FIELD_SIZE, at = (field, x, y) =>
    field[Math.floor((y + FIELD_EXTENT) / step) * FIELD_SIZE + Math.floor((x + FIELD_EXTENT) / step)];
  // A square of half-size 0.8: inside negative, outside positive, the edge distance exact at texel centers.
  const square = signedDistanceField({ rings: [[[-0.8, -0.8], [0.8, -0.8], [0.8, 0.8], [-0.8, 0.8]]], fillRule: "nonzero" });
  const x = -FIELD_EXTENT + 64.5 * step, y = x;
  assert.ok(Math.abs(at(square, x, y) - (Math.max(Math.abs(x), Math.abs(y)) - 0.8)) < 1e-6, "float32 of the exact distance");
  assert.ok(at(square, 1.2, 0) > 0.39 && at(square, 1.2, 0) < 0.42);
  // A hole: inside it under evenodd, and under nonzero when it winds the other way.
  const outer = [[-1, -1], [1, -1], [1, 1], [-1, 1]], hole = [[-0.5, -0.5], [-0.5, 0.5], [0.5, 0.5], [0.5, -0.5]];
  assert.ok(at(signedDistanceField({ rings: [outer, hole], fillRule: "evenodd" }), 0.01, 0.01) > 0, "evenodd: the hole is outside");
  assert.ok(at(signedDistanceField({ rings: [outer, hole], fillRule: "nonzero" }), 0.01, 0.01) > 0, "nonzero: an opposite winding cuts a hole");
  assert.ok(at(signedDistanceField({ rings: [outer, [...hole].reverse()], fillRule: "nonzero" }), 0.01, 0.01) < 0, "nonzero: the same winding fills");
  const circle = signedDistanceField(null);
  assert.ok(Math.abs(at(circle, x, y) - (Math.hypot(x, y) - 1)) < 1e-6);
});

test("shape names: ASCII identifiers only, built-in and 3D names reserved (8C A6)", () => {
  const rule = "Shape names must start with a letter and contain letters, digits, _ or -.";
  for (const name of ["pentágono", "bad name", "9lives", "", "_x", "-x", 7, null])
    assert.throws(() => validateShapeName(name), { message: rule }, String(name));
  assert.equal(validateShapeName("Kite_2-b"), "Kite_2-b");
  assert.throws(() => validateShapeName("cube"), { message: "cube is a 3D shape name and cannot be registered." });
  assert.throws(() => validateShapeName("hexagon"), { message: "hexagon is a built-in shape and cannot be redefined." });
});

test("the docs and examples register no built-in shape's name (TODO 69)", () => {
  // The custom-shapes example registered pentagon and arrow, built-ins since TODO 55, and threw.
  const root = new URL("../../", import.meta.url), registered = [];
  const files = ["src/routes/examples", "src/examples", "src/routes/content", "python/examples", "docs"]
    .flatMap((dir) => readdirSync(new URL(dir, root), { recursive: true }).map((file) => `${dir}/${file}`))
    .concat("README.md", "python/README.md").filter((file) => /\.(js|svelte|svx|py|md)$/.test(file))
    // A route folder can end in .md (src/routes/docs/[lesson].md serves a page's Markdown).
    .filter((file) => statSync(new URL(file, root)).isFile());
  for (const file of files)
    for (const [, name] of readFileSync(new URL(file, root), "utf8").matchAll(/(?:registerShape|register_shape)\(\\?["']([\w-]+)/g))
      registered.push([file, name]);
  assert.ok(registered.some(([file]) => file.endsWith("CustomShapes.svelte")));
  assert.deepEqual(registered.filter(([, name]) => BUILTIN_SHAPES.includes(name)), []);
});

test("literal() names a shape; expressions are rejected (8C A5)", () => {
  const scope = scopeOf({ star: ["a", "b"], x: [0, 1] });
  assert.deepEqual(shapeChannelProps({ shape: literal("star") }, scope, "Points"), { shape: "star" });
  const prepared = prepareNamed({ position: [[0, 0], [1, 1]], shape: literal("star") }, undefined, options, "Points", state());
  assert.equal(prepared.props.shape, "star");
  assert.equal(prepared.props.symbolCode, undefined);
  prepared.dispose();
  assert.throws(() => shapeChannelProps({ shape: col("x") }, scope, "Points"),
    { message: "Points.shape takes a column, a per-row array, or a shape name; expressions are not supported." });
  scope.dispose();
});

test("a column named like a shape is the column; literal() is the escape (8C B1)", async () => {
  const scope = scopeOf({ circle: ["a", "b"], x: [0, 1] });
  const [props, seen] = await warnings(() => shapeChannelProps({ shape: "circle" }, scope, "Points"));
  assert.deepEqual(props, { shapeField: "circle" });
  assert.deepEqual(seen, ['Points.shape="circle" names both a column and a shape; the column wins. Use literal("circle") for the shape.']);
  const [, again] = await warnings(() => shapeChannelProps({ shape: "circle" }, scope, "Points"));
  assert.deepEqual(again, [], "the warning is printed once");
  assert.deepEqual(shapeChannelProps({ shape: literal("circle") }, scope, "Points"), { shape: "circle" });
  // Registering a name elsewhere on the page does not capture a column of that name.
  const other = scopeOf({ arrowhead: ["a", "b"] });
  registerShape("arrowhead", [[0, 1], [1, -1], [0, -0.4], [-1, -1]]);
  const [captured] = await warnings(() => shapeChannelProps({ shape: "arrowhead" }, other, "Points"));
  assert.deepEqual(captured, { shapeField: "arrowhead" });
  scope.dispose(); other.dispose();
});

test("shapeField is not a prop: shape takes the column (R2.0)", () => {
  assert.throws(() => shapeChannelProps({ shapeField: "island" }, undefined, "Points"),
    { message: 'Points.shapeField is not a prop: pass the column to shape (shape="species").' });
});

test("shape channels on non-point marks throw before the per-row name path (8C A4)", async () => {
  const position = [[0, 0, 0], [1, 1, 1]];
  for (const kind of ["Line", "Text", "Text3D", "Heatmap"])
    await warnings(() => assert.throws(() => prepareNamed({ position, shape: ["circle", "star"] }, undefined, options, kind, state()),
      { message: `${kind} does not support a shape channel; shape channels require flat point marks (Points).` }, kind));
  assert.throws(() => prepareNamed({ position, shape: ["circle", "star"] }, undefined, options, "Points3D", state()),
    { message: "Points3D shapes are geometry (sphere or cube); give shape a name, not a column or per-row values." });
});

test("dictionary shape names: missing and out-of-range codes draw circles (8C A8)", async () => {
  const shape = { codes: new Int32Array([0, -1, 1, 5]), categories: ["square", "star"] };
  const prepared = prepareNamed({ position: [[0, 0], [1, 1], [2, 2], [3, 3]], shape }, undefined, options, "Points", state());
  assert.deepEqual(await values(prepared.props.symbolCode), [3, 0, 7, 0]);
  assert.deepEqual(prepared.metadata, {}, "shape names are literal symbols: no legend");
  prepared.dispose();
});

test("per-row names registered after a first prepare re-prepare to their codes (8C A3)", async () => {
  const position = [[0, 0], [1, 1], [2, 2]], states = [state(), state(), state(), state()];
  const [before, seen] = await warnings(() => prepareNamed({ position, shape: ["late", "circle", "circle"] }, undefined, options, "Points", states[0]));
  assert.deepEqual(await values(before.props.symbolCode), [0, 1, 1], "unknown names make the column categorical");
  assert.deepEqual(seen, ['Points.shape: "late" is not a shape name, so the values are treated as categories with automatic symbols. Register it with registerShape, or check the spelling.']);
  before.dispose();
  const [, quiet] = await warnings(() => prepareNamed({ position, shape: ["late", "circle", "circle"] }, undefined, options, "Points", states[1]).dispose());
  assert.deepEqual(quiet, [], "the warning is printed once");
  const late = registerShape("late", [[0, 1], [1, -1], [-1, -1]]);
  const after = prepareNamed({ position, shape: ["late", "circle", "circle"] }, undefined, options, "Points", states[2]);
  assert.deepEqual(await values(after.props.symbolCode), [late, 0, 0]);
  after.dispose();
  const [, none] = await warnings(() => prepareNamed({ position: [[0, 0], [1, 1]], shape: ["Biscoe", "Dream"] }, undefined, options, "Points", states[3]).dispose());
  assert.deepEqual(none, [], "all-category columns do not warn");
  states.forEach(releaseState);
});

test("Swarm/Dodge spaces shape columns like literal squares (8C A2)", async () => {
  const n = 40, x = Array.from({ length: n }, (_, i) => (i % 5) * 0.2),
    s = Array.from({ length: n }, (_, i) => ["a", "b", "c"][i % 3]);
  const camera = { isOrthographicCamera: true, projectionMatrix: { elements: [0.02, 0, 0, 0, 0, 0.02, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] } };
  const renderer = { domElement: { clientWidth: 400, clientHeight: 400 } };
  // The mark's shape option: the literal name, or its "circle" default when shape is a channel.
  const spread = async (props, option = "circle") => {
    const scope = scopeOf({ x, s }), layout = { get: (key) => (key === "shape" ? option : undefined) };
    const offsets = await prepareDodge({ size: 12, ...props }, scope, layout, camera, renderer, { field: "x", axis: "y" });
    const result = Math.max(...Array.from(await offsets.data()).map(Math.abs));
    scope.dispose();
    return result;
  };
  const [[channel, square, circle]] = await warnings(() => Promise.all([
    spread({ shape: "s" }), spread({ shape: "square" }, "square"), spread({ shape: "circle" })]));
  assert.equal(channel, square, "channel glyphs pack by their bounding square");
  assert.ok(circle < channel, `a literal circle packs tighter (${circle} < ${channel})`);
});

test("symbolPath exports custom polygons at the swatch center, scaled and rotated (8C C1)", () => {
  registerShape("arrowtip", [[0, 1], [1, -1], [-1, -1]]);
  assert.deepEqual(symbolPath("circle", 10, 20, 8), { type: "circle", attrs: { cx: 10, cy: 20, r: 4 } });
  // Shape space is y-up; SVG is y-down: the apex (0, 1) lands above the center.
  assert.deepEqual(symbolPath("arrowtip", 10, 20, 8), { type: "path", attrs: { d: "M10 16 L14 24 L6 24 Z" } });
  assert.deepEqual(symbolPath("arrowtip", 10, 20, 8, 90), { type: "path", attrs: { d: "M6 20 L14 16 L14 24 Z" } }, "90 degrees counterclockwise");
  assert.deepEqual(symbolPath("penta", 0, 0, 2).attrs.d.match(/ L/g).length, 4, "five vertices");
  assert.deepEqual(symbolPath("unregistered", 10, 20, 8), symbolPath("square", 10, 20, 8), "unknown names export as squares");
  assert.equal(symbolPath("square", 10, 20, 8).attrs.d, "M6 24 L14 24 L14 16 L6 16 Z", "the square spans the full symbol size");
});

test("shapes drawn from the field export and legend their outline: curves, holes, fill rule (TODO 55)", () => {
  // A built-in pictogram: curves stay cubic curves in export and in the legend swatch.
  const heart = symbolPath("heart", 10, 20, 8);
  assert.equal(heart.type, "path");
  assert.match(heart.attrs.d, /^M10 23\.6 C/, "the tip (0, -0.9) is below the center: SVG's y is down");
  assert.equal(heart.attrs["fill-rule"], undefined, "nonzero is SVG's default");
  assert.match(guideSymbol("heart"), /C/);
  // An open shape: two contours under evenodd.
  const open = symbolPath("circle-open", 0, 0, 2);
  assert.equal(open.attrs.d.match(/M/g).length, 2);
  assert.equal(open.attrs["fill-rule"], "evenodd");
  // A registered path with a viewBox exports in its fitted coordinates.
  registerShape("iconTriangle", { path: "M0 0 L24 0 L12 24 Z", viewBox: [0, 0, 24, 24] });
  assert.equal(symbolPath("iconTriangle", 0, 0, 2).attrs.d, "M-1 -1 L1 -1 L0 1 Z");
  // The new polygons are exact and legend their vertices.
  assert.equal(shapeVertices("octagon").length, 8);
  assert.match(guideSymbol("triangle-down"), /^M13,15 L/);
  // Themes accept paths too.
  assert.deepEqual(validateTheme({ shapes: { blob: { path: "M0 1 C1 1 1 -1 0 -1 C-1 -1 -1 1 0 1 Z" } } }).shapes.blob,
    { path: "M0 1 C1 1 1 -1 0 -1 C-1 -1 -1 1 0 1 Z" });
});

test("JavaScript and Python agree on the built-in shapes and limits (8C C2)", () => {
  const registry = JSON.parse(readFileSync(new URL("../../python/hmplot/registry.json", import.meta.url), "utf8"));
  assert.deepEqual(registry.shapes, { builtin: [...BUILTIN_SHAPES], maxSegments: MAX_SHAPE_SEGMENTS, maxShapes: MAX_SHAPES });
});

// Last: fills the page vocabulary to the cap.
test("registerShapes notifies once per batch and the vocabulary is capped (8C B4)", () => {
  const seen = [], stop = onShapeRegistered((name, names) => seen.push([name, names]));
  const version = shapesVersion();
  const tri = (k) => [[0, 1], [1, -1 + k / 1000], [-1, -1]];
  const codes = registerShapes({ batchA: tri(1), batchB: tri(2), penta: pentagon });
  assert.deepEqual(Object.keys(codes), ["batchA", "batchB", "penta"]);
  assert.equal(codes.batchB, codes.batchA + 1);
  assert.equal(codes.penta, shapeCode("penta"), "already-registered names keep their code");
  assert.deepEqual(seen, [["batchA", ["batchA", "batchB"]]], "one notification listing the added shapes");
  assert.equal(shapesVersion(), version + 1);
  assert.deepEqual(registerShapes({ batchA: tri(1) }), { batchA: codes.batchA });
  assert.equal(seen.length, 1, "a batch that adds nothing is silent");
  // An invalid entry throws, but shapes registered before it are announced.
  assert.throws(() => registerShapes({ batchC: tri(3), star: tri(4) }), { message: "star is a built-in shape and cannot be redefined." });
  assert.deepEqual(seen.at(-1), ["batchC", ["batchC"]]);
  assert.equal(isShape("batchC"), true);
  const room = MAX_SHAPES - shapeNames().length;
  registerShapes(Object.fromEntries(Array.from({ length: room }, (_, i) => [`fill${i}`, tri(10 + i)])));
  assert.equal(shapeNames().length, MAX_SHAPES);
  assert.throws(() => registerShape("onemore", tri(90)), { code: "limit.shapes", message: `Points: custom shapes on one page needs ${MAX_SHAPES - BUILTIN_SHAPES.length + 1} shapes; the limit is ${MAX_SHAPES - BUILTIN_SHAPES.length} shapes. Reuse shapes, or draw some marks as Polygons.` });
  assert.equal(registerShape("batchA", tri(1)), codes.batchA, "re-registering at the cap is still fine");
  stop();
});
