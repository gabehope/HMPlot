<script>
  // The docs' Python editor (R2.0b.4): CodeMirror 6 with Python highlighting, completion of hm's
  // names and each component's keywords (from signatures.json), Run on Ctrl/Cmd-Enter, and the
  // line of the last error marked.
  import { onDestroy, onMount } from "svelte";
  import { EditorView, basicSetup } from "codemirror";
  import { keymap } from "@codemirror/view";
  import { EditorState, Prec } from "@codemirror/state";
  import { python } from "@codemirror/lang-python";
  import { autocompletion } from "@codemirror/autocomplete";
  import { setDiagnostics } from "@codemirror/lint";
  import signatures from "../../../python/hmplot/signatures.json";
  import registry from "../../../python/hmplot/registry.json";

  let { value = $bindable(""), error = null, onrun, label = "Python source" } = $props();
  let host, view;

  // hm.<name> completes the components and the expression helpers; inside hm.Name( ... ) the
  // component's keywords complete, with their types as the detail.
  const names = [...new Set([...Object.keys(signatures), ...Object.keys(registry.components)])]
    .filter((name) => /^[A-Z]/.test(name) && name !== "LayoutGrid").concat("Grid").sort();
  const helpers = ["col", "input", "view", "literal", "categorical", "ordinal", "continuous", "normalization", "create_theme",
    "register_shape", "themes", "Table", "export_png", "export_svg", "export_pdf", "export_html", "export_mp4",
    "visualize_tree", "mean", "sum", "count", "min", "max", "where", "sin", "cos", "log", "exp", "sqrt", "abs"];
  function complete(context) {
    const member = context.matchBefore(/hm\.\w*/);
    if (member) return { from: member.from + 3, options: [...names.map((label) => ({ label, type: "class" })),
      ...helpers.map((label) => ({ label, type: "function" }))] };
    const word = context.matchBefore(/\w+/);
    if (!word && !context.explicit) return null;
    // The innermost unclosed hm.Name( before the cursor.
    const text = context.state.doc.sliceString(0, context.pos);
    let depth = 0, call = null;
    for (let i = text.length - 1; i >= 0 && !call; i--) {
      if (text[i] === ")") depth++;
      else if (text[i] === "(") {
        if (depth === 0) call = /hm\.(\w+)\s*$/.exec(text.slice(0, i))?.[1] ?? "";
        else depth--;
      }
    }
    const params = call && signatures[call === "Grid" ? "LayoutGrid" : call];
    if (!params) return null;
    return { from: word ? word.from : context.pos, options: Object.entries(params).map(([name, type]) =>
      ({ label: `${name}=`, type: "property", detail: type.length > 60 ? `${type.slice(0, 57)}...` : type })) };
  }
  onMount(() => {
    view = new EditorView({
      parent: host,
      state: EditorState.create({
        doc: value,
        extensions: [
          basicSetup, python(), autocompletion({ override: [complete] }),
          // Above the default keymap, where Mod-Enter inserts a blank line.
          Prec.highest(keymap.of([{ key: "Mod-Enter", run: () => { onrun?.(); return true; } }])),
          EditorView.updateListener.of((update) => { if (update.docChanged) value = update.state.doc.toString(); }),
          EditorView.contentAttributes.of({ "aria-label": label }),
        ],
      }),
    });
  });
  // Replaced from outside (Reset): the document follows.
  $effect(() => {
    if (view && value !== view.state.doc.toString())
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } });
  });
  // The last run's error, marked at its line (the mark follows later edits).
  $effect(() => {
    if (!view) return;
    const line = error?.line && error.line <= view.state.doc.lines ? view.state.doc.line(error.line) : null;
    view.dispatch(setDiagnostics(view.state, line ? [{ from: line.from, to: line.to, severity: "error", message: error.message }] : []));
  });
  onDestroy(() => view?.destroy());
</script>

<div class="editor" bind:this={host}></div>

<style>
  .editor { font-size: 12px; background: #fbfcfd; }
  .editor :global(.cm-editor) { max-height: 480px; }
  .editor :global(.cm-scroller) { font: 12px/1.6 ui-monospace, SFMono-Regular, Consolas, monospace; }
</style>
