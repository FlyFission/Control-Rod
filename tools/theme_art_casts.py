"""World specific character bodies.

tools/build_theme_art.py began with shared body templates that several worlds
reused. These overrides give every world its own body geometry, designed from
its catalog cast list; faces, legs and handheld tools stay a shared house
style. Each body is wrapped in <g id="shape-N">; tools/test_check_theme_assets.py
fails if any body shape appears in more than one world.

World index follows the catalog order in apps/web/src/features/floor/themes/catalog.ts.
"""

from __future__ import annotations

CONFECTIONERY, LANTERNWOOD, CAFE, TUMBLETOWN, ORBITAL = 3, 4, 5, 6, 7
BUTTON, CLOCKWORK, MEADOW = 11, 12, 14


def _human(coat, head, hair, fill, skin, haircolor):
    cx, cy, rx, ry = head
    return (
        f'<path d="{coat}" fill="{fill}"/>'
        f'<ellipse cx="{cx}" cy="{cy}" rx="{rx}" ry="{ry}" fill="{skin}"/>'
        f'<path d="{hair}" fill="{haircolor}"/>'
    )


# Café: everyday clothes, one silhouette per regular.
CAFE_COATS = [
    "M30 103l8-42q26-16 52 0l8 42H70V64H58v39z",
    "M32 103l7-41q25-17 50 0l7 41z",
    "M28 103l8-38q28-22 56 0l8 38zM42 60q22-16 44 0q-22 10-44 0z",
    "M30 103l10-44 24 20 24-20 10 44z",
    "M34 103l6-42q24-12 48 0l6 42zM54 52h20v10H54z",
    "M36 103l8-42h40l8 42zM48 61l-3-9M80 61l3-9",
]
CAFE_HEADS = [(63, 39, 20, 22), (63, 39, 18, 24), (63, 39, 23, 20), (63, 39, 19, 23), (63, 39, 22, 21), (63, 39, 17, 25)]
CAFE_HAIR = [
    "M40 44q-6-32 23-32 29 0 23 32l-4 10-6-22q-13 6-26 0l-6 22z",
    "M42 34q2-22 21-22t21 22zM56 12a8 8 0 1 0 16 0a8 8 0 1 0-16 0z",
    "M40 36a8 8 0 0 1 10-14a9 9 0 0 1 16-6a9 9 0 0 1 15 6a8 8 0 0 1 7 14z",
    "M44 30q4-18 19-18t19 18l-4-4H48z",
    "M42 36q0-24 21-24t21 24l-4-8H46zM84 30q14 6 10 26l-6-20z",
    "M38 58q-6-46 25-46t25 46l-6-6-2-24q-17-8-34 0l-2 24z",
]

# Button & Spool: small makers in tunics, pinafores and capes.
BUTTON_COATS = [
    "M34 103l6-38q24-14 48 0l6 38-20-6-8 6-8-6z",
    "M36 103l10-40h36l10 40zM46 63l-4-10M82 63l4-10",
    "M30 103q2-30 10-42q24-14 48 0 8 12 10 42z",
    "M32 103l8-40 24 10 24-10 8 40z",
    "M34 103l6-44q24-10 48 0l6 44z",
    "M26 103l14-44q24-16 48 0l14 44q-38 10-76 0z",
]
BUTTON_HEADS = [(63, 42, 18, 21), (63, 42, 20, 22), (63, 42, 19, 24), (63, 42, 21, 20), (63, 42, 17, 23), (63, 42, 22, 21)]
BUTTON_HAIR = [
    "M44 34q0-22 19-22 20 0 20 22l-6-6-14 4-14-4z",
    "M40 40q-4-28 23-28 27 0 23 28-6-10-23-12-17 2-23 12z",
    "M42 36q4-24 21-24 18 0 21 24l-10-10-11 8-11-8z",
    "M46 30q2-18 17-18 16 0 18 18z",
    "M40 44q-2-32 23-32 25 0 23 32l-6-16h-34z",
    "M42 32q6-20 21-20 16 0 21 20q-21-8-42 0z",
]

# Lanternwood members that previously borrowed the bureau's coats.
LANTERNWOOD_HUMANS = {
    0: ("M30 103l10-50q24-30 48 0l10 50z", (63, 41, 19, 22), "M40 44q0-34 24-34t24 34q-8-16-24-16t-24 16z"),
    4: ("M30 103l8-44q26-14 52 0l8 44H72l-8-18-8 18z", (63, 41, 18, 23), "M42 40q-6-30 21-30 26 0 21 30l-8-14q-13 8-26 0z"),
    5: ("M26 103l12-44q26-22 52 0l12 44zM36 62q28 18 56 0l-6-10q-22 10-44 0z", (63, 41, 21, 23), "M42 38q-2-28 22-28 24 0 22 28l-6-12h-32z"),
}


