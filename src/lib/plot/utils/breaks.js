import { numpy as np } from "@hmplot/jax";
import { Temporal } from "@js-temporal/polyfill";
import { timezone } from "./datetime.js";
import { offsetTable } from "./calendar.js";
import { deviceArray } from "./deviceParams.js";
import { lowerBound } from "./numeric/search.js";
import { LIMITS, limitError } from "./limits.js";

/**
 * Range breaks on a datetime axis (TODO 53.5): intervals the axis leaves out, as Plotly's
 * rangebreaks do. Rules, alone or in a list:
 *   "weekends"                      Saturday 00:00 to Monday 00:00
 *   { hours: [16, 9.5] }            every day from 16:00 to 09:30 (the next day when it wraps)
 *   { dates: ["2026-12-25", ...] }  whole days (holidays)
 *   { from, to }                    one interval (Dates, ISO strings with an offset, or epoch ms)
 * The patterns and dates are in the axis's time zone; patterns expand over 20 years either side
 * of the axis's origin. Positions on the axis are times less the time the breaks before them
 * remove, so marks, ticks and lines map through them and a line joins its points across one.
 * Positions count from the axis's origin, which stays at 0. The mapping happens where a
 * datetime column meets its axis (utils/namedData.js), on the device;
 * the axis inverts it on the host for brushing, the pointer and the visible domain.
 */
const DAY = 86400000;
const WINDOW = 20 * 365.2425 * DAY;
const LIMIT = LIMITS.axisBreaks.value;
const tables = new Map();

const instant = (value, what) => {
  const ms = value instanceof Date ? value.getTime() : typeof value === "number" ? value
    : typeof value === "string" ? Temporal.Instant.from(value).epochMilliseconds : NaN;
  if (!Number.isFinite(ms)) throw Error(`A break's ${what} is a Date, an ISO time with an offset, or epoch milliseconds.`);
  return ms;
};

/** The rules as a list of normalized rules; throws on a malformed one. */
export function breakRules(breaks) {
  if (breaks === undefined || breaks === null || breaks === false) return [];
  const list = Array.isArray(breaks) ? breaks : [breaks];
  return list.map((rule) => {
    if (rule === "weekends") return { kind: "weekends" };
    if (rule && typeof rule === "object") {
      if (Array.isArray(rule.hours)) {
        const [from, to] = rule.hours;
        if (!(from >= 0 && from < 24 && to >= 0 && to <= 24 && from !== to))
          throw Error("A break's hours are [from, to], hours of the day from 0 to 24, such as [16, 9.5].");
        return { kind: "hours", from, to };
      }
      if (Array.isArray(rule.dates)) {
        const dates = rule.dates.map((date) => {
          if (date instanceof Date) return date.toISOString().slice(0, 10);
          if (typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date)) return date;
          throw Error('A break\'s dates are Dates or "YYYY-MM-DD" strings.');
        });
        return { kind: "dates", dates };
      }
      if ("from" in rule || "to" in rule) {
        const from = instant(rule.from, "from"), to = instant(rule.to, "to");
        if (!(to > from)) throw Error("A break's to is after its from.");
        return { kind: "range", from, to };
      }
    }
    throw Error('A break is "weekends", { hours: [from, to] }, { dates: [...] } or { from, to }.');
  });
}

/**
 * The UTC instant of local wall time `local` (epoch milliseconds as if the zone were UTC), with
 * the zone's offsets from `table` (relative to `origin`): the offset that holds there.
 */
function utcOf(local, table, origin) {
  const offsetAt = (utc) => {
    if (table.constant !== undefined) return table.constant;
    const t = utc - origin;
    let lo = 0, hi = table.starts.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (table.starts[mid] < t) lo = mid + 1; else hi = mid; }
    return table.offsets[lo];
  };
  let utc = local - offsetAt(local);
  utc = local - offsetAt(utc);
  return local - offsetAt(utc);
}

/**
 * The intervals `rules` remove, in epoch milliseconds, sorted and merged, over `origin`'s
 * window: { starts, ends, removed } relative to `origin`, where removed[i] is the time removed
 * before break i. Cached per rules, zone and origin.
 */
