import test from "node:test";
import assert from "node:assert/strict";
import {
  datetimeCoordinates,
  calendarTicks,
  formatDatetime,
} from "../../src/lib/plot/utils/datetime.js";
import {
  axisLayout,
  polarAxisLayout,
  axisDefaults,
  axisKey,
  validateAxis,
  validateRules,
} from "../../src/lib/plot/utils/axes.js";
function options(config = {}, extra = {}) {
  const values = {
    xbounds: [0, 10],
    xrange: [0, 100],
    xTransform: "linear",
    ...extra,
  };
  const styles = Object.fromEntries(
    Object.entries({ ...axisDefaults, ...config }).map(([k, v]) => [
      axisKey("x", k),
      v,
    ]),
  );
  return {
    get: (k) => values[k],
    child: () => ({
      get: (k) => (k === "referenceRules" ? extra.rules : styles[k]),
    }),
  };
}
test("relative milliseconds retain seconds in modern timestamps and reuse origin", () => {
  const start = Date.UTC(2026, 8, 13);
  const a = datetimeCoordinates([new Date(start), start + 1000, start + 2000]);
  assert.deepEqual([...a.values], [0, 1000, 2000]);
  assert.equal(datetimeCoordinates([start + 3000], a).values[0], 3000);
  assert.throws(() => datetimeCoordinates([NaN]));
});
test("numeric major/minor layout, formatting and reversed domains", () => {
  const o = options({ step: 2, minor: true, format: ".2f" });
  const a = axisLayout(o, "x", [0, 100], 800);
  assert.equal(a.major[1].label, "2.00");
  assert.ok(a.minor.some((t) => Math.abs(t.value - 0.4) < 1e-10));
  assert.equal(a.major[1].fraction, 0.2);
  const b = axisLayout(o, "x", [100, 0], 800);
  assert.equal(b.major[0].value, 10);
  assert.equal(b.major.at(-1).value, 0);
  assert.throws(
    () => axisLayout(options({ step: 0.00001 }), "x", [0, 100], 800),
    {
      code: "limit.axisTicks",
      message:
        /^Plot: an axis needs 1,000,000 ticks; the limit is 4,096 ticks\./,
    },
  );
});
test("polar guides use a fixed custom X period and Y radius ticks", () => {
  const values = {
      coordinates: "polar", angleUnit: "custom", anglePeriod: 24,
      xbounds: [0, 24], xrange: [0, 24], ybounds: [0, 3], yrange: [0, 3],
      xTransform: "linear", yTransform: "linear", baseRadius: 0, radialScale: 1,
    }, styles = {};
  for (const axis of ["x", "y"])
    for (const [key, value] of Object.entries(axisDefaults)) styles[axisKey(axis, key)] = value;
  styles[axisKey("x", "step")] = 6;
  styles[axisKey("y", "step")] = 1;
  const rules = [{ axis: "x", value: 6, label: "Quarter", color: "#aa4433" },
    { axis: "y", value: 2, label: "Orbit", dash: [5, 3] }];
  const options = { get: (key) => values[key], child: () => ({
    get: (key) => key === "referenceRules" ? rules : styles[key],
  }) };
  const layout = polarAxisLayout(options, 400);
  assert.deepEqual(layout.angular.major.map((tick) => tick.value), [0, 12, 18]);
  assert.ok(Math.abs(layout.angular.reference[0].angle - Math.PI / 2) < 1e-10);
  assert.equal(layout.angular.reference[0].label, "Quarter");
  assert.deepEqual(layout.radial.major.map((tick) => tick.value), [1, 3]);
  assert.equal(layout.radial.reference[0].radius, 2);
  assert.deepEqual(layout.radial.reference[0].dash, [5, 3]);
  assert.equal(layout.radial.major[0].radius, 1);
  values.xbounds = [0, 12]; values.xrange = [0, 12];
  const narrowed = polarAxisLayout(options, 400);
  assert.ok(Math.abs(narrowed.angular.reference[0].angle - Math.PI / 2) < 1e-10);
});
test("log decade minors, sqrt placement and rule clipping", () => {
  const a = axisLayout(
    options({ minor: true }, { xbounds: [1, 1000], xTransform: "log" }),
    "x",
    [0, 100],
    800,
  );
  assert.deepEqual(
    a.major.map((t) => t.value),
    [1, 10, 100, 1000],
  );
  assert.ok(a.minor.some((t) => t.value === 20));
  const b = axisLayout(
    options(
      { step: 25 },
      {
        xbounds: [0, 100],
        xTransform: "sqrt",
        rules: [
          { axis: "x", value: 25 },
          { axis: "x", value: 101 },
        ],
      },
    ),
    "x",
    [0, 100],
    800,
  );
  assert.equal(b.reference.length, 1);
  assert.equal(b.reference[0].fraction, 0.5);
});
test("DST spring skips missing hour, fall retains both repeated hours with offsets", () => {
  const zone = "America/New_York";
  const spring = calendarTicks(
    Date.parse("2026-03-08T00:00:00-05:00"),
    Date.parse("2026-03-08T05:00:00-04:00"),
    8,
    zone,
    "1 hour",
  );
  assert.deepEqual(
    spring.map((t) => formatDatetime(t, "%H:%M", zone)),
    ["00:00", "01:00", "03:00", "04:00", "05:00"],
  );
  const start = Date.parse("2026-11-01T00:00:00-04:00"),
    end = Date.parse("2026-11-01T04:00:00-05:00");
  const o = options(
    {
      type: "datetime",
      timeOrigin: start,
      timezone: zone,
      majorInterval: "1 hour",
    },
    { xbounds: [0, end - start] },
  );
  const a = axisLayout(o, "x", [0, 100], 1200);
  assert.ok(a.major.some((t) => t.label === "01:00 -0400"));
  assert.ok(a.major.some((t) => t.label === "01:00 -0500"));
});
test("calendar months, leap days, timezone formats and validation", () => {
  const ticks = calendarTicks(
    Date.UTC(2024, 0, 1),
    Date.UTC(2024, 3, 1),
    5,
    "UTC",
    "1 month",
  );
  assert.deepEqual(
    ticks.map((t) => new Date(t).getUTCDate()),
    [1, 1, 1, 1],
  );
  assert.equal((ticks[2] - ticks[1]) / 86400000, 29);
  assert.equal(
    formatDatetime(Date.UTC(2024, 1, 29), "%Y-%m-%d", "UTC"),
    "2024-02-29",
  );
  assert.equal(formatDatetime(0, "%Q %s %Z", "UTC"), "0 0 +0000");
  assert.throws(() => formatDatetime(0, "%bad%"));
  assert.throws(() => validateAxis({ ...axisDefaults, format: ".2invalid" }));
  assert.equal(validateRules([{ axis: "x", value: "2026-01-01" }]).length, 1, "a wall date, in the axis's zone");
  assert.throws(() => validateRules([{ axis: "x", value: "January 1" }]), /a value that is a number, a Date, or an ISO date such as "2024-03-01" .*; received "January 1"/);
  assert.doesNotThrow(() =>
    validateRules([{ axis: "x", value: "2026-01-01T00:00:00Z" }]),
  );
});
test("local timezone and calendar spacing remain stable while panning", () => {
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  assert.equal(
    formatDatetime(1700000000000, "%c %Z", "Local"),
    formatDatetime(1700000000000, "%c %Z", zone),
  );
  const min = Date.UTC(2024, 0, 24),
    max = Date.UTC(2024, 1, 12);
  const a = calendarTicks(min, max, 10, "America/New_York", "2 days"),
    b = calendarTicks(
      min + 3 * 86400000,
      max,
      10,
      "America/New_York",
      "2 days",
    );
  assert.deepEqual(
    b,
    a.filter((v) => v >= min + 3 * 86400000),
  );
  assert.deepEqual(
    calendarTicks(min, max, 10, "UTC", "1 millisecond", 800),
    [],
  );
});
test("explicit datetime reference values share the origin and clipping mapping", () => {
  const origin = Date.UTC(2026, 0, 1),
    a = axisLayout(
      options(
        { type: "datetime", timeOrigin: origin, majorInterval: "1 second" },
        {
          xbounds: [0, 10000],
          rules: [{ axis: "x", value: "2026-01-01T00:00:05Z" }],
        },
      ),
      "x",
      [0, 100],
      800,
    );
  assert.equal(a.reference[0].fraction, 0.5);
  assert.equal(a.reference[0].value, 5000);
  assert.equal(a.major.find((t) => t.value === 5000).fraction, 0.5);
});

