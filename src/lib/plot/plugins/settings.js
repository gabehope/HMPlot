import { FieldType } from "../objects/types.js";

/** One parameter bag per instance, using the ordinary authored/user option layers.
 * The definition is shared; its schema/editor is local so plugins cannot alter one another.
 */
export function pluginSettings(parent, name, kind, changed) {
  const node = parent.splitUnique(name, "transform", kind);
  node.ensure(
    "pluginParameters",
    new FieldType({ defaultValue: {}, ui: false }),
  );
  node.setDisplayList([]);
  const stop = node.on(
    () => changed(node.get("pluginParameters")),
    "pluginParameters",
  );
  let previousKind, previousSchema, previousGrid, previousParams, previousKey;
  return {
    node,
    configure(kind, schema, grid, params) {
      if (previousKind !== kind) {
        node.clear("pluginParameters");
        previousParams = previousKey = undefined;
      }
      if (
        previousKind !== kind ||
        previousSchema !== schema ||
        previousGrid !== grid
      ) {
        node.presentationTypes.set("pluginParameters", {
          ui: "plugin-parameters",
          label: "Parameters",
          kind,
          schema: schema ?? {},
          grid,
        });
        node.setPresentation({ type: kind });
        node.setDisplayList(
          schema && Object.keys(schema).length ? ["pluginParameters"] : [],
        );
        node.emitStructure();
        previousKind = kind;
        previousSchema = schema;
        previousGrid = grid;
      }
      // A freshly constructed params object with the same JSON values is not a new authored
      // setting. Preserve its reference so OptionsNode keeps the viewer's edit.
      const key = JSON.stringify(params);
      if (key !== previousKey) {
        previousParams = { ...params };
        previousKey = key;
      }
      node.set("pluginParameters", previousParams);
      return node.get("pluginParameters");
    },
    dispose() {
      stop();
      node.dispose();
    },
  };
}
