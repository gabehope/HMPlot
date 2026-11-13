<script lang="ts">
  import { setContext, onDestroy, untrack } from "svelte";
  import type { Snippet } from "svelte";
  import { DATA_CONTEXT } from "./utils/categorical.js";
  import { setOptionsContext } from "./utils/context.js";
  import { PARTITION_CONTEXT, type PartitionGroup } from "./utils/facetService.js";
  let {
    group, depth, values, runtimeKey, scope, ordinalPath = [], children,
  }: { group: any; depth: number; values: any; runtimeKey: string; scope: any; ordinalPath: number[]; children?: Snippet } = $props();
  // One scope per group: the settings link keeps the groups in step, and the "*" alias (or the
  // group label, with legendGroups) decides whether legends see one definition or one per group.
  // The parent {#each} is keyed on the group, so these props are fixed for this instance.
  setOptionsContext(untrack(() => scope.node));
  setContext(DATA_CONTEXT, { read: () => group.view });
  // runtimeKey identifies this group among every enclosing Partition's ("[\"Adelie\"]/[\"Male\"]"),
  // so a scene node mounted here registers a runtime handle of its own (SceneNode.svelte).
  setContext<PartitionGroup>(PARTITION_CONTEXT, {
    get key() { return group.key; },
    get values() { return values; },
    get depth() { return depth; },
    get label() { return group.label; },
    get runtimeKey() { return runtimeKey; },
    // This group's position among its Partition's groups, and the enclosing Partitions'
    // positions before it: connection endpoints order repeated marks by it.
    get ordinal() { return ordinalPath.at(-1) ?? 0; },
    get ordinalPath() { return ordinalPath; },
  });
  onDestroy(() => scope.release());
</script>

{@render children?.()}
