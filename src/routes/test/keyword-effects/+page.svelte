<script>
  // TODO 137.5: a mark drawn twice, without and with one keyword's value, from props the spec
  // sends, so keyword-effects.spec.js can check that the keyword changes what the mark draws.
  import { onMount, tick } from "svelte";
  import * as lib from "$lib/index";
  import * as charts from "$lib/charts/index.js";
  let current = $state(null), plots = $state([]), generation = $state(0);
  onMount(() => {
    window.keywordEffects = {
      async draw({ mark, plot, base, variant }) {
        if (!(lib[mark] ?? charts[mark])) throw Error(`Unknown keyword fixture component: ${mark}`);
        plots = []; current = { mark, plot, props: [base, { ...base, ...variant }] }; generation++;
        await tick();
        for (let i = 0; i < 500 && !(plots[0] && plots[1]); i++) await new Promise((r) => setTimeout(r, 10));
        // Every plot has left "Loading..." before settling (AGENTS.md).
        for (let i = 0; i < 1500 && [...document.querySelectorAll(".canvas")].some((c) => c.getAttribute("aria-busy") !== "false"); i++)
          await new Promise((r) => setTimeout(r, 10));
        const errors = [];
        for (const p of plots) {
          const settled = (async () => { await p.whenSettled(); await p.whenAnimationsFinished(); })();
          const late = new Promise((_, reject) => setTimeout(() => reject(Error("did not settle in 15 s")), 15000));
          try { await Promise.race([settled, late]); errors.push(p.getRenderError() || ""); }
          catch (e) { errors.push(String(e?.message ?? e)); }
        }
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        const alert = document.querySelector('[role="alert"]')?.textContent ?? "";
        return errors.filter(Boolean)[0] || alert;
      },
    };
    return () => delete window.keywordEffects;
  });
  const Mark = $derived(current ? (lib[current.mark] ?? charts[current.mark]) : null);
</script>

{#if current}
  {#key generation}
    {#each current.props as props, i}
      <div class="case" id={i ? "variant" : "base"}>
        <lib.Plot bind:this={plots[i]} width={240} height={180} {...current.plot}>
          <Mark {...props} />
        </lib.Plot>
      </div>
    {/each}
  {/key}
{/if}

<style>
  .case { display: inline-block; width: 240px; height: 180px; }
</style>
