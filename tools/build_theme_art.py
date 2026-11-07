"""Reproducible original vector illustrations for the fifteen Control-Rod worlds.

All geometry is authored here; no reference images, downloaded assets, fonts,
franchise characters or model calls are used. Exports remain draft artwork.
"""
from pathlib import Path
import hashlib
import json
import math
import random
import re
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))
import theme_art_casts  # noqa: E402
import theme_art_backdrops  # noqa: E402
from theme_art_props import prop_shape  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
STATIONS = {
    'general': dict(x=20,y=20,w=300,h=240), 'site': dict(x=340,y=20,w=320,h=240),
    'archive': dict(x=680,y=20,w=300,h=240), 'verify': dict(x=20,y=340,w=340,h=240),
    'office': dict(x=380,y=340,w=260,h=240), 'bench': dict(x=660,y=340,w=320,h=240),
}


def mix(hexcolor, ratio, base=(15,25,35)):
    rgb = tuple(int(hexcolor[i:i+2],16) for i in (1,3,5))
    return '#' + ''.join(f'{round(c*ratio+b*(1-ratio)):02x}' for c,b in zip(rgb,base))


def svg(body, width=128, height=128, viewbox=None, is_pixel=False):
    crisp = ' shape-rendering="crispEdges"' if is_pixel else ''
    return f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="{viewbox or f"0 0 {width} {height}"}"{crisp}>{body}</svg>'


def star(x,y,r,color):
    return f'<path d="M{x} {y-r}l{r*.28} {r*.72} {r*.72} {r*.28}-{r*.72} {r*.28}-{r*.28} {r*.72}-{r*.28}-{r*.72}-{r*.72}-{r*.28} {r*.72}-{r*.28}z" fill="{color}"/>'


def leaf(x,y,size,color,angle=0):
    return f'<path d="M0 0Q{-size} {-size} 0 {-size*1.8}Q{size} {-size} 0 0Z" fill="{color}" transform="translate({x} {y}) rotate({angle})"/>'


def prop(name,palette):
    return svg('<ellipse cx="64" cy="110" rx="37" ry="6" fill="#0a1824" opacity=".2"/>'+prop_shape(name,palette))


def catalog_props():
    """Six prop names per pack ID, read from the catalog brief."""
    text=(ROOT/'docs/superpowers/specs/2026-10-25-overlay-themes-catalog.md').read_text()
    props={}
    for section in re.split(r'\n## \d+\. ',text)[1:]:
        ident=re.search(r'ID `([a-z0-9-]+)`',section);line=re.search(r'\*\*Props:\*\*\s*(.+)',section)
        if ident and line:props[ident.group(1)]=[x.strip() for x in line.group(1).rstrip('.').split(',')]
    return props


def character(world, v, palette):
    a, b, c, d = palette
    bodycolors = [a, b, c, mix(a, .65, (220, 215, 190)), mix(c, .7, (180, 210, 205)), mix(b, .6, (200, 220, 210))]
    color = bodycolors[v]
    is_pixel = world in (4, 8, 9)
    skin = ['#d29d80', '#a96f55', '#edc4a7', '#bc8d6c', '#825443', '#e5b795'][v]
    hair = ['#263544', '#49382e', '#d0b78c', '#30413c', '#322b37', '#8e644e'][v]

    if is_pixel:
        grad = ''
        fill = color
    else:
        grad = f'<defs><linearGradient id="body{v}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="{mix(color, .65, (255, 255, 235))}"/><stop offset="1" stop-color="{color}"/></linearGradient></defs>'
        fill = f'url(#body{v})'

    torso = theme_art_casts.body(world, v, fill, palette, color, skin, hair)
    shadow, limbs, face, tool, extras = theme_art_casts.cast_rig(world, v, palette, color, skin, hair)

    torso_node = f'<g id="shape-{v}">{torso}</g>'
    inner = grad + shadow + limbs + torso_node + face + extras + tool
    return svg(inner, 128, 128, is_pixel=is_pixel)


