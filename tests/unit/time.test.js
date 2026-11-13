// Time as data (TODO 53): calendar functions, calendar bins, datetime inputs, range breaks and
// model calendars.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Temporal } from "@js-temporal/polyfill";
import { createDataScope, literal } from "../../src/lib/plot/utils/categorical.js";
import { runTransform } from "../../src/lib/plot/utils/transforms.js";
import * as E from "../../src/lib/plot/utils/expressions.js";
import { calendarEdges } from "../../src/lib/plot/utils/datetime.js";
import { axisLayout, axisKey, labelMargin, axisValue, axisWorld } from "../../src/lib/plot/utils/axes.js";
import { breakRules, breakTable, breakPosition, breakTime, breakPositions, inBreak } from "../../src/lib/plot/utils/breaks.js";
import { numpy as np } from "@hmplot/jax";
import { playbackTimeStep, timeStops, timeText, addTime } from "../../src/lib/plot/utils/timeInputs.js";
import { scopeValue, displayValue, sameOption, optionEntries } from "../../src/lib/plot/utils/inputs.js";
import { modelCalendar, modelParts, modelValue, modelTicks, modelEdges, formatModel } from "../../src/lib/plot/utils/modelCalendars.js";
import { CALENDAR_PARTS } from "../../src/lib/plot/utils/calendar.js";

const scopeOf = (value) => {
  const scope = createDataScope();
  scope.update(value);
  return scope;
};
async function evaluate(expression, scope) {
  const result = E.evaluateExpression(expression, scope);
  const value = result.value?.codes ?? result.value;
  const values = Array.from(await value.ref.data());
  const out = { values, metadata: result.metadata, categories: result.value?.categories };
  result.dispose();
  return out;
}

const fixture = JSON.parse(readFileSync(new URL("./fixtures/pandas-calendar.json", import.meta.url), "utf8"));

test("calendar functions agree with pandas in five zones, across DST changes and years from the origin", async () => {
  const scope = scopeOf({ t: fixture.times.map((ms) => new Date(ms)) });
  for (const [zone, expected] of Object.entries(fixture.zones)) {
    for (const part of CALENDAR_PARTS) {
      const { values } = await evaluate(E[part]("t", { tz: zone }), scope);
      assert.deepEqual(values, expected[part], `${part} in ${zone}`);
    }
    for (const part of ["month_name", "day_name"]) {
      const { values, categories } = await evaluate(E[part]("t", { tz: zone }), scope);
      assert.deepEqual(values.map((code) => categories[code]), expected[part], `${part} in ${zone}`);
    }
    // time_floor to the month: the month's start in the zone, as far as float32 holds a time
    // (its step at 30 years from the origin is 131 s).
    const floored = await evaluate(E.time_floor("t", "1 month", { tz: zone }), scope);
    const origin = floored.metadata.origin;
    floored.values.forEach((value, i) => {
      const step = Math.max(1, Math.abs(expected.floor_month[i] - origin) * 2 ** -23);
      assert.ok(Math.abs(value + origin - expected.floor_month[i]) <= step, `time_floor month ${i} in ${zone}`);
    });
  }
  scope.dispose();
});

test("a column's own zone is the default, and a missing time is missing", async () => {
  const times = [Date.UTC(2026, 6, 1, 23, 30), null];
  const scope = createDataScope();
  scope.update({ t: { __hmplotColumn: true, values: times.map((t) => (t === null ? null : new Date(t))),
    metadata: { type: "datetime", timezone: "Asia/Tokyo" } } });
  assert.deepEqual((await evaluate(E.day("t"), scope)).values, [2, NaN]);
  assert.deepEqual((await evaluate(E.day("t", { tz: "UTC" }), scope)).values, [1, NaN]);
  const names = await evaluate(E.day_name("t"), scope);
  assert.deepEqual([names.categories[names.values[0]], names.values[1]], ["Thu", -1]);
  assert.throws(() => E.year("t", { tz: "Mars/Olympus" }));
  assert.throws(() => E.time_floor("t", "1 fortnight"), /interval/);
  scope.dispose();
  const numbers = scopeOf({ x: [1, 2] });
  assert.throws(() => E.evaluateExpression(E.year("x"), numbers), /reads a datetime column/);
  numbers.dispose();
});

