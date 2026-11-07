"""World-specific character casts, anatomies, bespoke limbs, faces, and held tools.

Authored to fulfill each world's 6-character cast brief in
docs/superpowers/specs/2026-10-25-overlay-themes-catalog.md with authentic
anatomies, expressive faces, bespoke appendages, and specialized tools.

Eliminates the 'Shared Mannequin Trap':
- Non-human creatures receive authentic creature limbs, paws, tentacles, wings, and features.
- Robotic helpers receive treads, tripods, pincers, dials, and CRT/sensor faces.
- Human specialists receive tailored noir/guild/maker attire with distinct tools.
- Pixel worlds (Lanternwood, Camp, Foundry) use strict integer-quantized pixel geometry.
"""

from __future__ import annotations


def mix(hexcolor: str, ratio: float, base=(15, 25, 35)) -> str:
    rgb = tuple(int(hexcolor[i:i+2], 16) for i in (1, 3, 5))
    return '#' + ''.join(f'{round(c * ratio + b * (1 - ratio)):02x}' for c, b in zip(rgb, base))


CREATURE, POCKET_LAB, BUREAU = 0, 1, 2
CONFECTIONERY, LANTERNWOOD, CAFE, TUMBLETOWN, ORBITAL = 3, 4, 5, 6, 7
WILDLIGHT, VOXEL, CLOUDSPRING = 8, 9, 10
BUTTON, CLOCKWORK, CORAL, MEADOW = 11, 12, 13, 14


# ==============================================================================
# 1. BODY SHAPES (wrapped inside <g id="shape-{v}">)
# Must be unique per world and distinct across variants (test_every_world_has_its_own_body_geometry)
# ==============================================================================

def _human_coat(d_path: str, fill: str, trim_d: str = '', trim_col: str = '') -> str:
    s = f'<path d="{d_path}" fill="{fill}"/>'
    if trim_d and trim_col:
        s += f'<path d="{trim_d}" stroke="{trim_col}" stroke-width="2" fill="none"/>'
    return s