def station_equipment(world, key, px, py, palette):
    """Distinct equipment or emblem for each station, located inside the station header bar."""
    a, b, c, d = palette
    s = ''
    if key == 'general':
        # Intake / Dispatch / Ledger
        s += f'<rect x="{px}" y="{py+2}" width="18" height="14" rx="2" fill="{d}" stroke="{b}" stroke-width="1.5"/><line x1="{px+4}" y1="{py+6}" x2="{px+14}" y2="{py+6}" stroke="{c}" stroke-width="1.5"/><line x1="{px+4}" y1="{py+10}" x2="{px+12}" y2="{py+10}" stroke="{c}" stroke-width="1.5"/>'
    elif key == 'site':
        # Assembly / Prototype / Workbench anvil / gear
        s += f'<path d="M{px} {py+14}h20l-4-4h-3l1-5h-8l1 5h-3z" fill="{c}" stroke="{d}" stroke-width="1"/><circle cx="{px+10}" cy="{py+6}" r="3" fill="{b}"/>'
    elif key == 'archive':
        # Records / Vault / Specimen shelves / drawers
        s += f'<rect x="{px+2}" y="{py+1}" width="16" height="16" rx="2" fill="{b}" stroke="{d}" stroke-width="1.5"/><line x1="{px+2}" y1="{py+9}" x2="{px+18}" y2="{py+9}" stroke="{d}" stroke-width="1"/><circle cx="{px+10}" cy="{py+5}" r="1.5" fill="{c}"/><circle cx="{px+10}" cy="{py+13}" r="1.5" fill="{c}"/>'
    elif key == 'verify':
        # Inspection loupe / Balance gauge
        s += f'<circle cx="{px+7}" cy="{py+8}" r="5" fill="none" stroke="{c}" stroke-width="1.5"/><line x1="{px+11}" y1="{py+12}" x2="{px+17}" y2="{py+17}" stroke="{d}" stroke-width="2.5" stroke-linecap="round"/>'
    elif key == 'office':
        # Lead / Command / Director seal
        s += f'<circle cx="{px+10}" cy="{py+9}" r="7" fill="{c}" stroke="{d}" stroke-width="1.5"/><circle cx="{px+10}" cy="{py+9}" r="3" fill="{b}"/>'
    elif key == 'bench':
        # Resting bench / Charging dock / tea alcove
        s += f'<rect x="{px}" y="{py+7}" width="20" height="4" rx="1" fill="{c}" stroke="{d}" stroke-width="1"/><rect x="{px+3}" y="{py+11}" width="3" height="6" fill="{b}"/><rect x="{px+14}" y="{py+11}" width="3" height="6" fill="{b}"/>'
    return s


