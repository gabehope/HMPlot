"""Regions on a map (a choropleth)
GeoJSON draws features in a spherical Plot, colored by a property; the map frames its features."""
import hmplot as hm

def region(value, ring):
    return {"type": "Feature", "properties": {"value": value}, "geometry": {"type": "Polygon", "coordinates": [ring]}}

regions = {"type": "FeatureCollection", "features": [
    region(3, [[-10, 36], [3, 36], [3, 44], [-10, 44], [-10, 36]]),
    region(7, [[3, 42], [8, 42], [8, 51], [3, 51], [3, 42]]),
    region(5, [[6, 47], [15, 47], [15, 55], [6, 55], [6, 47]])]}

with hm.Plot(coordinates="spherical", projection="mercator", height=340) as chart:
    shapes = hm.GeoJSON(data=regions, fill="value")
    hm.Legend(target=shapes, channel="fill", label="Value", position="right")
chart
