<script>
  let { children, ratio = "1fr 1fr" } = $props();
</script>
<div class="columns" style:grid-template-columns={ratio}>{@render children?.()}</div>
<style>
  .columns { display:grid; gap:1.5rem; align-items:start; min-width:0; }
  @media(max-width:720px) { .columns { grid-template-columns:1fr !important; } }
</style>
