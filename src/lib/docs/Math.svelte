<script>
  let { tex = "", display = false } = $props();
  let svg = $state("");
  $effect(() => {
    const source = tex, block = display; let cancelled = false;
    (import.meta.env.SSR ? Promise.resolve({ texSVG: () => "" }) : import("../plot/utils/tex.js")).then(({texSVG}) => texSVG(source,{display:block}))
      .then(value => { if (!cancelled) svg = value; });
    return () => { cancelled = true; };
  });
</script>
<span class:display role="math" aria-label={tex}>{#if svg}{@html svg}{:else}{tex}{/if}</span>
<style>.display{display:block;text-align:center;margin:20px 0}span :global(svg){max-width:100%}</style>
