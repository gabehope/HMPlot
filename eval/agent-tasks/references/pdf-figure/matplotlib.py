from pathlib import Path
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import pandas as pd

matplotlib.rcParams["svg.fonttype"] = "none"
frame = pd.read_csv("data/trial.csv")
fig, (left, right) = plt.subplots(1, 2, figsize=(180 / 25.4, 80 / 25.4))
fig.subplots_adjust(left=.09, right=.98, bottom=.31, top=.86, wspace=.32)
for group, rows in frame.groupby("group"):
    summary = rows.groupby("day").response.agg(["mean", "std"])
    left.plot(summary.index, summary["mean"], label=group)
    left.fill_between(summary.index, summary["mean"] - summary["std"],
                      summary["mean"] + summary["std"], alpha=.15)
    last = rows[rows.day == 28]
    right.scatter(last.baseline, last.response, s=9, label=group)
left.set(xlabel="Day", ylabel="Response")
right.set(xlabel="Baseline", ylabel="Response at day 28")
left.text(-.12, 1.05, "a", transform=left.transAxes, fontweight="bold")
right.text(-.12, 1.05, "b", transform=right.transAxes, fontweight="bold")
fig.legend(loc="lower center", bbox_to_anchor=(.5, .03), ncol=3,
           labels=["High dose", "Low dose", "Placebo"])
fig.savefig("output/figure.pdf")
fig.savefig("output/chart.svg")
Path("output/chart.html").write_text("<!doctype html><meta charset='utf-8'><title>Trial</title>" +
                                      Path("output/chart.svg").read_text())
