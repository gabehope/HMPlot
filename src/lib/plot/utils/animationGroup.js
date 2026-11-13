import { existingHostValues } from "./hostSources.js";
import { acquireColumn } from "./columnReads.js";

/** Animation identity is deliberately separate from Data identity and interaction keys. */
export const ANIMATION_GROUP_CONTEXT = Symbol("animation group");

export function animationGroupFields(group) {
  if (group == null) return null;
  const fields = Array.isArray(group) ? group : [group];
  if (
    !fields.length ||
    fields.some((field) => typeof field !== "string" || !field)
  )
    throw Error(
      "animationGroup requires a column name or a nonempty list of column names; use null to restore Data.key matching.",
    );
  return fields;
}

/** Resolve only this snapshot's logical rows, after filters and transforms. */
export async function animationCorrespondence(scope, group) {
  const fields = animationGroupFields(group);
  if (!fields) return null;
  if (!scope) throw Error("animationGroup requires a Data scope.");
  const length = scope.length;
  const held = [];
  try {
    const columns = await Promise.all(
      fields.map(async (field) => {
        if (!scope.has(field))
          throw Error(
            `animationGroup column ${JSON.stringify(field)} does not exist in the tweened snapshot.`,
          );
        const column = acquireColumn(scope, field);
        held.push(column);
        const value = column.value;
        const raw = value?.codes ?? value;
        const values = raw?.js
          ? (existingHostValues(raw) ?? (await raw.ref.js()))
          : raw;
        if (!Array.isArray(values) && !ArrayBuffer.isView(values))
          throw Error(
            `animationGroup column ${JSON.stringify(field)} must contain one value per row.`,
          );
        return value?.categories
          ? Array.from(values, (code) => value.categories[code])
          : values;
      }),
    );
    const tokens = Array.from({ length }, (_, row) =>
      JSON.stringify(
        columns.map((values) => {
          const value = values[row];
          if (
            value == null ||
            (typeof value === "number" && !Number.isFinite(value))
          )
            throw Error(
              "animationGroup values must be present and finite in the tweened snapshot.",
            );
          return [typeof value, String(value)];
        }),
      ),
    );
    if (new Set(tokens).size !== tokens.length)
      throw Error(
        "animationGroup values must be unique within each tweened snapshot; filter or aggregate to one row per group before tweening.",
      );
    return { scheme: JSON.stringify(fields), tokens };
  } finally {
    held.forEach((column) => column.release());
  }
}

/** A consumer retains only its newest snapshot; clock ticks reuse its host tokens. */
export function animationCorrespondenceCache(changed = () => {}) {
  let current;
  let alive = true;
  return {
    read(scope, group) {
      const fields = animationGroupFields(group);
      if (!fields) return null;
      const key = [
        scope?.length,
        scope?.identity,
        scope?.identity?.generation,
        JSON.stringify(fields),
        ...fields.map((field) => scope?.get(field)),
      ];
      if (
        !current ||
        key.some((value, i) => !Object.is(value, current.key[i])) ||
        key.length !== current.key.length
      ) {
        const release = scope?.retain?.();
        const entry = {
          key,
          value: undefined,
          error: undefined,
          promise: null,
        };
        current = entry;
        entry.promise = animationCorrespondence(scope, fields)
          .then(
            (value) => {
              entry.value = value;
            },
            (error) => {
              entry.error = error;
            },
          )
          .finally(() => {
            release?.();
            if (alive && current === entry) changed();
          });
      }
      if (current.error) throw current.error;
      return current;
    },
    async prepare(scope, group) {
      const entry = this.read(scope, group);
      if (!entry) return null;
      await entry.promise;
      if (entry.error) throw entry.error;
      return entry.value;
    },
    dispose() {
      alive = false;
      current = null;
    },
  };
}
