import { numpy as np } from "@hmplot/jax";
import { Temporal } from "@js-temporal/polyfill";
import { timezone, timeInterval } from "./datetime.js";
import { deviceArray, deviceScalar } from "./deviceParams.js";
import { lowerBound } from "./numeric/search.js";

/**
 * Calendar functions on the device (TODO 53.1). A datetime column is float32 milliseconds from
 * its origin (epoch milliseconds, kept on the host). A row's local time is its time plus its
 * zone's UTC offset then; the offset comes from a table of the zone's offset changes within 100
 * years of the origin, built once on the host with Temporal and looked up per row by a binary
 * search, so a time zone costs one table and no host work per row. Days since the epoch are the
 * origin's day (host, exact) plus the row's days from it; civil dates follow from those by
 * integer arithmetic (Howard Hinnant's days_from_civil and civil_from_days), exact in float32
 * for the dates of the next hundred thousand years. The parts are as exact as the column's own
 * float32 times: a column spanning ten years steps by about 8 s at its far end. So a time is
 * split into its day and its time of day by exact products (a day is 329 * 2^18 + 151 * 2^10
 * ms, and both products of a day count below 50,000 are exact in float32), and a time of day
 * within its float32 precision of a boundary (a day, an hour, a minute, a second, or
 * time_floor's interval; the coarsest that is near) is taken to be on it: a date stored at
 * midnight stays at midnight however far from the origin, and whole minutes stay whole. Other
 * times keep their stored value.
 */
