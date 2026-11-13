import hmplot as hm

shapes = {
    "type": "FeatureCollection",
    "features": [
        {"type": "Feature", "properties": {},
         "geometry": {"type": "LineString", "coordinates": [[-100, 20], [-40, 50], [10, 45]]}},
        {"type": "Feature", "properties": {},
         "geometry": {"type": "Polygon", "coordinates": [[[40, -30], [120, -30], [80, 30], [40, -30]]]}},
    ],
}
with hm.Plot(coordinates="spherical", projection="mercator", height=300) as plot:
    hm.GeoJSON(fill=None, data=shapes)
plot
