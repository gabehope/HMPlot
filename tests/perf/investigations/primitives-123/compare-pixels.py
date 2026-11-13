"""Compare fixed-time DPR-2 moving-particles captures after timing (Pillow required)."""
import json
import sys
from pathlib import Path
from PIL import Image, ImageChops

records = []
for filename in sys.argv[1:]:
    data = json.loads(Path(filename).read_text())
    shots = [row for row in data["correctness"] if row.get("screenshot") and row["rep"] >= 0]
    for shot in shots:
        if shot["method"] == "sort":
            continue
        baseline = next(row for row in shots if row["method"] == "sort" and row["rep"] == shot["rep"])
        with Image.open(baseline["screenshot"]) as a, Image.open(shot["screenshot"]) as b:
            diff = ImageChops.difference(a.convert("RGB"), b.convert("RGB"))
            pixels = sum(any(pixel) for pixel in diff.getdata())
            records.append({"input": filename, "rep": shot["rep"], "method": shot["method"], "size": a.size, "differentPixels": pixels, "bounds": diff.getbbox()})
print(json.dumps(records, indent=2))
if any(row["differentPixels"] for row in records):
    sys.exit(1)
