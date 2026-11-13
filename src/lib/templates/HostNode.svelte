<script>
  // One node of an expanded template (TODO 130.2): its part, mounted at once with this caller's
  // props, then its children. Props re-evaluate in place when a parameter changes; equal values
  // keep their identity, so the parts see a change only where there is one.
  import { setContext, untrack } from "svelte";
  import HostNode from "./HostNode.svelte";
  import SlotScope from "./SlotScope.svelte";
  import { ENDPOINT_COMPOUND_CONTEXT } from "../plot/utils/connections.js";
  import { setMarkLabelContext } from "../plot/utils/context.js";
  import { mounted, nodeProps } from "./instantiate.js";
  import { stable } from "../scene/stableProps.js";
  import { takesLegend } from "./definition.js";

  let { definition, item, path, parts, props, params, register, main, endpoint, content = undefined, extra = undefined } = $props();
  // A node's kind is fixed: the tree's shape never depends on a parameter. The slot is the
  // caller's children, rendered in its place.
  const Part = untrack(() => (item.kind === "Slot" ? null : parts[item.kind]));
  // The main part registers as the template's connection endpoint.
  untrack(() => { if (endpoint && path === main) setContext(ENDPOINT_COMPOUND_CONTEXT, endpoint); });
  // ... and takes the definition's label, where it declares one; the parts below it don't.
  untrack(() => { if (definition.label) setMarkLabelContext(path === main ? definition.label : undefined); });
  // A mark other than the main part has no legend entry of its own (the main part's is the
  // template's) unless the definition gives it one; it follows the main part's visibility.
  const follower = untrack(() => main !== undefined && path !== main && takesLegend(item.kind) && !("legend" in item.props));
  let previous;
  const resolved = $derived.by(() => {
    // What the host adds to a part (a linked Plot's onviewportchange), below the definition's.
    const own = { ...extra?.(path), ...nodeProps(definition, item, props, params) };
    return (previous = stable(follower ? { ...own, legend: false } : own, previous));
  });
  let instance = $state();
  const keep = (value) => { instance = value; register(path, value); };
</script>

{#if !Part}
  <SlotScope>{@render content?.()}</SlotScope>
{:else if item.children.length}
  <Part bind:this={() => instance, keep} {...resolved}>
    {#each item.children as child, index (index)}
      {#if mounted(child, params, definition.kind, props)}
        <HostNode {definition} item={child} path={`${path}.${index}`} {parts} {props} {params} {register} {main} {endpoint} {content} {extra} />
      {/if}
    {/each}
  </Part>
{:else}
  <Part bind:this={() => instance, keep} {...resolved} />
{/if}
