"""Redraw the README's research chart from inputs.json and record digests.

Run: python3 docs/research/second-checker/build.py
Writes docs/assets/readme/second-checker.svg and outputs.json beside this file. Every number in the
chart comes from inputs.json; this script types none.
"""
from __future__ import annotations

import hashlib
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
SVG = ROOT / "docs/assets/readme/second-checker.svg"
FONT = "Inter,Segoe UI,Arial,sans-serif"

inputs_bytes = (HERE / "inputs.json").read_bytes()
data = json.loads(inputs_bytes)
chart = data["chart"]
rows = chart["rows"]
colors = ["#94a3b8", "#ef4444", "#06b6d4"]
W, H = 720, 360
left, right, top, bottom = 64, 24, 72, 70
plot_w, plot_h = W - left - right, H - top - bottom
ymax = 10 * (max(v for r in rows for v in r["values"]) // 10 + 2)
group_w = plot_w / len(rows)
bar_w, gap = 56, 14


def y(v: float) -> float:
    return top + plot_h * (1 - v / ymax)


desc = "; ".join(
    f'{r["domain"]}: ' + ", ".join(f"{s} {v}%" for s, v in zip(chart["series"], r["values"])) for r in rows
)
parts = [
    f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}" role="img" aria-labelledby="t d">',
    f'<title id="t">{chart["title"]}</title>',
    f'<desc id="d">{desc}. Source: {data["sources"][chart["source"]]["url"]}, Table 1.</desc>',
    f'<rect width="{W}" height="{H}" rx="12" fill="#0b1220"/>',
    f'<text x="{left}" y="32" font-family="{FONT}" font-size="18" font-weight="600" fill="#f1f5f9">{chart["title"]}</text>',
    f'<text x="{left}" y="52" font-family="{FONT}" font-size="12" fill="#94a3b8">{chart["unit"]}. Stechly, Valmeekam and Kambhampati (2024), Table 1.</text>',
]
for t in range(0, ymax + 1, 10):
    parts.append(f'<line x1="{left}" x2="{W - right}" y1="{y(t):.1f}" y2="{y(t):.1f}" stroke="#1e293b"/>')
    parts.append(f'<text x="{left - 8}" y="{y(t) + 4:.1f}" text-anchor="end" font-family="{FONT}" font-size="11" fill="#64748b">{t}%</text>')
for gi, r in enumerate(rows):
    total = len(r["values"]) * bar_w + (len(r["values"]) - 1) * gap
    x0 = left + gi * group_w + (group_w - total) / 2
    for si, v in enumerate(r["values"]):
        x = x0 + si * (bar_w + gap)
        parts.append(f'<rect x="{x:.1f}" y="{y(v):.1f}" width="{bar_w}" height="{top + plot_h - y(v):.1f}" rx="3" fill="{colors[si]}"/>')
        parts.append(f'<text x="{x + bar_w / 2:.1f}" y="{y(v) - 6:.1f}" text-anchor="middle" font-family="{FONT}" font-size="13" font-weight="600" fill="#f1f5f9">{v}%</text>')
    parts.append(f'<text x="{x0 + total / 2:.1f}" y="{top + plot_h + 22}" text-anchor="middle" font-family="{FONT}" font-size="13" fill="#cbd5e1">{r["domain"]}</text>')
lx = left
for si, s in enumerate(chart["series"]):
    parts.append(f'<rect x="{lx}" y="{H - 26}" width="12" height="12" rx="2" fill="{colors[si]}"/>')
    parts.append(f'<text x="{lx + 18}" y="{H - 16}" font-family="{FONT}" font-size="12" fill="#cbd5e1">{s}</text>')
    lx += 18 + 8 * len(s) + 28
parts.append("</svg>")
svg = "\n".join(parts) + "\n"
SVG.write_text(svg)

out = {
    "inputs_sha256": hashlib.sha256(inputs_bytes).hexdigest(),
    "svg": str(SVG.relative_to(ROOT)),
    "svg_sha256": hashlib.sha256(svg.encode()).hexdigest(),
    "chart_values": {r["domain"]: dict(zip(chart["series"], r["values"])) for r in rows},
    "facts": data["facts"],
}
(HERE / "outputs.json").write_text(json.dumps(out, indent=2) + "\n")
print(json.dumps(out, indent=2))
