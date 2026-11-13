import { Temporal } from "@js-temporal/polyfill";
import { utcFormat } from "d3";
import { LIMITS, limitError } from "./limits.js";
export function timezone(value = "UTC") {
  const zone =
    value === "Local"
      ? Intl.DateTimeFormat().resolvedOptions().timeZone
      : value;
  Temporal.Instant.fromEpochMilliseconds(0).toZonedDateTimeISO(zone);
  return zone;
}
export function datetimeCoordinates(values, { origin } = {}) {
  const dates = Array.from(values, (v) =>
    v instanceof Date ? v.getTime() : v,
  );
  if (!dates.length || !dates.every(Number.isFinite))
    throw Error(
      "Datetime coordinates require finite Date values or Unix milliseconds.",
    );
  origin ??= dates[0];
  if (!Number.isFinite(origin)) throw Error("Invalid time origin.");
  const offsets = new Float32Array(dates.map((t) => t - origin));
  if (!offsets.every(Number.isFinite))
    throw Error("Datetime span exceeds float32 coordinates.");
  return { values: offsets, origin };
}
const units = [
  "millisecond",
  "second",
  "minute",
  "hour",
  "day",
  "week",
  "month",
  "year",
];
export function timeInterval(value) {
  if (value == null || value === "") return undefined;
  if (typeof value === "string") {
    const match =
      /^(\d+)\s*(millisecond|second|minute|hour|day|week|month|year)s?$/.exec(
        value.trim(),
      );
    if (!match) throw Error("Use an interval such as 15 minutes or 1 month.");
    value = { step: +match[1], unit: match[2] };
  }
  if (
    !units.includes(value.unit) ||
    !Number.isSafeInteger(value.step) ||
    value.step < 1
  )
    throw Error("Invalid calendar interval.");
  return value;
}
const intervals = [
  ["millisecond", 1],
  ["millisecond", 10],
  ["millisecond", 100],
  ["second", 1],
  ["second", 5],
  ["second", 15],
  ["second", 30],
  ["minute", 1],
  ["minute", 5],
  ["minute", 15],
  ["minute", 30],
  ["hour", 1],
  ["hour", 3],
  ["hour", 6],
  ["hour", 12],
  ["day", 1],
  ["day", 2],
  ["week", 1],
  ["month", 1],
  ["month", 3],
  ["year", 1],
  ["year", 5],
  ["year", 10],
  ["year", 100],
];
const duration = {
  millisecond: 1,
  second: 1000,
  minute: 60000,
  hour: 3600000,
  day: 86400000,
  week: 604800000,
  month: 2629800000,
  year: 31557600000,
};
/** The automatic interval after `interval` ({unit, step}), the next coarser one, or null. */
export function coarserInterval({ unit, step }) {
  const at = intervals.findIndex(([u, s]) => u === unit && s === step);
  const next = at >= 0 ? intervals[at + 1] : intervals.find(([u, s]) => duration[u] * s > duration[unit] * step);
  return next ? { unit: next[0], step: next[1] } : null;
}
export function automaticInterval(span, count) {
  const desired = span / Math.max(1, count);
  const [unit, step] = intervals.reduce(
    (best, v) =>
      Math.abs(Math.log((duration[v[0]] * v[1]) / desired)) <
      Math.abs(Math.log((duration[best[0]] * best[1]) / desired))
        ? v
        : best,
    intervals[0],
  );
  return { unit, step };
}
/**
 * The boundary of `interval` ({unit, step}) at or before `ms` in `zone`, as a ZonedDateTime: a
 * multiple of `step` of its unit within the next larger one (hours of the day, months of the
 * year), days and weeks counted from 1970 (weeks from Sunday), years from year 0.
 */
