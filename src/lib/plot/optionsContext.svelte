<script>
  import { onDestroy, untrack } from "svelte";
  import { getOptionsContext, setOptionsContext } from "./utils/context.js";
  import { createType } from "./objects/types.js";
  let {
    name = undefined,
    children = undefined,
    definitions = {},
    types = definitions,
    ...others
  } = $props();
  const localOptions = getOptionsContext().splitUnique(
    untrack(() => name),
    "group",
    "Group",
  );
  setOptionsContext(localOptions);
  $effect(() => {
    for (const [key, definition] of Object.entries(types)) {
      const type = definition?.isFieldType
        ? definition
        : typeof definition === "string"
          ? createType(definition)
          : createType(definition.type, definition);
      localOptions.ensure(key, type);
    }
    localOptions.populate(others);
  });
  onDestroy(() => localOptions.dispose());
</script>

{@render children?.()}
