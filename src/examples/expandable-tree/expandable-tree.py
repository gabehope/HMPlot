import hmplot as hm

nodes = dict(id=list(range(9)),
             name=["Studio", "Design", "Engineering", "Brand", "Digital", "Platform", "Experience", "Type", "Identity"],
             level=[0,1,1,2,2,2,2,3,3], under0=[0, 1, 1, 1, 1, 1, 1, 1, 1], under1=[0, 0, 0, 1, 1, 0, 0, 1, 1],
             under2=[0, 0, 0, 0, 0, 1, 1, 0, 0], under3=[0, 0, 0, 0, 0, 0, 0, 1, 1])
edges = dict(source=[0, 0, 1, 1, 2, 2, 3, 3], target=[1, 2, 3, 4, 5, 6, 7, 8],length=[1,1.3,.9,1.1,.8,1.2,1,1])
c = hm.col
# Selection stores collapsed branches; calculate visibility before filtering rows.
visible = hm.literal(True)
for branch in (0, 1, 2, 3):
    collapsed = hm.sum(hm.where(c.id == branch, hm.view.selected, 0)) > 0
    visible = visible & ~(c[f"under{branch}"] & collapsed)


with hm.Scene(gap=12) as scene:
    hm.Markdown("Shift-click a branch to collapse or expand it. A plain click collapses one branch; "
                "click the background to expand all. The depth control filters nodes and links. "
                "Branch widths and edge lengths shrink and grow together as the tree reflows.")
    with hm.Row(wrap=True, min_width=0, gap=20):
        hm.Slider(name="depth", label="Visible depth", min=0, max=3, step=1, value=3)
        hm.Select(name="orientation", label="Orientation", options=["down", "right", "up", "left"])
    with hm.Plot(data=edges, responsive=True, height=480, axes2d=False):
        with hm.GraphData(nodes=nodes, edges=edges, node_key="id", source="source", target="target"):
            with hm.Tree(root=0, directed=True, orientation=hm.input.orientation, mode="tidy-approx", edge_length="length", where=visible & (c.level <= hm.input.depth), enter=dict(node_width=0,edge_length=0), exit=dict(node_width=0,edge_length=0), animation_duration=600):
                with hm.Nodes():
                    with hm.Filter(where=c.depth > 0):
                        hm.Segments(start="parentPosition",
                                    end="position",opacity="presence",
                                    color="#a6afba", width=2)
                    hm.Points(x="x", y="y", size=hm.where(hm.view.selected, 20, 16),
                              fill="#4368ca",
                              opacity="presence", select=True, respond=False, tooltip=["name", "depth"])
                    hm.Text(x="x", y="y", opacity="presence", text="name", dy=-21, size=13)
scene
