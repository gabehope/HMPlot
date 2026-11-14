# Rooted tree

A deterministic spanning tree with labels and curved directional links.

## Python

```python
import hmplot as hm
edges = {'source': ['Root', 'Root', 'Left', 'Right'], 'target': ['Left', 'Right', 'Leaf A', 'Leaf B']}
people = {'node_id': ['Root', 'Left', 'Right', 'Leaf A', 'Leaf B'], 'name': ['Origin', 'Branch A', 'Branch B', 'A1', 'B1']}
with hm.Scene() as scene:
    with hm.Data(edges):
        with hm.Controls():
            hm.Select(name='root', options=hm.categories('source'), value='Root', label='Root')
            hm.Select(name='orientation', options=['down', 'up', 'left', 'right'], label='Orientation')
        with hm.GraphData(nodes=people, edges=edges, node_key='node_id', source='source', target='target'):
            with hm.Tree(root=hm.input.root, orientation=hm.input.orientation):
                with hm.Plot(x={'domain': [-2, 2]}, y={'domain': [-3, 1]}):
                    with hm.Edges():
                        hm.charts.Arrows(start='start', end='end', curve='link-vertical', width=1)
                    with hm.Nodes():
                        hm.Points(position='position', size=8)
                        hm.Text(x='x', y='y', text='name', dy=-14)
scene
```

## Svelte

```svelte
<script>
 import { Data, GraphData, Tree, Plot, Nodes, Edges, Points, Text, InputContext, Select, categories, input } from '$lib';
import { Arrows } from '$lib/charts/index.js';
  import {untrack} from 'svelte';
  let {plot=$bindable(),onready=undefined}=$props();
  $effect(()=>{const p=plot;untrack(()=>onready?.(p));});
 const data={source:['Root','Root','Left','Left','Right','Right','Isolated'],target:['Left','Right','Leaf A','Leaf B','Leaf C','Leaf D','Other']};
</script>
<InputContext><Data value={data}>
 <Select name="root" options={categories("source")} value="Root" label="Root"/>
 <Select name="orientation" options={["down","up","left","right"]} label="Orientation"/>
 <GraphData><Tree root={input("root")} orientation={input("orientation")}>
 <Plot bind:this={plot} responsive height={440} x={{domain:[-1,5]}} y={{domain:[-3,1]}}>
  <Edges><Arrows start="start" end="end" curve="link-vertical" width={1} color="#7b9865"/></Edges>
  <Nodes><Points position="position" size={4} fill="#547ba2"/><Text x="x" y="y" text="id" dy={-14}/></Nodes>
 </Plot>
</Tree></GraphData></Data></InputContext>
```