test("default tick labels are decimals, grouped once a guide reaches 10,000 (TODO 133.6)", async () => {
  const { tickLabel, roundedLabel, groupsThousands } = await import("../../src/lib/plot/utils/numberLabels.js");
  const log = [1, 10, 100, 1000, 10000, 100000];
  assert.deepEqual(log.map((v) => tickLabel(v, groupsThousands(log))), ["1", "10", "100", "1,000", "10,000", "100,000"]);
  // Four digits stay ungrouped on their own (years); float noise and fractions write exactly.
  assert.deepEqual([2020, 29.99999999, 0.1 + 0.2, 0.25, -1500, 0].map((v) => tickLabel(v, groupsThousands([2020]))),
    ["2020", "30", "0.3", "0.25", "−1500", "0"]);
  // Too small or large to read as decimals: an exponent.
  assert.deepEqual([1e-5, 2e15].map((v) => tickLabel(v)), ["0.00001", "2e+15"]);
  // A colorbar's evenly spaced ticks round to three significant digits.
  assert.deepEqual([0, 11387.5, 22775, 45550].map((v) => roundedLabel(v, true)), ["0", "11,400", "22,800", "45,600"]);
});

test("a theme's numbers.format labels linear ticks unless the axis sets a format; not log axes or angles (TODO 132.4)", () => {
  const themed = (config, extra) => { const o = options(config, extra), get = o.get; return { ...o, get: (k) => (k === "numberFormat" ? "$,.2f" : get(k)) }; };
  assert.equal(axisLayout(themed({ step: 2 }), "x", [0, 100], 800).major[1].label, "$2.00");
  assert.equal(axisLayout(themed({ step: 2, format: ".1f" }), "x", [0, 100], 800).major[1].label, "2.0");
  const labels = (layout) => layout.major.map((t) => t.label).filter(Boolean);
  // Decades would all read alike in a fixed-precision format ($0, $0, $1); a longitude as "$45°".
  assert.deepEqual(labels(axisLayout(themed({}, { xbounds: [1, 1000], xTransform: "log" }), "x", [0, 100], 800)), ["1", "10", "100", "1000"]);
  assert.ok(labels(axisLayout(themed({ step: 45 }, { coordinates: "spherical", angleUnit: "degrees", xbounds: [-180, 180] }), "x", [-180, 180], 800))
    .every((label) => !label.includes("$")));
  // A polar angle keeps its own labels; the radius takes the theme's.
  const values = { coordinates: "polar", angleUnit: "custom", anglePeriod: 24, xbounds: [0, 24], xrange: [0, 24], ybounds: [0, 3],
    yrange: [0, 3], xTransform: "linear", yTransform: "linear", baseRadius: 0, radialScale: 1, numberFormat: ".0%" };
  const styles = Object.fromEntries(["x", "y"].flatMap((axis) => Object.entries(axisDefaults).map(([key, value]) => [axisKey(axis, key), value])));
  const polar = polarAxisLayout({ get: (key) => values[key], child: () => ({ get: (key) => styles[key] }) }, 400);
  assert.ok(labels(polar.angular).every((label) => !label.includes("%")), labels(polar.angular).join());
  assert.ok(labels(polar.radial).every((label) => label.endsWith("%")), labels(polar.radial).join());
});