// A time's own float32 step (2 s seven months from the origin) limits what a floor can resolve:
// :05 is well within a ten-second step either way.
test("time_floor steps by each unit, and a result is a time", async () => {
  const zone = "Europe/Paris", times = [Date.UTC(2026, 2, 29, 5, 47, 31), Date.UTC(2026, 9, 25, 1, 17, 5), Date.UTC(2025, 11, 31, 23, 59)];
  const scope = scopeOf({ t: times.map((t) => new Date(t)) });
  // Temporal's floor in the zone: a multiple of `step` of the unit within the next larger one.
  const reference = (ms, unit, step) => {
    let z = Temporal.Instant.fromEpochMilliseconds(ms).toZonedDateTimeISO(zone);
    if (unit === "year") z = z.with({ year: Math.floor(z.year / step) * step, month: 1, day: 1 }).startOfDay();
    else if (unit === "month") z = z.with({ month: Math.floor((z.month - 1) / step) * step + 1, day: 1 }).startOfDay();
    else if (unit === "week") z = z.subtract({ days: z.dayOfWeek - 1 }).startOfDay();
    else if (unit === "day") z = z.startOfDay();
    else {
      const clear = { hour: { minute: 0 }, minute: { second: 0 }, second: {} }[unit];
      z = z.with({ ...clear, [unit]: Math.floor(z[unit] / step) * step, second: unit === "second" ? Math.floor(z.second / step) * step : 0, millisecond: 0 }, { offset: "prefer" });
    }
    return z.epochMilliseconds;
  };
  for (const [interval, unit, step] of [["1 year", "year", 1], ["3 months", "month", 3], ["1 month", "month", 1], ["1 week", "week", 1],
    ["1 day", "day", 1], ["6 hours", "hour", 6], ["1 hour", "hour", 1], ["15 minutes", "minute", 15], ["10 seconds", "second", 10]]) {
    const { values, metadata } = await evaluate(E.time_floor("t", interval, { tz: zone }), scope);
    assert.equal(metadata.type, "datetime");
    values.forEach((value, i) => {
      const want = reference(times[i], unit, step);
      assert.ok(Math.abs(value + metadata.origin - want) <= Math.max(1, Math.abs(want - metadata.origin) * 2 ** -23), `${interval} ${i}: ${new Date(value + metadata.origin).toISOString()} for ${new Date(want).toISOString()}`);
    });
  }
  scope.dispose();
});

test("times compare with Dates and with other tables' times; a time plus a number stays a time", async () => {
  const a = scopeOf({ t: [new Date(Date.UTC(2026, 0, 1)), new Date(Date.UTC(2026, 5, 1)), new Date(Date.UTC(2027, 0, 1))] });
  assert.deepEqual((await evaluate(E.less("t", new Date(Date.UTC(2026, 3, 1))), a)).values, [1, 0, 0]);
  assert.deepEqual((await evaluate(E.greater(new Date(Date.UTC(2026, 3, 1)), "t"), a)).values, [1, 0, 0]);
  const later = await evaluate(E.add("t", 86400000), a);
  assert.equal(later.metadata.type, "datetime");
  assert.deepEqual(later.values.map((v) => new Date(v + later.metadata.origin).toISOString().slice(0, 10)), ["2026-01-02", "2026-06-02", "2027-01-02"]);
  assert.equal((await evaluate(E.subtract("t", "t"), a)).metadata.type, "numeric");
  // Categories from a calendar function compare with a literal.
  assert.deepEqual((await evaluate(E.equal(E.month_name("t"), literal("Jun")), a)).values, [0, 1, 0]);
  a.dispose();
});