def body(world, v, fill, palette, color, skin, haircolor):
    """Return replacement body markup for (world, variant), or None to keep the original."""
    a, b, c, d = palette
    if world == CONFECTIONERY:
        return [
            f'<path d="M34 70l-18-12v24zM94 70l18-12v24z" fill="{c}"/><ellipse cx="64" cy="70" rx="30" ry="28" fill="{fill}"/>',
            f'<path d="M34 74q-4-34 30-40 34 6 30 40z" fill="{fill}"/><path d="M38 72h52l-6 32H44z" fill="{b}"/>',
            f'<path d="M30 102V58l66-24v68z" fill="{fill}"/><path d="M30 80l66-12" stroke="{d}" stroke-width="5"/>',
            f'<path d="M36 104q-6-50 28-68 34 18 28 68z" fill="{fill}"/><circle cx="50" cy="84" r="2.5" fill="{d}"/><circle cx="76" cy="90" r="2.5" fill="{d}"/><circle cx="66" cy="78" r="2.5" fill="{d}"/>',
            f'<rect x="32" y="40" width="64" height="20" rx="10" fill="{fill}"/><rect x="30" y="62" width="68" height="20" rx="10" fill="{c}"/><rect x="32" y="84" width="64" height="20" rx="10" fill="{fill}"/>',
            f'<path d="M64 32q16 0 14 24 22 14 18 34-6 16-32 16t-32-16q-4-20 18-34-2-24 14-24z" fill="{fill}"/><path d="M96 80h10m-4-6v12" stroke="{c}" stroke-width="4"/>',
        ][v]
    if world == MEADOW:
        return [
            f'<circle cx="40" cy="36" r="14" fill="{color}"/><circle cx="88" cy="36" r="14" fill="{color}"/><path d="M38 96q-8-40 26-58 34 18 26 58z" fill="{fill}"/><path d="M90 92q22 4 14-16" fill="none" stroke="{color}" stroke-width="4" stroke-linecap="round"/>',
            f'<path d="M32 50l4-12 10 8M96 50l-4-12-10 8" fill="{color}"/><rect x="26" y="44" width="76" height="60" rx="26" fill="{fill}"/><path d="M58 44h12v26q-6 6-12 0z" fill="{b}"/>',
            f'<path d="M38 64L14 86l26-6M90 64l24 22-26-6" fill="{c}"/><path d="M64 30q30 10 26 50l-26 24-26-24q-4-40 26-50z" fill="{fill}"/><path d="M56 102l8-8 8 8" fill="{c}"/>',
            f'<ellipse cx="64" cy="52" rx="18" ry="16" fill="{color}"/><path d="M26 98q0-40 38-40t38 40z" fill="{fill}"/><path d="M44 80l10-10h20l10 10-10 10H54zM30 88h14M84 88h14" fill="none" stroke="{b}" stroke-width="3"/>',
            f'<path d="M44 34q-14-14-2-22 12 4 6 16M84 34q14-14 2-22-12 4-6 16" fill="none" stroke="{c}" stroke-width="5" stroke-linecap="round"/><ellipse cx="64" cy="70" rx="24" ry="34" fill="{fill}"/><path d="M60 82l4 12 4-12" fill="{d}"/>',
            f'<path d="M24 96q0-56 40-58 40 2 40 58zM28 62l-8-8 12 0M34 46l-4-12 12 6M50 36l2-12 8 10M78 36l6-10 4 12M94 46l8-8v12" fill="{b}"/><ellipse cx="64" cy="68" rx="22" ry="20" fill="{fill}"/>',
        ][v]
    if world == ORBITAL:
        return [
            f'<path d="M40 70l-14 30M52 72l-6 32M76 72l6 32M88 70l14 30" stroke="{b}" stroke-width="5" stroke-linecap="round"/><path d="M36 70q0-32 28-32t28 32z" fill="{fill}"/>',
            f'<path d="M64 26q30 34 22 60-6 18-22 18t-22-18q-8-26 22-60z" fill="{fill}" fill-opacity=".85"/><ellipse cx="64" cy="76" rx="10" ry="14" fill="{d}" opacity=".5"/>',
            f'<rect x="40" y="30" width="48" height="30" rx="6" fill="{fill}"/><rect x="32" y="60" width="64" height="40" rx="6" fill="{c}"/><path d="M44 70h40" stroke="{d}" stroke-width="3"/>',
            f'<path d="M38 104l4-36q22-14 44 0l4 36z" fill="{fill}"/><circle cx="64" cy="54" r="24" fill="{d}" fill-opacity=".45" stroke="{c}" stroke-width="4"/>',
            f'<ellipse cx="64" cy="70" rx="44" ry="10" fill="none" stroke="{c}" stroke-width="4"/><circle cx="64" cy="62" r="28" fill="{fill}"/>',
            f'<path d="M34 56L16 46M34 72l-20 4M94 56l18-10M94 72l20 4" stroke="{b}" stroke-width="5" stroke-linecap="round"/><path d="M64 30l30 17v34L64 98 34 81V47z" fill="{fill}"/>',
        ][v]
    if world == CLOCKWORK:
        return [
            f'<path d="M50 28l-4-10h36l-4 10" fill="{c}"/><rect x="44" y="28" width="40" height="74" rx="12" fill="{fill}"/><path d="M44 48h40" stroke="{d}" stroke-width="3"/>',
            f'<circle cx="64" cy="66" r="34" fill="{fill}"/><circle cx="64" cy="66" r="28" fill="none" stroke="{d}" stroke-width="2"/><path d="M64 76l5 14-5 10-5-10z" fill="{c}"/>',
            f'<path d="M40 104V44l24-16 24 16v60z" fill="{fill}"/><path d="M64 72v18" stroke="{d}" stroke-width="2"/><circle cx="64" cy="94" r="5" fill="{c}"/>',
            f'<ellipse cx="64" cy="66" rx="26" ry="34" fill="{fill}" stroke="{c}" stroke-width="6"/><path d="M48 52q8-12 22-10" fill="none" stroke="#ffffff" stroke-width="3" opacity=".5"/>',
            f'<path d="M64 28l7 6 9-2 3 8 9 3-2 9 6 7-6 7 2 9-9 3-3 8-9-2-7 6-7-6-9 2-3-8-9-3 2-9-6-7 6-7-2-9 9-3 3-8 9 2z" fill="{fill}"/><circle cx="64" cy="66" r="12" fill="none" stroke="{d}" stroke-width="3"/>',
            f'<path d="M30 96L64 30l34 66z" fill="{fill}"/><path d="M36 90q28-16 56 0" fill="none" stroke="{c}" stroke-width="4"/><circle cx="64" cy="30" r="5" fill="{c}"/>',
        ][v]
    if world == CAFE:
        return _human(CAFE_COATS[v], CAFE_HEADS[v], CAFE_HAIR[v], fill, skin, haircolor)
    if world == BUTTON:
        return _human(BUTTON_COATS[v], BUTTON_HEADS[v], BUTTON_HAIR[v], fill, skin, haircolor)
    if world == LANTERNWOOD and v in LANTERNWOOD_HUMANS:
        coat, head, hair = LANTERNWOOD_HUMANS[v]
        return _human(coat, head, hair, fill, skin, haircolor)
    if world == TUMBLETOWN and v == 5:
        return f'<path d="M38 48q-20-16-22 6zM90 48q20-16 22 6z" fill="{c}"/><path d="M36 100q-6-44 28-54 34 10 28 54z" fill="{fill}"/>'
    return None