def vignette(world, px, py, palette):
    """The world's own small environmental vignette, drawn with its top left near (px, py)."""
    a, b, c, d = palette
    s = ''
    if world == 0:
        s += f'<rect x="{px}" y="{py}" width="23" height="47" rx="11" fill="{b}" stroke="{d}" stroke-width="2"/><circle cx="{px+11}" cy="{py+14}" r="6" fill="{a}"/><path d="M{px+11} {py+47}v13h-27" fill="none" stroke="{c}" stroke-width="5"/>'
    elif world == 1:
        s += f'<path d="M{px} {py+12}v41h24V{py+12}" fill="{mix(a,.8)}" stroke="{d}" stroke-width="2"/><path d="M{px-5} {py+12}h34" stroke="{c}" stroke-width="5"/><circle cx="{px+12}" cy="{py+35}" r="6" fill="{d}"/><path d="M{px+4} {py}h16v12" fill="none" stroke="{c}" stroke-width="3"/>'
    elif world == 2:
        for j in range(5):
            s += f'<rect x="{px-17+j*10}" y="{py+10+(j%3)*8}" width="8" height="{42-(j%3)*8}" fill="{mix(b,.25)}"/><path d="M{px-14+j*10} {py+24}v9" stroke="{c}" stroke-width="2"/>'
        s += f'<path d="M{px-20} {py+53}h65" stroke="{d}" stroke-width="2"/>'
    elif world == 3:
        s += f'<path d="M{px} {py+32}v28h23V{py+32}" fill="{c}"/><ellipse cx="{px+11}" cy="{py+30}" rx="19" ry="17" fill="{b}"/><path d="M{px+11} {py+13}v35" stroke="{d}" stroke-width="3"/><circle cx="{px+11}" cy="{py+30}" r="8" fill="none" stroke="{d}" stroke-width="3"/>'
    elif world == 4:
        s += f'<path d="M{px+10} {py+3}v14" stroke="{c}" stroke-width="3"/><path d="M{px-3} {py+20}l13-8 14 8-3 28H{px}z" fill="{c}"/><path d="M{px+5} {py+19}v26M{px+15} {py+19}v26" stroke="{d}" stroke-width="2"/>'
        s += leaf(px, py+65, 14, a, -30) + leaf(px+15, py+69, 12, c, 40)
    elif world == 5:
        s += f'<path d="M{px} {py+39}h22l-3 23h-16z" fill="{c}"/><path d="M{px+5} {py+40}v-29M{px+12} {py+40}l15-33" stroke="{a}" stroke-width="4"/>' + leaf(px+6, py+27, 12, a, -40) + leaf(px+20, py+29, 12, a, 40)
    elif world == 6:
        s += f'<path d="M{px-4} {py+64}l7-47 16-7 12 54z" fill="{b}" stroke="{d}" stroke-width="2"/><path d="M{px} {py+26}l30 5M{px} {py+39}l30 5M{px} {py+52}l30 5" stroke="{c}" stroke-width="6"/><path d="M{px+13} {py+13}l9-15" stroke="{c}" stroke-width="4"/>'
    elif world == 7:
        s += f'<path d="M{px-7} {py+47}l18-16 23 16-22 12z" fill="{a}"/><path d="M{px+11} {py+38}v-27l16-10v30z" fill="{c}" opacity=".6"/>' + star(px+19, py+16, 9, d)
    elif world == 8:
        s += f'<path d="M{px-12} {py+31}l25-31 28 31z" fill="{c}"/><path d="M{px-7} {py+31}v31h40V{py+31}" fill="{b}"/><path d="M{px+8} {py+62}V{py+37}h11v25" fill="{mix(a,.3)}"/>'
    elif world == 9:
        for j in range(3):
            xx, yy = px+(j%2)*18, py+(j//2)*25
            s += f'<path d="M{xx} {yy+8}l16-8 16 8-16 8z" fill="{d}"/><path d="M{xx} {yy+8}v17l16 8V{yy+16}z" fill="{a}"/><path d="M{xx+16} {yy+16}l16-8v17l-16 8z" fill="{b}"/>'
    elif world == 10:
        s += f'<path d="M{px-13} {py+24}l27-20 27 20-27-5z" fill="{c}"/><path d="M{px-4} {py+24}v38h36V{py+24}" fill="{b}"/><path d="M{px+14} {py+28}v32M{px-4} {py+43}h36" stroke="{d}" stroke-width="2"/><path d="M{px-14} {py+69}q28-10 53 0" fill="none" stroke="{a}" stroke-width="4"/>'
    elif world == 11:
        s += f'<ellipse cx="{px+11}" cy="{py+20}" rx="21" ry="9" fill="{d}"/><path d="M{px-4} {py+20}v36h31V{py+20}" fill="{b}"/><ellipse cx="{px+11}" cy="{py+56}" rx="21" ry="9" fill="{d}"/><path d="M{px} {py+26}l23 6-23 7 23 7" fill="none" stroke="{c}" stroke-width="3"/>'
    elif world == 12:
        s += f'<circle cx="{px+9}" cy="{py+30}" r="26" fill="none" stroke="{c}" stroke-width="2"/><ellipse cx="{px+9}" cy="{py+30}" rx="32" ry="9" fill="none" stroke="{d}" stroke-width="2" transform="rotate(-30 {px+9} {py+30})"/><circle cx="{px+9}" cy="{py+30}" r="9" fill="{c}"/><path d="M{px+9} {py+56}v13h-19" stroke="{c}" stroke-width="3" fill="none"/>'
    elif world == 13:
        for j in range(4):
            s += f'<path d="M{px+j*5} {py+67}q-20-30 {j*6-12}-44" fill="none" stroke="{[a,c,b,d][j]}" stroke-width="6" stroke-linecap="round"/>'
    elif world == 14:
        s += f'<path d="M{px-8} {py+37}v29h42V{py+37}L{px+13} {py+20}z" fill="{c}"/><path d="M{px-14} {py+38}l27-24 28 24" fill="none" stroke="{b}" stroke-width="5"/><path d="M{px+6} {py+47}h15v19h-15z" fill="{d}"/>'
    return s


def scene(world, entry):
    a, b, c, d = entry['palette']
    dark = mix(a, .18)
    light = mix(a, .65)
    accent = mix(c, .7, (255, 230, 195))
    rng = random.Random(world + 17)
    is_pixel = world in (4, 8, 9)

    defs = (f'<defs>'
            f'<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="{mix(a, .42)}"/><stop offset="1" stop-color="{dark}"/></linearGradient>'
            f'<linearGradient id="desk" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="{mix(c, .65)}"/><stop offset="1" stop-color="{mix(b, .4)}"/></linearGradient>'
            f'<radialGradient id="ambient" cx="50%" cy="50%" r="65%"><stop offset="0" stop-color="{mix(c, .25, (255, 255, 255))}" stop-opacity=".14"/><stop offset="100%" stop-color="{dark}" stop-opacity="0"/></radialGradient>'
            f'</defs>')
    if is_pixel:
        s = f'<rect width="1000" height="600" fill="{dark}"/>'
    else:
        s = defs + f'<rect width="1000" height="600" fill="url(#sky)"/><rect width="1000" height="600" fill="url(#ambient)"/>'

    # World-specific architectural backdrop
    s += theme_art_backdrops.backdrop(world, a, b, c, d, dark, light, accent, rng)

    # Central shared promenade, with a world-specific routing language.
    s += f'<path d="M0 286h1000v30H0z" fill="{mix(b, .28)}"/><path d="M20 300h960" stroke="{accent}" stroke-width="2" stroke-dasharray="4 12" opacity=".45"/>'
    if world in (0, 1, 3, 7):
        s += f'<path d="M0 277h1000M0 323h1000" stroke="{mix(c, .65)}" stroke-width="8"/>'
        for x in range(40, 1000, 110):
            s += f'<circle cx="{x}" cy="300" r="12" fill="{mix(a, .65)}" stroke="{d}" stroke-width="2"/><circle cx="{x}" cy="300" r="4" fill="{accent}"/>'
    if world in (10, 13):
        s += f'<path d="M0 298q125-25 250 0t250 0 250 0 250 0" fill="none" stroke="{mix(d, .7)}" stroke-width="10" opacity=".3"/>'

    rounding = 0 if is_pixel else (26 if world in (10, 13, 14) else 9 if world in (2, 7, 12) else 17)

    for index, (key, r) in enumerate(STATIONS.items()):
        x, y, w, h = r['x'], r['y'], r['w'], r['h']
        s += f'<rect x="{x+3}" y="{y+7}" width="{w}" height="{h}" rx="{rounding}" fill="#071422" opacity=".35"/><rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{rounding}" fill="{mix(a, .16)}" fill-opacity=".85" stroke="{mix(d, .45)}" stroke-width="1.5"/>'
        # Station header plate beneath title
        s += f'<rect x="{x+1}" y="{y+1}" width="{w-2}" height="32" rx="{max(0, rounding-1)}" fill="{mix(a, .28)}" opacity=".85"/><rect x="{x+1}" y="{y+18}" width="{w-2}" height="14" fill="{mix(a, .28)}" opacity=".85"/><line x1="{x+12}" y1="{y+32}" x2="{x+w-12}" y2="{y+32}" stroke="{mix(d, .35)}" stroke-width="1"/>'
        desk_fill = mix(c, .5) if is_pixel else 'url(#desk)'
        s += f'<path d="M{x+14} {y+h-30}h{w-28}l-8 15H{x+22}z" fill="{desk_fill}"/><path d="M{x+22} {y+h-15}v7h{w-44}v-7" fill="{mix(b, .35)}"/>'
        for col in range(3):
            sx = x + w * (col + .5) / 3
            if is_pixel:
                s += f'<rect x="{sx-24}" y="{y+106}" width="48" height="8" fill="#d9ecdb" opacity=".06"/><rect x="{sx-24}" y="{y+191}" width="48" height="8" fill="#d9ecdb" opacity=".06"/>'
            else:
                s += f'<ellipse cx="{sx}" cy="{y+110}" rx="30" ry="8" fill="#d9ecdb" opacity=".07"/><ellipse cx="{sx}" cy="{y+195}" rx="30" ry="8" fill="#d9ecdb" opacity=".07"/>'
        # Handcrafted environmental equipment insignia in the quiet header bar:
        s += station_equipment(world, key, x + w - 30, y + 6, entry['palette'])
        # Small instrument indicators
        for j in range(3):
            if is_pixel:
                s += f'<rect x="{x+22+j*9}" y="{y+h-24}" width="4" height="4" fill="{d}" opacity=".55"/>'
            else:
                s += f'<circle cx="{x+22+j*9}" cy="{y+h-22}" r="2" fill="{d}" opacity=".55"/>'

    if world == 12:
        s += f'<circle cx="500" cy="300" r="25" fill="{dark}" stroke="{c}" stroke-width="2"/>' + star(500, 300, 15, d)
    return svg(s, 1000, 600, is_pixel=is_pixel)


def preflight(entries,briefs):
    """Every problem that would stop the build, found before any file is written."""
    from theme_art_props import PROPS
    problems=[]
    ids=[e['id'] for e in entries]
    if len(set(ids))!=len(ids):problems.append('duplicate pack IDs in catalog.ts')
    for pid in ids:
        names=briefs.get(pid)
        if names is None:problems.append(f'{pid}: no prop brief in the catalog spec');continue
        if len(names)!=6:problems.append(f'{pid}: prop brief lists {len(names)} props; exactly six are required')
        for name in names:
            if name not in PROPS:problems.append(f'{pid}: no drawing for prop {name!r} in tools/theme_art_props.py')
    for pid in sorted(set(briefs)-set(ids)):problems.append(f'{pid}: prop brief has no catalog entry')
    return problems


def main():
    catalogpath=ROOT/'apps/web/src/features/floor/themes/catalog.ts'
    content=catalogpath.read_text()
    entries=json.loads(content.split(' = ',1)[1].rsplit(';',1)[0])
    packdir=ROOT/'apps/web/src/features/floor/themes/packs';packdir.mkdir(exist_ok=True)
    briefs=catalog_props()
    problems=preflight(entries,briefs)
    if problems:
        raise SystemExit('Nothing written; fix these first:\n'+'\n'.join(problems))
    for world,entry in enumerate(entries):
        pid=entry['id'];palette=entry['palette'];propnames=briefs[pid]
        public=ROOT/f'apps/web/public/floor-themes/{pid}';public.mkdir(parents=True,exist_ok=True)
        source=ROOT/f'design/overlay-themes/{pid}';source.mkdir(parents=True,exist_ok=True)
        background=scene(world,entry);chars=[character(world,v,palette) for v in range(6)]
        inner=background.split('>',1)[1].rsplit('</svg>',1)[0]
        for i,(key,r) in enumerate(STATIONS.items()):
            char=chars[i].replace('<svg ',f'<svg x="{r["x"]+r["w"]*.5-55}" y="{r["y"]+66}" ')
            char=char.replace('width="128" height="128"','width="110" height="110"')
            inner+=char
        is_pixel = world in (4, 8, 9)
        thumbnail=svg(inner,800,480,'0 0 1000 600',is_pixel=is_pixel)
        raw_assets={'scene':background,'thumbnail':thumbnail,**{f'character-{i}':c for i,c in enumerate(chars)},**{f'prop-{i}':prop(name,palette) for i,name in enumerate(propnames)}}
        previous=json.loads((public/'assets.json').read_text())['assets'] if (public/'assets.json').exists() else []
        assets=[]
        for key,value in raw_assets.items():
            data=value.encode();sha=hashlib.sha256(data).hexdigest();name=f'{key}.{sha[:12]}.svg'
            (public/name).write_bytes(data);(source/f'{key}.svg').write_bytes(data)
            w,h=(1000,600) if key=='scene' else (800,480) if key=='thumbnail' else (128,128)
            assets.append(dict(key=key,path=name,sha256=sha,bytes=len(data),width=w,height=h,creator='Original procedural vector illustration (Codex, Claude Code)',rightsBasis='original',licenseNoticeId='Apache-2.0'))
        current_names={a['path'] for a in assets}
        for old in previous:
            if old['path'] not in current_names and Path(old['path']).name==old['path']:
                (public/old['path']).unlink(missing_ok=True)
        manifest=dict(schemaVersion=1,packId=pid,version='0.1.0',title=entry['title'],assets=assets)
        (public/'assets.json').write_text(json.dumps(manifest,indent=2)+'\n')
        (public/'NOTICE.txt').write_text('Original Control-Rod vector artwork, authored in tools/build_theme_art.py.\nLicensed under Apache-2.0. No franchise characters, reference images, fonts or audio are included.\nDraft artwork; human art/distribution review remains pending.\n')
        (source/'source.json').write_text(json.dumps({'packId':pid,'generator':'tools/build_theme_art.py','palette':palette,'status':'draft','props':propnames,'sourceAssets':'Editable SVG siblings; identical geometry to hashed public exports'},indent=2)+'\n')
        def ref(key):
            a=next(a for a in assets if a['key']==key)
            return {k:v for k,v in {**a,'path':f'/floor-themes/{pid}/{a["path"]}'}.items() if k!='key'}
        accent_color = palette[1] if pid == 'midnight-bureau' else palette[2]
        surface_color = '#162534' if pid == 'midnight-bureau' else mix(palette[0], .32)
        pack=dict(schemaVersion=1,id=pid,version='0.1.0',title=entry['title'],description=entry['description'],moodTags=entry['moodTags'],availability='development',tokens=dict(backdrop=mix(palette[0],.18),surface=surface_color,ink='#ffffff',mutedInk='#d4e0eb',accent=accent_color,focus='#ffffff'),assets=dict(scene=ref('scene'),thumbnail=ref('thumbnail'),characters=[ref(f'character-{i}') for i in range(6)],props={f'prop-{i}':ref(f'prop-{i}') for i in range(6)}),stations={key:{**value,'label':entry['stationLabels'][key]} for key,value in STATIONS.items()},motionProfile='shared-v1',signature=entry['signature'],credits=['Original Control-Rod vector artwork · Apache-2.0'])
        (packdir/f'{pid}.ts').write_text('import type { ThemePackV1 } from "../types.js";\nexport default '+json.dumps(pack,indent=2)+' satisfies ThemePackV1;\n')
        entry['thumbnail']=ref('thumbnail')['path']
    catalogpath.write_text('import type { ThemeRegistryEntry } from "./types.js";\nexport const THEME_CATALOG: readonly ThemeRegistryEntry[] = '+json.dumps(entries,indent=2)+';\n')
    print('Built fifteen original draft worlds, ninety characters and ninety props with reproducible sources and SHA-256 manifests.')


if __name__=='__main__': main()