test("a datetime column bins by the calendar: interval, automatic intervals, zones and Facets' shared edges", async () => {
  const days = Array.from({ length: 90 }, (_, i) => new Date(Date.UTC(2026, 0, 15) + i * 86400000));
  const scope = scopeOf({ t: days });
  const monthly = await runTransform("Bin", scope, { x: "t", interval: "1 month" });
  const origin = monthly.metadata("x0").origin;
  const dates = async (view, key) => Array.from(await view.get(key).ref.data()).map((v) => new Date(v + origin).toISOString().slice(0, 10));
  assert.deepEqual(await dates(monthly, "x0"), ["2026-01-01", "2026-02-01", "2026-03-01", "2026-04-01"]);
  assert.deepEqual(Array.from(await monthly.get("count").ref.data()), [17, 28, 31, 14]);
  for (const key of ["x0", "x1", "x"]) assert.equal(monthly.metadata(key).type, "datetime", key);
  monthly.dispose();
  // Twelve bins over 90 days: the interval axis ticks would choose, weeks from Sunday.
  const weekly = await runTransform("Bin", scope, { x: "t", bins: 12 });
  assert.deepEqual((await dates(weekly, "x0")).slice(0, 2), ["2026-01-11", "2026-01-18"]);
  weekly.dispose();
  const assigned = await runTransform("Bin", scope, { x: "t", interval: "1 month", mode: "assign" });
  assert.equal(assigned.metadata("binX0").type, "datetime");
  assigned.dispose();
  const numeric = scopeOf({ x: [1, 2] });
  await assert.rejects(runTransform("Bin", numeric, { x: "x", interval: "1 month" }), /datetime column/);
  numeric.dispose(); scope.dispose();
  // Edges in a zone follow its offset changes: Paris days around the spring change.
  const edges = calendarEdges(Date.UTC(2026, 2, 28, 12), Date.UTC(2026, 2, 31), { unit: "day", step: 1 }, "Europe/Paris");
  assert.deepEqual(edges.map((t) => new Date(t).toISOString().slice(11, 16)), ["23:00", "23:00", "22:00", "22:00", "22:00"]);
});

test("Python's calendar calls and datetimes decode to the same expressions", async () => {
  const { SceneResources } = await import("../../src/lib/scene/resources.js");
  const resources = new SceneResources();
  const decoded = resources.resolve({ $expression: { op: "less", args: [
    { $expression: { op: "time_floor", args: ["t", { $expression_options: { interval: "1 month", tz: "Europe/Paris" } }] } },
    { $datetime: Date.UTC(2026, 1, 25) }] } }, () => {});
  assert.equal(decoded.args[0].op, "time_floor");
  assert.ok(decoded.args[1] instanceof Date);
  const scope = scopeOf({ t: [new Date(Date.UTC(2026, 1, 20)), new Date(Date.UTC(2026, 2, 20))] });
  assert.deepEqual((await evaluate(decoded, scope)).values, [1, 0]);
  scope.dispose();
  assert.throws(() => resources.resolve({ $expression: { op: "year", args: ["t", { $expression_options: { tz: "Nowhere/Else" } }] } }, () => {}));
});

/** Axis options as a Plot holds them (tests/unit/integrated-axes.test.js). */
function axisOptions(axis, extra = {}) {
  const plot = new Map(Object.entries(axis).map(([k, v]) => [axisKey("x", k), v]));
  const values = { coordinates: "cartesian", xbounds: [0, 1], xrange: [0, 100], xTransform: "linear", ...extra };
  return { get: (k) => values[k], child: () => ({ get: (k) => plot.get(k) ?? (k === "referenceRules" || k === "referenceBands" ? [] : undefined) }) };
}

test("a datetime x axis has a second row of labels where the coarser unit changes", () => {
  const origin = Date.UTC(2026, 0, 20), span = 40 * 86400000;
  const layout = axisLayout(axisOptions({ type: "datetime", timeOrigin: origin, timezone: "UTC", majorInterval: "1 week" }, { xbounds: [0, span] }), "x", [0, 100], 800);
  // Weekly ticks from Sunday: day numbers, with the month and year below where it changes.
  assert.deepEqual(layout.major.map((t) => t.label), ["25", "1", "8", "15", "22", "1"]);
  assert.deepEqual(layout.context.map((t) => t.label), ["Jan 2026", "Feb 2026", "Mar 2026"]);
  assert.equal(layout.context[1].value, layout.major[1].value);
  // Hours: the date below; months: the year. Off with context: false, and on y axes.
  const hours = axisLayout(axisOptions({ type: "datetime", timeOrigin: Date.UTC(2026, 0, 1, 18), timezone: "UTC" },
    { xbounds: [0, 12 * 3600000] }), "x", [0, 100], 800);
  assert.deepEqual(hours.context.map((t) => t.label), ["Jan 1, 2026", "Jan 2, 2026"]);
  const months = axisLayout(axisOptions({ type: "datetime", timeOrigin: Date.UTC(2025, 9, 1), timezone: "UTC", majorInterval: "1 month" },
    { xbounds: [0, 150 * 86400000] }), "x", [0, 100], 800);
  assert.deepEqual([months.major[0].label, months.context.map((t) => t.label)], ["Oct", ["2025", "2026"]]);
  const off = axisLayout(axisOptions({ type: "datetime", timeOrigin: origin, timezone: "UTC", majorInterval: "1 week", context: false },
    { xbounds: [0, span] }), "x", [0, 100], 800);
  assert.deepEqual([off.context, off.major[0].label], [[], "Jan 25"]);
  // The x axis's margin makes room for the second row.
  assert.equal(labelMargin(layout, 32), 36);
  assert.equal(labelMargin(off, 32), 32);
});

