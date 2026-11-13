"""Reference: numeric day coordinates avoid mixing datetime origins in reductions."""
from pathlib import Path
import pandas as pd
import hmplot as hm

Path("output").mkdir(exist_ok=True)
frame = pd.read_csv("data/stocks.csv", parse_dates=["date"]).sort_values(["ticker", "date"])
origin = frame.date.min()
frame["day"] = (frame.date - origin).dt.days.astype(float)
frame["date_label"] = frame.date.dt.strftime("%Y-%m-%d")
tickers = sorted(frame.ticker.unique())
colors = hm.categorical(domain=tickers, range=["#3477b4", "#df7253", "#52997a", "#9175b0"])
limits = [-3, float(frame.day.max()) + 30]
base = hm.input.base_day
base_price = hm.last("close", by="ticker", where=hm.col.day <= base, order_by="day")
with hm.Scene(gap=10) as chart:
    with hm.Theme(value=hm.create_theme(axes={"marginLeft": 100, "marginRight": 30})):
        hm.Slider(name="base_day", label="Base date · move over either panel, or scrub here",
                  min=0, max=float(frame.day.max()), step=1, value=0)
        with hm.Data(frame):
            with hm.Plot(title="Growth of 100", height=400,
                         x={"domain": limits, "label": "Date · days since " + origin.strftime("%Y-%m-%d")},
                         y={"label": "Indexed price"}) as growth:
                with hm.Calculate(columns={"indexed": 100 * hm.col.close / base_price}):
                    line = hm.Line(x="day", y="indexed", series="ticker", color="ticker",
                                   color_scale=colors, width=2.3, tooltip=["ticker", "date_label", "indexed"])
                    with hm.Filter(where=hm.col.day == hm.max("day")):
                        hm.Text(x="day", y="indexed", text="indexed", format=".0f",
                                color="ticker", color_scale=colors, dx=8, align="left", size=12)
                hm.charts.RuleX(x=base, color="#607085", width=1)
                hm.Legend(target=line, channel="color", label="Ticker", position="bottom")
            with hm.Plot(title="Daily volume", height=250,
                         x={"domain": limits, "label": "Date · days since " + origin.strftime("%Y-%m-%d")},
                         y={"label": "Shares traded"}) as volume:
                hm.charts.Bar(x="day", y="volume", fill="ticker", fill_scale=colors,
                              orientation="vertical", arrange="stack", band_fraction=0.9,
                              tooltip=["ticker", "date_label", "volume"], legend=False)
                hm.charts.RuleX(x=base, color="#607085", width=1)
        hm.LinkViews(growth, volume, axes="x")
hm.export_html(chart, "output/chart.html")

# LinkViews currently links navigation, not pointer state. This small standalone
# adapter writes the shared native input using the displayed x ticks, so it also
# follows zoom/pan. All rebasing and rendering remain HMPlot expressions.
path = Path("output/chart.html")
adapter = r'''<script>
document.addEventListener('pointermove', event => {
  const plot = event.target.closest('.canvas');
  if (!plot) return;
  const ticks = [...plot.querySelectorAll('.x-tick[data-value]')].map(tick => {
    const point = new DOMPoint(0, 0).matrixTransform(tick.getScreenCTM());
    return {x: point.x, value: Number(tick.dataset.value)};
  }).filter(t => Number.isFinite(t.value)).sort((a,b) => a.x-b.x);
  if (ticks.length < 2) return;
  const a=ticks[0], b=ticks.at(-1), input=document.querySelector('input[type=range]');
  if (!input || b.x===a.x) return;
  const value=Math.round(a.value+(event.clientX-a.x)*(b.value-a.value)/(b.x-a.x));
  const next=Math.max(Number(input.min),Math.min(Number(input.max),value));
  if (Number(input.value)!==next) {input.value=next;input.dispatchEvent(new Event('input',{bubbles:true}));}
});
</script>'''
before, after = path.read_text().rsplit("</body>", 1)
path.write_text(before + adapter + "</body>" + after)
