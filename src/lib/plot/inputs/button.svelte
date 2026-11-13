<script lang="ts">
  import { getContext, untrack, onDestroy } from "svelte";
  import { INPUT_CONTEXT } from "../utils/inputs.js";
  import { inputControl } from "../utils/inputStore.svelte.js";
  import { inputWriter, writerType, writerLabel, RESET, writerValue, type InputWriter } from "../utils/inputWriters.js";
  import { VIEW_CONTEXT } from "../utils/axisFrame.js";
  import type { ButtonProps } from "../publicTypes.js";
  import "./inputStyles.css";
  import { controlTheme } from "../utils/controlTheme.svelte.js";
  // A Button's value counts its presses, so a reader that acts on a change acts on each press
  // (Stage 42's reset=, Force's reheat=). With set (TODO 145.7) a press also writes other inputs:
  // set={root.reset()} restores root's default, set={root.set(literal("all"))} sets a value.
  let { name = undefined, value = $bindable(undefined), label = undefined, set = undefined, inputOwner = undefined }:
    ButtonProps & { inputOwner?: string } = $props();
  const store: any = getContext(INPUT_CONTEXT) ?? null;
  const insidePlot = Boolean(getContext(VIEW_CONTEXT));
  if (untrack(() => name === undefined)) {
    if (untrack(() => set === undefined)) throw Error("Button needs a name (its readers count its presses) or set (the inputs a press writes).");
    if (untrack(() => label === undefined)) throw Error("Button: with set and no name, give it a label, the text on the button.");
    if (!store) throw Error("Button: set writes inputs, so it needs an input context around it: an InputContext, or a Python Scene.");
    if (insidePlot) throw Error("Button is inside a Plot; put it in a Row beside the Plot.");
  } else inputControl("Button", () => ({ name, value }), { store, insidePlot, owner: untrack(() => inputOwner) });
  const controls = controlTheme();
  // The inputs set writes, registered as writers of them (so readers resolve without a widget of
  // that name) and released as they change or go.
  const owner = {};
  const held = new Map<string, () => void>();
  onDestroy(() => { held.forEach((release) => release()); held.clear(); });
  const writes = $derived.by((): InputWriter[] => {
    const list = set === undefined ? [] : Array.isArray(set) ? set : [set];
    const out = list.map((item) => {
      const writer = inputWriter(item, "Button", "set");
      if (!writer) throw Error(`Button: set takes input writes (input("root").reset(), input("root").set(literal("all"))); received ${JSON.stringify(item)}.`);
      return writer;
    });
    const names = out.map((w) => w.name);
    const twice = names.find((n, i) => names.indexOf(n) !== i);
    if (twice) throw Error(`Button: set writes the input "${twice}" twice; give it one write.`);
    if (name !== undefined && names.includes(name)) throw Error(`Button "${name}": set writes its own name, which counts its presses; set other inputs.`);
    return out;
  });
  $effect.pre(() => {
    const current = writes;
    untrack(() => {
      const wanted = new Set(current.map((w) => w.name));
      for (const writer of current)
        if (!held.has(writer.name))
          held.set(writer.name, store.share(writer.name, owner, { label: writerLabel(`Button "${label ?? name ?? ""}"`, "set", writer), given: writer.given, type: writerType(null, writer, "Button", "set") }));
      for (const [key, release] of held) if (!wanted.has(key)) { release(); held.delete(key); }
    });
  });
  export const getValue = () => (name === undefined ? undefined : store.values[name]);
  /** Press the button: its count goes up by one, and the inputs set names are written. */
  export function press() {
    if (name !== undefined) {
      const next = Number(store.values[name] ?? 0) + 1;
      value = next;
      store.set(name, next);
    }
    for (const writer of writes) {
      const next = writerValue(writer, () => undefined);
      if (next === RESET) store.reset(writer.name);
      else store.commit(writer.name, next);
    }
  }
</script>

<span class="hm-input hm-button" style={controls.style}><button type="button" onclick={press}>{label ?? name}</button></span>