test("range breaks remove weekends and session hours in the axis's zone, and positions invert", async () => {
  const origin = Date.UTC(2026, 2, 2, 14, 30), zone = "America/New_York"; // Monday 09:30 in New York
  const weekends = breakTable("weekends", zone, origin);
  const at = (iso) => Temporal.Instant.from(iso).epochMilliseconds - origin;
  // Friday 16:00 and the next Monday 09:30 are 2 days 17.5 hours apart; without the weekend, 17.5 hours.
  const friday = at("2026-03-06T16:00-05:00"), monday = at("2026-03-09T09:30-04:00");
  assert.equal(breakPosition(weekends, monday) - breakPosition(weekends, friday), 17.5 * 3600000 - 3600000 * 0);
  assert.ok(inBreak(weekends, at("2026-03-07T12:00-05:00")) && !inBreak(weekends, friday));
  // A session: 09:30 to 16:00 on weekdays. Friday's close and Monday's open meet.
  const session = breakTable(["weekends", { hours: [16, 9.5] }], zone, origin);
  assert.equal(breakPosition(session, monday), breakPosition(session, friday));
  for (const t of [0, friday - 3600000, monday + 5 * 60000, at("2026-11-02T10:00-05:00"), at("2025-12-31T15:00-05:00")])
    assert.equal(breakTime(session, breakPosition(session, t)), t);
  // The device computes the host's positions.
  const times = [0, friday, monday, at("2026-03-07T12:00-05:00"), at("2026-06-01T12:00-04:00")];
  const device = Array.from(await breakPositions(session, np.array(times)).data());
  device.forEach((position, i) => assert.ok(Math.abs(position - breakPosition(session, times[i])) <= 1024, `${i}`));
  // Holidays and explicit ranges; malformed rules are refused.
  const holiday = breakTable({ dates: ["2026-03-04"] }, zone, origin);
  assert.equal(breakPosition(holiday, at("2026-03-05T00:00-05:00")) - breakPosition(holiday, at("2026-03-03T23:00-05:00")), 3600000);
  assert.equal(breakRules({ from: "2026-01-01T00:00Z", to: "2026-01-02T00:00Z" })[0].to - breakRules({ from: "2026-01-01T00:00Z", to: "2026-01-02T00:00Z" })[0].from, 86400000);
  assert.throws(() => breakRules("holidays"), /weekends/);
  assert.throws(() => breakRules({ hours: [9, 9] }), /hours/);
});

test("an axis with breaks ticks outside them and inverts its positions for the pointer and brushes", () => {
  const origin = Date.UTC(2026, 2, 2), zone = "UTC";
  const config = { type: "datetime", timeOrigin: origin, timezone: zone, breaks: ["weekends"], majorInterval: "1 day" };
  const table = breakTable(["weekends"], zone, origin);
  const end = breakPosition(table, 14 * 86400000);
  const options = axisOptions(config, { xbounds: [0, end] });
  const layout = axisLayout(options, "x", [0, 100], 800);
  // Two weeks of weekdays and the Monday after: eleven ticks, no Saturday or Sunday among them.
  const days = layout.major.map((t) => new Date(breakTime(table, t.value) + origin).getUTCDay());
  assert.equal(days.length, 11);
  assert.ok(days.every((d) => d >= 1 && d <= 5));
  // The world position of a Monday is the Friday's plus one day, and it inverts to the Monday.
  const monday = Date.UTC(2026, 2, 9), friday = Date.UTC(2026, 2, 6);
  assert.ok(Math.abs(axisWorld(options, "x", new Date(monday)) - axisWorld(options, "x", new Date(friday)) - 100 / (end / 86400000)) < 1e-6);
  assert.equal(axisValue(options, "x", axisWorld(options, "x", new Date(monday))), monday);
  // TODO 69.16: an automatic interval suited to the positions' span put several ticks in each
  // session (a break gathers its times at its end): four weeks of market hours at 800 px read
  // "09:30" and "12:00" over and over. Coarser intervals now, until they are about as few as
  // the axis asks for (2 x 8 here): days, each labeled once.
  const zoneNY = "America/New_York", sessions = breakTable(["weekends", { hours: [16, 9.5] }], zoneNY, origin);
  const span = breakPosition(sessions, 28 * 86400000);
  const market = axisLayout(axisOptions({ type: "datetime", timeOrigin: origin, timezone: zoneNY, breaks: ["weekends", { hours: [16, 9.5] }] },
    { xbounds: [0, span] }), "x", [0, 100], 800);
  assert.ok(market.major.length <= 16, `${market.major.length} ticks`);
  const labels = market.major.map((t) => t.label);
  assert.equal(new Set(labels).size, labels.length, labels.join(" "));
  assert.ok(labels.every((label) => /^\d+$/.test(label)), labels.join(" "));
});

