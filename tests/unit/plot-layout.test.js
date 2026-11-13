import test from "node:test";
import assert from "node:assert/strict";
import {
  MAX_ITERATIONS,
  letterbox,
  plotGutters,
  solveLayout,
  solveRoundLayout,
} from "../../src/lib/plot/utils/plotLayout.js";

// TODO 136.10 slice 1: the pure layout solver. Text is 6 px a character; fonts are 11 px.
const measure = (text) => 6 * text.length;
const at = (span, fractions, texts) =>
  fractions.map((f, i) => ({
    text: texts[i],
    at: span[0] + f * (span[1] - span[0]),
  }));
// About one tick per 90 px of the span, labelled with as many decimals as the step needs.
const numeric = (span) => {
  const count = Math.max(2, Math.floor((span[1] - span[0]) / 90) + 1);
  return Array.from({ length: count }, (_, i) => {
    const f = i / (count - 1);
    return {
      text: f.toFixed(count > 6 ? 3 : 1),
      at: span[0] + f * (span[1] - span[0]),
    };
  });
};
/** Every label drawn for the solved area lies inside the canvas, and each axis inside its gutter. */
const fits = (layout, input) => {
  input.axes.forEach((axis, i) => {
    const upright = axis.side === "left" || axis.side === "right",
      span = upright
        ? [layout.area.top, layout.area.bottom]
        : [layout.area.left, layout.area.right];
    for (const label of axis.ticks(span)) {
      const half = upright ? 5.5 : measure(label.text) / 2;
      assert.ok(
        label.at - half >= 0 &&
          label.at + half <= (upright ? input.height : input.width),
        label.text,
      );
    }
    assert.ok(
      layout.axes[i].offset + layout.axes[i].depth <= layout.gutters[axis.side],
      axis.side,
    );
  });
};

test("a pinned side keeps its margin, at most 0.45 of the canvas; an empty auto or null side is the padding", () => {
  const layout = solveLayout({
    width: 400,
    height: 100,
    measure,
    margins: { left: 50, right: 300, top: 0, bottom: null },
  });
  assert.deepEqual(layout.gutters, { left: 50, right: 180, top: 0, bottom: 2 });
  assert.deepEqual(layout.area, {
    left: 50,
    top: 0,
    right: 220,
    bottom: 98,
    width: 170,
    height: 98,
  });
  assert.equal(layout.converged, true);
  assert.throws(
    () => solveLayout({ width: 1, height: 1, measure, margins: { left: -1 } }),
    /Plot: axisMarginLeft must be "auto" or a number of pixels of at least 0, got -1/,
  );
  assert.throws(
    () => solveLayout({ width: NaN, height: 1, measure }),
    /Plot: the layout needs the canvas's width and height in pixels, got NaN by 1/,
  );
});

test("an auto left gutter fits the widest y label and the y title (134.5)", () => {
  const names = ["a", "Ruthenium oxide", "b"];
  const layout = solveLayout({
    width: 600,
    height: 300,
    measure,
    axes: [
      {
        side: "left",
        tickSize: 5,
        labelOffset: 3,
        ticks: (span) => at(span, [0.2, 0.5, 0.8], names),
        title: { text: "Compound", offset: 7 },
      },
    ],
  });
  // ticks 5 + offset 3 + "Ruthenium oxide" 90 + title offset 7 + an upright title 11 + padding 2
  assert.equal(layout.gutters.left, 118);
  assert.deepEqual(layout.axes, [{ side: "left", offset: 0, depth: 116 }]);
});

test("an auto bottom gutter fits the x labels, a datetime axis's second row and the title", () => {
  const layout = solveLayout({
    width: 600,
    height: 300,
    measure,
    axes: [
      {
        side: "bottom",
        tickSize: 5,
        labelOffset: 3,
        ticks: (span) => [
          ...at(span, [0.25, 0.75], ["Jan", "Feb"]),
          { text: "2026", at: span[0], row: 1 },
        ],
        title: { text: "Month", offset: 7, fontSize: 13 },
      },
    ],
  });
  // The second row as labelMargin sizes it, 5 + 3 + 11 + 2 + 11 + its descent 3.3, then the
  // title's 7 + 13 and the padding 2.
  assert.equal(layout.gutters.bottom, 58);
});

