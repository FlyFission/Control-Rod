"""The fifteen Control-Rod worlds as office themes (plan task 4.9).

Each world keeps its palette, cast and environmental vignette from tools/build_theme_art.py and is
redrawn for the office view's room regions: one SVG per region, sized exactly to that region from
the canonical layout (apps/web/src/features/office/themes/layout.json, exported by
apps/web/scripts/build-office-themes.ts), and six 64 by 64 figure bodies that are the world's floor
characters at half size. Every world is a development theme: draft art, pending human art and
distribution review, and never in an ordinary build.

All geometry is authored here or in build_theme_art.py; no reference images, downloaded assets,
fonts, franchise characters or model calls. Run from the repository root:
    python3 tools/build_office_worlds.py          writes the files
    python3 tools/build_office_worlds.py --check  exits non-zero if any committed file is stale
"""
from __future__ import annotations

import hashlib
import json
import random
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import build_theme_art as art  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT / 'apps/web'
LAYOUT = WEB / 'src/features/office/themes/layout.json'
CATALOG = WEB / 'src/features/floor/themes/catalog.ts'
CREATOR = 'Original procedural vector illustration (Codex, Claude Code)'
NOTICE = ('Original Control-Rod vector artwork, authored in tools/build_office_worlds.py and tools/build_theme_art.py.\n'
          'Licensed under Apache-2.0. No franchise characters, reference images, fonts or audio are included.\n'
          'Draft artwork; human art and distribution review remains pending.\n')

# The cube sets' functional words; each world adds its own noun for the place.
DISCIPLINES = {'process': 'Process', 'mechanical': 'Mechanical', 'electrical': 'Electrical', 'civil': 'Civil',
               'assurance': 'Assurance', 'project-controls': 'Controls'}
# Rooms that keep the floor world's own station names.
FROM_STATIONS = {'interface': 'general', 'verification': 'verify', 'document-control': 'archive',
                 'your-office': 'office', 'bench': 'bench'}
# What each world calls its cube sets, its review room and its hold room. Authored here.
ROOMS = {
    'creature-dispatch': ('dock', 'sorting huddle', 'holding crate'),
    'pocket-lab': ('lab', 'results huddle', 'sealed cabinet'),
    'midnight-bureau': ('desk', 'case table', 'evidence locker'),
    'confectionery-works': ('kitchen', 'tasting table', 'cold store'),
    'lanternwood-guild': ('hall', 'council fire', 'warded chest'),
    'corner-cafe': ('corner', 'big table', 'back room'),
    'tumbletown-workshop': ('yard', 'huddle rug', 'locked cubby'),
    'orbital-shipyard': ('bay', 'briefing ring', 'isolation airlock'),
    'wildlight-camp': ('tent', 'campfire circle', 'sealed box'),
    'voxel-foundry': ('line', 'review platform', 'fenced cell'),
    'cloudspring-bathhouse': ('room', 'tea table', 'closed bath'),
    'button-and-spool': ('mat', 'fitting table', 'lidded tin'),
    'clockwork-observatory': ('workshop', 'orrery table', 'stopped vault'),
    'coral-commons': ('grotto', 'council pool', 'closed lagoon'),
    'meadow-post': ('garden', 'village green', 'locked shed'),
}

# Station names too long for the office's narrower plates (the harness measures clipping), shortened.
SHORTER = {
    ('confectionery-works', 'document-control'): 'Wrapped goods',
    ('tumbletown-workshop', 'bench'): 'Spring seats',
}


def svg(w, h, body):
    return f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}">{body}</svg>'


def r1(v):
    """One decimal place at most, so the geometry stays short and reproducible."""
    return f'{v:.1f}'.rstrip('0').rstrip('.')


def labels(pid, entry):
    noun, review, hold = ROOMS[pid]
    cap = lambda t: t[:1].upper() + t[1:]
    out = {rid: f'{word} {noun}' for rid, word in DISCIPLINES.items()}
    out.update({rid: cap(entry['stationLabels'][key]) for rid, key in FROM_STATIONS.items()})
    out['review'] = cap(review)
    out['quarantine'] = cap(hold)
    out.update({rid: label for (world, rid), label in SHORTER.items() if world == pid})
    return out


def tokens(palette):
    a, b, c, d = palette
    return {'backdrop': art.mix(a, .18), 'floor': art.mix(a, .32), 'wall': art.mix(d, .45),
            'decoration': art.mix(c, .6), 'decorationAlt': art.mix(b, .5)}


