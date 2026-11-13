import { numericColumn } from "../dataView.js";
import { acquireColumn } from "../columnReads.js";
import { deviceScalar } from "../deviceParams.js";
import { utcMonth, utcYear } from "d3";

const durations = { millisecond: 1, second: 1000, minute: 60000, hour: 3600000,
  day: 86400000, week: 604800000 };
const weekdays = new Set(["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]);

/** Signed coordinate offsets; calendar intervals use UTC, without rounding to boundaries. */
export function shiftInterval(interval) {
  if (typeof interval === "number" && Number.isFinite(interval)) return { offset: interval };
  const match = typeof interval === "string" && /^\s*([+-]?\d+)?\s*([a-z]+?)s?\s*$/i.exec(interval);
  if (!match) throw Error('Shift: interval must be a finite number or a signed interval such as "-1 year".');
  const step = match[1] === undefined ? 1 : Number(match[1]), unit = match[2].toLowerCase();
  if (!Number.isSafeInteger(step)) throw Error("Shift: calendar interval steps must be safe integers.");
  if (Object.hasOwn(durations, unit)) return { offset: step * durations[unit], temporal: true };
  if (weekdays.has(unit)) return { offset: step * durations.week, temporal: true };
  const months = { month: 1, quarter: 3, half: 6 }[unit];
  if (months) return { calendar: utcMonth, step: step * months, temporal: true };
  if (unit === "year") return { calendar: utcYear, step, temporal: true };
  throw Error(`Shift: unknown interval ${JSON.stringify(interval)}; use a number or a UTC calendar interval.`);
}

export const shift = {
  reads: "rows",
  output: "sameRows",
  renames: true,
  lineage: config => ({ [config.as?.original ?? "original"]: { kind: "expr", expression: config.field } }),
  validate(config) {
    if (typeof config.field !== "string" || !config.field) throw Error("Shift: pass field as a column name.");
    shiftInterval(config.interval);
    const names = [config.as?.shifted ?? "shifted", config.as?.original ?? "original"];
    if (names.some(name => typeof name !== "string" || !name) || names[0] === names[1])
      throw Error("Shift: as.shifted and as.original must be distinct nonempty column names.");
  },
  names(config, source) {
    return Object.fromEntries([config.as?.shifted ?? "shifted", config.as?.original ?? "original"]
      .map(name => [name, source.columnName?.(config.field) ?? config.field]));
  },
  async run(input, config, { own, boundary }) {
    const interval = shiftInterval(config.interval), field = config.field;
    const metadata = input.scope.metadata?.(field);
    if (interval.temporal && metadata?.type !== "datetime")
      throw Error(`Shift: ${field} must be a datetime column for a calendar interval; use a numeric interval for numeric data.`);
    const shifted = config.as?.shifted ?? "shifted", original = config.as?.original ?? "original";
    const values = own(numericColumn(input.scope, field));
    // The output keeps the column (as `original`) past this read.
    const read = acquireColumn(input.scope, field), source = read.value;
    own({ dispose: read.release });
    let output;
    if (interval.calendar) {
      // Calendar lengths vary by date. Read exact host offsets when available; derived device
      // columns need one readback. Keep the input's origin, logical type and row ordering.
      const host = Array.isArray(source) || ArrayBuffer.isView(source) ? source : await values.ref.data();
      await boundary();
      const origin = metadata.origin ?? 0;
      output = Float64Array.from(host, value => Number.isFinite(value)
        ? +interval.calendar.offset(new Date(value + origin), interval.step) - origin : NaN);
    } else {
      const amount = own(deviceScalar(interval.offset));
      output = own(values.ref.add(amount.ref));
    }
    return { columns: { [shifted]: output, [original]: source },
      columnMetadata: metadata ? { [shifted]: metadata, [original]: metadata } : {} };
  },
};