test("the end labels of an axis widen the gutters across it", () => {
  const layout = solveLayout({
    width: 600,
    height: 300,
    measure,
    axes: [
      { side: "bottom", ticks: (span) => at(span, [0, 1], ["0", "1,000,000"]) },
      { side: "left", ticks: (span) => at(span, [0, 1], ["10", "0"]) },
    ],
  });
  // Half of "1,000,000" (27) past the right end, and the top label's glyphs
  // 0.68 of 11 px above its tick (the baseline .32em below it).
  assert.equal(layout.gutters.right, 29);
  assert.equal(layout.gutters.top, 10);
  // "0" centered on the left edge reaches 3 px into the left gutter, already wider.
  assert.equal(layout.gutters.left, 2 + 3 + 12);
});

test("ticks chosen for the area converge to gutters that fit them", () => {
  const input = {
    width: 640,
    height: 360,
    measure,
    axes: [
      { side: "bottom", tickSize: 5, ticks: numeric },
      { side: "left", tickSize: 5, ticks: numeric, title: { text: "Count" } },
    ],
  };
  const layout = solveLayout(input);
  assert.equal(layout.converged, true);
  assert.ok(
    layout.iterations > 1 && layout.iterations <= 3,
    String(layout.iterations),
  );
  fits(layout, input);
});

test("labels that trade places with the gutter still end, with room for the longer set", () => {
  // A long first label widens the left gutter, which shortens the area to one with a short first
  // label, which narrows the gutter again.
  const flipping = (span) =>
    at(span, [0], [span[1] - span[0] > 375 ? "a long label" : "ab"]);
  const layout = solveLayout({
    width: 400,
    height: 300,
    measure,
    axes: [{ side: "bottom", ticks: flipping }],
  });
  assert.ok(
    layout.iterations > 3 && layout.iterations <= MAX_ITERATIONS,
    String(layout.iterations),
  );
  assert.equal(layout.converged, true);
  // Half of "a long label" (36) past the left edge, and the padding.
  assert.equal(layout.gutters.left, 38);
});

test("axes stacked on one side sit outside each other", () => {
  const axis = {
    side: "right",
    tickSize: 4,
    labelOffset: 3,
    ticks: (span) => at(span, [0.5], ["12345"]),
  };
  const layout = solveLayout({
    width: 600,
    height: 300,
    measure,
    axes: [axis, axis],
  });
  // Each is 4 + 3 + 30 deep, the second 8 px past the first's labels.
  assert.deepEqual(
    layout.axes.map((a) => a.offset),
    [0, 45],
  );
  assert.equal(layout.gutters.right, 45 + 37 + 2);
});

test("rotated labels take their rotated extent, and an end-aligned one overhangs before its tick", () => {
  const layout = solveLayout({
    width: 600,
    height: 400,
    measure,
    axes: [
      {
        side: "bottom",
        labelAngle: -90,
        labelAlign: "end",
        ticks: (span) => at(span, [0], ["Category"]),
      },
    ],
  });
  // Rotated about its baseline, 3 + 11 below the axis: the text runs 48 px down from there, and
  // its 11 px ascent sits before the tick, at the area's left edge.
  assert.equal(layout.gutters.bottom, 3 + 11 + 48 + 2);
  assert.equal(layout.gutters.left, 11 + 2);
});

test("each text is measured once a run", () => {
  let calls = 0;
  solveLayout({
    width: 640,
    height: 360,
    measure: (text) => (calls++, measure(text)),
    axes: [
      {
        side: "left",
        ticks: (span) => at(span, [0, 0.5, 1], ["0", "5", "10"]),
      },
    ],
  });
  assert.equal(calls, 3);
});

test("a Plot's gutters are the solved ones, or before a solve the pinned margins and fallbacks", () => {
  const plot = (values) => ({ get: (key) => values[key] });
  assert.deepEqual(
    plotGutters(plot({ axisMarginLeft: "auto", axisMarginTop: 4 })),
    {
      left: 36,
      right: 12,
      top: 4,
      bottom: 32,
    },
  );
  const solved = { left: 50, right: 9, top: 8, bottom: 30 };
  assert.equal(
    plotGutters(plot({ _axisGutters: solved, axisMarginTop: 4 })),
    solved,
  );
});

