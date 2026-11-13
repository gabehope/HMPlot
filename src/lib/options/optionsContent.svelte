<script>
  import OptionsElement from "./optionsElement.svelte";
  import { treeStore, optionRows } from "./inspector.js";
  let { options } = $props();
  const revision = $derived(treeStore(options));
  const rows = $derived.by(() => {
    $revision;
    return optionRows(options);
  });
</script>

{#each rows as row (row.path)}<OptionsElement
    {row}
    revision={$revision}
  />{/each}
