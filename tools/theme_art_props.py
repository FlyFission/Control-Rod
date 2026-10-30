"""Named prop drawings for the overlay worlds.

Each catalog brief names six props per world. Every name maps to exactly one
original drawing on a 128 by 128 canvas; worlds that share a prop name (for
example a lantern) share its drawing in their own palette. Drawings use only
passive SVG shapes so they pass tools/check_theme_assets.py.
"""

from __future__ import annotations


def _doc(a, b, c, d, lines=3, fold=True, tab=False, x=34, y=30, w=60, h=74):
    s = f'<path d="M{x} {y}h{w-16}l16 16v{h-16}H{x}z" fill="{d}" stroke="{b}" stroke-width="3"/>' if fold else f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="4" fill="{d}" stroke="{b}" stroke-width="3"/>'
    if fold:
        s += f'<path d="M{x+w-16} {y}v16h16" fill="{b}"/>'
    if tab:
        s += f'<path d="M{x+6} {y}v-8h20l4 8" fill="{c}"/>'
    for i in range(lines):
        s += f'<path d="M{x+10} {y+30+i*11}h{w-20-(i%2)*10}" stroke="{a}" stroke-width="4" stroke-linecap="round"/>'
    return s


PROPS = {
    # Documents and cards
    "routing card": lambda a, b, c, d: f'<rect x="28" y="42" width="72" height="48" rx="6" fill="{d}" stroke="{b}" stroke-width="3"/><path d="M38 56h22M38 68h34M38 80h16" stroke="{a}" stroke-width="4" stroke-linecap="round"/><path d="M78 52l10 12-10 12" fill="none" stroke="{c}" stroke-width="5" stroke-linecap="round"/>',
    "route card": lambda a, b, c, d: f'<rect x="30" y="36" width="68" height="58" rx="5" fill="{d}" stroke="{b}" stroke-width="3"/><path d="M40 82q12-30 24-10t24-24" fill="none" stroke="{c}" stroke-width="4" stroke-dasharray="6 5"/><circle cx="40" cy="82" r="5" fill="{a}"/><circle cx="88" cy="48" r="5" fill="{a}"/>',
    "recipe card": lambda a, b, c, d: f'<rect x="30" y="38" width="68" height="54" rx="5" fill="{d}" stroke="{b}" stroke-width="3"/><path d="M30 52h68" stroke="{c}" stroke-width="4"/><circle cx="44" cy="66" r="4" fill="{a}"/><circle cx="44" cy="80" r="4" fill="{a}"/><path d="M54 66h30M54 80h22" stroke="{a}" stroke-width="3" stroke-linecap="round"/>',
    "seed-paper card": lambda a, b, c, d: f'<rect x="30" y="38" width="68" height="54" rx="10" fill="{d}" stroke="{b}" stroke-width="3"/>' + "".join(f'<ellipse cx="{x}" cy="{y}" rx="3" ry="2" fill="{c}"/>' for x, y in [(42, 50), (60, 56), (80, 48), (50, 74), (72, 70), (86, 82), (40, 84)]) + f'<path d="M62 92q2-14 12-20" fill="none" stroke="{a}" stroke-width="3"/>',
    "dossier": lambda a, b, c, d: _doc(a, b, c, d, lines=2, fold=False, tab=True) + f'<rect x="44" y="44" width="40" height="10" rx="2" fill="{c}"/>',
    "folder": lambda a, b, c, d: f'<path d="M26 44h26l6 8h44v46H26z" fill="{b}"/><path d="M26 58h76v40H26z" fill="{d}"/><path d="M38 72h30" stroke="{a}" stroke-width="4" stroke-linecap="round"/>',
    "kelp folder": lambda a, b, c, d: f'<path d="M26 44h26l6 8h44v46H26z" fill="{b}"/><path d="M26 58h76v40H26z" fill="{d}"/><path d="M44 96q-8-14 2-24t-2-22M64 96q8-16-2-26t4-20M84 96q-6-12 4-22" fill="none" stroke="{c}" stroke-width="4" stroke-linecap="round"/>',
    "ledger": lambda a, b, c, d: f'<rect x="28" y="34" width="72" height="64" rx="4" fill="{b}"/><rect x="34" y="38" width="62" height="56" rx="2" fill="{d}"/><path d="M65 38v56" stroke="{b}" stroke-width="3"/><path d="M40 52h18M40 62h18M40 72h14M72 52h18M72 62h16M72 72h18" stroke="{a}" stroke-width="3"/><path d="M90 34v18l-5-4-5 4V34" fill="{c}"/>',
    "notebook": lambda a, b, c, d: f'<rect x="34" y="30" width="58" height="72" rx="6" fill="{b}"/><rect x="42" y="36" width="44" height="60" rx="3" fill="{d}"/>' + "".join(f'<circle cx="36" cy="{y}" r="4" fill="none" stroke="{c}" stroke-width="3"/>' for y in (42, 56, 70, 84)) + f'<path d="M50 52h28M50 64h22M50 76h26" stroke="{a}" stroke-width="3"/>',
    "chart": lambda a, b, c, d: f'<rect x="24" y="34" width="80" height="60" rx="4" fill="{d}" stroke="{b}" stroke-width="3"/><circle cx="64" cy="64" r="22" fill="none" stroke="{a}" stroke-width="2"/><circle cx="64" cy="64" r="12" fill="none" stroke="{a}" stroke-width="2"/><path d="M42 64h44M64 42v44" stroke="{a}" stroke-width="1.5"/><circle cx="76" cy="54" r="3" fill="{c}"/><circle cx="52" cy="72" r="2" fill="{c}"/>',
    "blueprint": lambda a, b, c, d: f'<rect x="26" y="34" width="76" height="60" rx="3" fill="{a}"/><path d="M36 84V48h30v20h22v16z" fill="none" stroke="{d}" stroke-width="3"/><path d="M36 44h52" stroke="{d}" stroke-width="1.5" stroke-dasharray="4 3"/>',
    "original map": lambda a, b, c, d: f'<path d="M26 40l24-8 28 8 24-8v58l-24 8-28-8-24 8z" fill="{d}" stroke="{b}" stroke-width="3"/><path d="M50 32v58M78 40v58" stroke="{b}" stroke-width="2"/><path d="M34 76q10-18 22-6t20-14 16-4" fill="none" stroke="{c}" stroke-width="3" stroke-dasharray="5 4"/><path d="M88 70l-6 6m0-6 6 6" stroke="{a}" stroke-width="3"/>',
    "folded pattern": lambda a, b, c, d: f'<path d="M30 40l34-8 34 8v52l-34 8-34-8z" fill="{d}" stroke="{b}" stroke-width="3"/><path d="M64 32v68" stroke="{b}" stroke-width="2"/><path d="M38 52q10 18 20 0M70 70h20" fill="none" stroke="{c}" stroke-width="3" stroke-dasharray="4 3"/><path d="M76 50l8 8m0-8-8 8" stroke="{a}" stroke-width="2"/>',
    "envelope": lambda a, b, c, d: f'<rect x="26" y="42" width="76" height="50" rx="4" fill="{d}" stroke="{b}" stroke-width="3"/><path d="M26 44l38 28 38-28" fill="none" stroke="{b}" stroke-width="3"/><circle cx="64" cy="72" r="7" fill="{c}"/>',
    # Rolls, spools and tubes
    "blueprint roll": lambda a, b, c, d: f'<rect x="26" y="54" width="70" height="22" rx="11" fill="{a}"/><ellipse cx="96" cy="65" rx="7" ry="11" fill="{d}"/><ellipse cx="96" cy="65" rx="3" ry="5" fill="{a}"/><path d="M38 76l-6 20h56l-6-20" fill="{d}" opacity=".85"/><path d="M42 84h40" stroke="{a}" stroke-width="2"/>',
    "drawing roll": lambda a, b, c, d: f'<path d="M30 92l50-50" stroke="{d}" stroke-width="22" stroke-linecap="round"/><path d="M42 80l10 10M58 64l10 10" stroke="{c}" stroke-width="5"/><ellipse cx="82" cy="40" rx="9" ry="12" transform="rotate(45 82 40)" fill="{b}"/><ellipse cx="82" cy="40" rx="3" ry="5" transform="rotate(45 82 40)" fill="{d}"/>',
    "scroll tube": lambda a, b, c, d: f'<rect x="50" y="26" width="28" height="76" rx="8" fill="{b}"/><rect x="46" y="22" width="36" height="12" rx="5" fill="{c}"/><rect x="46" y="94" width="36" height="12" rx="5" fill="{c}"/><path d="M58 46v40" stroke="{d}" stroke-width="3"/>',
    "ribbon spool": lambda a, b, c, d: f'<ellipse cx="64" cy="52" rx="30" ry="12" fill="{b}"/><rect x="34" y="52" width="60" height="30" fill="{c}"/><ellipse cx="64" cy="82" rx="30" ry="12" fill="{b}"/><ellipse cx="64" cy="52" rx="10" ry="4" fill="{d}"/><path d="M94 70q14 6 4 24l-10-6" fill="{c}"/>',
    "spool": lambda a, b, c, d: f'<rect x="38" y="30" width="52" height="10" rx="3" fill="{b}"/><rect x="38" y="92" width="52" height="10" rx="3" fill="{b}"/><rect x="46" y="40" width="36" height="52" fill="{c}"/>' + "".join(f'<path d="M46 {y}h36" stroke="{d}" stroke-width="2"/>' for y in (48, 58, 68, 78, 86)),
    "measuring tape": lambda a, b, c, d: f'<rect x="30" y="40" width="48" height="48" rx="12" fill="{c}"/><circle cx="54" cy="64" r="10" fill="{b}"/><path d="M78 72h22v12H78z" fill="{d}"/>' + "".join(f'<path d="M{x} 72v5" stroke="{a}" stroke-width="2"/>' for x in (82, 88, 94)),
    "coil": lambda a, b, c, d: f'<path d="M40 40c48-8 48 12 0 14s48 12 0 14 48 12 0 14 48 12 0 14" fill="none" stroke="{c}" stroke-width="6" stroke-linecap="round"/><path d="M40 40v56" stroke="{b}" stroke-width="4"/>',
    # Lamps and lanterns
    "lantern": lambda a, b, c, d: f'<path d="M64 22v8M52 30h24" stroke="{b}" stroke-width="4" stroke-linecap="round"/><path d="M48 36h32l6 10v40l-6 10H48l-6-10V46z" fill="{b}"/><rect x="50" y="46" width="28" height="40" rx="5" fill="{d}"/><path d="M64 54q8 10 0 22-8-12 0-22z" fill="{c}"/>',
    "work lamp": lambda a, b, c, d: f'<rect x="34" y="94" width="40" height="10" rx="3" fill="{b}"/><path d="M48 94l16-34 20-14" fill="none" stroke="{b}" stroke-width="5" stroke-linecap="round"/><path d="M76 34l26 14-12 20z" fill="{c}"/><path d="M94 66l6 12" stroke="{d}" stroke-width="3"/>',
    "task lamp": lambda a, b, c, d: f'<ellipse cx="64" cy="100" rx="22" ry="6" fill="{b}"/><path d="M64 98V58" stroke="{b}" stroke-width="5"/><path d="M40 58h48l-10-24H50z" fill="{c}"/><path d="M48 62l-8 18M80 62l8 18" stroke="{d}" stroke-width="2" opacity=".7"/>',
    "desk lamp": lambda a, b, c, d: f'<rect x="40" y="96" width="36" height="8" rx="3" fill="{b}"/><path d="M58 96V66q0-10 10-12" fill="none" stroke="{b}" stroke-width="5"/><path d="M60 40q16-14 32 0v12H60z" fill="{c}"/><circle cx="76" cy="58" r="5" fill="{d}"/>',
    "bent desk lamp": lambda a, b, c, d: f'<rect x="30" y="96" width="36" height="8" rx="3" fill="{b}"/><path d="M48 96q-20-30 8-44t30 20" fill="none" stroke="{b}" stroke-width="5"/><path d="M76 70l24-4-6 22z" fill="{c}"/><circle cx="56" cy="52" r="4" fill="{d}"/>',
    "pearl lamp": lambda a, b, c, d: f'<path d="M30 92q34-26 68 0z" fill="{b}"/><path d="M30 92q34 14 68 0" fill="none" stroke="{c}" stroke-width="3"/><circle cx="64" cy="66" r="16" fill="{d}"/><circle cx="58" cy="60" r="5" fill="#ffffff" opacity=".6"/>',
    # Carts and trolleys
    "trolley": lambda a, b, c, d: f'<path d="M30 46h60l-6 34H38z" fill="{b}"/><path d="M90 46l10-10" stroke="{c}" stroke-width="5" stroke-linecap="round"/><circle cx="44" cy="92" r="8" fill="{a}"/><circle cx="80" cy="92" r="8" fill="{a}"/>',
    "small trolley": lambda a, b, c, d: f'<rect x="40" y="52" width="46" height="28" rx="4" fill="{c}"/><path d="M86 54V36h10" fill="none" stroke="{b}" stroke-width="4"/><circle cx="50" cy="90" r="6" fill="{a}"/><circle cx="76" cy="90" r="6" fill="{a}"/>',
    "book cart": lambda a, b, c, d: f'<rect x="30" y="40" width="68" height="48" rx="3" fill="{b}"/><path d="M30 64h68" stroke="{d}" stroke-width="3"/>' + "".join(f'<rect x="{x}" y="44" width="8" height="18" fill="{col}"/>' for x, col in [(36, c), (46, d), (56, a), (66, c)]) + "".join(f'<rect x="{x}" y="68" width="8" height="18" fill="{col}"/>' for x, col in [(40, d), (50, c), (78, a)]) + f'<circle cx="40" cy="96" r="6" fill="{a}"/><circle cx="88" cy="96" r="6" fill="{a}"/>',
    "book trolley": lambda a, b, c, d: f'<path d="M30 52l68-12v44H30z" fill="{b}"/>' + "".join(f'<path d="M{x} {y}h7v{h}h-7z" fill="{col}"/>' for x, y, h, col in [(38, 58, 22, d), (48, 54, 26, c), (58, 52, 28, d), (68, 50, 30, a), (80, 50, 30, c)]) + f'<circle cx="42" cy="94" r="7" fill="{a}"/><circle cx="86" cy="94" r="7" fill="{a}"/>',
    # Tokens, blocks and stamps
    "desk stamp": lambda a, b, c, d: f'<rect x="40" y="74" width="48" height="16" rx="3" fill="{c}"/><rect x="56" y="44" width="16" height="30" fill="{b}"/><ellipse cx="64" cy="40" rx="16" ry="9" fill="{b}"/><rect x="34" y="92" width="60" height="6" rx="2" fill="{d}"/>',
    "small stamp": lambda a, b, c, d: f'<rect x="48" y="78" width="32" height="12" rx="3" fill="{c}"/><path d="M58 78V58h12v20" fill="{b}"/><circle cx="64" cy="52" r="10" fill="{b}"/><path d="M44 96h40" stroke="{d}" stroke-width="5" stroke-linecap="round"/>',
    "seal block": lambda a, b, c, d: f'<rect x="38" y="48" width="52" height="44" rx="6" fill="{b}"/><circle cx="64" cy="70" r="14" fill="{c}"/><path d="M58 66l6 10 6-10" fill="none" stroke="{d}" stroke-width="3"/>',
    "cargo token": lambda a, b, c, d: f'<path d="M64 30l32 16v36L64 98 32 82V46z" fill="{b}"/><path d="M32 46l32 16 32-16M64 62v36" fill="none" stroke="{d}" stroke-width="3"/><circle cx="64" cy="48" r="5" fill="{c}"/>',
    "relay puck": lambda a, b, c, d: f'<ellipse cx="64" cy="76" rx="32" ry="14" fill="{b}"/><rect x="32" y="62" width="64" height="14" fill="{b}"/><ellipse cx="64" cy="62" rx="32" ry="14" fill="{d}"/><circle cx="64" cy="62" r="6" fill="{c}"/>',
    "wooden token": lambda a, b, c, d: f'<circle cx="64" cy="66" r="28" fill="{b}"/><circle cx="64" cy="66" r="20" fill="none" stroke="{d}" stroke-width="3"/><path d="M54 66h20M64 56v20" stroke="{c}" stroke-width="4"/>',
    "button token": lambda a, b, c, d: f'<circle cx="64" cy="66" r="30" fill="{c}"/><circle cx="64" cy="66" r="22" fill="none" stroke="{d}" stroke-width="3"/>' + "".join(f'<circle cx="{x}" cy="{y}" r="4" fill="{b}"/>' for x, y in [(56, 58), (72, 58), (56, 74), (72, 74)]),
    "sea-glass token": lambda a, b, c, d: f'<path d="M40 54q10-24 34-18 26 8 18 36-8 26-34 20-26-8-18-38z" fill="{c}" opacity=".85"/><path d="M52 52q12-10 24-2" fill="none" stroke="#ffffff" stroke-width="3" opacity=".6"/>',
    "brass token": lambda a, b, c, d: f'<path d="M64 34l9 8 12-2 2 12 10 7-6 10 4 11-11 5-3 12-12-3-9 8-9-8-12 3-3-12-11-5 4-11-6-10 10-7 2-12 12 2z" fill="{c}"/><circle cx="64" cy="68" r="13" fill="{b}"/><circle cx="64" cy="68" r="5" fill="{d}"/>',
    "design tile": lambda a, b, c, d: f'<rect x="36" y="40" width="56" height="56" fill="{b}"/><path d="M36 40l28 28 28-28M36 96l28-28 28 28" fill="{c}"/><rect x="58" y="62" width="12" height="12" fill="{d}"/>',
    "measure block": lambda a, b, c, d: f'<path d="M36 52l28-14 28 14v32L64 98 36 84z" fill="{b}"/><path d="M36 52l28 14 28-14M64 66v32" fill="none" stroke="{d}" stroke-width="3"/>' + "".join(f'<path d="M{x} {y}l4 -2" stroke="{c}" stroke-width="2"/>' for x, y in [(70, 82), (76, 79), (82, 76), (88, 73)]),
    # Hand tools
    "magnifier": lambda a, b, c, d: f'<circle cx="56" cy="56" r="22" fill="{d}" fill-opacity=".6" stroke="{b}" stroke-width="7"/><path d="M72 72l24 24" stroke="{c}" stroke-width="10" stroke-linecap="round"/>',
    "lens": lambda a, b, c, d: f'<ellipse cx="64" cy="64" rx="30" ry="22" fill="{d}" fill-opacity=".7" stroke="{c}" stroke-width="6"/><path d="M46 56q10-12 28-8" fill="none" stroke="#ffffff" stroke-width="3" opacity=".6"/><path d="M94 64h10" stroke="{b}" stroke-width="5"/>',
    "caliper": lambda a, b, c, d: f'<path d="M34 40h62v10H34z" fill="{b}"/><path d="M40 50v38l8-8V50M78 50v38l8-8V50" fill="{c}"/><path d="M52 44h4M60 44h4M68 44h4" stroke="{d}" stroke-width="2"/>',
    "hand tool": lambda a, b, c, d: f'<path d="M40 92l36-36" stroke="{b}" stroke-width="9" stroke-linecap="round"/><path d="M70 42q16-10 22 6l-10 10-12-4z" fill="{c}"/>',
    "paperclip tool": lambda a, b, c, d: f'<path d="M48 96V44q0-12 14-12t14 12v44q0 8-8 8t-8-8V52" fill="none" stroke="{c}" stroke-width="6" stroke-linecap="round"/>',
    "coral tool": lambda a, b, c, d: f'<path d="M64 98V60M64 74l-16-14M64 66l14-16M48 60l-6-12M78 50l2-12" stroke="{c}" stroke-width="7" stroke-linecap="round"/><rect x="54" y="92" width="20" height="10" rx="3" fill="{b}"/>',
    "diagnostic wand": lambda a, b, c, d: f'<path d="M40 94l40-40" stroke="{b}" stroke-width="10" stroke-linecap="round"/><circle cx="86" cy="46" r="10" fill="{c}"/><path d="M98 34l6-6M100 48h8M86 28v-8" stroke="{d}" stroke-width="3" stroke-linecap="round"/>',
    "winding key": lambda a, b, c, d: f'<path d="M38 52q-14-14 0-24t24 6q10 14-4 22" fill="none" stroke="{c}" stroke-width="7"/><path d="M58 50l30 30" stroke="{c}" stroke-width="8" stroke-linecap="round"/><path d="M80 72l-8 8M88 80l-8 8" stroke="{b}" stroke-width="6"/>',
    "bell tool": lambda a, b, c, d: f'<path d="M42 82q0-34 22-36 22 2 22 36z" fill="{c}"/><rect x="36" y="82" width="56" height="8" rx="4" fill="{b}"/><circle cx="64" cy="96" r="5" fill="{d}"/><path d="M64 46V30h10" fill="none" stroke="{b}" stroke-width="4"/>',
    "mixing paddle": lambda a, b, c, d: f'<path d="M64 26v44" stroke="{b}" stroke-width="7" stroke-linecap="round"/><path d="M50 70h28l-4 30H54z" fill="{c}"/><path d="M58 76v18M70 76v18" stroke="{d}" stroke-width="3"/>',
    "copper scoop": lambda a, b, c, d: f'<path d="M30 60q0 30 30 30h14V52H38q-8 0-8 8z" fill="{c}"/><path d="M74 66h26" stroke="{b}" stroke-width="8" stroke-linecap="round"/><path d="M38 62q2 18 22 20" fill="none" stroke="{d}" stroke-width="3"/>',
    "crane hook": lambda a, b, c, d: f'<path d="M64 24v34" stroke="{b}" stroke-width="5"/><rect x="54" y="52" width="20" height="10" rx="2" fill="{c}"/><path d="M64 62v14q0 16-14 16t-12-14" fill="none" stroke="{c}" stroke-width="7" stroke-linecap="round"/>',
    "impossible ruler": lambda a, b, c, d: f'<path d="M24 78q20-36 40-6t40-34" fill="none" stroke="{c}" stroke-width="14" stroke-linecap="round"/>' + "".join(f'<circle cx="{x}" cy="{y}" r="2" fill="{d}"/>' for x, y in [(34, 66), (46, 58), (58, 66), (70, 70), (82, 58), (94, 46)]),
    # Containers, cases and vessels
    "parcel capsule": lambda a, b, c, d: f'<rect x="30" y="46" width="68" height="36" rx="18" fill="{c}"/><path d="M64 46v36" stroke="{d}" stroke-width="4"/><rect x="40" y="56" width="16" height="10" rx="2" fill="{d}"/>',
    "wrapped parcel": lambda a, b, c, d: f'<rect x="34" y="50" width="60" height="46" rx="4" fill="{d}"/><path d="M64 50v46M34 72h60" stroke="{c}" stroke-width="6"/><path d="M64 50q-18-18-14 0M64 50q18-18 14 0" fill="none" stroke="{c}" stroke-width="5"/>',
    "paper parcel": lambda a, b, c, d: f'<path d="M30 56l34-14 34 14v34L64 104 30 90z" fill="{d}" stroke="{b}" stroke-width="3"/><path d="M30 56l34 14 34-14M64 70v34" fill="none" stroke="{b}" stroke-width="3"/><path d="M47 49l34 14" stroke="{c}" stroke-width="4"/>',
    "case": lambda a, b, c, d: f'<rect x="28" y="48" width="72" height="46" rx="6" fill="{b}"/><path d="M52 48v-8h24v8" fill="none" stroke="{c}" stroke-width="5"/><rect x="58" y="64" width="12" height="10" rx="2" fill="{c}"/>',
    "tool case": lambda a, b, c, d: f'<rect x="26" y="52" width="76" height="42" rx="4" fill="{c}"/><path d="M26 64h76" stroke="{d}" stroke-width="3"/><path d="M50 52V42h28v10" fill="none" stroke="{b}" stroke-width="5"/>' + "".join(f'<rect x="{x}" y="70" width="10" height="16" rx="2" fill="{b}"/>' for x in (36, 52, 68, 84)),
    "instrument case": lambda a, b, c, d: f'<path d="M30 60q0-20 34-20t34 20v28q0 8-8 8H38q-8 0-8-8z" fill="{b}"/><path d="M40 66q24-14 48 0" fill="none" stroke="{c}" stroke-width="4"/><circle cx="64" cy="80" r="5" fill="{c}"/>',
    "toolbox": lambda a, b, c, d: f'<path d="M30 58h68v38H30z" fill="{c}"/><path d="M38 58l6-14h40l6 14" fill="{b}"/><path d="M54 44v-6h20v6" fill="none" stroke="{d}" stroke-width="4"/><path d="M30 72h68" stroke="{d}" stroke-width="3"/>',
    "tool pouch": lambda a, b, c, d: f'<path d="M34 50h60l-6 46H40z" fill="{b}"/><path d="M34 50q30 18 60 0" fill="{c}"/><path d="M48 40v26M62 36v28M76 42v22" stroke="{d}" stroke-width="5" stroke-linecap="round"/>',
    "canvas pouch": lambda a, b, c, d: f'<path d="M36 52q28-12 56 0l-4 44H40z" fill="{d}" stroke="{b}" stroke-width="3"/><path d="M42 54q22 12 44 0" fill="none" stroke="{c}" stroke-width="4"/><path d="M50 50q14-26 28 0" fill="none" stroke="{b}" stroke-width="4"/>',
    "basket": lambda a, b, c, d: f'<path d="M30 60h68l-8 36H38z" fill="{c}"/><path d="M38 60q26-40 52 0" fill="none" stroke="{b}" stroke-width="5"/>' + "".join(f'<path d="M{x} 62l-4 32" stroke="{d}" stroke-width="2"/>' for x in (46, 58, 70, 82)) + f'<path d="M34 76h60" stroke="{d}" stroke-width="2"/>',
    "specimen basket": lambda a, b, c, d: f'<ellipse cx="64" cy="86" rx="30" ry="12" fill="{b}"/><path d="M34 86V64h60v22" fill="{c}"/><ellipse cx="64" cy="64" rx="30" ry="10" fill="{d}"/><path d="M52 64q-4-20 8-24M74 64q6-16-4-22" fill="none" stroke="{a}" stroke-width="4"/>',
    "terrarium": lambda a, b, c, d: f'<path d="M36 96V56q0-26 28-26t28 26v40z" fill="{d}" fill-opacity=".55" stroke="{b}" stroke-width="3"/><path d="M36 88h56v8H36z" fill="{b}"/><path d="M54 88q-6-20 6-30M68 88q10-16 0-28" fill="none" stroke="{c}" stroke-width="4"/>',
    "steam vessel": lambda a, b, c, d: f'<path d="M38 60h52v28q0 10-10 10H48q-10 0-10-10z" fill="{c}"/><path d="M90 66q14 0 10 14l-10 4" fill="none" stroke="{c}" stroke-width="5"/><path d="M52 50q-6-10 2-18M64 48q-6-10 2-18M76 50q-6-10 2-18" fill="none" stroke="{d}" stroke-width="3" stroke-linecap="round"/>',
    "coffee cup": lambda a, b, c, d: f'<path d="M38 52h44l-6 44H44z" fill="{d}" stroke="{b}" stroke-width="3"/><path d="M82 60q16 0 12 16l-14 4" fill="none" stroke="{b}" stroke-width="5"/><path d="M38 62h44" stroke="{c}" stroke-width="5"/><path d="M54 44q-4-8 2-14M66 44q-4-8 2-14" fill="none" stroke="{a}" stroke-width="3"/>',
    "thimble": lambda a, b, c, d: f'<path d="M44 96V58q0-24 20-24t20 24v38z" fill="{c}"/>' + "".join(f'<circle cx="{x}" cy="{y}" r="2" fill="{d}"/>' for x, y in [(56, 50), (64, 46), (72, 50), (54, 62), (64, 60), (74, 62), (56, 74), (66, 74)]) + f'<rect x="40" y="90" width="48" height="8" rx="3" fill="{b}"/>',
    "specimen shell": lambda a, b, c, d: f'<path d="M64 98q-34-2-34-34 0-22 34-34 34 12 34 34 0 32-34 34z" fill="{c}"/>' + "".join(f'<path d="M64 96L{x} 44" stroke="{d}" stroke-width="2.5"/>' for x in (44, 54, 64, 74, 84)),
    "folded cloth": lambda a, b, c, d: f'<path d="M30 64h68v12H30zM34 76h60v12H34zM30 88h68v10H30z" fill="{d}" stroke="{b}" stroke-width="2"/><path d="M30 64q34-16 68 0" fill="{c}"/>',
    # Trays
    "sample tray": lambda a, b, c, d: f'<rect x="26" y="66" width="76" height="20" rx="4" fill="{b}"/>' + "".join(f'<rect x="{x}" y="46" width="10" height="22" rx="5" fill="{col}"/>' for x, col in [(34, c), (50, d), (66, c), (82, d)]),
    "specimen tray": lambda a, b, c, d: f'<rect x="26" y="56" width="76" height="36" rx="4" fill="{b}"/><path d="M52 56v36M78 56v36" stroke="{d}" stroke-width="3"/><circle cx="39" cy="74" r="7" fill="{c}"/><path d="M60 80l10-14 4 14z" fill="{d}"/><ellipse cx="90" cy="74" rx="6" ry="9" fill="{c}"/>',
    "tasting tray": lambda a, b, c, d: f'<ellipse cx="64" cy="82" rx="38" ry="12" fill="{b}"/>' + "".join(f'<circle cx="{x}" cy="72" r="8" fill="{col}"/>' for x, col in [(44, c), (64, d), (84, c)]) + f'<path d="M26 82h76" stroke="{d}" stroke-width="2"/>',
    "ceramic tray": lambda a, b, c, d: f'<path d="M24 70h80l-8 18H32z" fill="{d}" stroke="{b}" stroke-width="3"/><path d="M40 70q4-14 14-14t14 14" fill="{c}"/><circle cx="84" cy="64" r="6" fill="{c}"/>',
    "component tray": lambda a, b, c, d: f'<rect x="26" y="54" width="76" height="40" rx="3" fill="{b}"/>' + "".join(f'<rect x="{x}" y="{y}" width="14" height="12" fill="{d}"/>' for x, y in [(34, 60), (52, 60), (70, 60), (34, 76), (52, 76), (70, 76)]) + f'<path d="M88 62h8v26h-8z" fill="{c}"/>',
    "umbrella tray": lambda a, b, c, d: f'<path d="M26 86h76l-6 10H32z" fill="{b}"/><path d="M40 86q0-34 24-38 24 4 24 38" fill="none" stroke="{c}" stroke-width="5"/><path d="M40 60q24-24 48 0z" fill="{c}"/><path d="M64 36v12" stroke="{d}" stroke-width="3"/>',
    "tray": lambda a, b, c, d: f'<path d="M24 74q40-14 80 0l-6 16H30z" fill="{b}"/><path d="M30 74q34 10 68 0" fill="none" stroke="{d}" stroke-width="3"/><circle cx="64" cy="66" r="5" fill="{c}"/>',
    # Panels, projectors, flags and instruments
    "modular panel": lambda a, b, c, d: f'<rect x="28" y="36" width="72" height="60" rx="4" fill="{b}"/>' + "".join(f'<rect x="{x}" y="{y}" width="20" height="16" rx="2" fill="{col}"/>' for x, y, col in [(34, 42, d), (54, 42, c), (74, 42, d), (34, 64, c), (54, 64, d), (74, 64, c)]) + f'<path d="M34 88h60" stroke="{d}" stroke-width="3"/>',
    "drafting projector": lambda a, b, c, d: f'<rect x="34" y="62" width="44" height="30" rx="5" fill="{b}"/><circle cx="56" cy="77" r="9" fill="{d}"/><path d="M78 70l24-16v40l-24-16z" fill="{c}" opacity=".7"/><path d="M42 92l-4 10M70 92l4 10" stroke="{b}" stroke-width="4"/>',
    "tabletop projector": lambda a, b, c, d: f'<path d="M36 70h40v22H36z" fill="{b}"/><path d="M76 74l26-22v48z" fill="{c}" opacity=".6"/><circle cx="56" cy="62" r="10" fill="{d}" stroke="{b}" stroke-width="3"/><circle cx="56" cy="62" r="3" fill="{b}"/>',
    "survey flag": lambda a, b, c, d: f'<path d="M48 104V28" stroke="{b}" stroke-width="5" stroke-linecap="round"/><path d="M50 30h36l-8 12 8 12H50z" fill="{c}"/><path d="M40 104h16" stroke="{d}" stroke-width="5"/>',
    "desk flag": lambda a, b, c, d: f'<ellipse cx="60" cy="98" rx="18" ry="6" fill="{b}"/><path d="M60 96V44" stroke="{b}" stroke-width="4"/><path d="M62 44q16-8 30 0v22q-14-8-30 0z" fill="{c}"/>',
    "compass": lambda a, b, c, d: f'<circle cx="64" cy="66" r="30" fill="{d}" stroke="{c}" stroke-width="6"/><path d="M64 44l7 22-7 22-7-22z" fill="{b}"/><path d="M64 44l7 22H57z" fill="{c}"/><circle cx="64" cy="66" r="3" fill="{a}"/>',
    "modular arch": lambda a, b, c, d: f'<path d="M30 98V60q0-32 34-32t34 32v38H80V62q0-16-16-16T48 62v36z" fill="{c}"/><path d="M30 76h18M80 76h18" stroke="{d}" stroke-width="3"/>',
}


def prop_shape(name: str, palette: list[str]) -> str:
    a, b, c, d = palette
    if name not in PROPS:
        raise KeyError(f"no drawing for prop {name!r}; add one to tools/theme_art_props.py")
    return PROPS[name](a, b, c, d)