export function breakTable(breaks, zone, origin) {
  const rules = breakRules(breaks);
  if (!rules.length) return null;
  const key = JSON.stringify([rules, zone, origin]);
  let table = tables.get(key);
  if (table) return table;
  const name = timezone(zone), offsets = offsetTable(name, origin);
  const start = origin - WINDOW, end = origin + WINDOW, intervals = [];
  const firstDay = Math.floor((start + (offsets.constant ?? offsets.offsets[0])) / DAY) - 1, lastDay = Math.ceil(end / DAY) + 1;
  const add = (from, to) => {
    intervals.push([from, to]);
    if (intervals.length > LIMIT) throw limitError("axisBreaks");
  };
  for (const rule of rules) {
    if (rule.kind === "range") add(rule.from, rule.to);
    else if (rule.kind === "dates")
      for (const date of rule.dates) {
        const [y, m, d] = date.split("-").map(Number), day = Date.UTC(y, m - 1, d);
        add(utcOf(day, offsets, origin), utcOf(day + DAY, offsets, origin));
      }
    else if (rule.kind === "weekends") {
      // Saturdays: day 2 of the epoch (1970-01-03) was one.
      for (let day = firstDay + ((((2 - firstDay) % 7) + 7) % 7); day <= lastDay; day += 7)
        add(utcOf(day * DAY, offsets, origin), utcOf((day + 2) * DAY, offsets, origin));
    } else if (rule.kind === "hours") {
      const wraps = rule.to < rule.from;
      for (let day = firstDay; day <= lastDay; day++)
        add(utcOf(day * DAY + rule.from * 3600000, offsets, origin), utcOf((day + (wraps ? 1 : 0)) * DAY + rule.to * 3600000, offsets, origin));
    }
  }
  intervals.sort((a, b) => a[0] - b[0]);
  const starts = [], ends = [], removed = [];
  let total = 0;
  for (const [from, to] of intervals) {
    if (!(to > from)) continue;
    if (ends.length && from <= ends.at(-1) + origin) {
      const last = ends.length - 1;
      if (to - origin > ends[last]) { total += to - origin - ends[last]; ends[last] = to - origin; }
      continue;
    }
    starts.push(from - origin); ends.push(to - origin); removed.push(total);
    total += to - from;
  }
  // Positions count the time removed from the origin on (the origin is at 0, so positions stay
  // as precise as the times near it); each break collapses to one position.
  table = { starts, ends, removed };
  const atOrigin = -breakPosition(table, 0);
  table.removed = removed.map((r) => r - atOrigin);
  table.positions = starts.map((s, i) => s - table.removed[i]);
  if (tables.size > 32) tables.delete(tables.keys().next().value);
  tables.set(key, table);
  return table;
}

const search = (sorted, value) => {
  let lo = 0, hi = sorted.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (sorted[mid] < value) lo = mid + 1; else hi = mid; }
  return lo;
};

/** A time (from the axis's origin) as a position on the axis. */
export function breakPosition(table, time) {
  if (!table || !Number.isFinite(time)) return time;
  const i = search(table.starts, time) - 1;
  if (i < 0) return time;
  return time - table.removed[i] - Math.min(time - table.starts[i], table.ends[i] - table.starts[i]);
}

/** A position on the axis as a time (from the origin): a break's position is its end. */
export function breakTime(table, position) {
  if (!table || !Number.isFinite(position)) return position;
  const i = search(table.positions, position + 0.5) - 1;
  if (i < 0) return position;
  return position + table.removed[i] + (table.ends[i] - table.starts[i]);
}

/** Whether a time (from the origin) falls inside a break (its start included, its end not). */
export function inBreak(table, time) {
  if (!table) return false;
  const i = search(table.starts, time + 0.5) - 1;
  return i >= 0 && time < table.ends[i];
}

/** breakPosition over a device array (float32 times from the origin). Consumes `times`. */
export function breakPositions(table, times) {
  if (!table) return times;
  const starts = deviceArray(table.starts), lengths = deviceArray(table.ends.map((e, i) => e - table.starts[i]));
  const removed = deviceArray(table.removed);
  const t = times.astype(np.float32);
  const count = lowerBound(starts, t);
  const has = count.ref.greater(0), index = np.maximum(count.sub(1), 0).astype(np.int32);
  const start = np.take(starts, index.ref, 0), length = np.take(lengths, index.ref, 0), before = np.take(removed, index, 0);
  const cut = np.where(has, before.add(np.minimum(t.ref.sub(start), length)), 0);
  return t.sub(cut);
}
