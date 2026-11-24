"""Generate deterministic README and landing-page SVG instruments from inputs.json.

Run: python3 docs/research/second-checker/build.py
Writes:
  - docs/assets/readme/second-checker.svg
  - docs/assets/readme/evidence-board.svg
  - docs/assets/readme/council-loop.svg
  - docs/assets/readme/pr-receipt-card.svg
  - docs/assets/readme/workflow-modes.svg
  - docs/research/second-checker/outputs.json

Every empirical research statistic comes from inputs.json; this script types none (AGENTS.md rule 5).
"""

from __future__ import annotations

import hashlib
import html
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
ASSETS = ROOT / "docs" / "assets" / "readme"

SANS = "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif"
MONO = "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"

GROUND = "#06090f"
SURFACE = "#0b111b"
PANEL = "#101926"
LINE = "#1a2739"
LINE_2 = "#2b3f59"
TEXT = "#edf4fc"
TEXT_2 = "#c8d6e5"
MUTED = "#9eb0c4"
ACCENT = "#00f2ff"
ACCENT_DIM = "#0a8b99"
NEEDS = "#ffb020"
STUCK = "#ff6b6b"
DONE = "#22f59e"
IDLE = "#8b9db0"


def esc(val: object) -> str:
    return html.escape(str(val), quote=True)


def corner_ticks(x: float, y: float, w: float, h: float, size: float = 8, color: str = LINE_2) -> str:
    return "\n".join(
        [
            f'<path d="M{x},{y + size} V{y} H{x + size}" fill="none" stroke="{color}" stroke-width="1.5"/>',
            f'<path d="M{x + w - size},{y} H{x + w} V{y + size}" fill="none" stroke="{color}" stroke-width="1.5"/>',
            f'<path d="M{x},{y + h - size} V{y + h} H{x + size}" fill="none" stroke="{color}" stroke-width="1.5"/>',
            f'<path d="M{x + w - size},{y + h} H{x + w} V{y + h - size}" fill="none" stroke="{color}" stroke-width="1.5"/>',
        ]
    )


def build_second_checker_svg(data: dict) -> str:
    chart = data["chart"]
    bw = data["facts"]["stechly_blocksworld"]
    rows = list(chart["rows"]) + [
        {
            "domain": "Blocksworld planning",
            "values": [bw["standard"], bw["self_check"], bw["outside_checker_binary"]],
        }
    ]
    colors = [IDLE, STUCK, ACCENT]
    W, H = 920, 400
    left, right, top, bottom = 74, 36, 92, 82
    plot_w, plot_h = W - left - right, H - top - bottom
    ymax = 70
    group_w = plot_w / len(rows)
    bar_w, gap = 54, 14

    def y(v: float) -> float:
        return top + plot_h * (1 - v / ymax)

    desc = "; ".join(
        f'{r["domain"]}: ' + ", ".join(f"{s} {v}%" for s, v in zip(chart["series"], r["values"]))
        for r in rows
    )
    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}" role="img" aria-labelledby="sc-t sc-d">',
        f'<title id="sc-t">{esc(chart["title"])}</title>',
        f'<desc id="sc-d">{esc(desc)}. Source: {esc(data["sources"][chart["source"]]["url"])}, Table 1.</desc>',
        f'<rect width="{W}" height="{H}" rx="10" fill="{GROUND}" stroke="{LINE}" stroke-width="1.5"/>',
        f'<rect x="12" y="12" width="{W - 24}" height="{H - 24}" rx="6" fill="{SURFACE}" stroke="{LINE}"/>',
        corner_ticks(12, 12, W - 24, H - 24, 10, LINE_2),
        f'<text x="{left}" y="38" font-family="{MONO}" font-size="11" font-weight="600" fill="{ACCENT}">INSTRUMENT READOUT // STECHLY ET AL. (2024) TABLE 1</text>',
        f'<text x="{left}" y="60" font-family="{SANS}" font-size="19" font-weight="700" fill="{TEXT}">{esc(chart["title"])}</text>',
        f'<text x="{left}" y="78" font-family="{SANS}" font-size="12" fill="{MUTED}">{esc(chart["unit"])} (GPT-4). Outside checker is a sound program verifier giving binary feedback, not a second LLM.</text>',
    ]
    for t in range(0, ymax + 1, 10):
        yy = y(t)
        parts.append(f'<line x1="{left}" x2="{W - right}" y1="{yy:.1f}" y2="{yy:.1f}" stroke="{LINE}" stroke-dasharray="3 3"/>')
        parts.append(f'<text x="{left - 10}" y="{yy + 4:.1f}" text-anchor="end" font-family="{MONO}" font-size="11" fill="{MUTED}">{t}%</text>')
    parts.append(f'<line x1="{left}" x2="{W - right}" y1="{y(0):.1f}" y2="{y(0):.1f}" stroke="{LINE_2}" stroke-width="1.2"/>')

    for gi, r in enumerate(rows):
        total = len(r["values"]) * bar_w + (len(r["values"]) - 1) * gap
        x0 = left + gi * group_w + (group_w - total) / 2
        for si, v in enumerate(r["values"]):
            x = x0 + si * (bar_w + gap)
            bh = max(2.0, top + plot_h - y(v))
            parts.append(f'<rect x="{x:.1f}" y="{y(v):.1f}" width="{bar_w}" height="{bh:.1f}" rx="3" fill="{colors[si]}"/>')
            parts.append(f'<text x="{x + bar_w / 2:.1f}" y="{y(v) - 7:.1f}" text-anchor="middle" font-family="{MONO}" font-size="13" font-weight="600" fill="{TEXT}">{v}%</text>')
        parts.append(f'<text x="{x0 + total / 2:.1f}" y="{top + plot_h + 24}" text-anchor="middle" font-family="{SANS}" font-size="13" font-weight="600" fill="{TEXT_2}">{esc(r["domain"])}</text>')

    legend_labels = ["Single pass (no check)", "GPT-4 checks itself", "Sound outside checker"]
    lx = left
    for si, label in enumerate(legend_labels):
        parts.append(f'<rect x="{lx}" y="{H - 34}" width="12" height="12" rx="2" fill="{colors[si]}"/>')
        parts.append(f'<text x="{lx + 18}" y="{H - 24}" font-family="{SANS}" font-size="12" fill="{TEXT_2}">{esc(label)}</text>')
        lx += 235
    parts.append("</svg>")
    return "\n".join(parts) + "\n"


