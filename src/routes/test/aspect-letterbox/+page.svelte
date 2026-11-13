<script>
  // aspect="equal" never widens an explicit domain (TODO 136.14, 134.14): "given" sets x and y to
  // [0, 1] in a 400 x 200 plot, which letterboxes; "automatic" leaves x to its data (2 to 3),
  // which widens about it.
  import { Plot, Points } from "$lib/index";
  let given = $state(), automatic = $state();
  $effect(() => {
    window.aspectLetterbox = { get given() { return given; }, get automatic() { return automatic; } };
    return () => { delete window.aspectLetterbox; };
  });
</script>

<div class="given"><Plot bind:this={given} aspect="equal" autoBounds axes2d width={400} height={200}
  x={{ domain: [0, 1] }} y={{ domain: [0, 1] }}>
  <Points x={[0, 0.5, 1]} y={[0, 0.5, 1]} />
</Plot></div>
<div class="automatic"><Plot bind:this={automatic} aspect="equal" autoBounds axes2d width={400} height={200}
  y={{ domain: [0, 1] }}>
  <Points x={[2, 2.5, 3]} y={[0, 0.5, 1]} />
</Plot></div>
