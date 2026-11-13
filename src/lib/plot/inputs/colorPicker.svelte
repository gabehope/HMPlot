<script lang="ts">
  import { getContext, untrack } from "svelte";
  import { INPUT_CONTEXT } from "../utils/inputs.js";
  import { inputControl } from "../utils/inputStore.svelte.js";
  import { inputValue } from "../utils/inputValues.js";
  import { VIEW_CONTEXT } from "../utils/axisFrame.js";
  import type { ColorPickerProps } from "../publicTypes.js";
  import "./inputStyles.css";
  import { controlTheme } from "../utils/controlTheme.svelte.js";
  let { name, value = $bindable(undefined), label = undefined, inputOwner = undefined }:
    ColorPickerProps & { inputOwner?: string } = $props();
  const { store } = inputControl("ColorPicker", () => ({ name, value }),
    { store: getContext(INPUT_CONTEXT), insidePlot: Boolean(getContext(VIEW_CONTEXT)), owner: untrack(() => inputOwner) });
  const controls = controlTheme();
  export const getValue = () => store.values[name];
  export function setValue(next: string) {
    const normalized = inputValue("ColorPicker", { value: next });
    value = normalized;
    store.set(name, normalized);
  }
</script>

<label class="hm-input hm-color-picker" style={controls.style}><span class="hm-input-label">{label ?? name}</span><input type="color" aria-label={label ?? name}
  value={store.values[name]} oninput={(event) => setValue(event.currentTarget.value)} /></label>
