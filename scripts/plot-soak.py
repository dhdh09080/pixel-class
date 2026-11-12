"""Optional QA report tool: python scripts/plot-soak.py INPUT.json OUTPUT.png.

Requires matplotlib; never reads an application DB or credentials.
"""
import json
import statistics
import sys
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt

source, output = map(Path, sys.argv[1:])
report = json.loads(source.read_text())
points = report["checkpoints"]
if not points:
    raise ValueError("The report has no measured checkpoints")
x = [point["elapsedSeconds"] / 60 for point in points]
fig, axes = plt.subplots(3, 1, figsize=(11, 9), sharex=True, layout="constrained")
green = "#355c48"
axes[0].plot(x, [point["serverRssMiB"] for point in points], color=green)
axes[0].set_ylabel("Server RSS (MiB)")
axes[0].set_ylim(bottom=0)
axes[1].step(x, [point["serverSockets"]["active"] for point in points], where="post", color=green)
axes[1].set_ylabel("Sampled active server sockets")
axes[1].set_ylim(0, max(point["serverSockets"]["active"] for point in points) + 2)
heaps = [point["browserHeapMiB"] for point in points]
axes[2].fill_between(x, [min(values) for values in heaps], [max(values) for values in heaps], color="#c8d7bf", label="Range across 6 contexts")
axes[2].plot(x, [statistics.median(values) for values in heaps], color=green, label="Median")
axes[2].set_ylabel("Browser retained JS heap (MiB)")
axes[2].set_ylim(bottom=0)
axes[2].set_xlabel("Real elapsed minutes after warmup")
axes[2].legend(loc="lower right")
axes[2].set_title("Heap measured after explicit test GC; not total browser process memory", fontsize=10)
for axis in axes:
    axis.grid(alpha=0.2)
    for point in points:
        if point["label"] == "after-server-restart":
            axis.axvline(point["elapsedSeconds"] / 60, color="#9e684d", linestyle="--", alpha=0.8, label="Server restart" if axis is axes[0] else None)
if any(point["label"] == "after-server-restart" for point in points):
    axes[0].legend(loc="upper right")
closed = (report.get("serverSocketsAfterContextCleanup") or {}).get("active")
axes[1].set_title(f"After closing all browser contexts: {closed if closed is not None else 'not verified'}", fontsize=10)
status = "PASSED" if report.get("passed") else "INCOMPLETE / FAILED"
duration_kind = "observed seconds" if report.get("completed") is False else "real seconds"
fig.suptitle(f"Pixel Class local 6-context soak: {status}\nSource {report.get('sourceCommit', 'unknown')[:12]} | {report.get('actualSeconds', 'unknown')} {duration_kind}", fontsize=14)
output.parent.mkdir(parents=True, exist_ok=True)
fig.savefig(output, dpi=150)
plt.close(fig)
print(json.dumps({"input": str(source), "output": str(output), "checkpoints": len(points), "passed": report.get("passed")}))