test("model calendars: dates, calendar functions, floors, bins and an axis in 360_day, all_leap and noleap", async () => {
  // Dates round-trip, and each calendar's year has its own length.
  for (const [name, length] of [["360_day", 360], ["all_leap", 366], ["noleap", 365]]) {
    const cal = modelCalendar({ name, units: "days since 1850-01-01" });
    assert.equal(modelValue(cal, { year: 1851, month: 1, day: 1 }), length);
    for (const date of [{ year: 1850, month: 2, day: 28 }, { year: 1999, month: 12, day: 30 }, { year: 2100, month: 7, day: 15, hour: 6 }]) {
      const parts = modelParts(cal, modelValue(cal, date));
      assert.deepEqual([parts.year, parts.month, parts.day, parts.hour], [date.year, date.month, date.day, date.hour ?? 0], `${name} ${JSON.stringify(date)}`);
    }
  }
  const cal = modelCalendar({ name: "360_day", units: "days since 1850-01-01" });
  assert.equal(formatModel(cal, modelValue(cal, { year: 2000, month: 2, day: 30 }), "%Y-%m-%d %b"), "2000-02-30 Feb");
  // Calendar functions on the device follow the column's calendar.
  const days = [modelValue(cal, { year: 1850, month: 1, day: 1 }), modelValue(cal, { year: 2000, month: 2, day: 30, hour: 18 }),
    modelValue(cal, { year: 2100, month: 12, day: 30 })];
  const scope = createDataScope();
  scope.update({ t: { __hmplotColumn: true, values: Float64Array.from(days), metadata: { type: "numeric", calendar: "360_day", calendarUnits: "days since 1850-01-01" } } });
  for (const [part, expected] of [["year", [1850, 2000, 2100]], ["month", [1, 2, 12]], ["day", [1, 30, 30]], ["day_of_year", [1, 60, 360]], ["hour", [0, 18, 0]]])
    assert.deepEqual((await evaluate(E[part]("t"), scope)).values, expected, part);
  const floored = await evaluate(E.time_floor("t", "1 month"), scope);
  assert.deepEqual(floored.values.map((v) => formatModel(cal, v, "%Y-%m-%d")), ["1850-01-01", "2000-02-01", "2100-12-01"]);
  assert.equal(floored.metadata.calendar, "360_day");
  assert.throws(() => E.evaluateExpression(E.weekday("t"), scope), /weekdays/);
  // Monthly bins are 30 days each; a Bin keeps the column's calendar.
  const modelDays = scopeOf({ t: { __hmplotColumn: true, values: Float64Array.from({ length: 90 }, (_, i) => 55000 + i),
    metadata: { type: "numeric", calendar: "360_day", calendarUnits: "days since 1850-01-01" } } });
  const monthly = await runTransform("Bin", modelDays, { x: "t", interval: "1 month" });
  const edges = Array.from(await monthly.get("x0").ref.data());
  assert.ok(edges.slice(1).every((edge, i) => edge - edges[i] === 30));
  assert.equal(monthly.metadata("x0").calendar, "360_day");
  monthly.dispose(); modelDays.dispose(); scope.dispose();
  assert.deepEqual(modelEdges(cal, 0, 45, { unit: "month", step: 1 }), [0, 30, 60]);
  // The axis: month ticks, labelled in the calendar, with the year below.
  const layout = axisLayout(axisOptions({ type: "datetime", timeOrigin: 0, calendar: { name: "360_day", units: "days since 1850-01-01" }, majorInterval: "1 month" },
    { xbounds: [modelValue(cal, { year: 1999, month: 11, day: 1 }), modelValue(cal, { year: 2000, month: 3, day: 15 })] }), "x", [0, 100], 800);
  assert.deepEqual(layout.major.map((t) => t.label), ["Nov", "Dec", "Jan", "Feb", "Mar"]);
  assert.deepEqual(layout.context.map((t) => t.label), ["1999", "2000"]);
  assert.deepEqual(modelTicks(cal, 0, 719, 3, "1 year"), [0, 360]);
  assert.throws(() => modelCalendar({ name: "julian", units: "days since 1850-01-01" }), /Unknown model calendar/);
});