test("ticks sharing four leading digits read compactly beside an offset (TODO 136.10)", async () => {
  const { compactTicks } = await import("../../src/lib/plot/utils/numberLabels.js");
  // Deep in a zoom each would round to 932,000; the digits that change tell them apart.
  assert.deepEqual(compactTicks([932000.001, 932000.002, 932000.003]),
    { offset: 932000, text: "+932,000", labels: ["0.001", "0.002", "0.003"] });
  assert.deepEqual(compactTicks([1000000.25, 1000000.5, 1000000.75]).labels, ["0.25", "0.5", "0.75"]);
  assert.deepEqual(compactTicks([-932000.004, -932000.002, -932000]),
    { offset: -932000, text: "−932,000", labels: ["−0.004", "−0.002", "0"] });
  assert.equal(compactTicks([1.2345e16, 1.2346e16]).text, "+1.234e+16");
  // The offset is the roundest value that keeps labels to the changing digits, at or below the
  // ticks where one is as round, else at their middle (signed labels).
  assert.deepEqual(compactTicks([931999.98, 931999.99, 932000, 932000.01, 932000.02]).labels,
    ["−0.02", "−0.01", "0", "0.01", "0.02"]);
  assert.equal(compactTicks([123456.7, 123456.8, 123456.9]).text, "+123,456");
  // Offset plus label is the tick, whatever the zoom (written exactly, never rounded away).
  const { ticks } = await import("d3");
  const read = (text) => Number(text.replace(/\u2212/g, "-").replace(/,/g, ""));
  for (const [center, half] of [[932000, 0.025], [932000.0015, 0.0005], [-4.2e9, 30], [1e6 + 0.5, 0.4], [5.5e-7, 1e-12], [7e12, 2e5]]) {
    const values = ticks(center - half, center + half, 5), compact = compactTicks(values);
    assert.ok(compact, `${center} ± ${half}`);
    const step = values[1] - values[0];
    values.forEach((value, i) =>
      assert.ok(Math.abs(read(compact.text) + read(compact.labels[i]) - value) < step / 100, `${compact.text} ${compact.labels[i]} vs ${value}`));
    assert.equal(new Set(compact.labels).size, values.length);
  }
  // Ticks that read well alone keep their labels: years, small numbers, a wide span.
  for (const values of [[2000, 2001, 2002], [0.5, 1, 1.5], [0, 500000, 1000000], [5]])
    assert.equal(compactTicks(values), null, String(values));
});

test("ticks are chosen for the plot's own area, not the margins around it (TODO 134.12)", () => {
  // A 240 px histogram's y axis over [-4, 96]: the canvas's frame reaches 1.6 times past the
  // axis, so ticks chosen for it were 0 and 100, and only 0 was on the axis.
  const values = { coordinates: "cartesian", ybounds: [-4, 96], yrange: [-50, 50], yTransform: "linear" };
  const options = { get: (k) => values[k], child: () => ({ get: (k) => (k === "referenceRules" || k === "referenceBands" ? [] : undefined) }) };
  const visible = [-80, 80], area = [30 / 160, 130 / 160];
  const inside = (layout) => layout.major.filter((t) => t.showLabel && t.fraction >= area[0] && t.fraction <= area[1]);
  assert.ok(inside(axisLayout(options, "y", visible, 240, area)).length >= 2);
  assert.equal(inside(axisLayout(options, "y", visible, 240)).length, 1);
});
