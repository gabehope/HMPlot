"""Copy canonical JSON themes into the Python wheel source before packaging."""
from pathlib import Path
import shutil

root = Path(__file__).resolve().parents[1]
source = root / "src/lib/plot/themes"
target = root / "python/hmplot/themes"
target.mkdir(parents=True, exist_ok=True)
for path in source.glob("*.json"):
    shutil.copyfile(path, target / path.name)
# Partial themes (TODO 132.7), one file per group.
(target / "partials").mkdir(exist_ok=True)
for path in (source / "partials").glob("*.json"):
    shutil.copyfile(path, target / "partials" / path.name)
