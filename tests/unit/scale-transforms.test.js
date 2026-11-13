// TODO 39.1-39.2: the scale transform table. Each entry's forms agree (CPU, jax, WGSL), round
// trip, and follow one rule outside the domain; symlog and midpoint match d3.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as d3 from "d3";
import { numpy as np } from "@hmplot/jax";
import {
  SCALE_TRANSFORMS, TRANSFORM_NAMES, STEP_KIND, NO_STAGE_KIND, transformForward, transformInverse,
  transformDerivative, jaxTransformForward, scaleTransformWgsl, transformTicks, scaleFraction, scaleValueAt,
  paddedDomain, checkMidpoint, transformConstant, renderScaleValue,
} from "../../src/lib/plot/utils/scaleTransforms.js";
import { TRANSFORM_KINDS } from "../../src/lib/plot/utils/animation.js";
import { createNormalization, continuous } from "../../src/lib/plot/utils/scaleResources.js";
import { createFrameScale } from "../../src/lib/plot/utils/frameMapping.js";

const SAMPLES = [-50, -3, -1, -0.2, 0, 1e-4, 0.3, 1, 2.5, 10, 777];
const CONSTANTS = [1, 0.5, 20];

// A table WGSL expression as JavaScript: its functions are Math's, `1.` is a float literal.
function wgslFunction(expression, arg) {
  const js = expression
    .replace(/\b(log|exp|sqrt|abs|sign|max|min)\(/g, "Math.$1(")
    .replace(/(\d)\.(?!\d)/g, "$1.0")
    .replace(/\btrue\b/, "true");
  return new Function(arg, "c", `return ${js};`);
}

test("codes are dense and unique; step and no-stage kinds collide with none", () => {
  const codes = TRANSFORM_NAMES.map((name) => SCALE_TRANSFORMS[name].code);
  assert.deepEqual(codes, codes.map((_, i) => i));
  assert.deepEqual(TRANSFORM_NAMES, ["linear", "log", "sqrt", "symlog"]);
  for (const reserved of [STEP_KIND, NO_STAGE_KIND]) assert.ok(!codes.includes(reserved), String(reserved));
  // Animation's kinds are the table's plus step, which has its own code.
  assert.equal(new Set(Object.values(TRANSFORM_KINDS)).size, Object.keys(TRANSFORM_KINDS).length);
  for (const name of TRANSFORM_NAMES) assert.equal(TRANSFORM_KINDS[name], SCALE_TRANSFORMS[name].code);
});

test("the JavaScript and Python transform lists are identical", () => {
  const python = readFileSync(new URL("../../python/hmplot/data.py", import.meta.url), "utf8");
  const list = /SCALE_TRANSFORMS = \(([^)]*)\)/.exec(python)[1].match(/"(\w+)"/g).map((name) => name.slice(1, -1));
  assert.deepEqual(list, TRANSFORM_NAMES);
});

test("forward then inverse round-trips inside each domain; outside it a value is missing", () => {
  for (const name of TRANSFORM_NAMES)
    for (const c of CONSTANTS)
      for (const x of SAMPLES) {
        const y = transformForward(name, x, c), inside = SCALE_TRANSFORMS[name].inDomain(x);
        if (!inside) { assert.ok(Number.isNaN(y), `${name}(${x})`); continue; }
        assert.ok(Math.abs(transformInverse(name, y, c) - x) <= 1e-9 * Math.max(1, Math.abs(x)), `${name} ${c} ${x}`);
        // The derivative is the forward's slope.
        const h = 1e-6 * Math.max(1, Math.abs(x));
        if (name !== "linear" && x - h > (name === "log" ? 0 : name === "sqrt" ? 0 : -Infinity)) {
          const slope = (transformForward(name, x + h, c) - transformForward(name, x - h, c)) / (2 * h);
          assert.ok(Math.abs(slope - transformDerivative(name, x, c)) < 1e-4 * Math.max(1, Math.abs(slope)), `${name}' ${x}`);
        }
      }
  assert.ok(Number.isNaN(transformForward("log", 0)) && Number.isNaN(transformForward("sqrt", -1)));
  assert.ok(Number.isNaN(transformForward("linear", NaN)) && Number.isNaN(transformForward("symlog", Infinity)));
  assert.throws(() => transformForward("pow", 1), /Unsupported scale transform: pow\. Use linear, log, sqrt, symlog\./);
});