def body(world: int, v: int, fill: str, palette: list[str], color: str, skin: str, haircolor: str) -> str:
    a, b, c, d = palette

    if world == CREATURE:
        # Monster Mailroom: 0: broad moss courier, 1: moth clerk, 2: stone sorter,
        # 3: feather archivist, 4: many-footed mechanic, 5: fin-eared inspector
        return [
            f'<path d="M26 48q-4-18 16-16 12-14 24 0 16-12 24 2 12-4 10 14 14 16 0 28 8 22-8 28-28 6-56 0-16-6-8-28-14-12 0-28z" fill="{fill}"/><path d="M34 52l56 46" stroke="{c}" stroke-width="7" stroke-linecap="round"/><rect x="74" y="80" width="22" height="18" rx="4" fill="{b}"/>',
            f'<path d="M48 24q-14-16-18-4t6 18M78 24q14-16 18-4t-6 18" fill="none" stroke="{c}" stroke-width="3"/><path d="M42 56Q10 40 18 78q4 18 24 24M86 56q32-16 24 22-4 18-24 24" fill="{b}"/><ellipse cx="64" cy="68" rx="20" ry="34" fill="{fill}"/><path d="M52 46h24" stroke="{d}" stroke-width="3"/>',
            f'<path d="M28 58l18-24h36l20 24-8 38-28 12-30-12z" fill="{fill}"/><path d="M28 58l36 20 28-20M64 78v24" stroke="{d}" stroke-width="2.5" fill="none"/><rect x="36" y="86" width="56" height="8" rx="3" fill="{b}"/>',
            f'<path d="M54 22q10-14 20 0l-4 32q18 12 18 36-4 18-24 18t-24-18q0-24 18-36z" fill="{fill}"/><path d="M48 54q16-12 32 0-16 14-32 0z" fill="{c}"/><path d="M58 20l12-8" stroke="{d}" stroke-width="3"/>',
            f'<path d="M30 68q0-34 34-34t34 34q0 30-34 30t-34-30z" fill="{fill}"/><path d="M32 54q32-12 64 0M30 68q34-12 68 0M32 82q32-10 64 0" stroke="{b}" stroke-width="3.5" fill="none"/><circle cx="64" cy="88" r="7" fill="{c}"/>',
            f'<path d="M38 46q-20-12-14 18l14 8M90 46q20-12 14 18l-14 8" fill="{c}"/><path d="M38 52q0-22 26-22t26 22v32q-2 22-26 22t-26-22z" fill="{fill}"/><circle cx="64" cy="74" r="9" fill="{b}"/><circle cx="64" cy="74" r="5" fill="{d}"/>',
        ][v]

    if world == POCKET_LAB:
        # Little Helpers: 0: display cube, 1: 3-legged copper, 2: accordion neck,
        # 3: sphere on tracks, 4: articulated clamp, 5: multi-drawer automaton
        return [
            f'<rect x="34" y="32" width="60" height="68" rx="14" fill="{fill}"/><rect x="38" y="74" width="52" height="22" rx="4" fill="{b}"/><rect x="28" y="44" width="72" height="12" rx="4" fill="{d}"/><circle cx="48" cy="50" r="10" fill="{c}"/><circle cx="80" cy="50" r="10" fill="{c}"/>',
            f'<rect x="42" y="24" width="44" height="78" rx="10" fill="{fill}"/><path d="M38 52h52M38 62h52M38 72h52" stroke="{c}" stroke-width="4" stroke-linecap="round"/><circle cx="64" cy="38" r="6" fill="{d}"/>',
            f'<rect x="30" y="34" width="68" height="64" rx="8" fill="{fill}"/><circle cx="64" cy="58" r="16" fill="{b}"/><path d="M64 58l8-9" stroke="{d}" stroke-width="2.5"/><circle cx="46" cy="84" r="3.5" fill="{c}"/><circle cx="82" cy="84" r="3.5" fill="{c}"/>',
            f'<path d="M52 28h24v16l20 44q4 12-8 16H40q-12-4-8-16l20-44z" fill="{fill}"/><path d="M42 82q22 6 44 0" stroke="{c}" stroke-width="4"/><path d="M48 26h32" stroke="{d}" stroke-width="4"/>',
            f'<circle cx="64" cy="48" r="28" fill="{fill}"/><ellipse cx="64" cy="48" rx="34" ry="10" fill="none" stroke="{c}" stroke-width="3"/><path d="M48 76l32 6-32 7 32 6-32 7" fill="none" stroke="{b}" stroke-width="4"/>',
            f'<path d="M38 58l6-30h40l6 30v44H38z" fill="{fill}"/><circle cx="64" cy="34" r="14" fill="{b}" fill-opacity=".6" stroke="{c}" stroke-width="2"/><path d="M60 40l4-12 4 12" stroke="{d}" stroke-width="2" fill="none"/><path d="M64 64v34" stroke="{d}" stroke-width="2.5"/>',
        ][v]

    if world == BUREAU:
        # Heist Night: 0: planner, 1: comms, 2: researcher, 3: logistics, 4: analyst, 5: inspector
        coats = [
            "M30 103l8-46q24-18 50 0l8 46H74L63 86l-11 17zM44 58l20 20 20-20",
            "M32 103l7-45q25-15 50 0l7 45zM48 50h32v12H48z",
            "M28 103l8-42q28-20 56 0l8 42H72V66l-8-8-8 8v37z",
            "M26 103l12-46 26-6 26 6 12 46zM46 54h36",
            "M34 103l6-44q24-10 48 0l6 44H70l-6-24-6 24z",
            "M30 103l10-44q24-16 48 0l10 44-34-4zM50 62l14 18 14-18",
        ]
        return f'<path d="{coats[v]}" fill="{fill}"/>'

    if world == CONFECTIONERY:
        # Chocolate Factory: 0: artisan, 1: sugar automaton, 2: moth wrapper,
        # 3: kettle attendant, 4: ribbon mixer, 5: clockwork taster
        return [
            f'<path d="M34 70l-18-12v24zM94 70l18-12v24z" fill="{c}"/><ellipse cx="64" cy="70" rx="30" ry="28" fill="{fill}"/>',
            f'<path d="M34 74q-4-34 30-40 34 6 30 40z" fill="{fill}"/><path d="M38 72h52l-6 32H44z" fill="{b}"/>',
            f'<path d="M30 102V58l66-24v68z" fill="{fill}"/><path d="M30 80l66-12" stroke="{d}" stroke-width="5"/>',
            f'<path d="M36 104q-6-50 28-68 34 18 28 68z" fill="{fill}"/><circle cx="50" cy="84" r="2.5" fill="{d}"/><circle cx="76" cy="90" r="2.5" fill="{d}"/><circle cx="66" cy="78" r="2.5" fill="{d}"/>',
            f'<rect x="32" y="40" width="64" height="20" rx="10" fill="{fill}"/><rect x="30" y="62" width="68" height="20" rx="10" fill="{c}"/><rect x="32" y="84" width="64" height="20" rx="10" fill="{fill}"/>',
            f'<path d="M64 32q16 0 14 24 22 14 18 34-6 16-32 16t-32-16q-4-20 18-34-2-24 14-24z" fill="{fill}"/><path d="M96 80h10m-4-6v12" stroke="{c}" stroke-width="4"/>',
        ][v]

    if world == LANTERNWOOD:
        # Lantern Woods Guild: STRICT 16-BIT PIXEL ART
        # 0: mapmaker, 1: horned smith, 2: bird courier, 3: stone archivist, 4: herbalist, 5: appraiser
        return [
            f'<rect x="32" y="52" width="64" height="48" fill="{fill}"/><rect x="24" y="60" width="80" height="24" fill="{b}"/><rect x="40" y="40" width="48" height="16" fill="{c}"/>',
            f'<rect x="28" y="56" width="72" height="44" fill="{fill}"/><rect x="40" y="68" width="48" height="32" fill="{b}"/><rect x="24" y="24" width="16" height="32" fill="{c}"/><rect x="88" y="24" width="16" height="32" fill="{c}"/>',
            f'<rect x="36" y="48" width="56" height="52" fill="{fill}"/><rect x="16" y="56" width="20" height="36" fill="{c}"/><rect x="92" y="56" width="20" height="36" fill="{c}"/><rect x="52" y="32" width="24" height="20" fill="{b}"/>',
            f'<rect x="30" y="44" width="68" height="56" fill="{fill}"/><rect x="38" y="52" width="52" height="12" fill="{d}"/><rect x="38" y="72" width="52" height="12" fill="{d}"/>',
            f'<rect x="34" y="54" width="60" height="46" fill="{fill}"/><rect x="28" y="42" width="72" height="16" fill="{b}"/><rect x="44" y="66" width="40" height="24" fill="{c}"/>',
            f'<rect x="26" y="48" width="76" height="52" fill="{fill}"/><rect x="36" y="36" width="56" height="20" fill="{c}"/><rect x="46" y="68" width="36" height="32" fill="{d}"/>',
        ][v]

    if world == CAFE:
        # Coffee House Crew: 0: illustrator, 1: researcher, 2: organizer, 3: host, 4: architect, 5: editor
        coats = [
            "M30 103l8-42q26-16 52 0l8 42H70V64H58v39z",
            "M32 103l7-41q25-17 50 0l7 41z",
            "M28 103l8-38q28-22 56 0l8 38zM42 60q22-16 44 0q-22 10-44 0z",
            "M30 103l10-44 24 20 24-20 10 44z",
            "M34 103l6-42q24-12 48 0l6 42zM54 52h20v10H54z",
            "M36 103l8-42h40l8 42zM48 61l-3-9M80 61l3-9",
        ]
        return f'<path d="{coats[v]}" fill="{fill}"/>'

    if world == TUMBLETOWN:
        # Tumbletown: 0: crane, 1: bell, 2: teapot, 3: concertina, 4: spool, 5: umbrella
        return [
            f'<path d="M64 16v14m-12-8a7 7 0 1 1 24 0a7 7 0 1 1-24 0z" stroke="{c}" stroke-width="3" fill="none"/><rect x="34" y="32" width="60" height="66" rx="12" fill="{fill}"/><circle cx="64" cy="62" r="14" fill="{b}"/><circle cx="64" cy="62" r="6" fill="{d}"/>',
            f'<path d="M30 36l34-12 34 12-12 14 12 14-12 14 12 14-34 12-34-12 12-14-12-14 12-14z" fill="{fill}" stroke="{b}" stroke-width="2.5"/>',
            f'<rect x="40" y="44" width="48" height="56" rx="6" fill="{fill}"/><path d="M26 44h76M64 44v34" stroke="{c}" stroke-width="4"/><circle cx="34" cy="54" r="8" fill="{d}"/><circle cx="94" cy="54" r="8" fill="{d}"/>',
            f'<circle cx="64" cy="64" r="32" fill="{fill}"/><path d="M64 26v8M64 94v8M26 64h8M94 64h8M37 37l6 6M85 85l6 6M37 91l6-6M85 43l6-6" stroke="{b}" stroke-width="6"/><circle cx="64" cy="64" r="12" fill="{c}"/>',
            f'<rect x="44" y="34" width="40" height="68" rx="8" fill="{fill}"/><path d="M50 20h28v14H50z" fill="{c}"/><circle cx="70" cy="27" r="5" fill="{d}"/><path d="M44 54h40M44 76h40" stroke="{b}" stroke-width="3"/>',
            f'<path d="M38 48q-20-16-22 6zM90 48q20-16 22 6z" fill="{c}"/><path d="M36 100q-6-44 28-54 34 10 28 54z" fill="{fill}"/>',
        ][v]

    if world == ORBITAL:
        # Starport: 0: spider unit, 1: alien dome, 2: modular bot, 3: spacesuit, 4: float unit, 5: multi-arm
        return [
            f'<path d="M40 70l-14 30M52 72l-6 32M76 72l6 32M88 70l14 30" stroke="{b}" stroke-width="5" stroke-linecap="round"/><path d="M36 70q0-32 28-32t28 32z" fill="{fill}"/>',
            f'<path d="M64 26q30 34 22 60-6 18-22 18t-22-18q-8-26 22-60z" fill="{fill}" fill-opacity=".85"/><ellipse cx="64" cy="76" rx="10" ry="14" fill="{d}" opacity=".5"/>',
            f'<rect x="40" y="30" width="48" height="30" rx="6" fill="{fill}"/><rect x="32" y="60" width="64" height="40" rx="6" fill="{c}"/><path d="M44 70h40" stroke="{d}" stroke-width="3"/>',
            f'<path d="M38 104l4-36q22-14 44 0l4 36z" fill="{fill}"/><circle cx="64" cy="54" r="24" fill="{d}" fill-opacity=".45" stroke="{c}" stroke-width="4"/>',
            f'<ellipse cx="64" cy="70" rx="44" ry="10" fill="none" stroke="{c}" stroke-width="4"/><circle cx="64" cy="62" r="28" fill="{fill}"/>',
            f'<path d="M34 56L16 46M34 72l-20 4M94 56l18-10M94 72l20 4" stroke="{b}" stroke-width="5" stroke-linecap="round"/><path d="M64 30l30 17v34L64 98 34 81V47z" fill="{fill}"/>',
        ][v]

    if world == WILDLIGHT:
        # Critter Camp: STRICT 16-BIT PIXEL ART
        # 0: lantern beetle, 1: frilled quadruped, 2: pebble fox, 3: marsh bird, 4: coral crawler, 5: cloud amphibian
        return [
            f'<rect x="32" y="44" width="64" height="56" fill="{fill}"/><rect x="40" y="32" width="48" height="16" fill="{b}"/><rect x="48" y="20" width="8" height="16" fill="{c}"/><rect x="72" y="20" width="8" height="16" fill="{c}"/>',
            f'<rect x="24" y="56" width="80" height="44" fill="{fill}"/><rect x="40" y="40" width="48" height="20" fill="{c}"/><rect x="28" y="44" width="16" height="16" fill="{b}"/><rect x="84" y="44" width="16" height="16" fill="{b}"/>',
            f'<rect x="34" y="50" width="60" height="50" fill="{fill}"/><rect x="28" y="32" width="16" height="20" fill="{c}"/><rect x="84" y="32" width="16" height="20" fill="{c}"/><rect x="44" y="42" width="40" height="16" fill="{d}"/>',
            f'<rect x="40" y="42" width="48" height="58" fill="{fill}"/><rect x="20" y="54" width="24" height="34" fill="{c}"/><rect x="84" y="54" width="24" height="34" fill="{c}"/><rect x="52" y="26" width="24" height="20" fill="{b}"/>',
            f'<rect x="26" y="60" width="76" height="40" fill="{fill}"/><rect x="36" y="28" width="16" height="34" fill="{c}"/><rect x="76" y="28" width="16" height="34" fill="{c}"/>',
            f'<rect x="30" y="46" width="68" height="54" fill="{fill}"/><rect x="38" y="36" width="52" height="16" fill="{b}"/><rect x="44" y="74" width="40" height="20" fill="{d}"/>',
        ][v]

    if world == VOXEL:
        # Blockworks: STRICT ISOMETRIC VOXEL PIXEL ART
        # 0: wedge maker, 1: cylindrical survey, 2: hexagonal mechanic, 3: faceted courier, 4: arch, 5: tracked
        return [
            f'<rect x="32" y="48" width="64" height="52" fill="{fill}"/><polygon points="32,48 64,24 96,48" fill="{c}"/><rect x="44" y="64" width="40" height="24" fill="{b}"/>',
            f'<rect x="36" y="32" width="56" height="68" fill="{fill}"/><rect x="44" y="44" width="40" height="16" fill="{c}"/><rect x="36" y="80" width="56" height="20" fill="{b}"/>',
            f'<polygon points="40,36 88,36 104,68 88,100 40,100 24,68" fill="{fill}"/><rect x="44" y="56" width="40" height="24" fill="{c}"/>',
            f'<rect x="30" y="40" width="68" height="60" fill="{fill}"/><rect x="38" y="48" width="24" height="24" fill="{c}"/><rect x="66" y="48" width="24" height="24" fill="{b}"/><rect x="38" y="72" width="52" height="20" fill="{d}"/>',
            f'<rect x="28" y="36" width="72" height="64" fill="{fill}"/><rect x="44" y="64" width="40" height="36" fill="{mix(a, .2)}"/>',
            f'<rect x="34" y="40" width="60" height="48" fill="{fill}"/><rect x="24" y="88" width="80" height="16" fill="{b}"/><rect x="48" y="24" width="32" height="20" fill="{c}"/>',
        ][v]

    if world == CLOUDSPRING:
        # Cloudspring Baths: porcelain attendants
        # 0: crane, 1: kettle, 2: basin, 3: reed, 4: towel, 5: lantern
        return [
            f'<path d="M32 103l8-46q24-18 48 0l8 46z" fill="{fill}"/><path d="M40 56l24 24 24-24" fill="{c}"/><rect x="38" y="74" width="52" height="14" rx="2" fill="{b}"/>',
            f'<path d="M34 103l6-48q24-12 48 0l6 48z" fill="{fill}"/><path d="M44 54l20 28 20-28" stroke="{b}" stroke-width="4" fill="none"/><rect x="72" y="62" width="20" height="32" rx="4" fill="{d}"/>',
            f'<path d="M30 103l10-44q24-16 48 0l10 44z" fill="{fill}"/><path d="M38 66h52M38 78h52M38 90h52" stroke="{c}" stroke-width="3.5" stroke-linecap="round"/>',
            f'<path d="M28 103l10-48h56l10 48H84V64H44v39z" fill="{b}"/><rect x="46" y="58" width="36" height="42" fill="{fill}"/><circle cx="64" cy="76" r="6" fill="{c}"/>',
            f'<path d="M36 103l4-46q24-10 48 0l4 46z" fill="{fill}"/><path d="M38 80h52" stroke="{d}" stroke-width="6"/><circle cx="50" cy="88" r="4" fill="{c}"/><circle cx="64" cy="88" r="4" fill="{c}"/><circle cx="78" cy="88" r="4" fill="{c}"/>',
            f'<path d="M26 103l14-46 24 16 24-16 14 46z" fill="{b}"/><path d="M42 66l22 18 22-18v34H42z" fill="{fill}"/><circle cx="64" cy="50" r="5" fill="{c}"/>',
        ][v]

    if world == BUTTON:
        # Button & Spool: miniature makers
        # 0: stitcher, 1: measuring, 2: paper engineer, 3: thread courier, 4: drawer archivist, 5: loupe inspector
        coats = [
            "M34 103l6-38q24-14 48 0l6 38-20-6-8 6-8-6z",
            "M36 103l10-40h36l10 40zM46 63l-4-10M82 63l4-10",
            "M30 103q2-30 10-42q24-14 48 0 8 12 10 42z",
            "M32 103l8-40 24 10 24-10 8 40z",
            "M34 103l6-44q24-10 48 0l6 44z",
            "M26 103l14-44q24-16 48 0l14 44q-38 10-76 0z",
        ]
        return f'<path d="{coats[v]}" fill="{fill}"/>'

    if world == CLOCKWORK:
        # Clockwork Observatory: astronomical automata
        # 0: telescope, 1: compass, 2: pendulum, 3: lens, 4: gear, 5: sextant
        return [
            f'<path d="M50 28l-4-10h36l-4 10" fill="{c}"/><rect x="44" y="28" width="40" height="74" rx="12" fill="{fill}"/><path d="M44 48h40" stroke="{d}" stroke-width="3"/>',
            f'<circle cx="64" cy="66" r="34" fill="{fill}"/><circle cx="64" cy="66" r="28" fill="none" stroke="{d}" stroke-width="2"/><path d="M64 76l5 14-5 10-5-10z" fill="{c}"/>',
            f'<path d="M40 104V44l24-16 24 16v60z" fill="{fill}"/><path d="M64 72v18" stroke="{d}" stroke-width="2"/><circle cx="64" cy="94" r="5" fill="{c}"/>',
            f'<ellipse cx="64" cy="66" rx="26" ry="34" fill="{fill}" stroke="{c}" stroke-width="6"/><path d="M48 52q8-12 22-10" fill="none" stroke="#ffffff" stroke-width="3" opacity=".5"/>',
            f'<path d="M64 28l7 6 9-2 3 8 9 3-2 9 6 7-6 7 2 9-9 3-3 8-9-2-7 6-7-6-9 2-3-8-9-3 2-9-6-7 6-7-2-9 9-3 3-8 9 2z" fill="{fill}"/><circle cx="64" cy="66" r="12" fill="none" stroke="{d}" stroke-width="3"/>',
            f'<path d="M30 96L64 30l34 66z" fill="{fill}"/><path d="M36 90q28-16 56 0" fill="none" stroke="{c}" stroke-width="4"/><circle cx="64" cy="30" r="5" fill="{c}"/>',
        ][v]

    if world == CORAL:
        # Reef Town: marine creatures
        # 0: octopus maker, 1: banded shrimp, 2: manta ray, 3: hermit crab, 4: seahorse, 5: cuttlefish
        return [
            f'<ellipse cx="64" cy="52" rx="30" ry="24" fill="{fill}"/><path d="M38 68q-18 16 0 28t18-12M52 74q-10 20 6 24t10-18M76 74q10 20-6 24t-10-18M90 68q18 16 0 28t-18-12" fill="none" stroke="{c}" stroke-width="6" stroke-linecap="round"/>',
            f'<path d="M54 26q16-10 24 4t-8 26l6 24q2 18-16 18t-12-14" fill="none" stroke="{fill}" stroke-width="14" stroke-linecap="round"/><path d="M50 48h18M52 58h18M54 68h16" stroke="{c}" stroke-width="4"/><circle cx="68" cy="30" r="4" fill="{d}"/>',
            f'<ellipse cx="64" cy="72" rx="28" ry="22" fill="{fill}"/><path d="M44 48q20-24 40 0t-20 24z" fill="{b}"/><circle cx="64" cy="48" r="8" fill="{c}"/><path d="M26 76q-8-14 8-16M102 76q8-14-8-16" fill="none" stroke="{d}" stroke-width="6"/>',
            f'<path d="M64 36L18 68l46 28 46-28z" fill="{fill}"/><path d="M64 64v38" stroke="{c}" stroke-width="4"/><circle cx="50" cy="52" r="3.5" fill="{d}"/><circle cx="78" cy="52" r="3.5" fill="{d}"/>',
            f'<path d="M40 98q-6-36 24-42 30 6 24 42z" fill="{fill}"/><path d="M36 54q-8-22 6-26 10 16 6 26M50 50q-4-24 10-24 6 18 2 24M78 50q4-24-10-24-6 18-2 24M92 54q8-22-6-26-10 16-6 26" fill="{c}"/>',
            f'<ellipse cx="64" cy="68" rx="34" ry="26" fill="{fill}" stroke="{c}" stroke-width="4"/><path d="M64 48v40M46 58l18 10 18-10M46 78l18-10 18 10" stroke="{d}" stroke-width="2.5"/><circle cx="64" cy="34" r="10" fill="{b}"/>',
        ][v]

    if world == MEADOW:
        # Cozy Critter Village: 0: field mouse, 1: badger, 2: swallow, 3: tortoise, 4: goat, 5: hedgehog
        return [
            f'<circle cx="40" cy="36" r="14" fill="{color}"/><circle cx="88" cy="36" r="14" fill="{color}"/><path d="M38 96q-8-40 26-58 34 18 26 58z" fill="{fill}"/><path d="M90 92q22 4 14-16" fill="none" stroke="{color}" stroke-width="4" stroke-linecap="round"/>',
            f'<path d="M32 50l4-12 10 8M96 50l-4-12-10 8" fill="{color}"/><rect x="26" y="44" width="76" height="60" rx="26" fill="{fill}"/><path d="M58 44h12v26q-6 6-12 0z" fill="{b}"/>',
            f'<path d="M38 64L14 86l26-6M90 64l24 22-26-6" fill="{c}"/><path d="M64 30q30 10 26 50l-26 24-26-24q-4-40 26-50z" fill="{fill}"/><path d="M56 102l8-8 8 8" fill="{c}"/>',
            f'<ellipse cx="64" cy="52" rx="18" ry="16" fill="{color}"/><path d="M26 98q0-40 38-40t38 40z" fill="{fill}"/><path d="M44 80l10-10h20l10 10-10 10H54zM30 88h14M84 88h14" fill="none" stroke="{b}" stroke-width="3"/>',
            f'<path d="M44 34q-14-14-2-22 12 4 6 16M84 34q14-14 2-22-12 4-6 16" fill="none" stroke="{c}" stroke-width="5" stroke-linecap="round"/><ellipse cx="64" cy="70" rx="24" ry="34" fill="{fill}"/><path d="M60 82l4 12 4-12" fill="{d}"/>',
            f'<path d="M24 96q0-56 40-58 40 2 40 58zM28 62l-8-8 12 0M34 46l-4-12 12 6M50 36l2-12 8 10M78 36l6-10 4 12M94 46l8-8v12" fill="{b}"/><ellipse cx="64" cy="68" rx="22" ry="20" fill="{fill}"/>',
        ][v]

    return f'<path d="M34 59q0-29 29-29t30 29v24q-1 21-30 21T34 83z" fill="{fill}"/>'