test("a side whose labels need more than 0.45 of the canvas stops there and reports the overflow (slice 6)", () => {
  const names = ["A very long category name indeed", "Short"];
  const input = {
    width: 200,
    height: 120,
    measure,
    axes: [
      { side: "left", tickSize: 4, ticks: (span) => at(span, [0, 1], names) },
    ],
  };
  const layout = solveLayout(input);
  assert.equal(layout.gutters.left, 90);
  assert.deepEqual(layout.overflow, ["left"]);
  assert.deepEqual(solveLayout({ ...input, width: 600 }).overflow, []);
  // A pinned side clips as asked, without a warning.
  assert.deepEqual(
    solveLayout({ ...input, margins: { left: 20 } }).overflow,
    [],
  );
});

test("a round plot's sides keep a padding and grow to fit the labels around its disk (slice 7)", () => {
  const angle = (degrees) => (degrees * Math.PI) / 180,
    labels = [0, 90, 180, 270].map((d) => ({
      text: `${d}°`,
      angle: angle(d),
      dy: -5,
    }));
  // The disk fills the height: the 90 degree label above it takes the top gutter; the ones
  // beside it overhang into the width's slack.
  assert.deepEqual(
    solveRoundLayout({ width: 400, height: 300, labels, measure }).gutters,
    {
      left: 8,
      right: 8,
      top: 24,
      bottom: 8,
    },
  );
  // The disk fills the width: the 180 degree label reaches past its left edge.
  const narrow = solveRoundLayout({
    width: 200,
    height: 300,
    labels,
    measure,
  }).gutters;
  assert.equal(narrow.left, 20);
  assert.ok(narrow.right >= 14 && narrow.right <= 16, `right ${narrow.right}`);
  // A globe or map without outer labels keeps the padding; pinned sides stay pinned.
  assert.deepEqual(
    solveRoundLayout({
      width: 400,
      height: 300,
      measure,
      margins: { left: 40 },
    }).gutters,
    { left: 40, right: 8, top: 8, bottom: 8 },
  );
  const wide = [
    { text: "a label far wider than the canvas", angle: 0, anchor: "start" },
  ];
  assert.deepEqual(
    solveRoundLayout({ width: 100, height: 100, labels: wide, measure })
      .overflow,
    ["right"],
  );
});

test("aspect=\"equal\" letterboxes an explicit domain and widens an automatic one (TODO 136.14)", () => {
  const area = { left: 40, right: 440, top: 10, bottom: 210 }; // 400 x 200
  // x [0, 1], y [0, 1]: x would show 2 units; given, its side shrinks to 200 px, centered.
  assert.deepEqual(letterbox(area, { x: 1, y: 1 }, { x: true, y: true }), {
    left: 140,
    right: 340,
    top: 10,
    bottom: 210,
  });
  // An automatic x is widened, as before.
  assert.deepEqual(letterbox(area, { x: 1, y: 1 }, { x: false, y: true }), area);
  // y [0, 4] in 200 px is 50 px a unit, x [0, 1] in 400 px is 400: x again is the one cut.
  assert.deepEqual(letterbox(area, { x: 1, y: 4 }, { x: true, y: false }), {
    ...area,
    left: 215,
    right: 265,
  });
  // x [0, 4] is 100 px a unit against y's 200: an explicit y [0, 1] gets 100 px, centered.
  assert.deepEqual(letterbox(area, { x: 4, y: 1 }, { x: false, y: true }), {
    left: 40,
    right: 440,
    top: 60,
    bottom: 160,
  });
  // y has the spare length but is automatic: widened, though x is explicit.
  assert.deepEqual(letterbox(area, { x: 4, y: 1 }, { x: true, y: false }), area);
  assert.deepEqual(letterbox(area, { x: NaN, y: 1 }, { x: true, y: true }), area);
  // No side past 45% of a 440 px canvas (198 px): the left gutter stops there, and the strip is
  // wider than the 50 px the domain needs (both sides move in by the same amount).
  const capped = letterbox(area, { x: 1, y: 4 }, { x: true, y: false }, { width: 440, height: 220, share: 0.45 });
  assert.deepEqual([capped.left, 440 - capped.right], [198, 158]);
});
