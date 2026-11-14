const e=`import numpy as np
import hmplot as hm

# A smooth bump on a 41 x 41 grid: a Surface draws the grid it is given, one vertex per value.
t = np.linspace(-1, 1, 41)
x, y = np.meshgrid(t, t)
height = np.exp(-3 * (x**2 + y**2))
with hm.Plot(type="3d", height=300, axes3d=True) as plot:
    hm.Surface(height=height)
plot
`;export{e as default};
