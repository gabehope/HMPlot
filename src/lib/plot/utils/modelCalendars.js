import { numpy as np } from "@hmplot/jax";
import { utcFormat } from "d3";
import { timeInterval, automaticInterval } from "./datetime.js";
import { LIMITS, limitError } from "./limits.js";

/**
 * Model calendars (TODO 53.6): times in a climate model's calendar, kept as numbers of days (or
 * hours, minutes, seconds) since a reference date, as NetCDF files store them (Stage 48 keeps
 * 360_day and all_leap times so). 360_day has twelve months of 30 days; all_leap (366_day) every
 * year 366 days, with February's 29th; noleap (365_day) every year 365 days. Ticks, labels,
 * calendar functions and bins use their arithmetic instead of the Gregorian calendar's: a day
 * count from year 0 of the calendar, and each year's months from a fixed table.
 */
const MONTHS = {
  "360_day": Array(12).fill(30),
  all_leap: [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31],
  noleap: [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31],
};
const ALIASES = { "366_day": "all_leap", "365_day": "noleap" };
export const MODEL_CALENDARS = Object.freeze(["360_day", "all_leap", "366_day", "noleap", "365_day"]);
const UNIT_DAYS = { day: 1, hour: 1 / 24, minute: 1 / 1440, second: 1 / 86400 };

/** A model calendar's month lengths, cumulative starts and year length. */
function calendarOf(name) {
  const months = MONTHS[ALIASES[name] ?? name];
  if (!months) throw Error(`Unknown model calendar ${JSON.stringify(name)}; use one of ${MODEL_CALENDARS.join(", ")}.`);
  const starts = months.reduce((out, length) => [...out, out.at(-1) + length], [0]).slice(0, 12);
  return { name: ALIASES[name] ?? name, months, starts, year: months.reduce((a, b) => a + b, 0) };
}

/** "days since 1850-01-01" (or hours, minutes, seconds; a time of day may follow the date). */
export function parseUnits(units) {
  const match = /^\s*(day|hour|minute|second)s?\s+since\s+(-?\d{1,5})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}(?:\.\d+)?))?)?\s*$/i.exec(String(units ?? ""));
  if (!match) throw Error(`Model calendar units read like "days since 1850-01-01"; received ${JSON.stringify(units)}.`);
  const [, unit, y, m, d, hh = 0, mm = 0, ss = 0] = match;
  return { days: UNIT_DAYS[unit.toLowerCase()], reference: { year: +y, month: +m, day: +d, hour: +hh, minute: +mm, second: +ss } };
}

/** A model calendar's description as an axis or column holds it: { name, units }. */
export function modelCalendar(value) {
  if (!value) return null;
  const spec = typeof value === "string" ? { name: value, units: "days since 0001-01-01" } : value;
  const cal = calendarOf(spec.name), { days, reference } = parseUnits(spec.units);
  const ref = cal.year * reference.year + cal.starts[reference.month - 1] + reference.day - 1 +
    (reference.hour + reference.minute / 60 + reference.second / 3600) / 24;
  return { ...cal, units: spec.units, days, ref };
}

/** Day count from the calendar's year 0 of a value in the column's units. */
const absolute = (cal, value) => cal.ref + value * cal.days;
/** A value in the column's units of a day count from year 0. */
const valueOf = (cal, days) => (days - cal.ref) / cal.days;

/** A value's date and time: { year, month, day, hour, minute, second, dayOfYear }. */
export function modelParts(cal, value) {
  const days = absolute(cal, value), whole = Math.floor(days + 1e-9);
  const year = Math.floor(whole / cal.year), dayOfYear = whole - year * cal.year;
  let month = 0;
  while (month < 11 && cal.starts[month + 1] <= dayOfYear) month++;
  const seconds = Math.round((days - whole) * 86400);
  return { year, month: month + 1, day: dayOfYear - cal.starts[month] + 1, dayOfYear: dayOfYear + 1,
    hour: Math.floor(seconds / 3600), minute: Math.floor(seconds / 60) % 60, second: seconds % 60 };
}

/** The value of a date (and time) in the calendar. */
export function modelValue(cal, { year, month = 1, day = 1, hour = 0, minute = 0, second = 0 }) {
  const extra = Math.floor((month - 1) / 12);
  year += extra; month -= extra * 12;
  return valueOf(cal, year * cal.year + cal.starts[month - 1] + day - 1 + (hour + minute / 60 + second / 3600) / 24);
}

