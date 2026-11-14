const t=`import math
import hmplot as hm

days = list(range(365))
data = {"day": days, "visits": [200 + 80 * math.sin(d / 9) + d / 2 for d in days]}
# Drag across the strip below to zoom the chart to those days; clear the brush to see them all.
chart = hm.charts.FocusContext(data=data, x="day", y="visits", height=360)
chart
`;export{t as default};