def build_evidence_board_svg(data: dict) -> str:
    f = data["facts"]
    rows = {r["domain"]: r["values"] for r in data["chart"]["rows"]}
    gc = rows["Graph coloring"]
    g24 = rows["Game of 24"]
    bw = f["stechly_blocksworld"]

    W, H = 1120, 560
    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}" role="img" aria-labelledby="eb-t eb-d">',
        '<title id="eb-t">Published Empirical Evidence Behind Control Rod</title>',
        '<desc id="eb-d">Four published failure modes mapped to Control Rod controls: multi-turn instruction drop, self-verification collapse, self-preference and conceding when challenged, and test-passing PRs maintainers would not merge.</desc>',
        f'<rect width="{W}" height="{H}" rx="12" fill="{GROUND}" stroke="{LINE}" stroke-width="1.5"/>',
        f'<rect x="16" y="16" width="{W - 32}" height="{H - 32}" rx="8" fill="{SURFACE}" stroke="{LINE}"/>',
        corner_ticks(16, 16, W - 32, H - 32, 12, LINE_2),
        # Header
        f'<text x="40" y="46" font-family="{MONO}" font-size="11" font-weight="600" fill="{ACCENT}">EMPIRICAL BASIS // NINE PUBLISHED STUDIES, ZERO MODEL-TYPED NUMBERS</text>',
        f'<text x="40" y="72" font-family="{SANS}" font-size="22" font-weight="700" fill="{TEXT}">Why one model writing and checking its own work breaks down</text>',
        f'<text x="40" y="94" font-family="{SANS}" font-size="13" fill="{MUTED}">Every Control Rod gate answers a specific failure measured in peer-reviewed and maintainer studies (docs/research/second-checker/inputs.json).</text>',
    ]

    cards = [
        {
            "x": 40,
            "y": 114,
            "w": 510,
            "h": 188,
            "tag": "01 // LOCKED BRIEF & ROLE SEATS",
            "tag_color": ACCENT,
            "stat": f'-{f["laban_multi_turn_drop"]["value"]}%',
            "stat_color": STUCK,
            "headline": "Multi-turn drift when instructions trickle in",
            "lines": [
                (f'Across 15 LLMs and 6 tasks, sharding instructions across turns cut', TEXT_2),
                (f'performance by {f["laban_multi_turn_drop"]["value"]}% vs. one complete brief (Laban et al., 2025).', TEXT_2),
                (f'Clear role specs alone lifted ChatDev +{f["cemri_role_spec_gain"]["value"]} pp on ProgramDev', MUTED),
                ("with the same user prompt and GPT-4o model (Cemri et al., 2025).", MUTED),
            ],
            "control": "Control Rod -> One signed, complete brief + explicit role baseline per run.",
        },
        {
            "x": 570,
            "y": 114,
            "w": 510,
            "h": 188,
            "tag": "02 // EXTERNAL CHECK VS. SELF-CHECK",
            "tag_color": ACCENT,
            "stat": f"{gc[0]}% -> {gc[1]}% vs {gc[2]}%",
            "stat_color": ACCENT,
            "headline": "Self-critique can collapse valid solutions",
            "lines": [
                (f"Graph coloring: {gc[0]}% alone dropped to {gc[1]}% when GPT-4 checked itself,", TEXT_2),
                (f"vs. {gc[2]}% with an outside program checker; Game of 24: {g24[0]}% -> {g24[1]}% vs {g24[2]}%.", TEXT_2),
                (f'Intrinsic self-correction cut GSM8K {f["huang_gpt4_gsm8k"]["standard"]}% -> {f["huang_gpt4_gsm8k"]["self_correct_round_2"]}% & CSQA {f["huang_gpt35_csqa"]["standard"]}% -> {f["huang_gpt35_csqa"]["self_correct_round_1"]}%', MUTED),
                (f'(Huang 2024; Blocksworld rose {bw["standard"]}% -> {bw["self_check"]}%, outside checker {bw["outside_checker_binary"]}%).', MUTED),
            ],
            "control": "Control Rod -> Independent check with real test & build evidence attached.",
        },
        {
            "x": 40,
            "y": 318,
            "w": 510,
            "h": 184,
            "tag": "03 // BLIND WALL & DISTINCT VENDOR",
            "tag_color": ACCENT,
            "stat": f'{f["sharma_claude13_false_admit"]["value"]}% & r={f["goel_judge_similarity_r"]["value"]}',
            "stat_color": NEEDS,
            "headline": "Sycophancy, self-preference & shared blind spots",
            "lines": [
                (f'Challenged on a right answer, Claude 1.3 falsely admitted error {f["sharma_claude13_false_admit"]["value"]}%', TEXT_2),
                (f'of the time; pushback cut accuracy up to {f["sharma_llama2_accuracy_drop"]["value"]}% (Sharma et al., 2023).', TEXT_2),
                (f'GPT-4 spotted its own text {f["panickssery_gpt4_self_recognition"]["value"]}% (Panickssery 2024); judge scores track', MUTED),
                (f'mistake overlap at average Pearson r = {f["goel_judge_similarity_r"]["value"]} (Goel et al., 2025).', MUTED),
            ],
            "control": "Control Rod -> Checker comes from another vendor and never sees reasoning.",
        },
        {
            "x": 570,
            "y": 318,
            "w": 510,
            "h": 184,
            "tag": "04 // HUMAN PASSKEY GATE",
            "tag_color": NEEDS,
            "stat": "~1/2 not mergeable",
            "stat_color": DONE,
            "headline": "Passing automated tests != ready to merge",
            "lines": [
                (f'Maintainers of scikit-learn, Sphinx, and pytest reviewed {f["metr_prs_reviewed"]["value"]} AI pull', TEXT_2),
                ("requests written by agents on SWE-bench Verified tasks (METR, 2026).", TEXT_2),
                (f'Estimate: {f["metr_not_merged"]["value"]} of test-passing PRs would not have been merged,', MUTED),
                ("even after adjusting for noise in maintainer merge decisions.", MUTED),
            ],
            "control": "Control Rod -> Nothing is Accepted until your passkey signs the bound digest.",
        },
    ]

    for c in cards:
        x, y, w, h = c["x"], c["y"], c["w"], c["h"]
        parts.extend(
            [
                f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="6" fill="{PANEL}" stroke="{LINE_2}"/>',
                corner_ticks(x, y, w, h, 7, LINE_2),
                f'<text x="{x + 18}" y="{y + 24}" font-family="{MONO}" font-size="11" font-weight="600" fill="{c["tag_color"]}">{esc(c["tag"])}</text>',
                f'<text x="{x + w - 18}" y="{y + 28}" text-anchor="end" font-family="{MONO}" font-size="19" font-weight="700" fill="{c["stat_color"]}">{esc(c["stat"])}</text>',
                f'<text x="{x + 18}" y="{y + 52}" font-family="{SANS}" font-size="16" font-weight="700" fill="{TEXT}">{esc(c["headline"])}</text>',
                f'<line x1="{x + 18}" x2="{x + w - 18}" y1="{y + 64}" y2="{y + 64}" stroke="{LINE}"/>',
            ]
        )
        for li, (txt, col) in enumerate(c["lines"]):
            parts.append(
                f'<text x="{x + 18}" y="{y + 84 + li * 17}" font-family="{SANS}" font-size="12" fill="{col}">{esc(txt)}</text>'
            )
        parts.extend(
            [
                f'<rect x="{x + 14}" y="{y + h - 30}" width="{w - 28}" height="22" rx="4" fill="{SURFACE}" stroke="{LINE}"/>',
                f'<text x="{x + 24}" y="{y + h - 15}" font-family="{MONO}" font-size="10.8" font-weight="500" fill="{DONE}">{esc(c["control"])}</text>',
            ]
        )

    # Honest boundary strip at bottom
    parts.extend(
        [
            f'<rect x="40" y="514" width="1040" height="22" rx="4" fill="{GROUND}"/>',
            f'<text x="48" y="529" font-family="{MONO}" font-size="11" fill="{MUTED}">HONESTY BOUNDARY: Stechly 2024 outside checker is a deterministic program, not a 2nd LLM. Measure real cross-vendor code checks yourself with pnpm cr bench.</text>',
        ]
    )
    parts.append("</svg>")
    return "\n".join(parts) + "\n"