/** A value formatted with a d3-style pattern (%Y %m %d %e %b %B %j %H %M %S, and %-d etc.). */
export function formatModel(cal, value, pattern = "", span = 1) {
  const parts = modelParts(cal, value);
  const fmt = pattern || (span < 2 ? "%H:%M" : span < 730 ? "%b %d" : "%Y");
  // d3's names and padding, on a surrogate date that has this date's labels (a 30 February is
  // written by hand).
  const surrogate = new Date(0);
  surrogate.setUTCFullYear(parts.year, parts.month - 1, 1);
  surrogate.setUTCHours(parts.hour, parts.minute, parts.second);
  return fmt.replace(/%([-_0])?([A-Za-z%])/g, (token, pad, code) => {
    if (code === "d" || code === "e") return pad === "-" ? String(parts.day) : String(parts.day).padStart(2, code === "e" ? " " : "0");
    if (code === "j") return pad === "-" ? String(parts.dayOfYear) : String(parts.dayOfYear).padStart(3, "0");
    if (code === "Y") return String(parts.year).padStart(4, "0");
    if ("bBmHMSpIyL%".includes(code)) return utcFormat(token)(surrogate);
    throw Error(`Unsupported format directive %${code} for a model calendar.`);
  });
}

/**
 * Tick values (in the column's units) of `interval` (a calendar interval, else one for `count`
 * ticks over the span) between `min` and `max`, in the calendar: years and months at their
 * starts, days counted from year 0, hours and finer within the day.
 */
export function modelTicks(cal, min, max, count, explicit = "", limit = 1000) {
  const span = (max - min) * cal.days;
  const { unit, step } = timeInterval(explicit) ?? automaticInterval(span * 86400000, count);
  const out = [];
  const push = (value) => { if (value >= min - 1e-9 && value <= max + 1e-9) out.push(value); };
  const first = modelParts(cal, min);
  if (unit === "year" || unit === "month") {
    let y = unit === "year" ? Math.floor(first.year / step) * step : first.year;
    let m = unit === "year" ? 1 : Math.floor((first.month - 1) / step) * step + 1;
    for (let i = 0; i < limit; i++) {
      const value = modelValue(cal, { year: y, month: m });
      if (value > max + 1e-9) break;
      push(value);
      if (unit === "year") y += step;
      else { m += step; if (m > 12) { y += 1; m -= 12; } }
    }
    return out;
  }
  const size = { week: 7, day: 1, hour: 1 / 24, minute: 1 / 1440, second: 1 / 86400, millisecond: 1 / 86400000 }[unit] * step;
  const start = Math.ceil(absolute(cal, min) / size - 1e-9) * size;
  for (let i = 0, days = start; i < limit && valueOf(cal, days) <= max + 1e-9; i++, days = start + (i * size)) push(valueOf(cal, days));
  return out;
}

/** Calendar bin edges (in the column's units) from the boundary at or before `min` to the first after `max`. */
export function modelEdges(cal, min, max, interval, limit = LIMITS.timeBins.value) {
  const { unit, step } = interval;
  const first = modelParts(cal, min);
  const edges = [];
  if (unit === "year" || unit === "month") {
    let y = unit === "year" ? Math.floor(first.year / step) * step : first.year;
    let m = unit === "year" ? 1 : Math.floor((first.month - 1) / step) * step + 1;
    for (;;) {
      edges.push(modelValue(cal, { year: y, month: m }));
      if (edges.at(-1) > max || edges.length > limit) break;
      if (unit === "year") y += step; else { m += step; if (m > 12) { y += 1; m -= 12; } }
    }
  } else {
    const size = { week: 7, day: 1, hour: 1 / 24, minute: 1 / 1440, second: 1 / 86400, millisecond: 1 / 86400000 }[unit] * step;
    const start = Math.floor(absolute(cal, min) / size + 1e-9) * size;
    for (let i = 0; ; i++) {
      edges.push(valueOf(cal, start + i * size));
      if (edges.at(-1) > max || edges.length > limit) break;
    }
  }
  if (edges.length > limit) throw limitError("timeBins", { what: `binning time by ${step} ${unit}${step === 1 ? "" : "s"}`, limit });
  return edges;
}