def texture(world, w, h, band, palette, rng):
    """The world's material, sparse and quiet, below the name band (the floor scene's patterns)."""
    a, b, c, d = palette
    s = ''
    top, bottom = band + 4, h - 6
    if world in (7, 12):
        for _ in range(14):
            s += f'<circle cx="{rng.randrange(6, w - 6)}" cy="{rng.randrange(top, bottom)}" r="{rng.choice([1, 1, 2])}" fill="{d}" opacity=".4"/>'
    elif world in (4, 8, 14):
        for x in range(10, w, 46):
            s += art.leaf(x, bottom, 16, art.mix(a, .55), rng.randrange(-35, 35)).replace('/>', ' opacity=".35"/>')
    elif world == 13:
        for x in range(8, w, 26):
            s += f'<path d="M{x} {bottom}q-10-12 0-26 10-12 1-24" fill="none" stroke="{art.mix(a, .8)}" stroke-width="4" opacity=".25"/>'
    elif world == 6:
        for x in range(4, w, 17):
            s += f'<path d="M{x} {top}l-4 {bottom - top}" stroke="{d}" stroke-width="1" opacity=".06"/>'
    elif world in (2, 5):
        for y in range(top, bottom - 14, 22):
            for x in range(-20 + (y % 44), w, 64):
                s += f'<path d="M{x} {y}h58v18h-58z" fill="none" stroke="{c}" opacity=".09"/>'
    elif world == 9:
        for _ in range(6):
            x, y = rng.randrange(6, w - 20), rng.randrange(top, bottom - 14)
            s += f'<path d="M{x} {y + 4}l8-4 8 4-8 4z" fill="{d}" opacity=".18"/><path d="M{x} {y + 4}v8l8 4v-8z" fill="{a}" opacity=".18"/>'
    elif world == 10:
        s += f'<path d="M0 {bottom - 10}q{r1(w / 4)}-12 {r1(w / 2)} 0t{r1(w / 2)} 0" fill="none" stroke="{art.mix(d, .7)}" stroke-width="5" opacity=".2"/>'
    else:
        for y in range(top + 8, bottom, 28):
            for x in range(12 + (y % 2) * 14, w - 6, 28):
                s += f'<circle cx="{x}" cy="{y}" r="1.5" fill="{art.mix(c, .7)}" opacity=".18"/>'
    return s


def furniture(region, w, h, palette, grad):
    """Low furniture under the seats, and each room's own piece, all beneath the semantic layer."""
    a, b, c, d = palette
    s = ''
    seats = region['seats']
    if region['kind'] == 'cube-set':
        for p in seats:
            s += f'<path d="M{p["x"] - 26} {p["y"] + 14}h52l-4 12h-44z" fill="url(#{grad})" opacity=".75"/>'
            s += f'<rect x="{p["x"] - 8}" y="{p["y"] + 2}" width="16" height="10" rx="2" fill="{art.mix(b, .4)}" opacity=".6"/>'
        return s
    for p in seats:
        s += f'<ellipse cx="{p["x"]}" cy="{p["y"] + 24}" rx="19" ry="5" fill="{art.mix(c, .5)}" opacity=".3"/>'
    rid = region['id']
    if rid == 'review':
        s += f'<ellipse cx="{r1(w / 2)}" cy="{h - 30}" rx="{r1(w / 3)}" ry="12" fill="url(#{grad})" opacity=".55"/>'
    elif rid == 'document-control':
        for i in range(4):
            s += f'<rect x="{r1(10 + i * (w - 20) / 4)}" y="{h - 30}" width="{r1((w - 20) / 4 - 6)}" height="20" rx="2" fill="{art.mix(b, .45)}" opacity=".55"/>'
    elif rid == 'quarantine':
        for x in range(-h, w, 16):
            s += f'<path d="M{x} {h - 4}l26-26" stroke="{art.mix(c, .7)}" stroke-width="3" opacity=".3"/>'
    elif rid == 'your-office':
        s += f'<path d="M{r1(w / 2 - 48)} {h - 40}h96l-6 16h-84z" fill="url(#{grad})" opacity=".7"/>'
    elif rid in ('bench', 'verification', 'interface'):
        s += f'<rect x="12" y="{h - 26}" width="{w - 24}" height="12" rx="6" fill="url(#{grad})" opacity=".55"/>'
    return s


def region_svg(world, index, region, band, palette):
    a, b, c, d = palette
    w, h = region['w'], region['h']
    grad = f'desk{index}'
    rng = random.Random(world * 100 + index)
    body = (f'<defs><linearGradient id="{grad}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="{art.mix(c, .6)}"/>'
            f'<stop offset="1" stop-color="{art.mix(b, .4)}"/></linearGradient></defs>')
    rounding = 18 if world in (4, 8, 10, 13, 14) else 8 if world in (2, 7, 9, 12) else 13
    body += f'<rect x="0" y="0" width="{w}" height="{h}" rx="{rounding}" fill="{art.mix(a, .32)}"/>'
    body += f'<rect x="1" y="1" width="{w - 2}" height="{h - 2}" rx="{rounding}" fill="none" stroke="{art.mix(d, .45)}" stroke-width="2"/>'
    # A quiet band under the name plate, in the world's own tone.
    body += f'<rect x="2" y="2" width="{w - 4}" height="{band - 4}" rx="{max(rounding - 2, 2)}" fill="{art.mix(a, .22)}" opacity=".6"/>'
    body += texture(world, w, h, band, palette, rng)
    body += furniture(region, w, h, palette, grad)
    # The world's vignette, at half size in the name band's far corner.
    body += f'<g transform="translate({w - 30} 6) scale(.55)">{art.vignette(world, 0, 0, palette)}</g>'
    return svg(w, h, body)


