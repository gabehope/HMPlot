"""The defaults gallery (TODO 136.17): each chart drawn headlessly with HMPlot's defaults, then

- checked: no errors or lints (hm.check), no text outside the canvas or over other text, not
  blank, and no Cartesian axes on a polar or globe chart;
- compared with its baseline PNG (baselines/, drawn by SwiftShader on Linux; other GPUs and
  fonts will not match them): more than 0.5% of the pixels changed (each matched within 4 px of
  where it was) fails, so a defaults change is seen and its baselines redrawn on purpose.

Run with `npm run gallery` after `npm run build:python` (Chrome with WebGPU; HMPLOT_CHROME names
one). `npm run gallery:update` redraws the baselines. out/index.html shows each chart beside its
baseline. The gate does not run it.
"""

import base64
import os

import pytest

import hmplot as hm
from charts import CHARTS
from conftest import HERE, OUT, RESULTS

BASELINES = HERE / "baselines"
CHANGED = 0.005

# Each <text> drawn in the SVG export, laid out by the browser: its box in the SVG's pixels.
TEXT_BOXES = """svg => {
  const host = document.createElement("div");
  host.style.cssText = "position:absolute;left:0;top:0";
  host.innerHTML = svg;
  document.body.append(host);
  const root = host.querySelector("svg"), frame = root.getBoundingClientRect();
  const texts = [...root.querySelectorAll("text")].flatMap((node) => {
    const box = node.getBoundingClientRect(), text = node.textContent.trim();
    if (!text || box.width === 0 || getComputedStyle(node).visibility === "hidden") return [];
    return [{ text, left: box.left - frame.left, top: box.top - frame.top,
              right: box.right - frame.left, bottom: box.bottom - frame.top }];
  });
  const cartesian = root.querySelectorAll(".x-tick, .y-tick").length;
  host.remove();
  return { width: frame.width, height: frame.height, texts, cartesian };
}"""

# The share of pixels that differ (by more than 32 in a channel) between two PNGs; 1 when their
# sizes differ. `blank`: the share of pixels that differ from the first one.
PIXELS = """async ({ drawn, baseline }) => {
  const SHIFT = 4;
  const read = async (png) => {
    const image = await createImageBitmap(await (await fetch("data:image/png;base64," + png)).blob());
    const canvas = new OffscreenCanvas(image.width, image.height), context = canvas.getContext("2d");
    context.drawImage(image, 0, 0);
    return context.getImageData(0, 0, image.width, image.height);
  };
  const a = await read(drawn), count = a.width * a.height;
  const near = (p, q, i, j) => Math.max(...[0, 1, 2, 3].map((c) => Math.abs(p.data[i + c] - q.data[j + c]))) <= 32;
  let inked = 0;
  for (let i = 0; i < a.data.length; i += 4) if (!near(a, a, i, 0)) inked++;
  if (!baseline) return { blank: inked / count, changed: null };
  const b = await read(baseline);
  if (b.width !== a.width || b.height !== a.height) return { blank: inked / count, changed: 1 };
  // A pixel matches when the baseline has it at most SHIFT pixels away: the plot area's edge
  // still moves by a few pixels between draws (TODO 136.17's note), which is not a change.
  let changed = 0;
  for (let y = 0; y < a.height; y++)
    for (let x = 0; x < a.width; x++) {
      const i = 4 * (y * a.width + x);
      let match = false;
      for (let dy = -SHIFT; dy <= SHIFT && !match; dy++)
        for (let dx = -SHIFT; dx <= SHIFT && !match; dx++) {
          const u = x + dx, v = y + dy;
          match = u >= 0 && v >= 0 && u < a.width && v < a.height && near(a, b, i, 4 * (v * a.width + u));
        }
      if (!match) changed++;
    }
  return { blank: inked / count, changed: changed / count };
}"""


def overlapping(texts):
    """Pairs of texts whose glyphs overlap: their boxes, less the line's spacing above and below
    (a quarter of its height each), overlap by more than a pixel each way."""
    pairs = []
    core = lambda t: (t["top"] + (t["bottom"] - t["top"]) / 4, t["bottom"] - (t["bottom"] - t["top"]) / 4)
    for i, a in enumerate(texts):
        for b in texts[i + 1:]:
            (a0, a1), (b0, b1) = core(a), core(b)
            if min(a["right"], b["right"]) - max(a["left"], b["left"]) > 1 and min(a1, b1) - max(a0, b0) > 1:
                pairs.append(f'"{a["text"]}" and "{b["text"]}"')
    return pairs


def draw(chart, session, update):
    """What each check found, by check: a list of problems (empty when it passes)."""
    plot = chart.build()
    result = hm.check(plot, session=session)
    found = {"errors": result.errors, "lints": result.lints}
    if result.png is None:  # it did not validate or mount: its errors say why
        return found
    layout = session.page.evaluate(TEXT_BOXES, session.svg(plot).decode())
    found["text outside"] = [f'"{t["text"]}"' for t in layout["texts"]
                             if t["left"] < -1 or t["top"] < -1 or
                             t["right"] > layout["width"] + 1 or t["bottom"] > layout["height"] + 1]
    found["text overlaps"] = overlapping(layout["texts"])
    found["cartesian axes"] = ["a polar or globe chart draws Cartesian ticks"] if chart.curved and layout["cartesian"] else []
    baseline = BASELINES / f"{chart.name}.png"
    pixels = session.page.evaluate(PIXELS, {
        "drawn": base64.b64encode(result.png).decode(),
        "baseline": None if update or not baseline.exists() else base64.b64encode(baseline.read_bytes()).decode()})
    found["blank"] = ["draws almost nothing"] if pixels["blank"] < 0.01 else []
    found["baseline"] = ([] if update else ["no baseline: run npm run gallery:update"]) if pixels["changed"] is None else \
        [f"{pixels['changed']:.1%} of the pixels changed"] if pixels["changed"] > CHANGED else []
    OUT.mkdir(exist_ok=True)
    (OUT / f"{chart.name}.png").write_bytes(result.png)
    if update:
        BASELINES.mkdir(exist_ok=True)
        baseline.write_bytes(result.png)
    return found


@pytest.mark.parametrize("chart", CHARTS, ids=[chart.name for chart in CHARTS])
def test_chart(chart, session):
    update = os.environ.get("HMPLOT_GALLERY_UPDATE", "").strip() not in ("", "0")
    found = draw(chart, session, update)
    problems = [f"{check}: {problem}" for check, items in found.items() for problem in items]
    RESULTS[chart.name] = {"problems": problems, "covers": chart.covers}
    # A known problem is a check's problem containing the known text; any other fails.
    known = {(check, text): item for check, (text, item) in chart.known.items()}
    hit = {key for key in known if any(key[1] in problem for problem in found.get(key[0], []))}
    fixed = [f"{check} no longer finds {text!r}: TODO {known[(check, text)]} can close; remove it from the chart's known"
             for check, text in known.keys() - hit]
    assert not fixed, "\n".join(fixed)
    unknown = [f"{check}: {problem}" for check, items in found.items() for problem in items
               if not any(check == c and text in problem for c, text in hit)]
    assert not unknown, "\n".join(unknown)
    if hit:
        pytest.xfail("; ".join(f"{check}: TODO {known[(check, text)]}" for check, text in hit))
