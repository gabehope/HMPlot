<script lang="ts">
  import { useReporter } from "./utils/reporter.js";
  import { getContext, setContext, onDestroy, tick, untrack } from "svelte";
  import { optionsRoot } from "../options/options.js";
  import { getOptionsContext, setOptionsContext } from "./utils/context.js";
  import { DATA_CONTEXT } from "./utils/categorical.js";
  import { facetService, partitionGroup } from "./utils/facetService.js";
  import { GUIDE_CONTEXT } from "./utils/guides.js";
  import { planPartitions, partitionFields, DEFAULT_PARTITION_LIMIT } from "./utils/partition.js";
  import { createPartitionSettingsSync } from "../options/partitionSettingsSync.js";
  import { initializePlot } from "../jaxExtensions/setup.js";
  import { useThrelte } from "@threlte/core";
  import { settleUploads } from './rendering/uploadSettlement.js';
import { trackPreparation, currentCause, mountCause, publishWithCause } from './rendering/viewSettlement.js';
  import { reportDataError } from "./utils/dataErrors.js";
  import { useViewServices } from "./utils/viewServices.js";
  import Group from "./partitionGroup.svelte";
  import { endpointDescriptor } from "./utils/connections.js";
  import type { PartitionProps } from "./publicTypes.js";
  import { columnName } from "./utils/names.js";
  let {
    by,
    limit = DEFAULT_PARTITION_LIMIT,
    legendGroups = false,
    name = "Partition",
    children,
  }: PartitionProps = $props();
  const parent: any = getContext(DATA_CONTEXT);
  if (!parent) throw Error("Partition requires a Data scope.");
  const facet = facetService();
  const guides: any = getContext(GUIDE_CONTEXT);
  const outer = partitionGroup();
  const depth = (outer?.depth ?? -1) + 1;
  const renderer = (() => { try { return useThrelte().renderer; } catch { return undefined; } })();
  const viewServices = useViewServices();
  const errorOwner = {};
  // Marks read the Frame's scope, so groups hang off that: "Frame / Adelie / Line".
  const parentOptions = (() => { try { return getOptionsContext(); } catch { return optionsRoot; } })();
  const partitionOptions = parentOptions.splitUnique(untrack(() => name), "group", "Partition");
  setOptionsContext(partitionOptions);
  // With legendGroups each group is its own legend entry, so its visibility stays its own;
  // otherwise the one entry fans out to every group through the registry and the link alike.
  const link = createPartitionSettingsSync({ local: () => (legendGroups ? ["visible"] : []) });
  const scopes = new Map<string, any>();
  let plan = $state.raw<any>(null), error = $state(""), alive = true, planKey = "";
  let preparation = Promise.resolve();
  $effect(() => reportDataError(viewServices, errorOwner, error ? `Partition: ${error}` : ""));

  // Flipping legendGroups remounts the groups (the {#each} key below) so every mark registers
  // under its new legend definition; the outgoing scope of a group and its replacement briefly
  // coexist, hence the flag in the scope key.
  const scopeKey = (group) => `${legendGroups ? "g" : "d"}:${group.key}`;
  function scopeFor(group) {
    const key = scopeKey(group);
    let entry = scopes.get(key);
    if (!entry) {
      const node = partitionOptions.splitUnique(group.label, "group", "Group");
      entry = {
        node,
        group,
        release() {
          scopes.delete(key);
          link.remove(key);
          node.dispose();
          // The replacement scope was labelled while this one still held the group's label.
          for (const other of scopes.values())
            if (other.group.key === group.key && other.node.presentation?.label !== group.label)
              other.node.setPresentation({ ...other.node.presentation, label: group.label });
        },
      };
      scopes.set(key, entry);
      applyAlias(entry, group);
      link.add(key, node);
    }
    return entry;
  }
  // Legends key entries by the authored scope path: "*" makes every group one definition (one
  // entry), the group key makes each group its own entry labelled by its key values.
  function applyAlias(entry, group) {
    entry.node.definitionAlias = legendGroups ? `partition:${group.key}` : "*";
    entry.node.partitionLabel = legendGroups ? group.label : undefined;
  }
  const composedValues = (group) => ({ ...(outer?.values ?? {}), ...group.values });
  // The runtime handle key of every node inside this group: enclosing Partitions first.
  const runtimeKey = (group) => (outer?.runtimeKey ? `${outer.runtimeKey}/${group.key}` : group.key);
  $effect(() => {
    legendGroups;
    untrack(() => {
      for (const entry of scopes.values()) applyAlias(entry, entry.group);
      guides?.notify?.();
    });
  });

  $effect(() => {
    let source;
    // by={col.species} names the column as "species" does (R2.0).
    const config = { by: columnName(by, "Partition.by"), limit };
    try {
      partitionFields(config.by);
      source = parent.read();
      source.version;
    } catch (e) {
      untrack(() => (error = e.message));
      return;
    }
    const key = JSON.stringify([source.version, config]);
    if (untrack(() => plan) && planKey === key) return;
    const cancel = new AbortController();
    untrack(() => {
      // The change this plan serves (TODO 17.15); the first plan serves the plot's mount.
      const cause = Math.min(currentCause(viewServices), (plans++ ? undefined : mountCause(viewServices)) ?? Infinity);
      const work = initializePlot()
        // The previous plan's groups whose rows the update left alone are reused (TODO 17.9).
        .then(() => planPartitions(source, by, { signal: cancel.signal, limit, previous: untrack(() => plan) }))
        .then((next) => {
          if (!alive || cancel.signal.aborted) { next.dispose(); return; }
          const old = plan;
          publishWithCause(viewServices, cause, () => {
            planKey = key;
            plan = next;
            error = "";
          });
          // The previous groups stay mounted until the new plan is in place.
          tick().then(() => old?.dispose());
        })
        .catch((e) => {
          if (e.name !== "AbortError" && alive && !cancel.signal.aborted) error = e.message;
        });
      preparation = viewServices ? trackPreparation(viewServices, work, cause) : work;
      facet?.track(work);
    });
    return () => cancel.abort();
  });

  let plans = 0;
  export async function whenSettled() {
    for (;;) {
      const work = preparation;
      await work;
      await tick();
      if (work === preparation) break;
    }
    if (viewServices) await settleUploads(viewServices);
    if (error) throw Error(error);
  }
  /** One entry per mounted group, in key order, with the marks each group mounted. `values`
   * includes the enclosing Partitions' keys. */
  export function getGroups() {
    return (plan?.groups ?? []).map((group) => {
      const node = scopes.get(scopeKey(group))?.node;
      const marks = node && guides
        ? [...guides.marks].filter((mark: any) => {
            for (let scope = mark.options; scope; scope = scope.defaults) if (scope === node) return true;
            return false;
          }).map((mark: any) => mark.guideHandle)
        : [];
      return { key: group.key, values: composedValues(group), label: group.label, marks };
    });
  }
  /**
   * The uniquely named endpoint mark repeated in every group, for connect():
   * `connect(partition.endpoint("values"), {key: "id"})` connects the groups
   * in group order.
   */
  export function endpoint(name: string, config: Partial<{ at: string }> = {}) {
    return endpointDescriptor({ scope: partitionOptions, name, at: config.at, scopeKind: "Partition" });
  }
  onDestroy(() => {
    alive = false;
    reportDataError(viewServices, errorOwner, "");
    link.dispose();
    plan?.dispose();
    partitionOptions.dispose();
  });
  // Its error is a diagnostic of its scene node too (TODO 136.6, utils/reporter.js).
  const reportError = useReporter("Partition");
  $effect(() => reportError(error));
</script>

{#if error && !renderer}<div class="partition-error" role="alert">Partition: {error}</div>{/if}
{#each plan?.groups ?? [] as group, index (scopeKey(group))}
  <Group {group} {depth} values={composedValues(group)} runtimeKey={runtimeKey(group)} scope={scopeFor(group)}
    ordinalPath={[...(outer?.ordinalPath ?? []), index]}>
    {@render children?.()}
  </Group>
{/each}

<style>
  .partition-error {
    font: 12px/1.4 system-ui;
    color: #9d3535;
    padding: 6px;
  }
</style>