def build_council_loop_svg() -> str:
    W, H = 1120, 440
    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}" role="img" aria-labelledby="cl-t cl-d">',
        '<title id="cl-t">Control Rod Multi-Agent Council and Blind Cross-Vendor Loop</title>',
        '<desc id="cl-d">Flow from Your Signed Brief to Author Agent in an isolated worktree, across the Blind Wall that strips reasoning, into a Cross-Vendor Blind Checker, guarded by the Rust/WASM Kernel, ending in Your Passkey Sign-Off and an offline-verifiable PR Receipt.</desc>',
        '<defs>',
        f'<marker id="arr-cyan" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 1 L 9 5 L 0 9 z" fill="{ACCENT}"/></marker>',
        f'<marker id="arr-amber" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 1 L 9 5 L 0 9 z" fill="{NEEDS}"/></marker>',
        f'<marker id="arr-green" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 1 L 9 5 L 0 9 z" fill="{DONE}"/></marker>',
        '</defs>',
        f'<rect width="{W}" height="{H}" rx="12" fill="{GROUND}" stroke="{LINE}" stroke-width="1.5"/>',
        f'<rect x="14" y="14" width="{W - 28}" height="{H - 28}" rx="8" fill="{SURFACE}" stroke="{LINE}"/>',
        corner_ticks(14, 14, W - 28, H - 28, 12, LINE_2),
        # Header
        f'<text x="36" y="42" font-family="{MONO}" font-size="11" font-weight="600" fill="{ACCENT}">COUNCIL ARCHITECTURE // ONE TABLE, BLIND CROSS-VENDOR CHECK, RUST KERNEL CUSTODY</text>',
        f'<text x="36" y="66" font-family="{SANS}" font-size="20" font-weight="700" fill="{TEXT}">How work moves across your agent council—and why no agent can grade its own homework</text>',
        # Stage 1: Human Release
        f'<rect x="36" y="96" width="186" height="196" rx="6" fill="{PANEL}" stroke="{NEEDS}" stroke-width="1.5"/>',
        f'<rect x="36" y="96" width="186" height="26" rx="6" fill="#261b08"/>',
        f'<text x="48" y="113" font-family="{MONO}" font-size="10.5" font-weight="600" fill="{NEEDS}">1. YOU // RELEASE</text>',
        f'<text x="48" y="142" font-family="{SANS}" font-size="15" font-weight="700" fill="{TEXT}">Locked Brief</text>',
        f'<text x="48" y="162" font-family="{SANS}" font-size="12" fill="{TEXT_2}">• Clear acceptance criteria</text>',
        f'<text x="48" y="181" font-family="{SANS}" font-size="12" fill="{TEXT_2}">• Workflow: Playbook,</text>',
        f'<text x="58" y="197" font-family="{MONO}" font-size="11" fill="{ACCENT}">Superpowers / Pocock</text>',
        f'<text x="48" y="216" font-family="{SANS}" font-size="12" fill="{TEXT_2}">• Context: Light | Nuclear</text>',
        f'<rect x="48" y="254" width="162" height="24" rx="4" fill="#261b08" stroke="{NEEDS}"/>',
        f'<text x="129" y="270" text-anchor="middle" font-family="{MONO}" font-size="10.5" font-weight="600" fill="{NEEDS}">PASSKEY SIGNATURE #1</text>',
        # Arrow 1 -> 2
        f'<line x1="222" y1="194" x2="254" y2="194" stroke="{NEEDS}" stroke-width="2" marker-end="url(#arr-amber)"/>',
        # Stage 2: Author Seat
        f'<rect x="258" y="96" width="212" height="196" rx="6" fill="{PANEL}" stroke="{LINE_2}"/>',
        f'<rect x="258" y="96" width="212" height="26" rx="6" fill="#0d2230"/>',
        f'<text x="270" y="113" font-family="{MONO}" font-size="10.5" font-weight="600" fill="{ACCENT}">2. AUTHOR SEAT (VENDOR A)</text>',
        f'<text x="270" y="142" font-family="{SANS}" font-size="15" font-weight="700" fill="{TEXT}">Claude Code (or Codex)</text>',
        f'<text x="270" y="162" font-family="{SANS}" font-size="12" fill="{TEXT_2}">• Isolated git worktree</text>',
        f'<text x="270" y="181" font-family="{SANS}" font-size="12" fill="{TEXT_2}">• Native OS sandbox preflight</text>',
        f'<text x="270" y="200" font-family="{SANS}" font-size="12" fill="{TEXT_2}">• Outbound egress filtered</text>',
        f'<text x="270" y="219" font-family="{SANS}" font-size="12" fill="{TEXT_2}">• Stand-in failover if offline</text>',
        f'<rect x="270" y="254" width="188" height="24" rx="4" fill="{SURFACE}" stroke="{LINE_2}"/>',
        f'<text x="364" y="270" text-anchor="middle" font-family="{MONO}" font-size="10.5" fill="{TEXT_2}">Uses existing CLI login ($0 API)</text>',
        # THE BLIND WALL
        f'<rect x="494" y="88" width="124" height="212" rx="6" fill="#130d18" stroke="{STUCK}" stroke-width="1.5" stroke-dasharray="5 3"/>',
        f'<text x="556" y="112" text-anchor="middle" font-family="{MONO}" font-size="11" font-weight="700" fill="{STUCK}">BLIND WALL</text>',
        f'<line x1="508" x2="604" y1="122" y2="122" stroke="{LINE_2}"/>',
        f'<text x="556" y="144" text-anchor="middle" font-family="{MONO}" font-size="10.5" font-weight="600" fill="{STUCK}">STRIPPED:</text>',
        f'<text x="556" y="160" text-anchor="middle" font-family="{SANS}" font-size="11.5" fill="{MUTED}">Author prompt</text>',
        f'<text x="556" y="176" text-anchor="middle" font-family="{SANS}" font-size="11.5" fill="{MUTED}">Chain-of-thought</text>',
        f'<text x="556" y="192" text-anchor="middle" font-family="{SANS}" font-size="11.5" fill="{MUTED}">Self-justification</text>',
        f'<line x1="508" x2="604" y1="208" y2="208" stroke="{LINE_2}"/>',
        f'<text x="556" y="228" text-anchor="middle" font-family="{MONO}" font-size="10.5" font-weight="600" fill="{ACCENT}">PASSED ONLY:</text>',
        f'<text x="556" y="245" text-anchor="middle" font-family="{SANS}" font-size="11.5" fill="{TEXT}">Diff / Deliverable</text>',
        f'<text x="556" y="261" text-anchor="middle" font-family="{SANS}" font-size="11.5" fill="{TEXT}">Criteria + Test logs</text>',
        f'<line x1="470" y1="194" x2="492" y2="194" stroke="{ACCENT}" stroke-width="2" marker-end="url(#arr-cyan)"/>',
        f'<line x1="618" y1="194" x2="642" y2="194" stroke="{ACCENT}" stroke-width="2" marker-end="url(#arr-cyan)"/>',
        # Stage 3: Blind Checker Seat
        f'<rect x="646" y="96" width="212" height="196" rx="6" fill="{PANEL}" stroke="{ACCENT}" stroke-width="1.4"/>',
        f'<rect x="646" y="96" width="212" height="26" rx="6" fill="#08242b"/>',
        f'<text x="658" y="113" font-family="{MONO}" font-size="10.5" font-weight="600" fill="{ACCENT}">3. BLIND CHECKER (VENDOR B)</text>',
        f'<text x="658" y="142" font-family="{SANS}" font-size="15" font-weight="700" fill="{TEXT}">Codex (or Claude Code)</text>',
        f'<text x="658" y="162" font-family="{SANS}" font-size="12" fill="{TEXT_2}">• Distinct vendor enforced</text>',
        f'<text x="658" y="181" font-family="{SANS}" font-size="12" fill="{TEXT_2}">• Read-only source mount</text>',
        f'<text x="658" y="200" font-family="{SANS}" font-size="12" fill="{TEXT_2}">• Never fails over to shop pass</text>',
        f'<text x="658" y="219" font-family="{SANS}" font-size="12" fill="{TEXT_2}">• Scoped send-back on fail (≤2x)</text>',
        f'<rect x="658" y="254" width="188" height="24" rx="4" fill="{SURFACE}" stroke="{ACCENT_DIM}"/>',
        f'<text x="752" y="270" text-anchor="middle" font-family="{MONO}" font-size="10.5" fill="{ACCENT}">PASS | FAIL | INCONCLUSIVE</text>',
        # Scoped send-back arc
        f'<path d="M 752 292 C 752 324, 364 324, 364 294" fill="none" stroke="{MUTED}" stroke-width="1.4" stroke-dasharray="4 3" marker-end="url(#arr-cyan)"/>',
        f'<rect x="490" y="308" width="152" height="18" rx="3" fill="{SURFACE}"/>',
        f'<text x="566" y="320" text-anchor="middle" font-family="{MONO}" font-size="10" fill="{MUTED}">Scoped send-back on fail</text>',
        # Arrow 3 -> 4
        f'<line x1="858" y1="194" x2="886" y2="194" stroke="{DONE}" stroke-width="2" marker-end="url(#arr-green)"/>',
        # Stage 4: Human Acceptance + PR Receipt
        f'<rect x="890" y="96" width="194" height="196" rx="6" fill="{PANEL}" stroke="{DONE}" stroke-width="1.5"/>',
        f'<rect x="890" y="96" width="194" height="26" rx="6" fill="#09291c"/>',
        f'<text x="902" y="113" font-family="{MONO}" font-size="10.5" font-weight="600" fill="{DONE}">4. YOU // ACCEPT</text>',
        f'<text x="902" y="142" font-family="{SANS}" font-size="15" font-weight="700" fill="{TEXT}">Signed Provenance</text>',
        f'<text x="902" y="162" font-family="{SANS}" font-size="12" fill="{TEXT_2}">• Binds exact SHA-256 diff</text>',
        f'<text x="902" y="181" font-family="{SANS}" font-size="12" fill="{TEXT_2}">• Sealed in event chain</text>',
        f'<text x="902" y="200" font-family="{SANS}" font-size="12" fill="{TEXT_2}">• Exports PR receipt</text>',
        f'<text x="902" y="219" font-family="{MONO}" font-size="11" fill="{DONE}">pnpm cr verify</text>',
        f'<rect x="902" y="254" width="170" height="24" rx="4" fill="#261b08" stroke="{NEEDS}"/>',
        f'<text x="987" y="270" text-anchor="middle" font-family="{MONO}" font-size="10.5" font-weight="600" fill="{NEEDS}">PASSKEY SIGNATURE #2</text>',
        # Bottom Kernel & Roster Bar
        f'<rect x="36" y="344" width="1048" height="64" rx="6" fill="{PANEL}" stroke="{LINE_2}"/>',
        f'<text x="54" y="368" font-family="{MONO}" font-size="11" font-weight="700" fill="{ACCENT}">RUST / WASM KERNEL CUSTODY</text>',
        f'<text x="278" y="368" font-family="{SANS}" font-size="12" fill="{TEXT_2}">Every transition is decided by deterministic Rust functions no agent can edit, bypass, or sign for.</text>',
        f'<text x="54" y="392" font-family="{MONO}" font-size="11" font-weight="600" fill="{MUTED}">SEATS TODAY:</text>',
        f'<text x="148" y="392" font-family="{MONO}" font-size="11" fill="{DONE}">Claude Code ● Runnable</text>',
        f'<text x="312" y="392" font-family="{MONO}" font-size="11" fill="{DONE}">Codex CLI ● Runnable</text>',
        f'<text x="468" y="392" font-family="{MONO}" font-size="11" fill="{MUTED}">Antigravity · Grok · OpenCode · Ollama ○ Detected (held until sandboxed)</text>',
        f'<rect x="974" y="356" width="94" height="38" rx="4" fill="#2b0d12" stroke="{STUCK}"/>',
        f'<text x="1021" y="379" text-anchor="middle" font-family="{MONO}" font-size="12" font-weight="700" fill="{STUCK}">SCRAM</text>',
        "</svg>",
    ]
    return "\n".join(parts) + "\n"