function calendarFloor(ms, { unit, step }, zone) {
  let z = Temporal.Instant.fromEpochMilliseconds(Math.floor(ms)).toZonedDateTimeISO(timezone(zone));
  if (["millisecond", "second", "minute", "hour"].includes(unit)) {
    // Round in the local wall clock, retain its actual offset across repeated hours.
    const clear = {};
    for (const u of ["hour", "minute", "second", "millisecond", "microsecond", "nanosecond"]) {
      if (duration[u] < duration[unit] || u === "microsecond" || u === "nanosecond") clear[u] = 0;
    }
    clear[unit] = Math.floor(z[unit] / step) * step;
    return z.with(clear, { offset: "prefer" });
  }
  z = z.startOfDay();
  if (unit === "day" || unit === "week") {
    const anchor = Temporal.PlainDate.from(unit === "week" ? "1970-01-04" : "1970-01-01");
    const days = anchor.until(z.toPlainDate(), { largestUnit: "day" }).days,
      period = step * (unit === "week" ? 7 : 1);
    z = z.subtract({ days: ((days % period) + period) % period });
  }
  if (unit === "month") z = z.with({ day: 1, month: Math.floor((z.month - 1) / step) * step + 1 });
  if (unit === "year") z = z.with({ day: 1, month: 1, year: Math.floor(z.year / step) * step });
  return z;
}
export function calendarTicks(min, max, count, zone, explicit, pixels = 800) {
  const interval =
      timeInterval(explicit) ?? automaticInterval(max - min, count),
    { unit, step } = interval;
  if ((max - min) / (duration[unit] * step) > Math.max(2, pixels / 2))
    return []; // reject dense requests before allocating
  let z = calendarFloor(min, interval, zone);
  const result = [],
    limit = Math.ceil(pixels / 2) + 2;
  let last = -Infinity;
  for (let i = 0; i < limit; i++) {
    const t = z.epochMilliseconds;
    if (t > max) break;
    if (t >= min && t > last) result.push(t);
    last = t;
    z = z.add({ [unit + "s"]: step });
  }
  return result;
}
/**
 * Calendar bin edges (TODO 53.2) in epoch milliseconds: the boundaries of `interval` in `zone`
 * from the one at or before `min` to the first after `max`, so every bin is [edge, next edge)
 * and a time on a boundary starts its bin. At most `limit` bins.
 */
export function calendarEdges(min, max, interval, zone, limit = LIMITS.timeBins.value) {
  const { unit, step } = interval;
  if ((max - min) / (duration[unit] * step) > limit)
    throw limitError("timeBins", { what: `binning time by ${step} ${unit}${step === 1 ? "" : "s"}`, limit });
  let z = calendarFloor(min, interval, zone);
  const edges = [z.epochMilliseconds];
  while (edges.at(-1) <= max) {
    z = z.add({ [unit + "s"]: step });
    edges.push(z.epochMilliseconds);
  }
  return edges;
}
export function formatDatetime(
  ms,
  pattern = "",
  zone = "UTC",
  span = 86400000,
) {
  const z = Temporal.Instant.fromEpochMilliseconds(
    Math.round(ms),
  ).toZonedDateTimeISO(timezone(zone));
  // D3 supplies the complete calendar-format vocabulary. UTC-format a wall-clock
  // surrogate; instant/offset directives must use the actual instant, not surrogate.
  const date = new Date(0);
  date.setUTCFullYear(z.year, z.month - 1, z.day);
  date.setUTCHours(z.hour, z.minute, z.second, z.millisecond);
  const fmt =
    pattern ||
    (span < 1000
      ? "%H:%M:%S.%L"
      : span < 60000
        ? "%H:%M:%S"
        : span < 172800000
          ? "%H:%M"
          : span < 63072000000
            ? "%b %d"
            : "%Y");
  // Each % starts a directive, with an optional padding modifier (%-d is the unpadded day).
  if (/%(?![-_0]?[aAbBcdefgGHIjLmMpqQsSuUVwWxXyYZ%])/.test(fmt.replace(/%%/g, "")))
    throw Error("Unsupported datetime format directive.");
  return fmt.replace(/%(?:[-_0])?([A-Za-z%])/g, (token, code) =>
    code === "Z"
      ? z.offset.replace(":", "")
      : code === "Q"
        ? String(ms)
        : code === "s"
          ? String(Math.floor(ms / 1000))
          : utcFormat(token)(date),
  );
}
