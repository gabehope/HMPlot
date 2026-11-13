<script>
  import MovingParticles from "../../../../src/routes/examples/interactions/MovingParticles.svelte";
  const moving = new URLSearchParams(location.search).has("moving");
</script>

{#if moving}<MovingParticles />{:else}<canvas
    id="progress"
    width="300"
    height="100"
  ></canvas>{/if}

<style>
  :global(body) {
    margin: 20px;
    background: #171b27;
    color: #e3e8f1;
    font-family: sans-serif;
  }
</style>