def body_svg(world, v, palette):
    """The world's floor character, at half size: the same cast, so the distinct cast checks hold."""
    character = art.character(world, v, palette)
    inner = character.split('>', 1)[1].rsplit('</svg>', 1)[0]
    return svg(64, 64, f'<g transform="scale(.5)">{inner}</g>')


def catalog():
    text = CATALOG.read_text()
    return json.loads(text.split(' = ', 1)[1].rsplit(';', 1)[0])


def render():
    """Every file this generator owns, by path relative to the repository root."""
    layout = json.loads(LAYOUT.read_text())
    band = layout['nameBand']
    out: dict[str, str] = {}
    ids = []
    for world, entry in enumerate(catalog()):
        pid, palette = entry['id'], entry['palette']
        ids.append(pid)
        folder = f'apps/web/public/office-themes/{pid}'

        def asset(name, text, w, h):
            data = text.encode()
            sha = hashlib.sha256(data).hexdigest()
            file = f'{name}.{sha[:12]}.svg'
            out[f'{folder}/{file}'] = text
            return {'path': f'/office-themes/{pid}/{file}', 'sha256': sha, 'bytes': len(data), 'width': w, 'height': h,
                    'creator': CREATOR, 'rightsBasis': 'original', 'licenseNoticeId': 'Apache-2.0'}

        names = labels(pid, entry)
        regions = {}
        for i, region in enumerate(layout['regions']):
            regions[region['id']] = {'label': names[region['id']],
                                     'art': asset(region['id'], region_svg(world, i, region, band, palette), region['w'], region['h'])}
        bodies = [asset(f'body-{v}', body_svg(world, v, palette), 64, 64) for v in range(6)]
        theme = {
            'schemaVersion': 1, 'id': pid, 'version': '0.1.0', 'title': entry['title'], 'description': entry['description'],
            'availability': 'development', 'tokens': tokens(palette), 'regions': regions, 'bodies': bodies,
            'motionProfile': 'shared-v1',
            'accessibility': {'notes': 'Draft world. Scene art stays beneath opaque semantic plates; texture is sparse and low in contrast, and furniture sits under the seats, away from the name bands.'},
            'credits': [CREATOR],
        }
        files = [{'file': a['path'].rsplit('/', 1)[1], 'sha256': a['sha256']} for a in [r['art'] for r in regions.values()] + bodies]
        out[f'{folder}/assets.json'] = json.dumps({'theme': pid, 'files': files}, indent=2) + '\n'
        out[f'{folder}/NOTICE.txt'] = NOTICE
        out[f'apps/web/src/features/office/themes/worlds/{pid}.ts'] = (
            '// Generated by tools/build_office_worlds.py; do not edit.\n'
            'import type { OfficeThemeV1 } from "../../contract.js";\n\n'
            f'const theme: OfficeThemeV1 = {json.dumps(theme, indent=2)};\n'
            'export default theme;\n')
    imports = ''.join(f'import w{i} from "./{pid}.js";\n' for i, pid in enumerate(ids))
    out['apps/web/src/features/office/themes/worlds/index.ts'] = (
        '// Generated by tools/build_office_worlds.py; do not edit.\n'
        'import type { OfficeThemeV1 } from "../../contract.js";\n'
        f'{imports}\n'
        '/** The fifteen worlds, in catalogue order: development themes, draft art pending human review. */\n'
        f'export const WORLD_THEMES: readonly OfficeThemeV1[] = [{", ".join(f"w{i}" for i in range(len(ids)))}];\n')
    return out, ids


def main(argv):
    out, ids = render()
    owned = [ROOT / f'apps/web/public/office-themes/{pid}' for pid in ids] + [ROOT / 'apps/web/src/features/office/themes/worlds']
    stale = [p for p, text in out.items() if not (ROOT / p).exists() or (ROOT / p).read_text() != text]
    extra = [str(f.relative_to(ROOT)) for d in owned if d.exists() for f in d.iterdir() if str(f.relative_to(ROOT)) not in out]
    if '--check' in argv:
        for p in stale:
            print(f'stale: {p}')
        for p in extra:
            print(f'not generated: {p}')
        return 1 if stale or extra else 0
    for p in extra:
        (ROOT / p).unlink()
    for p, text in out.items():
        (ROOT / p).parent.mkdir(parents=True, exist_ok=True)
        (ROOT / p).write_text(text)
    print(f'built {len(ids)} office worlds: {len(out)} files')
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