test("CPU, jax and WGSL forms agree at sample points", () => {
  const wgsl = scaleTransformWgsl("t");
  for (const name of TRANSFORM_NAMES) {
    const entry = SCALE_TRANSFORMS[name];
    assert.ok(wgsl.includes(`k == ${entry.code}u`) || name === "linear", name);
    const forward = wgslFunction(entry.wgsl.forward, "x"), inverse = wgslFunction(entry.wgsl.inverse, "y"),
      valid = wgslFunction(entry.wgsl.valid, "x");
    for (const c of CONSTANTS) {
      const x = np.array(new Float32Array(SAMPLES));
      const jax = Array.from(jaxTransformForward(name, x, c).js());
      x.dispose();
      SAMPLES.forEach((v, i) => {
        const cpu = transformForward(name, v, c);
        assert.equal(valid(v, c), entry.inDomain(v), `${name} valid ${v}`);
        if (Number.isNaN(cpu)) { assert.ok(Number.isNaN(jax[i]), `${name} jax ${v}`); return; }
        assert.ok(Math.abs(jax[i] - cpu) < 1e-5 * Math.max(1, Math.abs(cpu)), `${name} jax ${v}: ${jax[i]} vs ${cpu}`);
        assert.ok(Math.abs(forward(v, c) - cpu) < 1e-12 * Math.max(1, Math.abs(cpu)), `${name} wgsl ${v}`);
        assert.ok(Math.abs(inverse(cpu, c) - v) < 1e-9 * Math.max(1, Math.abs(v)), `${name} wgsl inverse ${v}`);
      });
    }
  }
});

test("symlog matches d3.scaleSymlog, constant included", () => {
  for (const c of CONSTANTS) {
    const domain = [-40, 300], reference = d3.scaleSymlog().constant(c).domain(domain).range([0, 1]);
    for (const v of SAMPLES)
      assert.ok(Math.abs(scaleFraction(v, { domain, transform: "symlog", constant: c }) - reference(v)) < 1e-12, `${c} ${v}`);
    const scale = createFrameScale({ domain, range: [0, 1], transform: "symlog", constant: c });
    assert.ok(Math.abs(scale.inverse(reference(12)) - 12) < 1e-9);
  }
  assert.throws(() => transformConstant(0), /^Error: Symlog constant must be a finite positive number\.$/);
});

test("symlog ticks: 0 and ±10^k, thinned from the largest decade, minors at 2..9 × 10^k, linear inside [-c, c]", () => {
  const { major, minor } = transformTicks("symlog", -150, 2000, 12, 1);
  assert.deepEqual(major, [-100, -10, -1, 0, 1, 10, 100, 1000]);
  assert.ok(minor.includes(-20) && minor.includes(2000) && minor.includes(5) && !minor.includes(3000));
  // Fewer fit: every other decade, counting down from the largest; ±1 would crowd 0.
  assert.deepEqual(transformTicks("symlog", -1000, 1000, 3, 1).major, [-1000, -10, 0, 10, 1000]);
  assert.deepEqual(transformTicks("symlog", -43688, 43688, 4, 10).major, [-1e4, -100, 0, 100, 1e4]);
  // A larger constant is linear near 0: ±c's decade is the first tick past 0.
  assert.deepEqual(transformTicks("symlog", -1e4, 1e4, 12, 100).major, [-1e4, -1000, -100, 0, 100, 1000, 1e4]);
  assert.deepEqual(transformTicks("symlog", 5, 5000, 8, 1).major, [10, 100, 1000]);
  assert.equal(transformTicks("symlog", -0.8, 0.9, 6, 1), null);
  assert.deepEqual(transformTicks("symlog", 5, 5000, 8, 1).major, [10, 100, 1000]);
  // log keeps its decade rule; linear and sqrt use d3's linear ticks.
  assert.deepEqual(transformTicks("log", 1, 1000, 5).major, [1, 10, 100, 1000]);
  assert.equal(transformTicks("sqrt", 0, 10, 5), null);
});

