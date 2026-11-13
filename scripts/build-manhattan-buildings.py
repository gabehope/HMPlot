"""Rebuild the Manhattan flyover fixture from NYC Open Data.

Usage: python scripts/build-manhattan-buildings.py [--all] /tmp/manhattan-buildings-{0,10000,...}.json
The input pages are the Socrata BUILDING records selected and ordered below. The repository keeps
the first 10,000 buildings of the seeded shuffle, the ones the example draws (4 MB; R1.4); --all
writes every one of the 45,194 (19 MB), for BUILDINGS = 45_194 in the example.
"""

import json
import math
import random
import sys
from pathlib import Path

SOURCE = "https://data.cityofnewyork.us/resource/5zhs-2jue.json"
OUTPUT = Path(__file__).resolve().parents[1] / "src/examples/manhattan-flyover/manhattan-buildings.json"
LONGITUDE_FACTOR = 111320 * math.cos(math.radians(40.72)) * 0.004
LATITUDE_FACTOR = 111320 * 0.004
KEPT = 10_000


def project(coordinates):
    if len(coordinates) >= 2 and isinstance(coordinates[0], (int, float)):
        return [
            round((coordinates[0] + 73.95) * LONGITUDE_FACTOR, 4),
            round((coordinates[1] - 40.72) * LATITUDE_FACTOR, 4),
        ]
    return [project(part) for part in coordinates]


def main(paths):
    everything = "--all" in paths
    paths = [path for path in paths if path != "--all"]
    if not paths:
        raise SystemExit("Pass the downloaded Socrata JSON pages as arguments.")
    records = [record for path in paths for record in json.loads(Path(path).read_text())]
    features = []
    seen = set()
    for record in records:
        building_id = record.get("bin")
        geometry = record.get("the_geom")
        if building_id is None or not geometry:
            continue
        if building_id in seen:
            raise ValueError(f"Duplicate BIN {building_id}; check pagination/order")
        seen.add(building_id)
        roof_feet = float(record.get("height_roof") or 0)
        if not math.isfinite(roof_feet) or roof_feet < 0:
            roof_feet = 0
        features.append({
            "type": "Feature",
            "id": building_id,
            "properties": {
                "name": record.get("name") or f"Building {building_id}",
                "height": round(roof_feet * 0.3048 * 0.004, 5),
                "roofFeet": roof_feet,
            },
            "geometry": {
                "type": geometry["type"],
                "coordinates": project(geometry["coordinates"]),
            },
        })
    # A prefix of the limit control should cover the island rather than one
    # contiguous run of building IDs.
    random.Random(42).shuffle(features)
    if not everything:
        features = features[:KEPT]
    OUTPUT.write_text(json.dumps({"type": "FeatureCollection", "features": features}, separators=(",", ":")))
    print(f"Wrote {len(features):,} of {len(seen):,} Manhattan buildings to {OUTPUT}")


if __name__ == "__main__":
    main(sys.argv[1:])
