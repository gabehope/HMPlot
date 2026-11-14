# 100% stacked bars

Stack with offset="expand" scales each region's stack to span 0 to 1, so each Bar segment is a product's share of the region's sales.

## Python

```python
import hmplot as hm

# Sales by region and product line: one row per pair.
regions = ["North", "East", "South", "West", "Central"]
products = ["Hardware", "Software", "Services", "Support"]
data = {"region": [], "product": [], "sales": []}
for i, region in enumerate(regions):
    for j, product in enumerate(products):
        data["region"].append(region)
        data["product"].append(product)
        data["sales"].append(20 + ((i * 7 + j * 13) % 11) * 9 + j * 6)

# offset="expand" scales each region's stack to span 0 to 1: each segment is a product's share.
with hm.Plot(data=data, height=400, axes2d=True,
             axis_margin_left=72, axis_margin_bottom=52,
             x={"scale": hm.categorical(domain=regions), "label": "Region", "title_position": "middle", "title_placement": "outside", "title_offset": 24},
             y={"domain": [0, 1], "format": ".0%", "label": "Share of sales",
                "title_position": "middle", "title_placement": "outside", "title_offset": 40,
                "title_angle": -90}) as plot:
    with hm.Stack(x="region", y="sales", series="product", offset="expand"):
        hm.charts.Bar(x="region", y="y1", baseline="y0", fill="product")
    hm.Legend(channel="fill", label="Product", position="right")
plot
```

## Svelte

```svelte
<Stack x="region" y="sales" series="product" offset="expand">
  <Bar x="region" y="y1" baseline="y0" fill="product" />
</Stack>
```