test("datetime inputs: calendar steps and rates, labels as an axis writes them, and min() of a time is a Date", async () => {
  const lo = Date.UTC(2026, 0, 15), hi = Date.UTC(2026, 5, 20);
  // "1 month" lands on month starts between the bounds.
  assert.deepEqual(timeStops(lo, hi, "1 month", "UTC").map((t) => new Date(t).toISOString().slice(0, 10)),
    ["2026-02-01", "2026-03-01", "2026-04-01", "2026-05-01", "2026-06-01"]);
  // A Playback at "1 day" per second moves a day each second; with step "1 month" its value is the
  // last month start passed; it loops back to its low bound.
  let moved = playbackTimeStep(lo, 1000, { lo, hi, rate: "1 day", zone: "UTC" });
  assert.equal(moved.position - lo, 86400000);
  moved = playbackTimeStep(Date.UTC(2026, 2, 30), 3000, { lo, hi, rate: "1 day", step: "1 month", zone: "UTC" });
  assert.equal(new Date(moved.value).toISOString().slice(0, 10), "2026-04-01");
  moved = playbackTimeStep(hi - 86400000, 2000, { lo, hi, rate: "1 day", loop: true, zone: "UTC" });
  assert.equal(moved.position, lo + 86400000);
  assert.equal(playbackTimeStep(hi - 1000, 2000, { lo, hi, rate: 1000, zone: "UTC" }).stopped, true);
  // A month per second is a calendar month, however long.
  assert.equal(addTime(Date.UTC(2026, 1, 1), 0.5, { unit: "month", step: 1 }, "UTC"), Date.UTC(2026, 1, 15));
  // Labels by the step, else by the span; a Date in a list or a placeholder reads as a date.
  assert.equal(timeText(Date.UTC(2026, 2, 1), { step: "1 month" }), "Mar 2026");
  assert.equal(timeText(Date.UTC(2026, 2, 1, 9, 30), { span: 86400000, zone: "Europe/Paris" }), "Mar 1, 2026 10:30");
  assert.equal(displayValue(new Date(Date.UTC(2026, 2, 1))), "Mar 1, 2026");
  assert.equal(optionEntries([new Date(Date.UTC(2026, 2, 1))])[0].label, "Mar 1, 2026");
  assert.ok(sameOption(new Date(lo), new Date(lo)) && !sameOption(new Date(lo), new Date(hi)));
  // min() and max() of a datetime column are Dates in its zone.
  const scope = createDataScope();
  scope.update({ t: { __hmplotColumn: true, values: [new Date(hi), new Date(lo)], metadata: { type: "datetime", timezone: "Asia/Tokyo" } } });
  const first = await scopeValue(E.min("t"), scope, "Slider.min");
  assert.ok(first instanceof Date);
  assert.deepEqual([first.getTime(), first.timezone], [lo, "Asia/Tokyo"]);
  scope.dispose();
});

test("datetime input wall times preserve their zone and reject DST gaps and overlaps", async () => {
  const { dateTimeInputText, dateTimeInputValue } = await import("../../src/lib/plot/utils/timeInputs.js");
  const date = new Date("2024-06-01T16:30:00.123Z");
  assert.equal(dateTimeInputText(date, "America/New_York"), "2024-06-01T12:30:00.123");
  assert.equal(dateTimeInputValue("2024-06-01T12:30:00.123", "America/New_York").getTime(), date.getTime());
  assert.equal(dateTimeInputValue(""), null);
  assert.throws(() => dateTimeInputValue("2024-03-10T02:30", "America/New_York"), /DateTimeInput.*unambiguous/);
  assert.throws(() => dateTimeInputValue("2024-11-03T01:30", "America/New_York"), /DateTimeInput.*unambiguous/);
});
