import { columnTitle } from "../utils/axisTitleRules.js";
import { normalizeSchemaEntry } from "../utils/columns.js";

/** The declared columns' types and labels use ordinary table metadata. A declaration may
 * describe only some outputs, but every name it describes must actually be published.
 */
export function outputMetadata(kind, outputs, params, columns, sourceScope) {
  if (!outputs) return {};
  const declarations = outputs(params);
  if (!Array.isArray(declarations))
    throw Error(
      `${kind}: outputs(params) must return a list of { name, type, unit, label }.`,
    );
  const metadata = Object.create(null);
  for (const entry of declarations) {
    const { name, type, unit, source } = entry ?? {};
    let label = entry?.label;
    if (source !== undefined) {
      if (typeof source !== "string" || !sourceScope?.has(source))
        throw Error(
          `${kind}: output "${name}" source must name an input column.`,
        );
      label ??= columnTitle(sourceScope, source) ?? undefined;
    }
    if (typeof name !== "string" || !name || Object.hasOwn(metadata, name))
      throw Error(`${kind}: output names must be nonempty and unique.`);
    if (!Object.hasOwn(columns, name))
      throw Error(
        `${kind}: declared output "${name}" was not returned; publish its column or remove its declaration.`,
      );
    for (const [key, value] of Object.entries({ unit, label }))
      if (value !== undefined && typeof value !== "string")
        throw Error(`${kind}: output "${name}" ${key} must be a string.`);
    try {
      metadata[name] = normalizeSchemaEntry({
        type,
        ...(unit === undefined ? {} : { unit }),
        ...(label === undefined ? {} : { label }),
      });
    } catch (error) {
      throw Error(`${kind}: output "${name}": ${error.message}`);
    }
  }
  return metadata;
}
