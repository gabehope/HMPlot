import { numpy as np } from "@hmplot/jax";
import { numericColumn } from "../dataView.js";
import { list } from "./common.js";

/**
 * Fold: every row once per field of `fields`, with the field's name (`key`) and value (`value`).
 * Over hidden rows each copy keeps its row's visibility.
 */
export const fold = {
  reads: "rows",
  output: "newRows",
  repeatsRows: true,
  // Its outputs are named by `as` here, once (runner.js).
  renames: true,
  // Row r of the value is field fields[key] of its source row (lineage, TODO 38.2).
  lineage: (config) => ({
    [config.as?.value ?? "value"]: { kind: "fold", fields: list(config.fields), key: config.as?.key ?? "key" },
  }),
  validate(config) {
    const fields = list(config.fields);
    if (!fields.length || fields.some((field) => typeof field !== "string"))
      throw Error("Fold needs one or more field names.");
    if ((config.as?.key ?? "key") === (config.as?.value ?? "value"))
      throw Error("Fold output names must be distinct.");
  },
  run(input, config, { own }) {
    const fields = list(config.fields),
      n = input.length,
      keyName = config.as?.key ?? "key",
      valueName = config.as?.value ?? "value";
    const folded = fields.map((field) =>
      own(numericColumn(input.scope, field)),
    );
    const order = own(
      np.concatenate(fields.map(() => np.arange(n).astype(np.int32))),
    );
    const columns = {
      [keyName]: {
        codes: own(
          np.concatenate(
            fields.map((_, i) => np.full([n], i, { dtype: np.int32 })),
          ),
        ),
        categories: fields,
      },
      [valueName]: own(np.concatenate(folded.map((field) => field.ref))),
    };
    return {
      order,
      count: input.count * fields.length,
      columns,
      provenance: { kind: "fold", fields: [keyName, valueName] },
      // A Facet split by the key builds a cell per field over the source rows (view.fold).
      fold: { fields: [...fields], key: keyName, value: valueName },
    };
  },
};