const BOUNDARIES = [86400000, 3600000, 60000, 1000];
export const CALENDAR_PARTS = Object.freeze(["year", "quarter", "month", "week", "day", "weekday", "day_of_year", "hour", "minute", "second"]);
export const CALENDAR_NAMES = Object.freeze({
  month_name: Object.freeze(["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]),
  day_name: Object.freeze(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]),
});
export const CALENDAR_OPS = Object.freeze([...CALENDAR_PARTS, ...Object.keys(CALENDAR_NAMES), "time_floor"]);

const DAY = 86400000;
const YEARS = 100 * 365.2425 * DAY;
const tables = new Map();

/**
 * `zone`'s UTC offsets around `origin`: { constant } for a zone without changes there (UTC, a
 * fixed offset), else { starts, offsets }: the changes' instants from the origin (half a
 * millisecond early, so a change applies from its own instant) and the offset before each change
 * and after the last (offsets has one more entry).
 */
export function offsetTable(zone, origin) {
  const key = `${zone}|${origin}`;
  let table = tables.get(key);
  if (table) return table;
  const name = timezone(zone), start = origin - YEARS, end = origin + YEARS;
  let z = Temporal.Instant.fromEpochMilliseconds(Math.round(start)).toZonedDateTimeISO(name);
  const starts = [], offsets = [z.offsetNanoseconds / 1e6];
  for (let next = z.getTimeZoneTransition("next"); next && next.epochMilliseconds <= end; next = next.getTimeZoneTransition("next")) {
    starts.push(next.epochMilliseconds - origin - 0.5);
    offsets.push(next.offsetNanoseconds / 1e6);
  }
  table = starts.length ? { starts, offsets } : { constant: offsets[0] };
  if (tables.size > 64) tables.delete(tables.keys().next().value);
  tables.set(key, table);
  return table;
}

/**
 * The calendar arithmetic over jax arrays. `own` registers every array made (the caller frees
 * them); arguments are borrowed.
 */
function arithmetic(own) {
  const floor = (a) => own(np.floor(a.ref));
  // k * DAY for integer k with |k| < 50,000 as two exact products (329 * 2^18 and 151 * 2^10),
  // so t - k * DAY subtracts them one at a time: the first difference is exact (the operands are
  // within a factor of two), and the second is small.
  const dayParts = (k) => [own(own(k.ref.mul(329)).ref.mul(2 ** 18)), own(own(k.ref.mul(151)).ref.mul(2 ** 10))];
  const minusDays = (t, k) => { const [high, low] = dayParts(k); return own(own(t.ref.sub(high.ref)).ref.sub(low.ref)); };
  /** k * DAY plus a small `rest`: one rounding, at the end. */
  const plusDays = (k, rest) => { const [high, low] = dayParts(k); return own(high.ref.add(own(low.ref.add(typeof rest === "number" ? rest : rest.ref)).ref)); };
  const div = (a, k) => floor(own(a.ref.div(k)));
  const add = (a, b) => own(a.ref.add(typeof b === "number" ? b : b.ref));
  const sub = (a, b) => own(a.ref.sub(typeof b === "number" ? b : b.ref));
  const mul = (a, k) => own(a.ref.mul(typeof k === "number" ? k : k.ref));
  const mod = (a, k) => sub(a, mul(div(a, k), k));
  const where = (c, a, b) => own(np.where(c.ref, typeof a === "number" ? a : a.ref, typeof b === "number" ? b : b.ref));
  /** Days since 1970-01-01 of a proleptic Gregorian date (days_from_civil). */
  const daysFromCivil = (year, month, day) => {
    const early = own(month.ref.lessEqual(2));
    const y = where(early, sub(year, 1), year);
    const era = div(y, 400), yoe = sub(y, mul(era, 400));
    const shifted = where(early, add(month, 9), sub(month, 3));
    const doy = add(div(add(mul(shifted, 153), 2), 5), sub(day, 1));
    const doe = add(sub(add(mul(yoe, 365), div(yoe, 4)), div(yoe, 100)), doy);
    return sub(add(mul(era, 146097), doe), 719468);
  };
  /** The date of a day since 1970-01-01 (civil_from_days): { year, month, day }. */
  const civil = (days) => {
    const z = add(days, 719468), era = div(z, 146097), doe = sub(z, mul(era, 146097));
    const yoe = div(add(sub(sub(doe, div(doe, 1460)), div(doe, 146096)), div(doe, 36524)), 365);
    const doy = sub(doe, add(sub(mul(yoe, 365), div(yoe, 100)), div(yoe, 4)));
    const mp = div(add(mul(doy, 5), 2), 153);
    const day = add(sub(doy, div(add(mul(mp, 153), 2), 5)), 1);
    const month = where(own(mp.ref.less(10)), add(mp, 3), sub(mp, 9));
    const year = add(add(yoe, mul(era, 400)), where(own(month.ref.lessEqual(2)), 1, 0));
    return { year, month, day };
  };
  return { floor, div, mod, add, sub, mul, where, civil, daysFromCivil, minusDays, plusDays };
}

/** A calendar operator's options: { tz } and, for time_floor, { interval }. */
export function calendarOptions(op, options = {}) {
  if (options === null || typeof options !== "object") throw TypeError(`${op}() options are an object such as { tz: "Europe/Paris" }.`);
  const { tz, interval } = options;
  if (tz !== undefined) timezone(tz);
  if (op === "time_floor") {
    if (interval === undefined) throw TypeError('time_floor() needs an interval, such as time_floor("t", "1 month").');
    timeInterval(interval);
  }
  return Object.freeze({ __expressionLiteral: true, ...(tz !== undefined ? { tz } : {}), ...(interval !== undefined ? { interval } : {}) });
}

/**
 * A calendar operator over resolved `values` (float32 milliseconds from `metadata.origin`) with
 * its `options`. Returns { value, metadata, categories? } as evaluateExpression's nodes do.
 */
/** @returns {import("./expressionPlanTypes.js").ResolvedOperand} */
export function calendarValue(op, values, metadata, options, own) {
  const origin = metadata.origin, zone = options.tz ?? metadata.timezone ?? "UTC";
  const A = arithmetic(own);
  const t = own(values.ref.astype(np.float32));
  // The row's offset from UTC, in milliseconds.
  const table = offsetTable(zone, origin);
  const offsetAt = (instants) => {
    if (table.constant !== undefined) return own(deviceScalar(table.constant));
    const starts = own(deviceArray(table.starts)), offsets = own(deviceArray(table.offsets));
    const index = own(lowerBound(starts, instants).astype(np.int32));
    return own(np.take(offsets.ref, index.ref, 0));
  };
  // Local time as days since the epoch and milliseconds into the day. The origin's day is split
  // off on the host; the row's whole days from the origin by exact products, so its time of day
  // is exact but for its stored time's float32 step (|t| / 2^23), which the grid then covers.
  const originDay = Math.floor(origin / DAY), originRest = origin - originDay * DAY;
  const whole = A.div(t, DAY), rest = A.minusDays(t, whole);
  let local = A.add(A.add(rest, offsetAt(t)), originRest);
  // Precision: half the stored time's float32 step, and a time of day's own rounding (about 8 ms).
  const tolerance = A.add(A.mul(own(np.abs(t.ref)), 2 ** -24 * 1.01), 16);
  let snapped = own(np.zeros(local.shape, { dtype: np.bool }));
  const size = op === "time_floor" && ["hour", "minute", "second"].includes(timeInterval(options.interval).unit)
    ? { hour: 3600000, minute: 60000, second: 1000 }[timeInterval(options.interval).unit] * timeInterval(options.interval).step : null;
  for (const boundary of [...BOUNDARIES, ...(size ? [size] : [])].sort((a, b) => b - a)) {
    const nearest = A.mul(own(np.round(own(local.ref.div(boundary)).ref)), boundary);
    const near = own(np.logicalAnd(own(np.logicalNot(snapped.ref)).ref, own(own(np.abs(A.sub(local, nearest).ref)).ref.lessEqual(tolerance.ref)).ref));
    local = A.where(near, nearest, local);
    snapped = own(np.logicalOr(snapped.ref, near.ref));
  }
  const rounded = local;
  const carry = A.div(rounded, DAY);
  const days = A.add(A.add(whole, carry), originDay), msOfDay = A.sub(rounded, A.mul(carry, DAY));
  const date = () => A.civil(days);
  const weekday = () => A.mod(A.add(days, 3), 7);
  const finite = own(np.isfinite(t.ref));
  const numeric = (value) => ({ value: A.where(finite, value, NaN), metadata: { type: "numeric" } });
  if (CALENDAR_NAMES[op]) {
    const code = op === "month_name" ? A.sub(date().month, 1) : weekday();
    const categories = CALENDAR_NAMES[op];
    return { value: A.where(finite, code, NaN), categories, metadata: { type: "categorical", domain: categories, ordered: true } };
  }
  switch (op) {
    case "year": return numeric(date().year);
    case "quarter": return numeric(A.add(A.div(A.sub(date().month, 1), 3), 1));
    case "month": return numeric(date().month);
    case "day": return numeric(date().day);
    case "weekday": return numeric(weekday());
    case "day_of_year": {
      const { year } = date(), one = own(np.onesLike(year.ref));
      return numeric(A.add(A.sub(days, A.daysFromCivil(year, one, one)), 1));
    }
    case "week": {
      // ISO: the week of the year its Thursday is in, weeks starting on Monday.
      const thursday = A.add(A.sub(days, weekday()), 3), { year } = A.civil(thursday), one = own(np.onesLike(year.ref));
      return numeric(A.add(A.div(A.sub(thursday, A.daysFromCivil(year, one, one)), 7), 1));
    }
    case "hour": return numeric(A.div(msOfDay, 3600000));
    case "minute": return numeric(A.mod(A.div(msOfDay, 60000), 60));
    case "second": return numeric(A.mod(A.div(msOfDay, 1000), 60));
    case "time_floor": {
      const { unit, step } = timeInterval(options.interval);
      let day = days, ms = null;
      if (unit === "day") day = A.sub(days, A.mod(days, step));
      else if (unit === "week") {
        // Weeks start on Monday (ISO, as week() counts them), counted from 1970-01-05.
        const monday = A.sub(days, weekday());
        day = A.sub(monday, A.mul(A.mod(A.div(A.sub(monday, 4), 7), step), 7));
      } else if (unit === "month" || unit === "year") {
        const { year, month } = date(), one = own(np.onesLike(year.ref));
        day = unit === "month"
          ? A.daysFromCivil(year, A.add(A.mul(A.div(A.sub(month, 1), step), step), 1), one)
          : A.daysFromCivil(A.mul(A.div(year, step), step), one, one);
      } else {
        // Within the day, a multiple of `step` of the unit within the next larger one.
        const size = { hour: 3600000, minute: 60000, second: 1000, millisecond: 1 }[unit];
        const parent = { hour: DAY, minute: 3600000, second: 60000, millisecond: 1000 }[unit];
        const within = A.mod(msOfDay, parent);
        ms = A.sub(msOfDay, A.sub(within, A.mul(A.div(within, size * step), size * step)));
      }
      // The floored local time, from the origin, back to UTC: with the time's own offset where
      // that offset holds at the result (within its float32 step: an hour repeated at a change
      // keeps the side the time is on, as Temporal's "prefer"), else the offset there (a day's
      // start before a change has the earlier one).
      const localFromOrigin = A.plusDays(A.sub(day, originDay), ms === null ? -originRest : A.sub(ms, originRest));
      const own1 = offsetAt(t), guess = A.sub(localFromOrigin, own1);
      const slack = A.add(A.mul(own(np.abs(guess.ref)), 2 ** -22), 1);
      const before = offsetAt(A.sub(guess, slack)), after = offsetAt(A.add(guess, slack));
      const holds = own(np.logicalOr(own(before.ref.equal(own1.ref)).ref, own(after.ref.equal(own1.ref)).ref));
      const utc = A.sub(localFromOrigin, A.where(holds, own1, before));
      return { value: A.where(finite, utc, NaN), metadata: { type: "datetime", origin, timezone: metadata.timezone ?? "UTC", unit: "ms", gpuUnit: "ms" } };
    }
  }
  throw Error(`Unknown calendar operation: ${op}.`);
}