def build_pr_receipt_svg() -> str:
    W, H = 960, 376
    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}" role="img" aria-labelledby="pr-t pr-d">',
        '<title id="pr-t">Control Rod Verifiable Pull Request Receipt</title>',
        '<desc id="pr-d">Example PR receipt generated from an authenticated Control Rod inclusion proof showing package ID, author agent, cross-vendor blind checker verdict, human passkey acceptance, SHA-256 diff digest, and offline verification command.</desc>',
        f'<rect width="{W}" height="{H}" rx="12" fill="{GROUND}" stroke="{LINE}" stroke-width="1.5"/>',
        f'<rect x="16" y="16" width="{W - 32}" height="{H - 32}" rx="8" fill="{SURFACE}" stroke="{LINE_2}"/>',
        corner_ticks(16, 16, W - 32, H - 32, 10, LINE_2),
        # Top window strip
        f'<rect x="16" y="16" width="{W - 32}" height="38" rx="8" fill="{PANEL}"/>',
        f'<line x1="16" x2="{W - 16}" y1="54" y2="54" stroke="{LINE_2}"/>',
        f'<circle cx="38" cy="35" r="5" fill="{DONE}"/>',
        f'<text x="52" y="39" font-family="{MONO}" font-size="11.5" font-weight="600" fill="{TEXT}">CONTROL ROD PROVENANCE RECEIPT // ATTACH TO ANY PULL REQUEST OR CLIENT DROP</text>',
        f'<text x="{W - 34}" y="39" text-anchor="end" font-family="{MONO}" font-size="11" fill="{DONE}">SEAL AUTHENTICATED</text>',
        # Left receipt body
        f'<rect x="36" y="72" width="556" height="224" rx="6" fill="{PANEL}" stroke="{LINE}"/>',
        f'<text x="54" y="98" font-family="{SANS}" font-size="16" font-weight="700" fill="{TEXT}">WP-0042 · rev 1 — Fix OAuth PKCE state validation</text>',
        f'<line x1="54" x2="574" y1="110" y2="110" stroke="{LINE}"/>',
        f'<text x="54" y="134" font-family="{MONO}" font-size="12" fill="{MUTED}">WRITER</text>',
        f'<text x="200" y="134" font-family="{MONO}" font-size="12" font-weight="600" fill="{TEXT}">claude (Anthropic · isolated worktree)</text>',
        f'<text x="54" y="160" font-family="{MONO}" font-size="12" fill="{MUTED}">BLIND CHECKER</text>',
        f'<text x="200" y="160" font-family="{MONO}" font-size="12" font-weight="600" fill="{ACCENT}">codex (OpenAI · distinct vendor) -> PASS (1 minor)</text>',
        f'<text x="54" y="186" font-family="{MONO}" font-size="12" fill="{MUTED}">ACCEPTED BY</text>',
        f'<text x="200" y="186" font-family="{MONO}" font-size="12" font-weight="600" fill="{NEEDS}">Ben Huffer (WebAuthn passkey signature)</text>',
        f'<text x="54" y="212" font-family="{MONO}" font-size="12" fill="{MUTED}">DIFF SHA-256</text>',
        f'<text x="200" y="212" font-family="{MONO}" font-size="11.5" fill="{TEXT_2}">sha256:8f4c2e91b07d4a62c1e8…d307a41b7c68e502</text>',
        f'<rect x="54" y="232" width="520" height="48" rx="4" fill="{GROUND}" stroke="{LINE}"/>',
        f'<text x="66" y="252" font-family="{MONO}" font-size="11" fill="{MUTED}">$ pnpm cr verify --receipt pr-receipt.md inclusion-proof.json</text>',
        f'<text x="66" y="270" font-family="{MONO}" font-size="11" font-weight="600" fill="{DONE}">✓ Verified offline: seal intact, human acceptance covers exact diff &amp; rev 1</text>',
        # Right column: two ways to generate
        f'<rect x="610" y="72" width="314" height="106" rx="6" fill="{PANEL}" stroke="{LINE}"/>',
        f'<text x="626" y="95" font-family="{MONO}" font-size="11" font-weight="600" fill="{ACCENT}">MODE A // FULL WORKSPACE RECEIPT</text>',
        f'<text x="626" y="116" font-family="{SANS}" font-size="12" fill="{TEXT_2}">Exported from an accepted package with</text>',
        f'<text x="626" y="133" font-family="{SANS}" font-size="12" fill="{TEXT_2}">sealed event-chain inclusion proof:</text>',
        f'<text x="626" y="158" font-family="{MONO}" font-size="11.5" fill="{TEXT}">pnpm cr receipt proof.json</text>',
        f'<rect x="610" y="190" width="314" height="106" rx="6" fill="{PANEL}" stroke="{LINE}"/>',
        f'<text x="626" y="213" font-family="{MONO}" font-size="11" font-weight="600" fill="{NEEDS}">MODE B // 30s STANDALONE CLI / CI</text>',
        f'<text x="626" y="234" font-family="{SANS}" font-size="12" fill="{TEXT_2}">Run blind cross-vendor check on any git</text>',
        f'<text x="626" y="251" font-family="{SANS}" font-size="12" fill="{TEXT_2}">diff or GitHub PR (honestly marked unaccepted):</text>',
        f'<text x="626" y="276" font-family="{MONO}" font-size="11.5" fill="{TEXT}">controlrod check --base main</text>',
        # Bottom note
        f'<text x="36" y="332" font-family="{SANS}" font-size="12" fill="{MUTED}">Every governed receipt embeds a machine-checked binding comment; editing a single character of the verdict, author, or digest fails offline verification.</text>',
        "</svg>",
    ]
    return "\n".join(parts) + "\n"


