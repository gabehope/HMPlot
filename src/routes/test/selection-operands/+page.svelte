<script>
  // TODO 139: selection resources as expression operands, through nested aggregates both ways,
  // and selection({by}) linking two tables by value. Opaque red marks are members; others fade
  // (no grid, which would show through a faded mark).
  import { onMount } from "svelte";
  import { Data, Plot, Points, Group, selection, where, logical_not, count } from "$lib/index";
  // Twelve rows in (a, b) cells; Group by [a, b], then by b: three bands of b.
  const rows = {
    a: ["p", "p", "q", "q", "r", "r", "p", "q", "r", "p", "q", "r"],
    b: ["u", "u", "u", "v", "v", "v", "w", "w", "w", "u", "v", "w"],
    x: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
    y: [0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1],
  };
  const genes = { gene: ["A", "B", "C"], gx: [0, 1, 2], gy: [0, 0, 0] };
  const samples = { gene: ["A", "A", "B", "C", "C", "C", null], sx: [0, 1, 2, 3, 4, 5, 6], sy: [0, 0, 0, 0, 0, 0, 0] };
  const focus = selection(), byGene = selection({ by: "gene" });
  const plots = $state({});
  onMount(() => {
    window.selectionOperands = { focus, byGene, plots };
    return () => { delete window.selectionOperands; };
  });
</script>

<Data value={rows}>
  <Plot bind:this={plots.rows} width={360} height={160} animation={false} x={{ domain: [-1, 12], grid: "off" }} y={{ domain: [-1, 2], grid: "off" }}>
    <Points x="x" y="y" size={18} fill="#d01010" select={focus} respond={false} opacity={where(focus, 1, 0.12)} />
  </Plot>
  <Plot bind:this={plots.groups} width={360} height={160} animation={false} x={{ grid: "off" }} y={{ domain: [1, 4], grid: "off" }}>
    <Group by={["a", "b"]} columns={{ n: count() }}>
      <Group by="b" columns={{ cells: count() }}>
        <Points x="b" y="cells" size={26} fill="#d01010" select={focus} respond={false} opacity={where(focus, 1, 0.12)} />
      </Group>
    </Group>
  </Plot>
  <Plot bind:this={plots.negated} width={360} height={160} animation={false} x={{ domain: [-1, 12], grid: "off" }} y={{ domain: [-1, 2], grid: "off" }}>
    <Points x="x" y="y" size={18} fill="#d01010" opacity={where(logical_not(focus), 1, 0.12)} />
  </Plot>
</Data>
<Plot bind:this={plots.genes} data={genes} width={360} height={120} animation={false} x={{ domain: [-1, 3], grid: "off" }} y={{ grid: "off" }}>
  <Points x="gx" y="gy" size={30} fill="#1030d0" hover={byGene} />
</Plot>
<Plot bind:this={plots.samples} data={samples} width={360} height={120} animation={false} x={{ domain: [-1, 7], grid: "off" }} y={{ grid: "off" }}>
  <Points x="sx" y="sy" size={22} fill="#d01010" opacity={where(byGene, 1, 0.12)} />
</Plot>
