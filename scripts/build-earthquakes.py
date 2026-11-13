#!/usr/bin/env python3
"""Build static/data/earthquakes/usgs-m45-2015-2024.csv from the USGS earthquake catalog.

Downloads every event of magnitude >= 4.5 from 2015-01-01 to 2025-01-01 (UTC) through the
USGS FDSN event web service, one calendar year per request (the service caps a query at
20,000 events), and writes a compact CSV with the columns the gallery example uses:

    year   decimal year of the origin time (e.g. 2024.0021)
    lat    latitude, degrees, 2 decimals
    lon    longitude, degrees, 2 decimals
    depth  hypocenter depth, km, 1 decimal
    mag    magnitude (any magType), 1 decimal

Rows are sorted by time. Only type == "earthquake" is kept (quarry blasts and explosions are
dropped). USGS catalog data is in the public domain; see the .source.md next to the output.

It then splits that file into static/data/earthquakes/by-year/YYYY.csv (month, lat, lon, depth,
mag; month is 1-13, the fraction of the year times 12 plus 1), which the "provider-earthquakes"
gallery example loads one year at a time.

Usage: python3 scripts/build-earthquakes.py [--split-only]   (--split-only: no download)
"""
import csv
import io
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

URL = ("https://earthquake.usgs.gov/fdsnws/event/1/query?format=csv&minmagnitude=4.5"
       "&orderby=time-asc&starttime={start}&endtime={end}")
OUT = Path(__file__).resolve().parent.parent / "static/data/earthquakes/usgs-m45-2015-2024.csv"
BY_YEAR = OUT.parent / "by-year"


def decimal_year(stamp):
    t = datetime.fromisoformat(stamp.replace("Z", "+00:00"))
    start = datetime(t.year, 1, 1, tzinfo=timezone.utc)
    end = datetime(t.year + 1, 1, 1, tzinfo=timezone.utc)
    return t.year + (t - start).total_seconds() / (end - start).total_seconds()


def main():
    rows = []
    for year in range(2015, 2025):
        url = URL.format(start=f"{year}-01-01", end=f"{year + 1}-01-01")
        with urllib.request.urlopen(url, timeout=120) as response:
            text = response.read().decode("utf-8")
        events = [e for e in csv.DictReader(io.StringIO(text)) if e["type"] == "earthquake"]
        if len(events) >= 20000:
            raise SystemExit(f"{year}: {len(events)} events hits the service cap; split the query.")
        for e in events:
            if not (e["latitude"] and e["longitude"] and e["depth"] and e["mag"]):
                continue
            rows.append((decimal_year(e["time"]), float(e["latitude"]), float(e["longitude"]),
                         float(e["depth"]), float(e["mag"])))
        print(year, len(events))
    rows.sort()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    with OUT.open("w", newline="") as f:
        f.write("year,lat,lon,depth,mag\n")
        for y, lat, lon, depth, mag in rows:
            f.write(f"{y:.4f},{lat:.2f},{lon:.2f},{depth:.1f},{mag:.1f}\n")
    print(f"wrote {len(rows)} rows to {OUT}")


def split():
    """One file per calendar year, for loading on demand (TODO 20's Provider example)."""
    years = {}
    with OUT.open() as f:
        for row in csv.DictReader(f):
            year = float(row["year"])
            month = 1 + (year - int(year)) * 12
            years.setdefault(int(year), []).append((month, row["lat"], row["lon"], row["depth"], row["mag"]))
    BY_YEAR.mkdir(parents=True, exist_ok=True)
    for year, rows in sorted(years.items()):
        with (BY_YEAR / f"{year}.csv").open("w", newline="") as f:
            f.write("month,lat,lon,depth,mag\n")
            for month, lat, lon, depth, mag in rows:
                f.write(f"{month:.3f},{lat},{lon},{depth},{mag}\n")
        print(year, len(rows))


if __name__ == "__main__":
    import sys
    if "--split-only" not in sys.argv:
        main()
    split()
