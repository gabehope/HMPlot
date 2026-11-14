const t=`import hmplot as hm

# Palmer penguins, from vega-datasets on a CDN that allows any page to fetch it.
with hm.Provider(url="https://cdn.jsdelivr.net/npm/vega-datasets@2/data/penguins.json", format="json") as penguins:
    with hm.Plot(height=300, axes2d=True):
        hm.Points(x="Beak Length (mm)", y="Beak Depth (mm)")
penguins
`;export{t as default};