def build_workflow_modes_svg() -> str:
    W, H = 1040, 350
    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}" role="img" aria-labelledby="wm-t wm-d">',
        '<title id="wm-t">Dynamic Workflows, Context Depth, and Human Check-In Controls</title>',
        '<desc id="wm-d">Three orthogonal controls in Control Rod: Per-Card Workflow Pack (Playbook, Superpowers, Matt Pocock, Pocock Superpowers), Context Depth (Light vs Nuclear), and Check-In Points (Start and merge live today; Start only and Every step coming soon).</desc>',
        f'<rect width="{W}" height="{H}" rx="12" fill="{GROUND}" stroke="{LINE}" stroke-width="1.5"/>',
        f'<rect x="14" y="14" width="{W - 28}" height="{H - 28}" rx="8" fill="{SURFACE}" stroke="{LINE}"/>',
        corner_ticks(14, 14, W - 28, H - 28, 10, LINE_2),
        f'<text x="36" y="42" font-family="{MONO}" font-size="11" font-weight="600" fill="{ACCENT}">DYNAMIC HARNESS CONTROLS // THREE ORTHOGONAL DIALS PER PROJECT OR CARD</text>',
        f'<text x="36" y="66" font-family="{SANS}" font-size="19" font-weight="700" fill="{TEXT}">Run lightweight on a two-line bugfix—or full Nuclear rigor on high-consequence work</text>',
        # Col 1: Workflow Packs
        f'<rect x="36" y="88" width="312" height="224" rx="6" fill="{PANEL}" stroke="{LINE_2}"/>',
        f'<text x="54" y="112" font-family="{MONO}" font-size="11" font-weight="600" fill="{ACCENT}">1. WORKFLOW PACK (HOW IT SEQUENCES)</text>',
        f'<rect x="54" y="126" width="276" height="36" rx="4" fill="{SURFACE}" stroke="{ACCENT}"/>',
        f'<text x="66" y="148" font-family="{SANS}" font-size="13" font-weight="600" fill="{TEXT}">Playbook</text>',
        f'<text x="318" y="148" text-anchor="end" font-family="{MONO}" font-size="10.5" fill="{MUTED}">Default stage brief</text>',
        f'<rect x="54" y="170" width="276" height="36" rx="4" fill="{SURFACE}" stroke="{LINE_2}"/>',
        f'<text x="66" y="192" font-family="{SANS}" font-size="13" font-weight="600" fill="{TEXT}">Superpowers</text>',
        f'<text x="318" y="192" text-anchor="end" font-family="{MONO}" font-size="10.5" fill="{DONE}">Jesse Vincent · MIT</text>',
        f'<rect x="54" y="214" width="276" height="36" rx="4" fill="{SURFACE}" stroke="{LINE_2}"/>',
        f'<text x="66" y="236" font-family="{SANS}" font-size="13" font-weight="600" fill="{TEXT}">Matt Pocock</text>',
        f'<text x="318" y="236" text-anchor="end" font-family="{MONO}" font-size="10.5" fill="{DONE}">Pocock skills · MIT</text>',
        f'<rect x="54" y="258" width="276" height="36" rx="4" fill="{SURFACE}" stroke="{LINE_2}"/>',
        f'<text x="66" y="280" font-family="{SANS}" font-size="13" font-weight="600" fill="{TEXT}">Pocock Superpowers</text>',
        f'<text x="318" y="280" text-anchor="end" font-family="{MONO}" font-size="10.5" fill="{ACCENT}">Hybrid · SHA-256 locked</text>',
        # Col 2: Context Profile
        f'<rect x="364" y="88" width="312" height="224" rx="6" fill="{PANEL}" stroke="{LINE_2}"/>',
        f'<text x="382" y="112" font-family="{MONO}" font-size="11" font-weight="600" fill="{ACCENT}">2. CONTEXT DEPTH (HOW MUCH RIGOR)</text>',
        f'<rect x="382" y="126" width="276" height="78" rx="4" fill="{SURFACE}" stroke="{ACCENT}"/>',
        f'<text x="396" y="148" font-family="{SANS}" font-size="14" font-weight="700" fill="{TEXT}">Light Context</text>',
        f'<text x="396" y="168" font-family="{SANS}" font-size="12" fill="{TEXT_2}">Short, fast stage brief for everyday</text>',
        f'<text x="396" y="185" font-family="{SANS}" font-size="12" fill="{TEXT_2}">General-service code &amp; docs.</text>',
        f'<rect x="382" y="214" width="276" height="80" rx="4" fill="{SURFACE}" stroke="{NEEDS}"/>',
        f'<text x="396" y="236" font-family="{SANS}" font-size="14" font-weight="700" fill="{NEEDS}">Nuclear Context</text>',
        f'<text x="396" y="256" font-family="{SANS}" font-size="12" fill="{TEXT_2}">Adds basis, assumptions, custody &amp;</text>',
        f'<text x="396" y="273" font-family="{SANS}" font-size="12" fill="{TEXT_2}">trace discipline. Mandatory on Safety.</text>',
        # Col 3: Check-In Points
        f'<rect x="692" y="88" width="312" height="224" rx="6" fill="{PANEL}" stroke="{LINE_2}"/>',
        f'<text x="710" y="112" font-family="{MONO}" font-size="11" font-weight="600" fill="{NEEDS}">3. WHEN WE CHECK WITH YOU</text>',
        f'<rect x="710" y="126" width="276" height="52" rx="4" fill="#261b08" stroke="{NEEDS}"/>',
        f'<text x="724" y="147" font-family="{SANS}" font-size="13" font-weight="700" fill="{TEXT}">At start &amp; before merge</text>',
        f'<text x="974" y="147" text-anchor="end" font-family="{MONO}" font-size="10" font-weight="600" fill="{DONE}">LIVE TODAY</text>',
        f'<text x="724" y="165" font-family="{SANS}" font-size="11.5" fill="{TEXT_2}">Passkey at release + passkey at accept</text>',
        f'<rect x="710" y="186" width="276" height="46" rx="4" fill="{SURFACE}" stroke="{LINE}"/>',
        f'<text x="724" y="206" font-family="{SANS}" font-size="13" font-weight="600" fill="{TEXT_2}">At the start only</text>',
        f'<text x="974" y="206" text-anchor="end" font-family="{MONO}" font-size="10" fill="{MUTED}">COMING SOON</text>',
        f'<text x="724" y="222" font-family="{SANS}" font-size="11" fill="{MUTED}">Needs signed standing acceptance in kernel</text>',
        f'<rect x="710" y="240" width="276" height="54" rx="4" fill="{SURFACE}" stroke="{LINE}"/>',
        f'<text x="724" y="260" font-family="{SANS}" font-size="13" font-weight="600" fill="{TEXT_2}">At every step</text>',
        f'<text x="974" y="260" text-anchor="end" font-family="{MONO}" font-size="10" fill="{MUTED}">COMING SOON</text>',
        f'<text x="724" y="278" font-family="{SANS}" font-size="11" fill="{MUTED}">SCRAM &amp; disputes always stop for you</text>',
        "</svg>",
    ]
    return "\n".join(parts) + "\n"


