const t=`import hmplot as hm

# Two rows of three RGB pixels, 0 to 1.
pixels = [
    [[0.9, 0.3, 0.2], [0.95, 0.75, 0.2], [0.3, 0.7, 0.4]],
    [[0.2, 0.5, 0.8], [0.5, 0.3, 0.7], [0.9, 0.9, 0.9]],
]
with hm.Plot(height=300) as plot:
    hm.Image(data=pixels, pixelated=True)
plot
`;export{t as default};
