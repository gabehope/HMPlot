<script lang="ts">
  import { useReporter } from "../utils/reporter.js";
  import { getContext, untrack } from "svelte";
  import { INPUT_CONTEXT, optionEntries, sameOption } from "../utils/inputs.js";
  import { isExpression } from "../utils/expressions.js";
  import { inputControl } from "../utils/inputStore.svelte.js";
  import { VIEW_CONTEXT } from "../utils/axisFrame.js";
  import type { SelectProps } from "../publicTypes.js";
  import "./inputStyles.css";
  import { controlTheme } from "../utils/controlTheme.svelte.js";
  let {
    name,
    options = [],
    multiple = false,
    value = $bindable(undefined),
    label = undefined,
    inputOwner = undefined,
  }: SelectProps & { inputOwner?: string } = $props();
  const { store, fromData, owner } = inputControl(
    "Select",
    () => ({ name, options, multiple, value }),
    {
      store: getContext(INPUT_CONTEXT),
      insidePlot: Boolean(getContext(VIEW_CONTEXT)),
      owner: untrack(() => inputOwner),
    },
  );
  // Options may read the data (categories("species"), columns(): TODO 41.2).
  const entries = $derived(
    optionEntries(isExpression(options) ? fromData.values.options : options),
  );
  const pending = $derived(store.pending(name));
  const index = $derived(
    entries.findIndex((entry) => sameOption(entry.value, store.values[name])),
  );
  const chosen = $derived(
    entries.flatMap((entry, i) =>
      (Array.isArray(store.values[name]) ? store.values[name] : []).some((v) =>
        sameOption(v, entry.value),
      )
        ? [String(i)]
        : [],
    ),
  );
  // Its value shows as the chosen option's label, in {$name} placeholders too (TODO 46).
  $effect(() => {
    const n = name,
      list = entries,
      many = multiple;
    const describe = (v) =>
      list.find((entry) => sameOption(entry.value, v))?.label ??
      String(v ?? "");
    return untrack(() =>
      store.describe(
        n,
        (v) =>
          many
            ? (Array.isArray(v) ? v : []).map(describe).join(", ")
            : describe(v),
        owner,
      ),
    );
  });
  const controls = controlTheme();
  export const getValue = () => store.values[name];
  export function setValue(next) {
    value = next;
    store.set(name, next);
  }
  // Its error is a diagnostic of its scene node too (TODO 136.6, utils/reporter.js).
  const reportError = useReporter("Select");
  $effect(() => reportError(fromData.error));
</script>

<label
  class="hm-input hm-select"
  class:hm-multi-select={multiple}
  style={controls.style}
  ><span class="hm-input-label">{label ?? name}</span><select
    disabled={pending}
    aria-label={label ?? name}
    {multiple}
    value={multiple ? chosen : String(index)}
    onchange={(event) =>
      setValue(
        multiple
          ? Array.from(
              event.currentTarget.selectedOptions,
              (option) => entries[Number(option.value)].value,
            )
          : entries[Number(event.currentTarget.value)]?.value,
      )}
  >
    {#each entries as entry, i}<option value={String(i)}>{entry.label}</option
      >{/each}
  </select>{#if fromData.error}<span role="alert">{fromData.error}</span
    >{/if}</label
>