def main() -> None:
    inputs_bytes = (HERE / "inputs.json").read_bytes()
    data = json.loads(inputs_bytes)
    chart = data["chart"]
    rows = chart["rows"]

    ASSETS.mkdir(parents=True, exist_ok=True)
    generated = {
        "second-checker.svg": build_second_checker_svg(data),
        "evidence-board.svg": build_evidence_board_svg(data),
        "council-loop.svg": build_council_loop_svg(),
        "pr-receipt-card.svg": build_pr_receipt_svg(),
        "workflow-modes.svg": build_workflow_modes_svg(),
    }

    svg_digests: dict[str, str] = {}
    for filename, content in generated.items():
        path = ASSETS / filename
        path.write_text(content, encoding="utf-8")
        svg_digests[str(path.relative_to(ROOT))] = hashlib.sha256(content.encode("utf-8")).hexdigest()

    primary_svg = ASSETS / "second-checker.svg"
    out = {
        "inputs_sha256": hashlib.sha256(inputs_bytes).hexdigest(),
        "svg": str(primary_svg.relative_to(ROOT)),
        "svg_sha256": svg_digests[str(primary_svg.relative_to(ROOT))],
        "svgs": svg_digests,
        "chart_values": {r["domain"]: dict(zip(chart["series"], r["values"])) for r in rows},
        "facts": data["facts"],
    }
    (HERE / "outputs.json").write_text(json.dumps(out, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"inputs_sha256": out["inputs_sha256"], "svgs": svg_digests}, indent=2))


if __name__ == "__main__":
    main()
