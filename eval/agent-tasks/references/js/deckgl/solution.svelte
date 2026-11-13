<script>
  import { onMount } from 'svelte';
  import { Deck, OrthographicView } from '@deck.gl/core';
  import { ScatterplotLayer } from '@deck.gl/layers';
  import csv from './data/penguins.csv?raw';
  const lines = csv.trim().split(/\r?\n/);
  const headers = lines.shift().split(',');
  const rows = lines.map(line => Object.fromEntries(line.split(',').map((v, i) => [headers[i], v]))).filter(row => row.bill_length_mm && row.bill_depth_mm);
  let host;
  onMount(() => {
    const colors = {Adelie:[43,108,176],Chinstrap:[207,77,70],Gentoo:[66,142,107]};
    const deck = new Deck({parent:host, views:[new OrthographicView({id:'main'})],
      initialViewState:{target:[45,17,0],zoom:5}, controller:true,
      layers:[new ScatterplotLayer({id:'penguins',data:rows,
        getPosition:d=>[+d.bill_length_mm,+d.bill_depth_mm,0],
        getFillColor:d=>colors[d.species]||[100,100,100],getRadius:0.11,
        radiusMinPixels:2,radiusMaxPixels:7,pickable:true})]});
    return () => deck.finalize();
  });
</script>
<h1>Penguin bills</h1>
<div class="axis">Bill depth (mm)</div>
<div bind:this={host} style="width:900px;height:560px"></div>
<p>Bill length (mm)</p>
<p>Species: Adelie · Chinstrap · Gentoo</p>
