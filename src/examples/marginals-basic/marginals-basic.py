import hmplot as hm

data = {
    "height": [151, 156, 158, 160, 162, 163, 165, 166, 168, 169, 170, 171, 172, 174, 175, 176, 178, 180, 182, 185],
    "weight": [48, 52, 55, 54, 58, 61, 59, 63, 62, 66, 65, 70, 68, 72, 71, 75, 74, 79, 83, 86],
}
figure = hm.charts.Marginals(data=data, x="height", y="weight", bins=8, height=360)
figure