def extras(world, v, palette):
    """Replacement accessory markup for worlds whose shared robot antenna no longer fits, or None."""
    a, b, c, d = palette
    if world == CONFECTIONERY:
        # A chef hat seated on each confection's own top edge, and a small neckerchief
        # instead of the full apron, so the confection silhouettes stay visible.
        seat = [10, 2, 14, 4, 8, 0][v]
        return (
            f'<g transform="translate(0 {seat})"><path d="M42 31q-10-13 4-17 3-13 17-5 16-8 18 7 12 5 3 16z" fill="#fbf6ec"/>'
            f'<path d="M44 32h39" stroke="{c}" stroke-width="4"/></g>'
            f'<path d="M56 84l8 9 8-9z" fill="{c}"/>'
        )
    if world == MEADOW:
        # No shared belly patch: each animal's markings live in its own body.
        return ''
    if world == ORBITAL:
        return f'<path d="M21 72l-8-15 8-12M106 73l10-12-10-14" fill="none" stroke="{d}" stroke-width="3"/>'
    if world == CLOCKWORK:
        return f'<circle cx="94" cy="40" r="7" fill="{c}" stroke="{d}" stroke-width="2"/><path d="M94 35v5l3 2" fill="none" stroke="#273f53" stroke-width="1.5"/>'
    return None
