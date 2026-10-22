"""Render a drawing sheet from a template and a record, through CADCraft's MCP server.

Agents never draw borders or type title blocks. They supply a record; this script draws the
sheet from the project template and fills every title block, revision and notes field from that
record. A record missing a required field, or notes that would overflow the notes column, is
refused before anything is written.

Usage:
    CADCRAFT_CLI=/path/to/cadcraft-cli python render_sheet.py TEMPLATE.json RECORD.json OUTDIR

Writes OUTDIR/<DWGNO>.dxf, .dwg, .pdf and .png plus manifest.json with SHA-256 digests of the
template, the record and every output, and the CADCraft version that produced them.
"""

from __future__ import annotations

import hashlib
import json
import os
import subprocess
import sys
from decimal import Decimal
from pathlib import Path


class SheetError(Exception):
    """The record or template cannot produce a compliant sheet."""


class Cad:
    """Minimal MCP client for `cadcraft-cli mcp` (headless, stdio)."""

    def __init__(self, cli: str) -> None:
        # The CLI path is the pinned build named by the operator, and arguments are fixed.
        self.p = subprocess.Popen(  # noqa: S603
            [cli, "mcp"],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
        self.n = 0
        self._req(
            "initialize",
            {
                "protocolVersion": "2025-06-18",
                "capabilities": {},
                "clientInfo": {"name": "control-rod", "version": "0"},
            },
        )
        self._send({"jsonrpc": "2.0", "method": "notifications/initialized"})

    def _send(self, msg: dict) -> None:
        if self.p.stdin is None:
            raise SheetError("CADCraft MCP server has no stdin")
        self.p.stdin.write(json.dumps(msg) + "\n")
        self.p.stdin.flush()

    def _req(self, method: str, params: dict) -> dict:
        self.n += 1
        self._send({"jsonrpc": "2.0", "id": self.n, "method": method, "params": params})
        if self.p.stdout is None:
            raise SheetError("CADCraft MCP server has no stdout")
        while True:
            line = self.p.stdout.readline()
            if not line:
                raise SheetError("CADCraft MCP server closed the connection")
            msg = json.loads(line)
            if msg.get("id") == self.n:
                if "error" in msg:
                    raise SheetError(f"{method}: {msg['error']}")
                return msg["result"]

    def tool(self, name: str, args: dict):
        res = self._req("tools/call", {"name": name, "arguments": args})
        text = "".join(c.get("text", "") for c in res.get("content", []) if c.get("type") == "text")
        if res.get("isError"):
            raise SheetError(f"{name} {json.dumps(args)[:160]}: {text[:300]}")
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            return text

    def ex(self, command: str, params: dict):
        return self.tool("execute", {"command": command, "params": params})

    def close(self) -> None:
        self.p.terminate()


def d(x: str) -> float:
    """Template values are decimal strings; CAD coordinates take floats."""
    return float(Decimal(x))


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def check_record(tpl: dict, rec: dict) -> None:
    tags = [c["tag"] for row in tpl["titleBlock"]["rows"] for c in row["cells"]]
    tb = rec.get("titleBlock", {})
    missing = [t for t in tags if not str(tb.get(t, "")).strip()]
    unknown = [t for t in tb if t not in tags]
    if missing or unknown:
        raise SheetError(f"title block fields missing {missing} or unknown {unknown}")
    stem = tb["DWGNO"]
    if (
        not isinstance(stem, str)
        or any(c in stem for c in '/\\:<>"|?*')
        or any(ord(c) < 32 for c in stem)
        or stem.endswith((".", " "))
    ):
        raise SheetError("drawing number must be a safe filename without path separators")
    if not rec.get("revisions"):
        raise SheetError("revision block needs at least one revision")
    keys = [s["key"] for s in tpl["notes"]["sections"]]
    notes = rec.get("notes", {})
    if not isinstance(notes, dict):
        raise SheetError("notes must be an object containing every template section")
    missing = [k for k in keys if k not in notes]
    extra = [k for k in notes if k not in keys]
    if missing or extra:
        raise SheetError(f"notes sections missing {missing} or unknown {extra}")
    for key, items in notes.items():
        if not isinstance(items, list) or any(
            not isinstance(t, str) or not t.strip() for t in items
        ):
            raise SheetError(f"notes {key}: supply a list of nonblank strings or [] for none")


class Metrics:
    """Text widths from the template's TrueType font, calibrated against CADCraft's own layout.

    CADCraft's drawing extents ignore MTEXT word wrap, so wrapping is done here and every line
    is passed as an explicit paragraph. Single-line extents are exact and set the scale.
    """

    def __init__(self, cli: str, font: str) -> None:
        from PIL import ImageFont  # Pillow, HPND licence

        # fc-match is resolved from PATH on purpose: it is the system font lookup.
        lookup = ["fc-match", "-f", "%{file}", font]
        path = subprocess.run(lookup, capture_output=True, text=True).stdout.strip()  # noqa: S603, S607
        if not path:
            raise SheetError(f"font {font!r} not found")
        self.face = ImageFont.truetype(path, 1000)
        probe = "ABCDEFGHIJKLM 0123456789"
        cad = Cad(cli)
        try:
            cad.tool("new_drawing", {})
            cad.ex("style", {"name": "Standard", "font": font, "current": True})
            cad.ex("text", {"at": [0, 0], "text": probe, "height": 1.0})
            (x0, _), (x1, _) = cad.tool("inspect_drawing", {})["extents"]
        finally:
            cad.close()
        self.k = (x1 - x0) / (self.face.getlength(probe) / 1000)

    def width(self, text: str, height: float) -> float:
        return self.face.getlength(text) / 1000 * height * self.k

    def wrap(self, text: str, height: float, width: float, indent: str = "") -> list[str]:
        lines, cur = [], ""
        for word in text.split():
            trial = f"{cur} {word}".strip()
            if cur and self.width(trial, height) > width:
                lines.append(cur)
                cur = indent + word
            else:
                cur = trial if not cur else f"{cur} {word}"
        if cur:
            lines.append(cur)
        if any(self.width(line, height) > width for line in lines):
            raise SheetError(f"a word in {text[:40]!r} is wider than its column")
        return lines


def fits(metrics: Metrics, text: str, height: float, room: float, where: str) -> None:
    if metrics.width(text, height) > room:
        raise SheetError(f"{where}: {text!r} does not fit; shorten it or change the template")


def notes_mtext(metrics: Metrics, items: list[str], height: float, width: float) -> str:
    lines: list[str] = []
    for i, t in enumerate(items, 1):
        lines += metrics.wrap(f"{i}. {t}", height, width, indent="    ")
    return "\\P".join(lines)


def measure(cli: str, font: str, text: str, height: float, width: float) -> float:
    """Height of an MTEXT paragraph as CADCraft lays it out, measured in a scratch session."""
    cad = Cad(cli)
    try:
        cad.tool("new_drawing", {})
        cad.ex("style", {"name": "Standard", "font": font, "current": True})
        cad.ex("mtext", {"at": [0, 0], "text": text, "height": height, "width": width})
        (x0, y0), (x1, y1) = cad.tool("inspect_drawing", {})["extents"]
        return y1 - y0
    finally:
        cad.close()


def render(cli: str, tpl: dict, rec: dict, outdir: Path) -> dict:
    check_record(tpl, rec)
    W, H, m = (d(tpl["sheet"][k]) for k in ("width", "height", "margin"))
    cw = d(tpl["rightColumn"]["width"])
    font = tpl["font"]
    rb, tbk, nt = tpl["revisionBlock"], tpl["titleBlock"], tpl["notes"]
    cx = W - m - cw  # left edge of the right column
    tb_top = m + d(tbk["height"])
    rb_bottom = H - m - d(rb["height"])

    # Lay out the notes column first, so an overflow refuses the sheet before anything is drawn.
    pad, gap = d(nt["padding"]), d(nt["gap"])
    hh, th = d(nt["headingHeight"]), d(nt["textHeight"])
    width = cw - 2 * pad
    metrics = Metrics(cli, font)
    for row in tbk["rows"]:
        for c in row["cells"]:
            fits(
                metrics,
                str(rec["titleBlock"][c["tag"]]),
                d(c["h"]),
                d(c["w"]) - 0.16,
                f"title block {c['tag']}",
            )
    for rev in rec["revisions"]:
        for col in rb["columns"]:
            fits(
                metrics,
                str(rev.get(col["header"], "")),
                d(rb["textHeight"]),
                d(col["width"]) - 0.12,
                f"revision {col['header']}",
            )
    blocks = []
    for s in nt["sections"]:
        items = rec.get("notes", {}).get(s["key"]) or ["NONE."]
        body = notes_mtext(metrics, items, th, width)
        blocks.append((s["heading"], body, measure(cli, font, body, th, width * 2)))
    need = sum(hh * 1.6 + b + gap for _, _, b in blocks)
    have = rb_bottom - tb_top - 2 * pad
    if need > have:
        raise SheetError(
            f"notes need {need:.2f} in and the column has {have:.2f} in; "
            "move notes to a notes sheet"
        )

    cad = Cad(cli)
    try:
        cad.tool("new_drawing", {})
        cad.ex("units", {"lunits": 2, "luprec": 3, "insunits": 1})
        cad.ex("style", {"name": "Standard", "font": font, "current": True})

        # Border and zones (numbers rise right to left, letters bottom to top).
        cad.ex("rectang", {"p1": [0, 0], "p2": [W, H]})
        cad.ex("rectang", {"p1": [m, m], "p2": [W - m, H - m]})
        z = tpl["zones"]
        cols, rows, zh = z["columns"], z["rows"], d(z["labelHeight"])
        for i in range(1, cols):
            x = m + (W - 2 * m) * i / cols
            cad.ex("line", {"points": [[x, 0], [x, m]]})
            cad.ex("line", {"points": [[x, H - m], [x, H]]})
        for j in range(1, rows):
            y = m + (H - 2 * m) * j / rows
            cad.ex("line", {"points": [[0, y], [m, y]]})
            cad.ex("line", {"points": [[W - m, y], [W, y]]})
        for i in range(cols):
            x = m + (W - 2 * m) * (i + 0.5) / cols
            label = str(cols - i)
            for y in (m / 2, H - m / 2):
                cad.ex("text", {"at": [x, y], "text": label, "height": zh, "justify": "MC"})
        for j in range(rows):
            y = m + (H - 2 * m) * (j + 0.5) / rows
            for x in (m / 2, W - m / 2):
                cad.ex(
                    "text",
                    {"at": [x, y], "text": z["rowLetters"][j], "height": zh, "justify": "MC"},
                )

        # Right column: one vertical rule from the bottom border to the top border.
        cad.ex("line", {"points": [[cx, m], [cx, H - m]]})

        # Revision block at the top of the column.
        rh, rth = d(rb["rowHeight"]), d(rb["textHeight"])
        cad.ex("line", {"points": [[cx, rb_bottom], [W - m, rb_bottom]]})
        y_head = H - m - rh
        cad.ex("line", {"points": [[cx, y_head], [W - m, y_head]]})
        x = cx
        for col in rb["columns"]:
            cad.ex(
                "text",
                {
                    "at": [x + d(col["width"]) / 2, y_head + rh / 2],
                    "text": col["header"],
                    "height": rth,
                    "justify": "MC",
                },
            )
            x += d(col["width"])
            if x < W - m - 1e-9:
                cad.ex("line", {"points": [[x, rb_bottom], [x, H - m]]})
        slots = int((y_head - rb_bottom) / rh + 1e-9)
        if len(rec["revisions"]) > slots:
            raise SheetError(
                f"{len(rec['revisions'])} revisions and the revision block holds {slots}"
            )
        for k in range(1, slots):
            cad.ex("line", {"points": [[cx, y_head - k * rh], [W - m, y_head - k * rh]]})
        y = y_head
        for rev in rec["revisions"]:
            y -= rh
            x = cx
            for col in rb["columns"]:
                cad.ex(
                    "text",
                    {
                        "at": [x + 0.06, y + rh / 2],
                        "text": str(rev.get(col["header"], "")),
                        "height": rth,
                        "justify": "ML",
                    },
                )
                x += d(col["width"])

        # Title block: geometry and attribute definitions become one block, inserted with values.
        made: list[str] = []

        def keep(r):
            if isinstance(r, dict) and "handle" in r:
                made.append(r["handle"])

        keep(cad.ex("line", {"points": [[cx, tb_top], [W - m, tb_top]]}))
        lh = d(tbk["labelHeight"])
        for row in tbk["rows"]:
            bottom, top = m + d(row["bottom"]), m + d(row["top"])
            keep(cad.ex("line", {"points": [[cx, bottom], [W - m, bottom]]}))
            for c in row["cells"]:
                x0 = cx + d(c["x"])
                if d(c["x"]) > 0:
                    keep(cad.ex("line", {"points": [[x0, bottom], [x0, top]]}))
                keep(
                    cad.ex(
                        "text",
                        {
                            "at": [x0 + 0.05, top - 0.05],
                            "text": c["label"],
                            "height": lh,
                            "justify": "TL",
                        },
                    )
                )
                keep(
                    cad.ex(
                        "attdef",
                        {
                            "tag": c["tag"],
                            "prompt": c["label"],
                            "default": "-",
                            "at": [x0 + 0.08, bottom + 0.12],
                            "height": d(c["h"]),
                        },
                    )
                )
        cad.ex("block", {"name": tbk["block"], "base": [cx, m], "handles": made, "keep": "delete"})
        cad.ex("insert", {"name": tbk["block"], "at": [cx, m], "attribs": rec["titleBlock"]})

        # Notes column between the revision block and the title block.
        y = rb_bottom - pad
        for heading, body, bh in blocks:
            cad.ex("text", {"at": [cx + pad, y], "text": heading, "height": hh, "justify": "TL"})
            y -= hh * 1.6
            cad.ex("mtext", {"at": [cx + pad, y], "text": body, "height": th, "width": width * 2})
            y -= bh + gap

        outdir.mkdir(parents=True, exist_ok=True)
        stem = rec["titleBlock"]["DWGNO"]
        outs = {ext: outdir / f"{stem}.{ext}" for ext in ("dxf", "dwg", "png")}
        for ext in ("dxf", "dwg", "png"):
            cad.tool("save", {"path": str(outs[ext])})
        outs["pdf"] = outdir / f"{stem}.pdf"
        cad.ex(
            "plot",
            {
                "path": str(outs["pdf"]),
                "layout": "Model",
                "paper": tpl["sheet"]["name"],
                "landscape": True,
                "scale": 1,
                "plotArea": "extents",
                "lineweights": True,
            },
        )
    finally:
        cad.close()

    ask = [cli, "--version"]
    version = subprocess.run(ask, capture_output=True, text=True).stdout.strip()  # noqa: S603
    return {
        "tool": version,
        "outputs": {k: {"path": v.name, "sha256": sha256(v)} for k, v in outs.items()},
    }


def main(argv: list[str]) -> int:
    if len(argv) != 4:
        print(__doc__)
        return 2
    cli = os.environ.get("CADCRAFT_CLI", "cadcraft-cli")
    tpath, rpath, outdir = Path(argv[1]), Path(argv[2]), Path(argv[3])
    tpl, rec = json.loads(tpath.read_text()), json.loads(rpath.read_text())
    try:
        result = render(cli, tpl, rec, outdir)
    except SheetError as e:
        print(f"refused: {e}", file=sys.stderr)
        return 1
    manifest = {
        "template": {"path": tpath.name, "sha256": sha256(tpath)},
        "record": {"path": rpath.name, "sha256": sha256(rpath)},
        **result,
    }
    (outdir / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print(json.dumps(manifest, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
