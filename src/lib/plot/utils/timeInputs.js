import { Temporal } from "@js-temporal/polyfill";
import { timeInterval, timezone, formatDatetime, calendarTicks } from "./datetime.js";

/**
 * Datetime inputs (TODO 53.3): a Slider, Playback or Select over dates holds Dates, shows them
 * as an axis would, and steps in calendar terms. A Date from the data (min("t"), max("t")) carries
 * its column's time zone as `timezone` (utils/inputs.js scopeValue); steps and labels are in it.
 */
export const isTime = (value) => value instanceof Date;
export const timeMs = (value) => (value instanceof Date ? value.getTime() : Number(value));

/** A Date in `zone` (kept on it for later steps and labels). */
export function zonedDate(ms, zone) {
  const date = new Date(ms);
  if (zone) Object.defineProperty(date, "timezone", { value: zone, enumerable: false });
  return date;
}

/** An input's zone: its own prop, else its bounds' (from a column), else UTC. */
export const inputZone = (explicit, ...bounds) => explicit ?? bounds.find((b) => b?.timezone)?.timezone ?? "UTC";

/** A step or rate in calendar terms: "1 month", {step, unit}; a number is milliseconds. */
export const calendarStep = (value) => (typeof value === "string" || (value && typeof value === "object") ? timeInterval(value) : null);

/**
 * The times a calendar step lands on between `lo` and `hi` (epoch ms): the interval's starts in
 * `zone` (month starts for "1 month"), or `lo` alone when none falls between them.
 */
export function timeStops(lo, hi, step, zone) {
  const interval = calendarStep(step);
  const stops = calendarTicks(lo, hi, 2, zone, interval, 2 * 100000);
  return stops.length ? stops : [lo];
}

/** The pattern a time shows in: by its calendar step, else by the span it moves over. */
export function timePattern(step, span) {
  const unit = calendarStep(step)?.unit;
  if (unit === "year") return "%Y";
  if (unit === "month") return "%b %Y";
  if (unit === "week" || unit === "day") return "%b %-d, %Y";
  if (unit === "hour" || unit === "minute") return "%b %-d, %Y %H:%M";
  if (unit === "second" || unit === "millisecond") return "%b %-d, %Y %H:%M:%S";
  return span > 2 * 86400000 ? "%b %-d, %Y" : "%b %-d, %Y %H:%M";
}

/**
 * A Date (or epoch ms) as text: with `format` (a %-pattern or a function), else by `step`/`span`.
 * @param {Date | number} value
 * @param {Partial<{ format: any, step: any, span: number, zone: string }>} [options]
 */
export function timeText(value, { format = undefined, step = undefined, span = 0, zone = "UTC" } = {}) {
  if (typeof format === "function") return format(value);
  return formatDatetime(timeMs(value), format || timePattern(step, span), zone);
}

/** `ms` moved by `amount` (fractional) of a calendar unit in `zone`. */
export function addTime(ms, amount, { unit, step }, zone) {
  const units = amount * step;
  if (!["month", "year"].includes(unit))
    return ms + units * { millisecond: 1, second: 1000, minute: 60000, hour: 3600000, day: 86400000, week: 604800000 }[unit];
  const z = Temporal.Instant.fromEpochMilliseconds(Math.round(ms)).toZonedDateTimeISO(timezone(zone));
  const whole = Math.floor(units), a = z.add({ [unit + "s"]: whole }), b = a.add({ [unit + "s"]: 1 });
  return a.epochMilliseconds + (units - whole) * (b.epochMilliseconds - a.epochMilliseconds);
}

/**
 * A playing Playback over times moved by `dt` milliseconds of its clock (TODO 41.4, 50, 53.3):
 * `rate` is a calendar interval per second ("1 day") or milliseconds per second; `step` a
 * calendar interval the value lands on (its starts in `zone`) or milliseconds from `lo`. At `hi`
 * it stops, or wraps to `lo` with `loop`. Times are epoch ms.
 */
export function playbackTimeStep(position, dt, { lo, hi, rate, step, loop, zone = "UTC" }) {
  const interval = calendarStep(rate);
  let next = interval ? addTime(position, dt / 1000, interval, zone) : position + (Number(rate) * dt) / 1000, stopped = false;
  if (next >= hi) {
    if (loop && hi > lo) next = lo + ((next - lo) % (hi - lo));
    else {
      next = hi;
      stopped = true;
    }
  }
  let value = next;
  if (calendarStep(step)) {
    const stops = timeStops(lo, hi, step, zone), passed = stops.filter((stop) => stop <= next + 1e-6);
    value = passed.length ? passed.at(-1) : stops[0];
  } else if (step) value = Math.min(hi, lo + Math.floor((next - lo) / Number(step) + 1e-9) * Number(step));
  return { position: next, value, stopped };
}

/** Native datetime-local text in the input's zone, independent of the browser's zone. */
export function dateTimeInputText(value, zone = "UTC") {
  if (value == null) return "";
  return Temporal.Instant.fromEpochMilliseconds(value.getTime()).toZonedDateTimeISO(timezone(zone))
    .toPlainDateTime().toString({ smallestUnit: "millisecond" });
}
/** Reject nonexistent or ambiguous wall times rather than silently moving the chosen instant. */
export function dateTimeInputValue(text, zone = "UTC") {
  if (!text) return null;
  try {
    const instant = Temporal.PlainDateTime.from(text).toZonedDateTime(timezone(zone), { disambiguation: "reject" });
    return zonedDate(instant.epochMilliseconds, zone);
  } catch {
    throw Error(`DateTimeInput: enter a valid, unambiguous date and time in ${zone}.`);
  }
}