# ==============================================================================
# 2. BESPOKE RIG (shadow, limbs, face, tool, extras)
# Replaces the generic robot mannequin with authentic anatomy & held items.
# ==============================================================================

def cast_rig(world: int, v: int, palette: list[str], color: str, skin: str, haircolor: str) -> tuple[str, str, str, str, str]:
    a, b, c, d = palette
    accent = mix(c, .7, (255, 230, 195))
    is_pixel = world in (4, 8, 9)

    # Defaults
    shadow = '<ellipse cx="64" cy="114" rx="34" ry="7" fill="#091726" opacity=".24"/>'
    limbs = ''
    face = ''
    tool = ''
    extras = ''

    if world == CREATURE:
        # Monster Mailroom
        shadow = f'<ellipse cx="64" cy="114" rx="{[38, 28, 42, 26, 40, 28][v]}" ry="7" fill="#091726" opacity=".26"/>'
        if v == 0:  # broad moss courier
            limbs = f'<path d="M42 96l-6 18h16M74 96l6 18h16" stroke="{b}" stroke-width="8" stroke-linecap="round"/>'
            face = f'<circle cx="50" cy="56" r="4.5" fill="{d}"/><circle cx="78" cy="56" r="4.5" fill="{d}"/><circle cx="51" cy="55" r="1.5" fill="#fff"/><circle cx="79" cy="55" r="1.5" fill="#fff"/><path d="M60 66h8" stroke="{d}" stroke-width="3" stroke-linecap="round"/>'
            tool = f'<rect x="86" y="78" width="26" height="20" rx="3" fill="{b}" stroke="{d}" stroke-width="2"/><path d="M92 84h14" stroke="{c}" stroke-width="2"/>'
        elif v == 1:  # moth clerk
            limbs = f'<path d="M52 100l-4 14h10M72 100l4 14h10" stroke="{c}" stroke-width="5" stroke-linecap="round"/>'
            face = f'<ellipse cx="56" cy="52" rx="3" ry="5" fill="{b}"/><ellipse cx="72" cy="52" rx="3" ry="5" fill="{b}"/>'
            tool = f'<path d="M88 74l20-16" stroke="{d}" stroke-width="3" stroke-linecap="round"/><path d="M96 70l-6 12 10-6z" fill="{c}"/>'
        elif v == 2:  # stone sorter
            limbs = f'<rect x="38" y="98" width="16" height="16" rx="3" fill="{mix(b, .6)}"/><rect x="74" y="98" width="16" height="16" rx="3" fill="{mix(b, .6)}"/>'
            face = f'<rect x="48" y="52" width="10" height="4" fill="{d}"/><rect x="70" y="52" width="10" height="4" fill="{d}"/>'
            tool = f'<rect x="88" y="80" width="22" height="22" rx="2" fill="{d}" stroke="{b}" stroke-width="2"/>'
        elif v == 3:  # feather archivist
            limbs = f'<path d="M54 98v16m-6 0h12M74 98v16m-6 0h12" stroke="{b}" stroke-width="3"/>'
            face = f'<circle cx="58" cy="40" r="3.5" fill="{b}"/><path d="M64 42l10 3-10 3z" fill="{c}"/>'
            tool = f'<rect x="88" y="72" width="8" height="30" rx="4" fill="{d}" stroke="{c}" stroke-width="2"/>'
        elif v == 4:  # many-footed mechanic
            limbs = f'<path d="M36 104l-4 10M50 104l-2 10M64 104v10M78 104l2 10M92 104l4 10" stroke="{b}" stroke-width="5" stroke-linecap="round"/>'
            face = f'<circle cx="48" cy="62" r="3" fill="{d}"/><circle cx="64" cy="58" r="4" fill="{d}"/><circle cx="80" cy="62" r="3" fill="{d}"/>'
            tool = f'<path d="M94 74l16-8m-3-4l6 8" stroke="{d}" stroke-width="4" stroke-linecap="round"/>'
        elif v == 5:  # fin-eared inspector
            limbs = f'<path d="M48 96l-4 18h12M76 96l4 18h12" stroke="{b}" stroke-width="6" stroke-linecap="round"/>'
            face = f'<circle cx="54" cy="56" r="4" fill="{d}"/><circle cx="74" cy="56" r="4" fill="{d}"/><circle cx="55" cy="55" r="1.5" fill="#fff"/><circle cx="75" cy="55" r="1.5" fill="#fff"/>'
            tool = f'<circle cx="98" cy="78" r="9" fill="none" stroke="{c}" stroke-width="3"/><line x1="92" y1="84" x2="84" y2="94" stroke="{d}" stroke-width="4"/>'

    elif world == POCKET_LAB:
        # Little Helpers Laboratory
        if v == 0:  # display cube
            shadow = '<rect x="36" y="110" width="56" height="8" rx="4" fill="#091726" opacity=".24"/>'
            limbs = f'<path d="M46 100l-6 14h14M76 100l6 14h14" stroke="{d}" stroke-width="6"/>'
            face = f'<line x1="46" y1="52" x2="82" y2="52" stroke="{d}" stroke-width="3"/><circle cx="52" cy="52" r="2" fill="{a}"/>'
            tool = f'<path d="M94 70l14-6v16" stroke="{c}" stroke-width="3" fill="none"/>'
        elif v == 1:  # 3-legged copper instrument
            shadow = '<ellipse cx="64" cy="114" rx="28" ry="6" fill="#091726" opacity=".24"/>'
            limbs = f'<path d="M44 98l-12 16M64 102v12M84 98l12 16" stroke="{c}" stroke-width="5" stroke-linecap="round"/>'
            face = f'<circle cx="64" cy="46" r="8" fill="{d}" stroke="{b}" stroke-width="2"/><line x1="64" y1="46" x2="68" y2="42" stroke="{a}" stroke-width="2"/>'
            tool = f'<line x1="90" y1="68" x2="108" y2="60" stroke="{c}" stroke-width="3"/><circle cx="108" cy="60" r="3" fill="{d}"/>'
        elif v == 2:  # accordion neck
            shadow = '<ellipse cx="64" cy="114" rx="30" ry="6" fill="#091726" opacity=".24"/>'
            limbs = f'<rect x="42" y="98" width="14" height="16" fill="{d}"/><rect x="72" y="98" width="14" height="16" fill="{d}"/>'
            face = f'<circle cx="52" cy="44" r="5" fill="{b}"/><circle cx="76" cy="44" r="5" fill="{b}"/><circle cx="52" cy="44" r="2" fill="{d}"/><circle cx="76" cy="44" r="2" fill="{d}"/>'
            tool = f'<path d="M92 74l18-4M96 70v12" stroke="{d}" stroke-width="2.5"/>'
        elif v == 3:  # ceramic sphere on tracks
            shadow = '<rect x="34" y="110" width="60" height="8" rx="4" fill="#091726" opacity=".24"/>'
            limbs = f'<rect x="36" y="104" width="56" height="10" rx="3" fill="{d}"/><line x1="42" y1="109" x2="86" y2="109" stroke="{c}" stroke-width="2" stroke-dasharray="4 4"/>'
            face = f'<ellipse cx="64" cy="44" rx="14" ry="4" fill="{b}"/><circle cx="64" cy="44" r="2.5" fill="{d}"/>'
            tool = f'<rect x="90" y="76" width="6" height="24" rx="3" fill="{c}" stroke="{d}" stroke-width="1.5"/>'
        elif v == 4:  # clamp helper
            shadow = '<ellipse cx="64" cy="114" rx="26" ry="6" fill="#091726" opacity=".24"/>'
            limbs = f'<path d="M50 96l-8 18M78 96l8 18" stroke="{d}" stroke-width="6"/>'
            face = f'<circle cx="64" cy="48" r="10" fill="{d}" stroke="{b}" stroke-width="2"/><circle cx="64" cy="48" r="4" fill="{c}"/>'
            tool = f'<path d="M92 68l12-10 6 8" stroke="{c}" stroke-width="3" fill="none"/><circle cx="110" cy="66" r="4" fill="{d}"/>'
        elif v == 5:  # tiny multi-drawer automaton
            shadow = '<rect x="40" y="110" width="48" height="8" rx="3" fill="#091726" opacity=".24"/>'
            limbs = f'<rect x="44" y="100" width="10" height="14" fill="{d}"/><rect x="74" y="100" width="10" height="14" fill="{d}"/>'
            face = f'<circle cx="56" cy="44" r="3" fill="{d}"/><circle cx="72" cy="44" r="3" fill="{d}"/>'
            tool = f'<path d="M92 80l16-6m-16 2l16 6" stroke="{c}" stroke-width="2"/>'

    elif world == BUREAU:
        # Midnight Bureau: human specialist crew
        heads = [(63, 38, 19, 23), (63, 38, 18, 24), (63, 38, 22, 21), (63, 38, 20, 22), (63, 38, 17, 24), (63, 38, 21, 22)]
        hairstyles = [
            "M40 38q-4-28 23-28 27 0 23 28-6-8-23-8t-23 8z",
            "M42 32q0-20 21-20t21 20l-4-6h-34z",
            "M39 36a8 8 0 0 1 12-14a9 9 0 0 1 16-6a9 9 0 0 1 14 6a8 8 0 0 1 6 14z",
            "M44 32q4-22 19-22t19 22l-6-4H48z",
            "M42 34q0-24 21-24t21 24l-6-8H46zM82 28q12 6 8 24l-4-18z",
            "M38 52q-4-40 25-40t25 40l-6-6-2-20q-17-6-34 0l-2 20z",
        ]
        cx, cy, rx, ry = heads[v]
        limbs = f'<path d="M46 95l-4 19h14M72 95l4 19h14" stroke="{mix(b, .4)}" stroke-width="6" stroke-linecap="round"/>'
        face = (f'<ellipse cx="{cx}" cy="{cy}" rx="{rx}" ry="{ry}" fill="{skin}"/>'
                f'<path d="{hairstyles[v]}" fill="{haircolor}"/>'
                f'<circle cx="56" cy="40" r="2" fill="#172c39"/><circle cx="70" cy="40" r="2" fill="#172c39"/>')
        if v == 0:  # rolled drawings
            tool = f'<rect x="88" y="74" width="28" height="8" rx="4" transform="rotate(-30 88 74)" fill="{d}" stroke="{b}" stroke-width="1.5"/>'
        elif v == 1:  # headset comms
            face += f'<path d="M46 40v12h10" fill="none" stroke="{d}" stroke-width="2"/><circle cx="46" cy="40" r="3" fill="{c}"/>'
            tool = f'<rect x="90" y="80" width="14" height="22" rx="3" fill="{b}" stroke="{d}" stroke-width="1.5"/>'
        elif v == 2:  # tabbed notebook
            tool = f'<rect x="88" y="74" width="22" height="26" rx="2" fill="{d}" stroke="{b}" stroke-width="1.5"/><line x1="88" y1="80" x2="110" y2="80" stroke="{c}" stroke-width="2"/>'
        elif v == 3:  # security case
            tool = f'<rect x="86" y="82" width="28" height="18" rx="2" fill="{b}" stroke="{d}" stroke-width="1.5"/><path d="M96 82v-4h8v4" fill="none" stroke="{d}" stroke-width="2"/>'
        elif v == 4:  # tablet
            tool = f'<rect x="88" y="74" width="22" height="28" rx="3" fill="{b}" stroke="{c}" stroke-width="1.5"/><line x1="92" y1="82" x2="106" y2="82" stroke="{d}" stroke-width="1.5"/>'
        elif v == 5:  # loupe
            tool = f'<circle cx="98" cy="74" r="8" fill="none" stroke="{c}" stroke-width="2.5"/><line x1="94" y1="80" x2="86" y2="92" stroke="{d}" stroke-width="3"/>'

    elif world == CONFECTIONERY:
        # Chocolate Factory: unique outfits & confectionery tools
        limbs = f'<path d="M46 96l-4 18h14M72 96l4 18h14" stroke="{mix(b, .6)}" stroke-width="7" stroke-linecap="round"/>'
        if v == 0:  # pastry artisan
            face = f'<ellipse cx="64" cy="42" rx="18" ry="20" fill="{skin}"/><circle cx="57" cy="42" r="2.5" fill="{b}"/><circle cx="71" cy="42" r="2.5" fill="{b}"/>'
            extras = f'<path d="M44 32q-8-14 6-18 8-10 18-4 12-8 18 6 10 4 2 16z" fill="#fbf6ec"/><path d="M44 32h39" stroke="{c}" stroke-width="2"/>'
            tool = f'<path d="M92 74l18-18" stroke="{d}" stroke-width="3"/><path d="M106 60q6-6 10 0t-10 10z" fill="none" stroke="{c}" stroke-width="2"/>'
        elif v == 1:  # sugar automaton
            face = f'<rect x="52" y="32" width="24" height="24" rx="4" fill="{d}" stroke="{c}" stroke-width="2"/><circle cx="58" cy="44" r="3" fill="{a}"/><circle cx="70" cy="44" r="3" fill="{a}"/>'
            tool = f'<path d="M90 78l18-8v12l-18 4z" fill="{c}" stroke="{d}" stroke-width="1.5"/>'
        elif v == 2:  # moth wrapper
            face = f'<ellipse cx="64" cy="44" rx="16" ry="18" fill="{skin}"/><path d="M52 24l-8-12M76 24l8-12" stroke="{c}" stroke-width="2.5"/>'
            tool = f'<path d="M94 76l14-10m-14 0l14 10" stroke="{d}" stroke-width="3"/>'
        elif v == 3:  # kettle attendant
            face = f'<circle cx="64" cy="40" r="14" fill="{b}"/><circle cx="58" cy="40" r="2.5" fill="{d}"/><circle cx="70" cy="40" r="2.5" fill="{d}"/>'
            tool = f'<path d="M90 76l16-16" stroke="{c}" stroke-width="3"/><circle cx="106" cy="60" r="6" fill="{d}"/>'
        elif v == 4:  # ribbon mixer
            face = f'<ellipse cx="64" cy="42" rx="18" ry="20" fill="{skin}"/><path d="M46 32q-10 14 0 28M82 32q10 14 0 28" stroke="{c}" stroke-width="4" fill="none"/>'
            tool = f'<path d="M92 72l16 16m-12-6l8-8" stroke="{d}" stroke-width="3"/>'
        elif v == 5:  # clockwork taster
            face = f'<ellipse cx="64" cy="42" rx="16" ry="18" fill="{b}"/><circle cx="70" cy="42" r="6" fill="none" stroke="{c}" stroke-width="2"/><circle cx="58" cy="42" r="2" fill="{d}"/>'
            tool = f'<path d="M92 82l16-6" stroke="{c}" stroke-width="3"/><circle cx="108" cy="76" r="4" fill="{d}"/>'

    elif world == LANTERNWOOD:
        # Lantern Woods Guild: STRICT 16-BIT PIXEL ART
        shadow = '<rect x="36" y="112" width="56" height="6" fill="#091726"/>'
        limbs = f'<rect x="44" y="98" width="12" height="16" fill="{b}"/><rect x="72" y="98" width="12" height="16" fill="{b}"/>'
        if v == 0:  # mapmaker
            face = f'<rect x="52" y="36" width="24" height="20" fill="{skin}"/><rect x="56" y="44" width="4" height="4" fill="#172c39"/><rect x="68" y="44" width="4" height="4" fill="#172c39"/>'
            tool = f'<rect x="88" y="76" width="20" height="24" fill="{d}"/><rect x="92" y="80" width="12" height="16" fill="{c}"/>'
        elif v == 1:  # horned smith
            face = f'<rect x="50" y="38" width="28" height="22" fill="{skin}"/><rect x="54" y="46" width="4" height="4" fill="#172c39"/><rect x="70" y="46" width="4" height="4" fill="#172c39"/>'
            tool = f'<rect x="92" y="70" width="8" height="28" fill="{d}"/><rect x="88" y="70" width="16" height="8" fill="{b}"/>'
        elif v == 2:  # bird courier
            face = f'<rect x="52" y="32" width="24" height="20" fill="{b}"/><rect x="62" y="40" width="12" height="8" fill="{d}"/>'
            tool = f'<rect x="90" y="76" width="16" height="20" fill="{d}"/><rect x="94" y="78" width="8" height="4" fill="{c}"/>'
        elif v == 3:  # stone archivist
            face = f'<rect x="52" y="34" width="24" height="20" fill="{c}"/><rect x="56" y="40" width="4" height="4" fill="{d}"/><rect x="68" y="40" width="4" height="4" fill="{d}"/>'
            tool = f'<rect x="88" y="72" width="24" height="28" fill="{b}"/><rect x="92" y="76" width="16" height="4" fill="{d}"/>'
        elif v == 4:  # herbal engineer
            face = f'<rect x="52" y="36" width="24" height="20" fill="{skin}"/><rect x="56" y="44" width="4" height="4" fill="#172c39"/><rect x="68" y="44" width="4" height="4" fill="#172c39"/>'
            tool = f'<rect x="94" y="74" width="12" height="20" fill="{c}"/><rect x="98" y="70" width="4" height="6" fill="{d}"/>'
        elif v == 5:  # cloak appraiser
            face = f'<rect x="48" y="32" width="32" height="24" fill="{mix(a, .4)}"/><rect x="56" y="42" width="4" height="4" fill="{c}"/><rect x="68" y="42" width="4" height="4" fill="{c}"/>'
            tool = f'<rect x="90" y="74" width="16" height="20" fill="{d}"/><rect x="94" y="78" width="8" height="8" fill="{c}"/>'

    elif world == CAFE:
        # Coffee House Crew: everyday regulars
        heads = [(63, 39, 20, 22), (63, 39, 18, 24), (63, 39, 23, 20), (63, 39, 19, 23), (63, 39, 22, 21), (63, 39, 17, 25)]
        hairstyles = [
            "M40 44q-6-32 23-32 29 0 23 32l-4 10-6-22q-13 6-26 0l-6 22z",
            "M42 34q2-22 21-22t21 22zM56 12a8 8 0 1 0 16 0a8 8 0 1 0-16 0z",
            "M40 36a8 8 0 0 1 10-14a9 9 0 0 1 16-6a9 9 0 0 1 15 6a8 8 0 0 1 7 14z",
            "M44 30q4-18 19-18t19 18l-4-4H48z",
            "M42 36q0-24 21-24t21 24l-4-8H46zM84 30q14 6 10 26l-6-20z",
            "M38 58q-6-46 25-46t25 46l-6-6-2-24q-17-8-34 0l-2 24z",
        ]
        cx, cy, rx, ry = heads[v]
        limbs = f'<path d="M46 95l-4 19h14M72 95l4 19h14" stroke="{mix(b, .4)}" stroke-width="6" stroke-linecap="round"/>'
        face = (f'<ellipse cx="{cx}" cy="{cy}" rx="{rx}" ry="{ry}" fill="{skin}"/>'
                f'<path d="{hairstyles[v]}" fill="{haircolor}"/>'
                f'<circle cx="56" cy="40" r="2" fill="#172c39"/><circle cx="70" cy="40" r="2" fill="#172c39"/>')
        if v == 0:  # sketchbook
            tool = f'<rect x="88" y="76" width="22" height="24" rx="2" fill="{d}" stroke="{b}" stroke-width="1.5"/><line x1="106" y1="72" x2="114" y2="84" stroke="{c}" stroke-width="2"/>'
        elif v == 1:  # book stack
            face += f'<circle cx="56" cy="40" r="4.5" fill="none" stroke="{b}" stroke-width="1.5"/><circle cx="70" cy="40" r="4.5" fill="none" stroke="{b}" stroke-width="1.5"/>'
            tool = f'<rect x="86" y="80" width="26" height="8" rx="2" fill="{c}"/><rect x="88" y="74" width="22" height="8" rx="2" fill="{d}"/>'
        elif v == 2:  # organizer clipboard
            tool = f'<rect x="88" y="76" width="20" height="26" rx="2" fill="{b}" stroke="{d}" stroke-width="1.5"/><line x1="92" y1="82" x2="104" y2="82" stroke="{c}" stroke-width="2"/>'
        elif v == 3:  # espresso cup
            tool = f'<ellipse cx="98" cy="84" rx="10" ry="3" fill="{d}"/><path d="M92 82v-8h12v8z" fill="{c}"/><path d="M104 76q6 2 0 6" fill="none" stroke="{c}" stroke-width="1.5"/>'
        elif v == 4:  # blueprint tube
            tool = f'<rect x="86" y="74" width="28" height="8" rx="4" transform="rotate(-35 86 74)" fill="{c}" stroke="{d}" stroke-width="1.5"/>'
        elif v == 5:  # manuscript proof
            tool = f'<rect x="88" y="74" width="22" height="26" rx="1" fill="{d}" stroke="{b}" stroke-width="1.5"/><line x1="104" y1="70" x2="112" y2="80" stroke="{c}" stroke-width="2.5"/>'

    elif world == TUMBLETOWN:
        # Tumbletown Rhyme Works: whimsical inventions
        if v == 0:  # origami crane
            limbs = f'<path d="M50 96l-6 18M78 96l6 18" stroke="{b}" stroke-width="4"/>'
            face = f'<path d="M64 26l14-6-6 12z" fill="{c}"/>'
            tool = f'<line x1="90" y1="74" x2="112" y2="80" stroke="{d}" stroke-width="3"/>'
        elif v == 1:  # bell tinkerer
            limbs = f'<circle cx="50" cy="110" r="5" fill="{d}"/><circle cx="78" cy="110" r="5" fill="{d}"/>'
            face = f'<circle cx="56" cy="46" r="3" fill="{d}"/><circle cx="72" cy="46" r="3" fill="{d}"/>'
            tool = f'<path d="M92 76l14-4m-4-6a6 6 0 1 1 0 12" stroke="{c}" stroke-width="2.5" fill="none"/>'
        elif v == 2:  # teapot creature
            limbs = f'<path d="M46 98l-8 16M82 98l8 16" stroke="{c}" stroke-width="3.5"/>'
            face = f'<circle cx="64" cy="54" r="4" fill="{d}"/>'
            tool = f'<line x1="92" y1="70" x2="108" y2="60" stroke="{d}" stroke-width="2.5"/><circle cx="108" cy="60" r="5" fill="{c}"/>'
        elif v == 3:  # concertina clerk
            limbs = f'<path d="M48 98v16M80 98v16" stroke="{b}" stroke-width="5"/>'
            face = f'<ellipse cx="56" cy="50" rx="3" ry="5" fill="{d}"/><ellipse cx="72" cy="50" rx="3" ry="5" fill="{d}"/>'
            tool = f'<rect x="92" y="78" width="16" height="12" rx="2" fill="{d}"/><rect x="96" y="70" width="8" height="8" fill="{b}"/>'
        elif v == 4:  # spool courier
            limbs = f'<path d="M46 100l-4 14M82 100l4 14" stroke="{b}" stroke-width="5"/>'
            face = f'<circle cx="58" cy="44" r="3" fill="{d}"/><circle cx="70" cy="44" r="3" fill="{d}"/>'
            tool = f'<rect x="90" y="76" width="22" height="16" rx="2" fill="{d}" stroke="{c}" stroke-width="1.5"/><path d="M90 76l11 10 11-10" fill="none" stroke="{c}" stroke-width="1.5"/>'
        elif v == 5:  # umbrella inspector
            limbs = f'<path d="M50 98l-6 16M78 98l6 16" stroke="{b}" stroke-width="4"/>'
            face = f'<circle cx="56" cy="58" r="3.5" fill="{d}"/><circle cx="72" cy="58" r="3.5" fill="{d}"/>'
            tool = f'<path d="M92 78l12-12q12 0 6 12t-12-6" stroke="{c}" stroke-width="2.5" fill="none"/>'

    elif world == ORBITAL:
        # Starport Shipyard: sci-fi engineering crew
        if v == 0:  # spider repair unit
            limbs = f'<path d="M36 78L18 96l6 18M48 82L38 100l-4 14M80 82l10 18 4 14M92 78l18 18-6 18" stroke="{b}" stroke-width="4" stroke-linecap="round" fill="none"/>'
            face = f'<circle cx="56" cy="54" r="3" fill="{c}"/><circle cx="64" cy="50" r="3" fill="{d}"/><circle cx="72" cy="54" r="3" fill="{c}"/>'
            tool = f'<path d="M96 74l16-6" stroke="{d}" stroke-width="3"/><circle cx="112" cy="68" r="3" fill="{c}"/>'
        elif v == 1:  # alien surveyor
            limbs = f'<path d="M52 100l-6 14M76 100l6 14" stroke="{mix(b, .7)}" stroke-width="5" stroke-linecap="round"/>'
            face = f'<circle cx="64" cy="46" r="8" fill="{d}" fill-opacity=".6"/><circle cx="64" cy="46" r="3" fill="{c}"/>'
            tool = f'<circle cx="96" cy="74" r="8" fill="none" stroke="{c}" stroke-width="2"/><circle cx="96" cy="74" r="3" fill="{d}"/>'
        elif v == 2:  # modular bot
            limbs = f'<rect x="42" y="98" width="14" height="16" fill="{d}"/><rect x="72" y="98" width="14" height="16" fill="{d}"/>'
            face = f'<rect x="48" y="38" width="32" height="12" rx="3" fill="{d}"/><circle cx="56" cy="44" r="2.5" fill="{c}"/><circle cx="72" cy="44" r="2.5" fill="{c}"/>'
            tool = f'<line x1="90" y1="74" x2="110" y2="74" stroke="{c}" stroke-width="4"/><circle cx="112" cy="74" r="3" fill="{d}"/>'
        elif v == 3:  # spacesuit
            limbs = f'<path d="M46 98l-4 16h14M72 98l4 16h14" stroke="{mix(b, .5)}" stroke-width="7" stroke-linecap="round"/>'
            face = f'<ellipse cx="64" cy="54" rx="16" ry="12" fill="{c}" stroke="{d}" stroke-width="2"/>'
            tool = f'<path d="M92 78l16-8m-3-4l6 8" stroke="{d}" stroke-width="3.5" stroke-linecap="round"/>'
        elif v == 4:  # float unit
            limbs = f'<path d="M52 104l-6 10M76 104l6 10" stroke="{c}" stroke-width="3"/>'
            face = f'<circle cx="64" cy="56" r="6" fill="{d}"/><line x1="52" y1="56" x2="76" y2="56" stroke="{c}" stroke-width="2"/>'
            tool = f'<polygon points="98,68 106,78 98,88 90,78" fill="{c}" stroke="{d}" stroke-width="1.5"/>'
        elif v == 5:  # multi-arm
            limbs = f'<path d="M48 98l-4 16M80 98l4 16" stroke="{b}" stroke-width="6"/>'
            face = f'<circle cx="56" cy="46" r="3" fill="{d}"/><circle cx="72" cy="46" r="3" fill="{d}"/>'
            tool = f'<path d="M96 66l12-8M98 80l14 2M96 92l10 8" stroke="{c}" stroke-width="3" fill="none"/>'

    elif world == WILDLIGHT:
        # Critter Camp: STRICT 16-BIT PIXEL ART
        shadow = '<rect x="36" y="112" width="56" height="6" fill="#091726"/>'
        if v == 0:  # lantern beetle
            limbs = f'<rect x="32" y="98" width="8" height="16" fill="{b}"/><rect x="52" y="98" width="8" height="16" fill="{b}"/><rect x="68" y="98" width="8" height="16" fill="{b}"/><rect x="88" y="98" width="8" height="16" fill="{b}"/>'
            face = f'<rect x="52" y="36" width="6" height="6" fill="{d}"/><rect x="70" y="36" width="6" height="6" fill="{d}"/>'
            tool = f'<rect x="94" y="74" width="16" height="20" fill="{c}"/><rect x="98" y="78" width="8" height="10" fill="{accent}"/>'
        elif v == 1:  # frilled quadruped
            limbs = f'<rect x="28" y="98" width="12" height="16" fill="{b}"/><rect x="46" y="98" width="12" height="16" fill="{b}"/><rect x="70" y="98" width="12" height="16" fill="{b}"/><rect x="88" y="98" width="12" height="16" fill="{b}"/>'
            face = f'<rect x="54" y="46" width="6" height="6" fill="{d}"/><rect x="68" y="46" width="6" height="6" fill="{d}"/>'
            tool = f'<rect x="94" y="70" width="8" height="20" fill="{c}"/><rect x="98" y="72" width="12" height="6" fill="{d}"/>'
        elif v == 2:  # pebble fox
            limbs = f'<rect x="42" y="98" width="10" height="16" fill="{b}"/><rect x="76" y="98" width="10" height="16" fill="{b}"/>'
            face = f'<rect x="54" y="44" width="6" height="6" fill="{d}"/><rect x="68" y="44" width="6" height="6" fill="{d}"/><rect x="62" y="52" width="4" height="4" fill="{b}"/>'
            tool = f'<rect x="90" y="76" width="18" height="22" fill="{d}"/><rect x="94" y="80" width="10" height="4" fill="{c}"/>'
        elif v == 3:  # marsh bird
            limbs = f'<rect x="54" y="98" width="4" height="16" fill="{d}"/><rect x="70" y="98" width="4" height="16" fill="{d}"/>'
            face = f'<rect x="58" y="32" width="6" height="6" fill="{b}"/><rect x="64" y="34" width="16" height="6" fill="{c}"/>'
            tool = f'<rect x="92" y="74" width="16" height="16" fill="{c}"/><rect x="96" y="78" width="8" height="8" fill="{d}"/>'
        elif v == 4:  # coral crawler
            limbs = f'<rect x="24" y="98" width="8" height="16" fill="{b}"/><rect x="44" y="98" width="8" height="16" fill="{b}"/><rect x="76" y="98" width="8" height="16" fill="{b}"/><rect x="96" y="98" width="8" height="16" fill="{b}"/>'
            face = f'<rect x="52" y="56" width="6" height="6" fill="{d}"/><rect x="70" y="56" width="6" height="6" fill="{d}"/>'
            tool = f'<rect x="94" y="68" width="4" height="28" fill="{d}"/><rect x="98" y="68" width="12" height="8" fill="{c}"/>'
        elif v == 5:  # cloud amphibian
            limbs = f'<rect x="38" y="98" width="14" height="16" fill="{b}"/><rect x="76" y="98" width="14" height="16" fill="{b}"/>'
            face = f'<rect x="48" y="40" width="8" height="8" fill="{d}"/><rect x="72" y="40" width="8" height="8" fill="{d}"/>'
            tool = f'<rect x="92" y="76" width="18" height="18" fill="{c}"/><rect x="96" y="80" width="10" height="10" fill="{d}"/>'

    elif world == VOXEL:
        # Blockworks: STRICT ISOMETRIC VOXEL PIXEL ART
        shadow = '<rect x="36" y="112" width="56" height="6" fill="#091726"/>'
        if v == 0:  # wedge maker
            limbs = f'<rect x="42" y="98" width="14" height="16" fill="{b}"/><rect x="72" y="98" width="14" height="16" fill="{b}"/>'
            face = f'<rect x="52" y="44" width="8" height="4" fill="{d}"/><rect x="68" y="44" width="8" height="4" fill="{d}"/>'
            tool = f'<rect x="94" y="72" width="6" height="28" fill="{d}"/><polygon points="90,72 104,72 110,64 96,64" fill="{c}"/>'
        elif v == 1:  # cylindrical survey
            limbs = f'<rect x="44" y="98" width="12" height="16" fill="{b}"/><rect x="72" y="98" width="12" height="16" fill="{b}"/>'
            face = f'<rect x="48" y="42" width="32" height="6" fill="{d}"/>'
            tool = f'<rect x="92" y="78" width="18" height="14" fill="{d}"/><rect x="110" y="82" width="12" height="4" fill="{c}"/>'
        elif v == 2:  # hexagonal mechanic
            limbs = f'<rect x="44" y="98" width="14" height="16" fill="{b}"/><rect x="70" y="98" width="14" height="16" fill="{b}"/>'
            face = f'<rect x="50" y="48" width="6" height="6" fill="{d}"/><rect x="72" y="48" width="6" height="6" fill="{d}"/>'
            tool = f'<rect x="92" y="74" width="6" height="26" fill="{c}"/><rect x="90" y="74" width="12" height="6" fill="{d}"/>'
        elif v == 3:  # faceted courier
            limbs = f'<rect x="42" y="98" width="14" height="16" fill="{b}"/><rect x="72" y="98" width="14" height="16" fill="{b}"/>'
            face = f'<rect x="54" y="42" width="6" height="6" fill="{d}"/><rect x="68" y="42" width="6" height="6" fill="{d}"/>'
            tool = f'<rect x="92" y="76" width="20" height="20" fill="{c}"/><rect x="96" y="80" width="12" height="12" fill="{d}"/>'
        elif v == 4:  # arch archivist
            limbs = f'<rect x="36" y="98" width="16" height="16" fill="{b}"/><rect x="76" y="98" width="16" height="16" fill="{b}"/>'
            face = f'<rect x="54" y="44" width="6" height="6" fill="{d}"/><rect x="68" y="44" width="6" height="6" fill="{d}"/>'
            tool = f'<rect x="90" y="74" width="22" height="24" fill="{d}"/><rect x="94" y="78" width="14" height="4" fill="{c}"/>'
        elif v == 5:  # tracked inspector
            limbs = f'<rect x="32" y="104" width="64" height="10" fill="{d}"/><rect x="40" y="106" width="48" height="4" fill="{c}"/>'
            face = f'<rect x="52" y="32" width="24" height="6" fill="{d}"/>'
            tool = f'<rect x="94" y="72" width="6" height="24" fill="{c}"/><rect x="94" y="72" width="16" height="4" fill="{d}"/>'

    elif world == CLOUDSPRING:
        # Cloudspring Baths: porcelain attendants
        limbs = f'<path d="M48 96l-4 18h12M76 96l4 18h12" stroke="{mix(b, .6)}" stroke-width="6" stroke-linecap="round"/>'
        if v == 0:  # crane
            face = f'<path d="M64 48V20l16 6-16 4z" fill="{c}"/><circle cx="62" cy="26" r="2" fill="{d}"/>'
            tool = f'<line x1="90" y1="76" x2="108" y2="60" stroke="{d}" stroke-width="3"/><circle cx="108" cy="60" r="5" fill="{mix(a, .7)}"/>'
        elif v == 1:  # kettle
            face = f'<path d="M48 30q16-16 32 0" fill="none" stroke="{b}" stroke-width="3"/><circle cx="64" cy="42" r="3" fill="{d}"/>'
            tool = f'<ellipse cx="98" cy="80" rx="6" ry="8" fill="{c}" stroke="{d}" stroke-width="1.5"/>'
        elif v == 2:  # basin spirit
            face = f'<rect x="46" y="52" width="36" height="10" rx="3" fill="{b}"/><circle cx="56" cy="57" r="2.5" fill="{d}"/><circle cx="72" cy="57" r="2.5" fill="{d}"/>'
            tool = f'<rect x="90" y="76" width="18" height="12" rx="3" fill="{mix(b, .7)}" stroke="{d}" stroke-width="1.5"/>'
        elif v == 3:  # tall reed
            face = f'<ellipse cx="64" cy="38" rx="8" ry="16" fill="{c}"/><circle cx="64" cy="36" r="2.5" fill="{d}"/>'
            tool = f'<path d="M92 78l16-14" stroke="{d}" stroke-width="3"/><path d="M104 68q8-6 10 4t-8 6z" fill="{c}"/>'
        elif v == 4:  # towel automaton
            face = f'<rect x="48" y="44" width="32" height="10" rx="2" fill="{d}"/><circle cx="58" cy="49" r="2" fill="{a}"/><circle cx="70" cy="49" r="2" fill="{a}"/>'
            tool = f'<rect x="90" y="74" width="16" height="24" rx="2" fill="{b}" stroke="{c}" stroke-width="1.5"/>'
        elif v == 5:  # lantern spirit
            face = f'<circle cx="64" cy="46" r="16" fill="{c}" fill-opacity=".4"/><circle cx="58" cy="46" r="3" fill="{d}"/><circle cx="70" cy="46" r="3" fill="{d}"/>'
            tool = f'<circle cx="98" cy="78" r="8" fill="{d}" stroke="{c}" stroke-width="2"/>'

    elif world == BUTTON:
        # Button & Spool: miniature people
        heads = [(63, 42, 18, 21), (63, 42, 20, 22), (63, 42, 19, 24), (63, 42, 21, 20), (63, 42, 17, 23), (63, 42, 22, 21)]
        hairstyles = [
            "M44 34q0-22 19-22 20 0 20 22l-6-6-14 4-14-4z",
            "M40 40q-4-28 23-28 27 0 23 28-6-10-23-12-17 2-23 12z",
            "M42 36q4-24 21-24 18 0 21 24l-10-10-11 8-11-8z",
            "M46 30q2-18 17-18 16 0 18 18z",
            "M40 44q-2-32 23-32 25 0 23 32l-6-16h-34z",
            "M42 32q6-20 21-20 16 0 21 20q-21-8-42 0z",
        ]
        cx, cy, rx, ry = heads[v]
        limbs = f'<path d="M46 95l-4 19h14M72 95l4 19h14" stroke="{mix(b, .4)}" stroke-width="6" stroke-linecap="round"/>'
        face = (f'<ellipse cx="{cx}" cy="{cy}" rx="{rx}" ry="{ry}" fill="{skin}"/>'
                f'<path d="{hairstyles[v]}" fill="{haircolor}"/>'
                f'<circle cx="56" cy="44" r="2" fill="#172c39"/><circle cx="70" cy="44" r="2" fill="#172c39"/>')
        if v == 0:  # needle lance
            tool = f'<line x1="94" y1="50" x2="94" y2="106" stroke="{d}" stroke-width="3" stroke-linecap="round"/><ellipse cx="94" cy="54" rx="1.5" ry="4" fill="#172c39"/>'
        elif v == 1:  # folding rule
            tool = f'<path d="M88 74l12 12-8 12" stroke="{c}" stroke-width="3.5" fill="none"/>'
        elif v == 2:  # safety pin
            tool = f'<ellipse cx="98" cy="74" rx="6" ry="12" fill="none" stroke="{d}" stroke-width="2.5"/><line x1="98" y1="74" x2="98" y2="92" stroke="{d}" stroke-width="2.5"/>'
        elif v == 3:  # thread spool
            tool = f'<rect x="90" y="74" width="16" height="24" rx="2" fill="{c}" stroke="{b}" stroke-width="1.5"/><line x1="86" y1="74" x2="110" y2="74" stroke="{d}" stroke-width="2"/>'
        elif v == 4:  # button loupe
            tool = f'<circle cx="98" cy="76" r="10" fill="{c}" stroke="{d}" stroke-width="2"/><circle cx="95" cy="76" r="1.5" fill="{b}"/><circle cx="101" cy="76" r="1.5" fill="{b}"/>'
        elif v == 5:  # thimble helmet
            face += f'<path d="M52 28h24l-3-12H55z" fill="{d}" stroke="{b}" stroke-width="1.5"/>'
            tool = f'<circle cx="98" cy="78" r="8" fill="none" stroke="{c}" stroke-width="3"/><line x1="92" y1="84" x2="84" y2="96" stroke="{d}" stroke-width="3"/>'

    elif world == CLOCKWORK:
        # Clockwork Stargazers: astronomical automata
        if v == 0:  # telescope
            limbs = f'<path d="M44 98l-12 16M64 100v14M84 98l12 16" stroke="{c}" stroke-width="4.5" stroke-linecap="round"/>'
            face = f'<circle cx="64" cy="40" r="12" fill="{c}"/><circle cx="64" cy="40" r="6" fill="{d}"/>'
            tool = f'<rect x="90" y="74" width="18" height="12" rx="3" fill="{d}" stroke="{c}" stroke-width="1.5"/>'
        elif v == 1:  # compass
            limbs = f'<path d="M48 98l-10 16M80 98l10 16" stroke="{d}" stroke-width="4"/>'
            face = f'<circle cx="64" cy="48" r="14" fill="{b}"/><line x1="64" y1="36" x2="64" y2="60" stroke="{c}" stroke-width="2"/>'
            tool = f'<rect x="88" y="74" width="22" height="26" rx="2" fill="{d}" stroke="{b}" stroke-width="1.5"/>'
        elif v == 2:  # pendulum
            limbs = f'<path d="M52 98v16M76 98v16" stroke="{c}" stroke-width="4"/>'
            face = f'<circle cx="64" cy="44" r="10" fill="{d}"/><circle cx="64" cy="44" r="4" fill="{b}"/>'
            tool = f'<line x1="92" y1="70" x2="108" y2="86" stroke="{c}" stroke-width="3"/>'
        elif v == 3:  # lens
            limbs = f'<path d="M48 98l-4 16M80 98l4 16" stroke="{b}" stroke-width="5"/>'
            face = f'<circle cx="64" cy="46" r="14" fill="{d}" fill-opacity=".5" stroke="{c}" stroke-width="2"/>'
            tool = f'<rect x="88" y="76" width="24" height="18" rx="3" fill="{b}" stroke="{d}" stroke-width="1.5"/>'
        elif v == 4:  # gear
            limbs = f'<rect x="42" y="98" width="14" height="16" fill="{c}"/><rect x="72" y="98" width="14" height="16" fill="{c}"/>'
            face = f'<circle cx="64" cy="50" r="12" fill="{d}"/><circle cx="64" cy="50" r="4" fill="{b}"/>'
            tool = f'<path d="M92 78h16m-4-6a6 6 0 1 1 0 12" stroke="{c}" stroke-width="3" fill="none"/>'
        elif v == 5:  # sextant
            limbs = f'<path d="M46 98l-6 16M82 98l6 16" stroke="{d}" stroke-width="4"/>'
            face = f'<circle cx="64" cy="44" r="8" fill="{c}"/><circle cx="64" cy="44" r="3" fill="{d}"/>'
            tool = f'<path d="M90 74l18 18-12 4z" fill="{c}" stroke="{d}" stroke-width="1.5"/>'

    elif world == CORAL:
        # Reef Town: marine creatures
        shadow = f'<ellipse cx="64" cy="114" rx="{[34, 26, 42, 30, 24, 32][v]}" ry="7" fill="#091726" opacity=".24"/>'
        if v == 0:  # octopus maker
            limbs = f'<path d="M30 76q-16 18 2 28t14-10M44 82q-8 20 6 22t8-16M76 82q8 20-6 22t-8-16M90 76q16 18-2 28t-14-10" fill="none" stroke="{c}" stroke-width="5" stroke-linecap="round"/>'
            face = f'<ellipse cx="54" cy="48" rx="4" ry="6" fill="{d}"/><ellipse cx="74" cy="48" rx="4" ry="6" fill="{d}"/><circle cx="55" cy="47" r="1.5" fill="#fff"/><circle cx="75" cy="47" r="1.5" fill="#fff"/>'
            tool = f'<path d="M94 70l14 16-8 4z" fill="{d}" stroke="{b}" stroke-width="1.5"/>'
        elif v == 1:  # banded shrimp
            limbs = f'<path d="M48 88l-12 18M58 92l-6 16M68 92l6 16M78 88l12 18" stroke="{c}" stroke-width="3" stroke-linecap="round"/>'
            face = f'<circle cx="68" cy="30" r="3" fill="{d}"/><path d="M68 28q14-12 24-4" fill="none" stroke="{c}" stroke-width="2"/>'
            tool = f'<line x1="92" y1="74" x2="108" y2="64" stroke="{c}" stroke-width="2.5"/><circle cx="108" cy="64" r="4" fill="{d}"/>'
        elif v == 2:  # manta ray
            limbs = f'<path d="M64 92v20" stroke="{color}" stroke-width="6" stroke-linecap="round"/>'
            face = f'<circle cx="48" cy="58" r="3.5" fill="{d}"/><circle cx="80" cy="58" r="3.5" fill="{d}"/>'
            tool = f'<rect x="92" y="78" width="18" height="14" rx="3" fill="{c}" stroke="{d}" stroke-width="1.5"/>'
        elif v == 3:  # hermit crab
            limbs = f'<path d="M42 96l-8 16M86 96l8 16" stroke="{c}" stroke-width="6" stroke-linecap="round"/>'
            face = f'<circle cx="54" cy="42" r="3" fill="{d}"/><circle cx="74" cy="42" r="3" fill="{d}"/>'
            tool = f'<rect x="90" y="72" width="22" height="26" rx="3" fill="{b}" stroke="{c}" stroke-width="1.5"/>'
        elif v == 4:  # seahorse
            limbs = f'<path d="M60 96q-12 14 0 16t10-10" fill="none" stroke="{c}" stroke-width="5" stroke-linecap="round"/>'
            face = f'<circle cx="58" cy="44" r="3.5" fill="{d}"/><path d="M54 46l-12 2" stroke="{c}" stroke-width="3"/>'
            tool = f'<path d="M88 74l18-14" stroke="{d}" stroke-width="3"/>'
        elif v == 5:  # cuttlefish
            limbs = f'<path d="M44 92q-6 16 2 20M56 94q-2 16 4 18M72 94q2 16-4 18M84 92q6 16-2 20" fill="none" stroke="{c}" stroke-width="4"/>'
            face = f'<circle cx="50" cy="58" r="4" fill="{d}"/><circle cx="78" cy="58" r="4" fill="{d}"/>'
            tool = f'<rect x="92" y="74" width="10" height="22" rx="4" fill="{c}" stroke="{d}" stroke-width="1.5"/>'

    elif world == MEADOW:
        # Cozy Critter Village: gentle animal makers
        shadow = f'<ellipse cx="64" cy="114" rx="{[28, 38, 24, 34, 30, 32][v]}" ry="7" fill="#091726" opacity=".24"/>'
        if v == 0:  # field mouse
            limbs = f'<path d="M48 96l-4 18h12M76 96l4 18h12" stroke="{color}" stroke-width="5" stroke-linecap="round"/>'
            face = f'<circle cx="56" cy="54" r="3.5" fill="{d}"/><circle cx="72" cy="54" r="3.5" fill="{d}"/><circle cx="64" cy="62" r="2.5" fill="{c}"/>'
            tool = f'<circle cx="98" cy="80" r="9" fill="{d}" stroke="{b}" stroke-width="2"/><line x1="98" y1="74" x2="98" y2="86" stroke="{c}" stroke-width="1.5"/>'
        elif v == 1:  # badger
            limbs = f'<rect x="40" y="98" width="14" height="16" fill="{color}"/><rect x="74" y="98" width="14" height="16" fill="{color}"/>'
            face = f'<circle cx="52" cy="52" r="3.5" fill="{d}"/><circle cx="76" cy="52" r="3.5" fill="{d}"/><polygon points="61,60 67,60 64,64" fill="{d}"/>'
            tool = f'<line x1="94" y1="72" x2="94" y2="98" stroke="{b}" stroke-width="4"/><rect x="86" y="70" width="16" height="10" rx="2" fill="{d}"/>'
        elif v == 2:  # swallow
            limbs = f'<path d="M56 98v16m-4 0h8M72 98v16m-4 0h8" stroke="{c}" stroke-width="3"/>'
            face = f'<circle cx="58" cy="40" r="3" fill="{b}"/><polygon points="62,42 74,45 62,48" fill="{c}"/>'
            tool = f'<rect x="88" y="76" width="22" height="16" rx="2" fill="{d}" stroke="{b}" stroke-width="1.5"/><path d="M88 76l11 10 11-10" fill="none" stroke="{c}" stroke-width="1.5"/>'
        elif v == 3:  # tortoise
            limbs = f'<path d="M42 98l-6 16M86 98l6 16" stroke="{color}" stroke-width="7" stroke-linecap="round"/>'
            face = f'<circle cx="56" cy="46" r="3" fill="{b}"/><circle cx="72" cy="46" r="3" fill="{b}"/><circle cx="56" cy="46" r="5" fill="none" stroke="{d}" stroke-width="1.5"/><circle cx="72" cy="46" r="5" fill="none" stroke="{d}" stroke-width="1.5"/>'
            tool = f'<rect x="88" y="74" width="22" height="26" rx="2" fill="{d}" stroke="{b}" stroke-width="1.5"/><line x1="92" y1="80" x2="106" y2="80" stroke="{c}" stroke-width="1.5"/>'
        elif v == 4:  # goat
            limbs = f'<path d="M48 96l-4 18h12M76 96l4 18h12" stroke="{color}" stroke-width="6" stroke-linecap="round"/>'
            face = f'<circle cx="54" cy="52" r="3.5" fill="{d}"/><circle cx="74" cy="52" r="3.5" fill="{d}"/><path d="M64 64v6" stroke="{c}" stroke-width="3" stroke-linecap="round"/>'
            tool = f'<rect x="90" y="74" width="14" height="26" rx="4" fill="{c}" stroke="{d}" stroke-width="1.5"/>'
        elif v == 5:  # hedgehog
            limbs = f'<path d="M46 96l-4 18h12M78 96l4 18h12" stroke="{b}" stroke-width="6" stroke-linecap="round"/>'
            face = f'<circle cx="56" cy="58" r="3" fill="{d}"/><circle cx="72" cy="58" r="3" fill="{d}"/><polygon points="62,64 66,64 64,67" fill="{d}"/>'
            tool = f'<rect x="90" y="80" width="18" height="14" rx="2" fill="{d}" stroke="{c}" stroke-width="1.5"/><rect x="96" y="72" width="6" height="8" fill="{b}"/>'

    return shadow, limbs, face, tool, extras