test("a midpoint maps the domain's halves to the range's halves, as d3.scaleDiverging", () => {
  const linear = d3.scaleDiverging().domain([-2, 0, 10]).interpolator((t) => t);
  for (const v of [-2, -1, 0, 3, 10])
    assert.ok(Math.abs(scaleFraction(v, { domain: [-2, 10], midpoint: 0 }) - linear(v)) < 1e-12, String(v));
  const log = d3.scaleDivergingLog().domain([1, 10, 1e4]).interpolator((t) => t);
  for (const v of [1, 3, 10, 100, 1e4])
    assert.ok(Math.abs(scaleFraction(v, { domain: [1, 1e4], transform: "log", midpoint: 10 }) - log(v)) < 1e-12, String(v));
  // A reversed domain keeps its halves; the inverse returns the value at a fraction.
  assert.equal(scaleFraction(10, { domain: [10, -2], midpoint: 0 }) + 0, 0);
  assert.equal(scaleValueAt(0.5, { domain: [-2, 10], midpoint: 0 }), 0);
  assert.equal(scaleValueAt(0.25, { domain: [-2, 10], midpoint: 0 }), -1);
  // Without a midpoint the map is one linear piece; a missing value stays missing.
  assert.equal(scaleFraction(4, { domain: [-2, 10] }), 0.5);
  assert.ok(Number.isNaN(scaleFraction(0, { domain: [1, 10], transform: "log" })));
  assert.throws(() => checkMidpoint(20, [-2, 10]), /^Error: Scale midpoint 20 is outside its domain \[-2, 10\]\.$/);
});

test("normalizations take symlog, a constant and a midpoint; an automatic domain grows to the midpoint", () => {
  const n = createNormalization({ transform: "symlog", constant: 5, midpoint: 0 });
  assert.equal(n.constant, 5);
  n.contribute("a", [2, 10]);
  assert.deepEqual(n.domain, [0, 10]);
  assert.deepEqual(n.preview("b", [-4, 1]), [-4, 10]);
  assert.throws(() => createNormalization({ domain: [1, 10], midpoint: 20 }),
    /^Error: Normalization midpoint 20 is outside its domain \[1, 10\]\.$/);
  assert.throws(() => createNormalization({ transform: "symlog", constant: -1 }),
    /^Error: Normalization constant must be a finite positive number\.$/);
  assert.throws(() => continuous({ normalization: n, midpoint: 1 }), /Configure domain, transform, constant, midpoint/);
  n.update({ midpoint: undefined });
  assert.equal(n.midpoint, undefined);
  assert.deepEqual(n.domain, [2, 10]);
});

test("automatic domains pad in transformed space: a log axis stays positive", () => {
  const [lo, hi] = paddedDomain([1, 1000], "log", 0.04);
  assert.ok(lo > 0 && Math.abs(Math.log(lo) + 0.04 * Math.log(1000)) < 1e-9 && hi > 1000);
  assert.deepEqual(paddedDomain([2, 4], "linear", 0.5), [1, 5]);
  assert.deepEqual(paddedDomain([3, 3], "linear", 0), [2.5, 3.5]);
  assert.ok(paddedDomain([5, 5], "log", 0).every((v) => v > 0));
  assert.equal(paddedDomain([0, 4], "sqrt", 0.5)[0], 0);
});


test("render scale mappings preserve equal and reversed domains, midpoint halves and validity", () => {
  const cases = [
    [2, { domain: [2, 2] }, 0],
    [2, { domain: [2, 2], range: [4, 8] }, 4],
    [0, { domain: [0, 1e-10] }, 0],
    [1e-10, { domain: [0, 1e-10] }, 0.01],
    [5, { domain: [10, 0] }, 0.5],
    [-1, { domain: [3, -1], midpoint: 0 }, 1],
    [0, { domain: [3, -1], midpoint: 0 }, 0.5],
    [1.5, { domain: [3, -1], midpoint: 0 }, 0.25],
    [0, { domain: [0, 4], midpoint: 0 }, 0.5],
    [4, { domain: [0, 4], midpoint: 4 }, 0.5],
    [10, { domain: [1, 100], transform: "log" }, 0.5],
    [10, { domain: [100, 1], transform: "log", midpoint: 10 }, 0.5],
    [4, { domain: [0, 16], transform: "sqrt" }, 0.5],
    [0, { domain: [-10, 10], transform: "symlog", constant: 2 }, 0.5],
    [0, { domain: [1, 100], transform: "log" }, null],
    [-1, { domain: [0, 16], transform: "sqrt" }, null],
  ];
  for (const [value, options, expected] of cases) {
    const result = renderScaleValue(value, options);
    if (expected === null) assert.equal(result, null);
    else assert.ok(Math.abs(result - expected) < 1e-12, JSON.stringify({ value, options, expected, result }));
  }
  assert.equal(scaleFraction(2, { domain: [2, 2] }), 0.5, "axis/domain arithmetic keeps its existing equal-domain rule");
});
