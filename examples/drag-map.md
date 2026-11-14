# Dragging cities on a map

Drag a city on a Mercator map: the drag goes back through the projection and writes offsets in degrees; the point and its label both read moved().

## Python

```python
import hmplot as hm

cities = hm.Table({"name": names, "lon": lons, "lat": lats}, key="name")
with hm.Plot(data=cities, type="2d", coordinates="spherical", projection="mercator",
             x={"domain": [-180, 180], "show": False}, y={"domain": [-60, 75], "show": False}) as plot:
    hm.GeoJSON(data=countries, fill="#d8dde3")
    hm.Points(x=hm.moved("lon"), y=hm.moved("lat"), fill="#d62728", drag=True)
    hm.Text(x=hm.moved("lon"), y=hm.moved("lat"), text="name", dy=14)
plot
# cities.offsets: how far each city was dragged, in degrees.
```

## Svelte

```svelte
<Data value={cities} key="name">
  <Plot type="2d" coordinates="spherical" projection="mercator"
    x={{ domain: [-180, 180], visible: false }} y={{ domain: [-60, 75], visible: false }}>
    <GeoJSON data={countries} fill="#d8dde3" />
    <Points x={moved("lon")} y={moved("lat")} fill="#d62728" drag />
    <Text x={moved("lon")} y={moved("lat")} text="name" dy={14} />
  </Plot>
</Data>
```
