/** Validate and normalize the values shared by the new input controls and their store. */
export const VALUE_INPUTS = new Set(["TextInput", "ColorPicker", "DateTimeInput"]);
export function inputValue(kind, props = {}) {
  const fail = (message) => { throw Error(`${kind}: ${message}`); };
  const value = props.value;
  if (kind === "Slider" && Array.isArray(value)) {
    const { min = 0, max = 1, step } = props;
    const time = min instanceof Date && max instanceof Date;
    const numeric = (v) => time && v instanceof Date ? v.getTime() : typeof v === "number" && !time ? v : NaN;
    if (!Number.isFinite(numeric(min)) || !Number.isFinite(numeric(max)) || min > max)
      fail("pass finite min and max with min <= max.");
    if (step !== undefined && (!time || typeof step === "number") && (!Number.isFinite(step) || step <= 0)) fail("pass a positive step.");
    if (value.length !== 2 || !value.every(v => Number.isFinite(numeric(v))))
      fail("pass value as two finite numbers or Dates matching the bounds, [lower, upper].");
    return value.map(v => v < min ? min : v > max ? max : v).sort((a, b) => numeric(a) - numeric(b));
  }
  if (kind === "TextInput") {
    if (value != null && typeof value !== "string") fail("pass a string value.");
    return value ?? "";
  }
  if (kind === "ColorPicker") {
    if (value != null && (typeof value !== "string" || !/^#[0-9a-f]{6}$/i.test(value)))
      fail("pass a six-digit hexadecimal color, such as #4f7dff.");
    return (value ?? "#000000").toLowerCase();
  }
  if (kind === "DateTimeInput") {
    for (const key of ["min", "max", "value"])
      if (props[key] != null && (!(props[key] instanceof Date) || !Number.isFinite(props[key].getTime())))
        fail(`pass ${key} as a valid Date, or omit it.`);
    if (props.min && props.max && props.min > props.max) fail("pass min before or equal to max.");
    if (props.step !== undefined && (!Number.isFinite(props.step) || props.step <= 0)) fail("pass a positive step in milliseconds.");
    if (value == null) return null;
    return props.min && value < props.min ? props.min : props.max && value > props.max ? props.max : value;
  }
  return value;
}
