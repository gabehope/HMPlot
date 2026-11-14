const t=`import hmplot as hm

with hm.Plot(coordinates="spherical", projection="mercator", tone_mapping=0, height=300) as plot:
    hm.VectorTile(tile=[14, 9014, 4818], live=False)
plot
`;export{t as default};
