// @ts-check
/** Plain scene-light specifications (TODO 137.6); no renderer dependency. */
const parameters = {
  ambient: ["color", "intensity"],
  directional: ["color", "intensity", "position"],
  hemisphere: ["color", "groundColor", "intensity", "position"],
  point: ["color", "intensity", "position", "distance", "decay"],
};
/** @param {unknown} value @returns {value is number} */
const finite = (value) => typeof value === "number" && Number.isFinite(value);

/** Create a light for Plot(lights=[...]). Positions are world coordinates.
 * @param {import("../publicTypes.js").LightSpec["kind"]} kind
 * @param {Omit<import("../publicTypes.js").LightSpec, "kind">} values
 * @returns {import("../publicTypes.js").LightSpec}
 */
export function light(kind, values = {}) {
  if (!Object.hasOwn(parameters, kind))
    throw Error(
      'Plot.lights: pass light("ambient" | "directional" | "hemisphere" | "point", {...}).',
    );
  if (!values || typeof values !== "object" || Array.isArray(values))
    throw Error(
      `Plot.lights: ${kind} parameters must be an object, such as { intensity: 1 }.`,
    );
  const allowed = parameters[kind];
  for (const [key, value] of Object.entries(values)) {
    if (!allowed.includes(key))
      throw Error(
        `Plot.lights: ${kind} does not take ${key}; pass ${allowed.join(", ")}.`,
      );
    if (value === undefined) continue;
    if (
      ["intensity", "distance", "decay"].includes(key) &&
      (!finite(value) || value < 0)
    )
      throw Error(
        `Plot.lights: ${kind}.${key} must be a finite number of at least zero.`,
      );
    if (
      ["color", "groundColor"].includes(key) &&
      (typeof value !== "string" ||
        !value ||
        (globalThis.CSS && !CSS.supports("color", value)))
    )
      throw Error(`Plot.lights: ${kind}.${key} must be a CSS color string.`);
    if (
      key === "position" &&
      (!Array.isArray(value) || value.length !== 3 || !value.every(finite))
    )
      throw Error(
        `Plot.lights: ${kind}.position must be three finite world coordinates [x, y, z].`,
      );
  }
  return {
    kind,
    ...Object.fromEntries(
      Object.entries(values).filter(([, value]) => value !== undefined),
    ),
  };
}

/** Validate authored or settings-pane values before mounting scene objects.
 * @param {unknown} value
 */
export function readLights(value) {
  if (value == null) return [];
  if (!Array.isArray(value))
    throw Error(
      'Plot.lights: pass a list such as [light("ambient", { intensity: 1 })].',
    );
  return value.map((spec) => {
    if (!spec || typeof spec !== "object" || Array.isArray(spec))
      throw Error(
        'Plot.lights: each entry must have a kind, such as { kind: "ambient", intensity: 1 }.',
      );
    const { kind, ...settings } = spec;
    return light(kind, settings);
  });
}
