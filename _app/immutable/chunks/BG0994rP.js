const t=`import hmplot as hm

with hm.Plot(type="3d", height=300, axes3d=True) as plot:
    hm.Text3D(text="Hello", position=[0, 0.4, 0], size=10)
    hm.Text3D(text=r"e^{i\\pi} + 1 = 0", tex=True, position=[0, -0.4, 0], size=10)
plot
`;export{t as default};
