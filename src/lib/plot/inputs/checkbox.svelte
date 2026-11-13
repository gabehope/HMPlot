<script lang="ts">
  import { getContext, untrack } from "svelte";
  import { INPUT_CONTEXT } from "../utils/inputs.js";
  import { inputControl } from "../utils/inputStore.svelte.js";
  import { VIEW_CONTEXT } from "../utils/axisFrame.js";
  import type { CheckboxProps } from "../publicTypes.js";
  import "./inputStyles.css";
  import { controlTheme } from "../utils/controlTheme.svelte.js";
  let { name, value = $bindable(undefined), label = undefined, inputOwner = undefined }:
    CheckboxProps & { inputOwner?: string } = $props();
  const { store } = inputControl("Checkbox", () => ({ name, value }),
    { store: getContext(INPUT_CONTEXT), insidePlot: Boolean(getContext(VIEW_CONTEXT)), owner: untrack(() => inputOwner) });
  const controls = controlTheme();
  export const getValue = () => store.values[name];
  export function setValue(next: boolean) {
    value = next;
    store.set(name, next);
  }
</script>

<label class="hm-input hm-checkbox" style={controls.style}><input type="checkbox" checked={Boolean(store.values[name])}
    onchange={(event) => setValue(event.currentTarget.checked)} /><span class="hm-input-label">{label ?? name}</span></label>
