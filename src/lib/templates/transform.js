// Transform templates share the runner's lifecycle. Expand their parameters before handing
// the same input and ownership context to the declared core operation; never wrap a second
// DataView or keep another cache, input subscription, status channel or settlement promise.
import { nodeProps, parameterValues } from "./instantiate.js";
import { createDataView } from "../plot/utils/dataView.js";
import { inputGroups } from "../plot/utils/transforms/common.js";
import { rename } from "../plot/utils/transforms/common.js";

export function transformTemplate(template, operation) {
  const configOf = config => nodeProps(template, template.root, config, parameterValues(template, config));
  const configured = hook => typeof hook === "function"
    ? (config, ...args) => hook(configOf(config), ...args) : hook;
  const named = (values, config) => values && rename(values, configOf(config).as);
  return {
    ...operation,
    renames: true,
    reads: configured(operation.reads),
    output: configured(operation.output),
    buckets: configured(operation.buckets),
    dependencies: configured(operation.dependencies),
    categoryAxis: configured(operation.categoryAxis),
    valueAxis: configured(operation.valueAxis),
    validate(config) {
      const params = parameterValues(template, config);
      for (const [name, setting] of Object.entries(template.settings ?? {}))
        if (setting.options && !setting.options.includes(params[name]))
          throw Error(`${template.kind}.${name} must be one of ${setting.options.join(", ")}.`);
      operation.validate?.(configOf(config));
    },
    lineage: operation.lineage && ((config, source) => named(operation.lineage(configOf(config), source), config)),
    names: operation.names && ((config, source, columns) => named(operation.names(configOf(config), source, columns), config)),
    async run(input, config, context) {
      const grouping = template.output.groups;
      if (grouping && config[grouping]) {
        const groups = await inputGroups(context.cache, input, config[grouping]);
        context.cleanup(() => groups.dispose());
        const field = "\u0000templateGroup";
        const scope = createDataView(input.scope, { mask: input.valid?.ref, count: input.count, columns: {
          [field]: { codes: groups.codes, categories: Array.from({ length: groups.count }, (_, i) => i) },
        } });
        context.cleanup(() => scope.dispose());
        input = { ...input, scope: scope.padded?.() ?? scope };
        config = { ...config, [grouping]: field };
      }
      const expanded = configOf(config);
      const result = await operation.run(input, expanded, context);
      return {
        ...result,
        columns: rename(result.columns ?? {}, expanded.as),
        columnMetadata: result.columnMetadata && rename(result.columnMetadata, expanded.as),
        columnFacts: result.columnFacts && rename(result.columnFacts, expanded.as),
        liveColumns: result.liveColumns && new Set([...result.liveColumns].map(name => expanded.as?.[name] ?? name)),
      };
    },
  };
}
