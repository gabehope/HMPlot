import hmplot as hm


def polygon(value, ring):
    return {
        "type": "Feature",
        "properties": {"value": value},
        "geometry": {"type": "Polygon", "coordinates": [ring]},
    }


regions = {
    "type": "FeatureCollection",
    "features": [
        polygon(1, [[-120, 20], [-70, 20], [-70, 55], [-120, 55], [-120, 20]]),
        polygon(2, [[-10, 35], [40, 35], [40, 65], [-10, 65], [-10, 35]]),
        polygon(3, [[110, -40], [155, -40], [130, -10], [110, -40]]),
    ],
}
with hm.Plot(coordinates="spherical", projection="mercator", height=300) as plot:
    hm.GeoJSON(data=regions, fill="value")
plot