/**
 * A calendar operator over a model-calendar column on the device (utils/calendar.js does
 * Gregorian times): `values` in the column's units. No time zones: a model's times are its own.
 */
/** @returns {import("./expressionPlanTypes.js").ResolvedOperand} */
export function modelCalendarValue(op, values, metadata, options, own, names) {
  const cal = modelCalendar({ name: metadata.calendar, units: metadata.calendarUnits });
  const f = (a) => own(np.floor(a.ref));
  const t = own(values.ref.astype(np.float32));
  const finite = own(np.isfinite(t.ref));
  // Days from the reference date's midnight, as precise as the column, and whole days from year
  // 0 by adding the reference's day count (integers, exact in float32) on the side.
  const refDay = Math.floor(cal.ref), refFraction = cal.ref - refDay;
  const rel = own(own(t.ref.mul(cal.days)).ref.add(refFraction));
  const relDay = f(own(rel.ref.add(1e-6)));
  const fraction = own(rel.ref.sub(relDay.ref));
  const whole = own(relDay.ref.add(refDay));
  const year = f(own(whole.ref.div(cal.year)));
  const doy = own(whole.ref.sub(own(year.ref.mul(cal.year)).ref));
  // The month: how many month starts are at or before the day of the year.
  let month = own(np.zeros(t.shape, { dtype: np.float32 }));
  for (const start of cal.starts.slice(1)) month = own(month.ref.add(own(doy.ref.greaterEqual(start).astype(np.float32)).ref));
  const starts = own(np.array(cal.starts));
  const monthStart = own(np.take(starts.ref, own(month.ref.astype(np.int32)).ref, 0));
  const seconds = own(np.round(own(fraction.ref.mul(86400)).ref));
  const done = (value) => ({ value: own(np.where(finite.ref, value.ref, NaN)), metadata: { type: "numeric" } });
  switch (op) {
    case "year": return done(year);
    case "month": return done(own(month.ref.add(1)));
    case "quarter": return done(own(f(own(month.ref.div(3))).ref.add(1)));
    case "day": return done(own(own(doy.ref.sub(monthStart.ref)).ref.add(1)));
    case "day_of_year": return done(own(doy.ref.add(1)));
    case "hour": return done(f(own(seconds.ref.div(3600))));
    case "minute": { const m = f(own(seconds.ref.div(60))); return done(own(m.ref.sub(own(f(own(m.ref.div(60))).ref.mul(60)).ref))); }
    case "second": return done(own(seconds.ref.sub(own(f(own(seconds.ref.div(60))).ref.mul(60)).ref)));
    case "month_name": return { value: own(np.where(finite.ref, month.ref, NaN)), categories: names.month_name, metadata: { type: "categorical", domain: names.month_name, ordered: true } };
    case "time_floor": {
      // The interval's start as whole days from year 0 (or, within a day, days from the
      // reference's midnight), back to the column's units.
      const { unit, step } = timeInterval(options.interval);
      let fromRef;
      if (unit === "year" || unit === "month") {
        let days;
        if (unit === "year") days = own(f(own(year.ref.div(step))).ref.mul(step * cal.year));
        else {
          const m0 = own(f(own(month.ref.div(step))).ref.mul(step));
          days = own(own(year.ref.mul(cal.year)).ref.add(own(np.take(starts.ref, own(m0.ref.astype(np.int32)).ref, 0)).ref));
        }
        fromRef = own(days.ref.sub(refDay));
      } else if (unit === "week" || unit === "day") {
        const size = (unit === "week" ? 7 : 1) * step;
        fromRef = own(own(f(own(whole.ref.div(size))).ref.mul(size)).ref.sub(refDay));
      } else {
        const size = { hour: 1 / 24, minute: 1 / 1440, second: 1 / 86400, millisecond: 1 / 86400000 }[unit] * step;
        fromRef = own(relDay.ref.add(own(f(own(own(fraction.ref.add(1e-9)).ref.div(size))).ref.mul(size)).ref));
      }
      const value = own(own(fromRef.ref.sub(refFraction)).ref.div(cal.days));
      return { value: own(np.where(finite.ref, value.ref, NaN)), metadata: { ...metadata } };
    }
  }
  throw Error(`${op}() needs a date in a Gregorian calendar; a ${cal.name} calendar has no ${op === "week" ? "ISO weeks" : "weekdays"}.`);
}
