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


def svg(body, width=128, height=128, viewbox=None):
    return f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="{viewbox or f"0 0 {width} {height}"}">{body}</svg>'


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


def character(world,v,palette):
    a,b,c,d=palette
    bodycolors=[a,b,c,mix(a,.65,(220,215,190)),mix(c,.7,(180,210,205)),mix(b,.6,(200,220,210))]
    color=bodycolors[v]
    grad=f'<defs><linearGradient id="body{v}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="{mix(color,.65,(255,255,235))}"/><stop offset="1" stop-color="{color}"/></linearGradient></defs>'
    fill=f'url(#body{v})'
    shadow='<ellipse cx="64" cy="114" rx="34" ry="7" fill="#091726" opacity=".24"/>'
    legs='<path d="M47 93l-5 17h14l4-17M72 93l1 17h15l-8-17" fill="#243b4b"/>'
    eyes='<ellipse cx="52" cy="57" rx="4" ry="6" fill="#172c39"/><ellipse cx="73" cy="57" rx="4" ry="6" fill="#172c39"/><circle cx="53" cy="55" r="1.3" fill="#fff"/><circle cx="74" cy="55" r="1.3" fill="#fff"/><path d="M57 69q8 6 15-1" fill="none" stroke="#31444a" stroke-width="2.5" stroke-linecap="round"/>'
    arms=f'<path d="M38 70Q20 73 27 91M88 70q19 5 13 20" stroke="{color}" stroke-width="10" fill="none" stroke-linecap="round"/>'
    tool=f'<path d="M91 83l17-8 7 18-17 7z" fill="{d}" stroke="{b}" stroke-width="2"/><path d="M97 86l10-4m-7 9 9-4" stroke="{a}" stroke-width="2"/>'
    torso=f'<path d="M34 59q0-29 29-29t30 29v24q-1 21-30 21T34 83z" fill="{fill}"/>'
    extras=''
    skin=hair='#000000'
    if world in (0,3):
        silhouettes=[
            f'<path d="M29 49l-5-15 16 5 6-16 13 9 15-13 9 16 17-2-3 17 8 16-10 9 6 15-15 6-5 15-18-5-15 5-9-15-15-3 5-16-8-12z" fill="{fill}"/>',
            f'<path d="M42 58Q5 20 10 72q1 26 35 10M84 58q37-38 32 14-1 26-35 10" fill="{b}"/><ellipse cx="64" cy="67" rx="24" ry="37" fill="{fill}"/><path d="M53 30l-8-14M73 30l9-14" stroke="{c}" stroke-width="4"/>',
            f'<path d="M26 61l17-23h40l23 25-9 29-30 13-33-14z" fill="{fill}"/><path d="M38 43l-4-18 18 15M78 40l15-17 4 24" fill="{c}"/>',
            f'<path d="M40 90q-14-10-9-25l20-20V25q11-16 24 0v22l20 18q9 24-17 34z" fill="{fill}"/><path d="M48 29l16-14 14 14" fill="{c}"/>',
            f'<ellipse cx="38" cy="81" rx="23" ry="21" fill="{b}"/><ellipse cx="61" cy="77" rx="27" ry="24" fill="{fill}"/><ellipse cx="82" cy="56" rx="24" ry="30" fill="{fill}"/>',
            f'<path d="M36 44l-16-9 6 28-11 9 20 12M91 43l21-8-7 27 12 15-24 8" fill="{c}"/>'+torso,
        ]
        torso=silhouettes[v]
        if world==3:
            extras=f'<path d="M45 78h38l-4 25H49z" fill="{d}"/><path d="M42 31q-10-13 4-17 3-13 17-5 16-8 18 7 12 5 3 16z" fill="{mix(d,.9,(255,255,255))}"/><path d="M44 32h39" stroke="{c}" stroke-width="4"/>'
    elif world in (1,7,12):
        robotshapes=[
            f'<rect x="30" y="30" width="68" height="68" rx="13" fill="{fill}"/><rect x="39" y="40" width="50" height="33" rx="9" fill="#203745"/>',
            f'<path d="M38 91l-12 19M64 91v21M87 91l15 19" stroke="{b}" stroke-width="8"/><path d="M30 48l34-22 35 22-10 44H40z" fill="{fill}"/>',
            f'<path d="M47 65l35 7-35 7 35 7-35 7" fill="none" stroke="{c}" stroke-width="7"/><rect x="36" y="23" width="54" height="45" rx="17" fill="{fill}"/>',
            f'<rect x="25" y="89" width="79" height="18" rx="9" fill="#2a4251"/><circle cx="64" cy="62" r="35" fill="{fill}"/><path d="M42 37q20-15 39 1" stroke="{d}" stroke-width="4" fill="none"/>',
            f'<path d="M43 93h43V64L72 39l14-19 10 9-12 14 12 23v29H33V67L18 46 29 28l10 7-8 12 12 16z" fill="{fill}"/><rect x="45" y="44" width="37" height="28" rx="6" fill="{d}"/>',
            f'<path d="M30 36h67v65H30z" fill="{fill}"/><path d="M30 59h67M30 80h67" stroke="{d}" stroke-width="3"/><circle cx="63" cy="89" r="3" fill="#24394c"/>',
        ]
        torso=robotshapes[v]
        if v==0:eyes=eyes.replace('#172c39',d)
        extras=f'<path d="M63 29V15" stroke="{c}" stroke-width="4"/><circle cx="63" cy="12" r="5" fill="{d}"/><circle cx="90" cy="85" r="5" fill="{c}"/>'
        if world==7:extras+=f'<path d="M21 72l-8-15 8-12M106 73l10-12-10-14" fill="none" stroke="{d}" stroke-width="3"/>'
        if world==12:
            extras+=f'<circle cx="64" cy="80" r="14" fill="{c}" stroke="{d}" stroke-width="3"/><path d="M64 70v10l8 5" fill="none" stroke="#273f53" stroke-width="2"/>'
    elif world in (2,4,5,11):
        skin=['#d29d80','#a96f55','#edc4a7','#bc8d6c','#825443','#e5b795'][v]
        hair=['#263544','#49382e','#d0b78c','#30413c','#322b37','#8e644e'][v]
        legs=f'<path d="M45 87l-4 24h16l8-24M68 87l5 24h16l-7-24" fill="{b}"/>'
        coats=['M32 103l9-40q22-15 44 0l12 40H70l-7-17-7 17z','M27 101l7-35q29-25 59 0l9 35z','M37 101l7-42h38l11 42-28-6z','M24 101l12-32q27-27 57 0l12 32z','M34 101l9-45q21-9 40 4l10 41z','M30 101l6-38q26-18 54 0l9 38-35 6z']
        hairstyles=['M42 36q-2-26 23-25 27 0 20 29l-8-15-25 3-7 13z','M39 38q-8-20 6-25 2-15 20-5 19-7 24 12l-5 24-10-18-24 1z','M44 35q-2-33 24-24 24 7 17 30l-12-13-24 13z','M36 31q3-27 30-23 32 3 24 32l-8-18-36 4-10 18z','M43 39q-11-36 20-30 28-8 23 34l-11-19-21-1z','M37 39q-6-30 29-29 27 2 21 33l-13-16-26 8z']
        torso=f'<path d="{coats[v]}" fill="{fill}"/><path d="M49 58l14 16 14-16" fill="{d}"/><ellipse cx="63" cy="40" rx="{[19,22,17,24,18,21][v]}" ry="{[23,21,25,20,24,22][v]}" fill="{skin}"/><path d="{hairstyles[v]}" fill="{hair}"/>'
        eyes='<circle cx="56" cy="41" r="2" fill="#243540"/><circle cx="70" cy="41" r="2" fill="#243540"/><path d="M59 50q5 3 9-1" fill="none" stroke="#573f35" stroke-width="2"/>'
        if world==2:extras=f'<path d="M62 73l-4 16 5 7 5-7-4-16" fill="{c}"/><path d="M42 62l9 38M82 62l-9 38" stroke="{b}" stroke-width="6"/>'
        if world==4:extras=f'<path d="M35 58l-11 45h29l9-33 10 33h31L90 58 64 74z" fill="{b}"/><circle cx="63" cy="74" r="4" fill="{c}"/>'
        if world==5 and v%2==0:extras=f'<path d="M47 70h32v31H47z" fill="{d}"/><path d="M50 67l-2-11M76 67l2-11" stroke="{d}" stroke-width="4"/>'
        if world==11:extras=f'<path d="M42 20Q64-15 84 20z" fill="{c}"/><path d="M34 23h57" stroke="{b}" stroke-width="5"/>'
        # Each specialist has an original tool as well as different silhouette/proportions.
        tools=[f'<path d="M88 77l26-5v24l-26 4z" fill="{d}"/><path d="M90 78v21M112 73v24" stroke="{c}" stroke-width="3"/>',f'<path d="M43 42q-4-24 21-25 28 0 22 25M42 40v12M86 40v12l-12 4" fill="none" stroke="{b}" stroke-width="5"/>',f'<path d="M87 75h27v27H87z" fill="{d}" stroke="{b}" stroke-width="3"/><path d="M93 80v17M99 82h10M99 89h8" stroke="{a}" stroke-width="2"/>',f'<rect x="87" y="83" width="30" height="23" rx="3" fill="{b}"/><path d="M96 83v-8h11v8" fill="none" stroke="{c}" stroke-width="3"/>',f'<rect x="88" y="72" width="26" height="31" rx="4" fill="{b}"/><rect x="92" y="76" width="18" height="22" fill="{d}"/>',f'<circle cx="99" cy="76" r="12" fill="{d}" stroke="{c}" stroke-width="4"/><path d="M95 86l-10 19" stroke="{c}" stroke-width="5"/>']
        tool=tools[v]
        if world==4 and v==1:
            torso=f'<path d="M29 98l7-39 14-25h30l17 28 4 36z" fill="{fill}"/><path d="M46 36L32 13l4 31M78 36l18-24-5 33" fill="{c}"/><path d="M42 80h45v22H42z" fill="{b}"/>'
            eyes='<circle cx="53" cy="52" r="3" fill="#243540"/><circle cx="74" cy="52" r="3" fill="#243540"/>';extras=''
        elif world==4 and v==2:
            torso=f'<path d="M40 100q-16-24 1-39l15-13V29q10-18 24-2v27l16 18-9 29z" fill="{fill}"/><path d="M76 32l24 10-23 7" fill="{c}"/><path d="M46 67L24 95l30-10" fill="{b}"/>'
            eyes='<circle cx="67" cy="32" r="3" fill="#243540"/>';extras=''
        elif world==4 and v==3:
            torso=f'<path d="M26 52l23-24 36 5 18 28-9 36-29 11-36-14z" fill="{fill}"/><path d="M49 28l7 25-18 19M85 33L72 59l22 38" stroke="{b}" stroke-width="3" fill="none"/>'
            eyes='<circle cx="52" cy="59" r="4" fill="#243540"/><circle cx="74" cy="59" r="4" fill="#243540"/>';extras=''
        elif world==4 and v==4:
            extras+=leaf(92,84,12,c,-30)+leaf(109,91,15,a,35)+f'<path d="M88 90h29l-5 18H94z" fill="{b}"/>'
        if world==5 and v==0:extras+=f'<ellipse cx="63" cy="17" rx="29" ry="10" fill="{b}"/>'
        if world==5 and v==3:extras+=f'<path d="M37 76h55l-4 29H41z" fill="{d}"/>'
        if world==11:
            extras+=f'<path d="M{35+v*3} 97l{18+v} -22 27 22" fill="{c}"/><circle cx="{36+v*7}" cy="86" r="{5+v}" fill="{d}"/>'
    elif world==6:
        paper=[
            f'<path d="M27 91l23-49 14-30 14 33 26 50-41-12z" fill="{fill}"/><path d="M50 42l13 41 15-38M27 91l36-8 41 12" stroke="{d}" stroke-width="3" fill="none"/>',
            f'<path d="M31 99l8-48q24-26 47 0l12 48z" fill="{fill}"/><circle cx="64" cy="27" r="12" fill="{c}"/>',
            f'<path d="M32 49h60v39q-2 18-30 18T32 88zM92 57q35-2 12 32" fill="{fill}"/><path d="M29 49h66M50 33h26" stroke="{b}" stroke-width="7"/><circle cx="63" cy="31" r="6" fill="{c}"/>',
            f'<path d="M34 33l62 12-61 12 59 12-62 12 63 12-61 10z" fill="{fill}" stroke="{b}" stroke-width="3"/>',
            f'<ellipse cx="65" cy="76" rx="33" ry="25" fill="{fill}"/><path d="M39 64l-8-19h66l-7 19" fill="{c}"/><path d="M30 84Q0 76 15 54" fill="none" stroke="{b}" stroke-width="9"/>',
            f'<path d="M37 49l-26-12 9 35 19 3M89 48l27-10-7 35-21 2" fill="{c}"/>'+torso,
        ]
        torso=paper[v]
    elif world in (8,14):
        # Original natural-history creatures; variant anatomy is not a capability label.
        torso=f'<path d="M30 72q-1-34 33-34 34 0 34 34v15q-4 20-34 19-31 0-33-19z" fill="{fill}"/>'
        ears=[f'<path d="M37 44Q13 3 43 17l12 24M75 40Q92 0 100 23L89 49" fill="{color}"/>',f'<path d="M35 48l-4-32 26 21M75 37l27-21-5 37" fill="{color}"/>',f'<path d="M34 56Q1 39 14 78l21 7M93 54q29-21 21 18L92 89" fill="{c}"/>',f'<circle cx="34" cy="40" r="19" fill="{color}"/><circle cx="94" cy="40" r="19" fill="{color}"/>',f'<path d="M35 43l2-22 13 19M79 40l16-18-4 28" fill="{color}"/>',f'<path d="M33 46l11-21 9 16 15-26 11 21 15-7-2 24" fill="{c}"/>'][v]
        torso=ears+torso
        extras=f'<ellipse cx="63" cy="88" rx="22" ry="14" fill="{d}" opacity=".7"/>'
        if world==8:extras+=leaf(86,38,13,c,45)+f'<circle cx="37" cy="81" r="7" fill="{b}"/>'
        if v==3:extras+=f'<path d="M38 92q25-24 49 0" stroke="{b}" stroke-width="5" fill="none"/>'
    elif world==9:
        shapes=[f'<path d="M29 34h64v66H29z" fill="{fill}"/>',f'<path d="M30 43l33-23 35 23v45l-35 17-33-17z" fill="{fill}"/>',f'<path d="M28 32h70v70H28z" fill="{fill}"/><path d="M28 32l20-15h36l14 15" fill="{c}"/>',f'<path d="M24 65l40-45 40 45-15 38H39z" fill="{fill}"/>',f'<path d="M25 99V47q38-47 77 0v52H80V56q-16-19-31 0v43z" fill="{fill}"/>',f'<path d="M26 30h77v62H26z" fill="{fill}"/><rect x="19" y="92" width="90" height="17" rx="5" fill="{b}"/>']
        torso=shapes[v];extras=f'<path d="M30 82h65" stroke="{d}" stroke-width="4"/>'
    elif world==10:
        shapes=[f'<path d="M38 97l8-61q17-30 35 0l12 61z" fill="{fill}"/>',f'<path d="M29 42h64v47q-7 23-32 18-28 0-32-18zM93 50q33 4 11 31" fill="{fill}"/><path d="M28 42h66" stroke="{c}" stroke-width="7"/>',f'<path d="M20 56h88l-11 39q-36 24-67 0z" fill="{fill}"/>',f'<path d="M46 101l7-71q10-24 24 0l8 71z" fill="{fill}"/>',f'<path d="M26 44l70-13 7 24-70 13 70 5-2 26-74-5z" fill="{fill}"/>',f'<path d="M40 36h47l14 21v33l-14 16H40L26 90V57z" fill="{fill}"/><path d="M40 36v70M85 36v70" stroke="{d}" stroke-width="3"/>']
        torso=shapes[v];extras=f'<path d="M40 93q24 8 47-1" stroke="{c}" stroke-width="3" fill="none"/>'
    elif world==13:
        shapes=[
            f'<path d="M31 72Q25 22 64 23q40 0 33 49l10 27-13 8-13-17-7 18H59L48 90l-9 18-18-10z" fill="{fill}"/>',
            f'<path d="M34 43q52-28 56 15L65 91 31 73z" fill="{fill}"/><path d="M38 79l-14 27M52 87l-3 23M66 86l15 21" stroke="{c}" stroke-width="5"/>',
            f'<path d="M14 79l50-55 52 55-39-7-14 25-15-25z" fill="{fill}"/><path d="M64 94l6 18" stroke="{color}" stroke-width="6"/>',
            f'<circle cx="64" cy="70" r="36" fill="{fill}"/><path d="M43 90q-27-30 4-43 35-18 39 17 2 21-20 20-14-3-8-18" fill="none" stroke="{c}" stroke-width="6"/>',
            f'<path d="M63 102q-32-5-16-22 28-10 21-26-29-7-13-28 24-22 37 3l-7 16-11 16q23 35-11 41z" fill="{fill}"/>',
            f'<path d="M22 71q11-49 43-40 32-8 43 40-22 42-43 30Q41 108 22 71z" fill="{fill}"/><path d="M28 77l-7 15M100 77l8 17" stroke="{c}" stroke-width="6"/>',
        ]
        torso=shapes[v];legs='';arms='';extras=f'<circle cx="42" cy="70" r="4" fill="{d}" opacity=".7"/>'
    custom=theme_art_casts.body(world,v,fill,palette,color,skin,hair)
    if custom is not None:torso=custom
    accessory=theme_art_casts.extras(world,v,palette)
    if accessory is not None:extras=accessory
    torso=f'<g id="shape-{v}">{torso}</g>'
    return svg(grad+shadow+legs+arms+torso+eyes+extras+tool)


def vignette(world,px,py,palette):
    """The world's own small environmental vignette, drawn with its top left near (px, py).

    The floor scene puts one at each room's quiet edge; the office worlds reuse it in their regions.
    """
    a,b,c,d=palette
    s=''
    if world==0:
        s+=f'<rect x="{px}" y="{py}" width="23" height="47" rx="11" fill="{b}" stroke="{d}" stroke-width="2"/><circle cx="{px+11}" cy="{py+14}" r="6" fill="{a}"/><path d="M{px+11} {py+47}v13h-27" fill="none" stroke="{c}" stroke-width="5"/>'
    elif world==1:
        s+=f'<path d="M{px} {py+12}v41h24V{py+12}" fill="{mix(a,.8)}" stroke="{d}" stroke-width="2"/><path d="M{px-5} {py+12}h34" stroke="{c}" stroke-width="5"/><circle cx="{px+12}" cy="{py+35}" r="6" fill="{d}"/><path d="M{px+4} {py}h16v12" fill="none" stroke="{c}" stroke-width="3"/>'
    elif world==2:
        for j in range(5):s+=f'<rect x="{px-17+j*10}" y="{py+10+(j%3)*8}" width="8" height="{42-(j%3)*8}" fill="{mix(b,.25)}"/><path d="M{px-14+j*10} {py+24}v9" stroke="{c}" stroke-width="2"/>'
        s+=f'<path d="M{px-20} {py+53}h65" stroke="{d}" stroke-width="2"/>'
    elif world==3:
        s+=f'<path d="M{px} {py+32}v28h23V{py+32}" fill="{c}"/><ellipse cx="{px+11}" cy="{py+30}" rx="19" ry="17" fill="{b}"/><path d="M{px+11} {py+13}v35" stroke="{d}" stroke-width="3"/><circle cx="{px+11}" cy="{py+30}" r="8" fill="none" stroke="{d}" stroke-width="3"/>'
    elif world==4:
        s+=f'<path d="M{px+10} {py+3}v14" stroke="{c}" stroke-width="3"/><path d="M{px-3} {py+20}l13-8 14 8-3 28H{px}z" fill="{c}"/><path d="M{px+5} {py+19}v26M{px+15} {py+19}v26" stroke="{d}" stroke-width="2"/>'
        s+=leaf(px,py+65,14,a,-30)+leaf(px+15,py+69,12,c,40)
    elif world==5:
        s+=f'<path d="M{px} {py+39}h22l-3 23h-16z" fill="{c}"/><path d="M{px+5} {py+40}v-29M{px+12} {py+40}l15-33" stroke="{a}" stroke-width="4"/>'+leaf(px+6,py+27,12,a,-40)+leaf(px+20,py+29,12,a,40)
    elif world==6:
        s+=f'<path d="M{px-4} {py+64}l7-47 16-7 12 54z" fill="{b}" stroke="{d}" stroke-width="2"/><path d="M{px} {py+26}l30 5M{px} {py+39}l30 5M{px} {py+52}l30 5" stroke="{c}" stroke-width="6"/><path d="M{px+13} {py+13}l9-15" stroke="{c}" stroke-width="4"/>'
    elif world==7:
        s+=f'<path d="M{px-7} {py+47}l18-16 23 16-22 12z" fill="{a}"/><path d="M{px+11} {py+38}v-27l16-10v30z" fill="{c}" opacity=".6"/>'+star(px+19,py+16,9,d)
    elif world==8:
        s+=f'<path d="M{px-12} {py+31}l25-31 28 31z" fill="{c}"/><path d="M{px-7} {py+31}v31h40V{py+31}" fill="{b}"/><path d="M{px+8} {py+62}V{py+37}h11v25" fill="{mix(a,.3)}"/>'
    elif world==9:
        for j in range(3):
            xx,yy=px+(j%2)*18,py+(j//2)*25
            s+=f'<path d="M{xx} {yy+8}l16-8 16 8-16 8z" fill="{d}"/><path d="M{xx} {yy+8}v17l16 8V{yy+16}z" fill="{a}"/><path d="M{xx+16} {yy+16}l16-8v17l-16 8z" fill="{b}"/>'
    elif world==10:
        s+=f'<path d="M{px-13} {py+24}l27-20 27 20-27-5z" fill="{c}"/><path d="M{px-4} {py+24}v38h36V{py+24}" fill="{b}"/><path d="M{px+14} {py+28}v32M{px-4} {py+43}h36" stroke="{d}" stroke-width="2"/><path d="M{px-14} {py+69}q28-10 53 0" fill="none" stroke="{a}" stroke-width="4"/>'
    elif world==11:
        s+=f'<ellipse cx="{px+11}" cy="{py+20}" rx="21" ry="9" fill="{d}"/><path d="M{px-4} {py+20}v36h31V{py+20}" fill="{b}"/><ellipse cx="{px+11}" cy="{py+56}" rx="21" ry="9" fill="{d}"/><path d="M{px} {py+26}l23 6-23 7 23 7" fill="none" stroke="{c}" stroke-width="3"/>'
    elif world==12:
        s+=f'<circle cx="{px+9}" cy="{py+30}" r="26" fill="none" stroke="{c}" stroke-width="2"/><ellipse cx="{px+9}" cy="{py+30}" rx="32" ry="9" fill="none" stroke="{d}" stroke-width="2" transform="rotate(-30 {px+9} {py+30})"/><circle cx="{px+9}" cy="{py+30}" r="9" fill="{c}"/><path d="M{px+9} {py+56}v13h-19" stroke="{c}" stroke-width="3" fill="none"/>'
    elif world==13:
        for j in range(4):s+=f'<path d="M{px+j*5} {py+67}q-20-30 {j*6-12}-44" fill="none" stroke="{[a,c,b,d][j]}" stroke-width="6" stroke-linecap="round"/>'
    elif world==14:
        s+=f'<path d="M{px-8} {py+37}v29h42V{py+37}L{px+13} {py+20}z" fill="{c}"/><path d="M{px-14} {py+38}l27-24 28 24" fill="none" stroke="{b}" stroke-width="5"/><path d="M{px+6} {py+47}h15v19h-15z" fill="{d}"/>'
    return s


def scene(world,entry):
    a,b,c,d=entry['palette'];dark=mix(a,.18);light=mix(a,.65);accent=mix(c,.7,(255,230,195));rng=random.Random(world+17)
    s=(f'<defs>'
       f'<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="{mix(a,.42)}"/><stop offset="1" stop-color="{dark}"/></linearGradient>'
       f'<linearGradient id="desk" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="{mix(c,.65)}"/><stop offset="1" stop-color="{mix(b,.4)}"/></linearGradient>'
       f'<radialGradient id="ambient" cx="50%" cy="50%" r="65%"><stop offset="0" stop-color="{mix(c,.25,(255,255,255))}" stop-opacity=".14"/><stop offset="100%" stop-color="{dark}" stop-opacity="0"/></radialGradient>'
       f'</defs>'
       f'<rect width="1000" height="600" fill="url(#sky)"/>'
       f'<rect width="1000" height="600" fill="url(#ambient)"/>')
    # World-specific architectural backdrop
    s+=theme_art_backdrops.backdrop(world,a,b,c,d,dark,light,accent,rng)
    # Central shared promenade, with a world-specific routing language.
    s+=f'<path d="M0 286h1000v30H0z" fill="{mix(b,.28)}"/><path d="M20 300h960" stroke="{accent}" stroke-width="2" stroke-dasharray="4 12" opacity=".45"/>'
    if world in (0,1,3,7):
        s+=f'<path d="M0 277h1000M0 323h1000" stroke="{mix(c,.65)}" stroke-width="8"/>'
        for x in range(40,1000,110):s+=f'<circle cx="{x}" cy="300" r="12" fill="{mix(a,.65)}" stroke="{d}" stroke-width="2"/><circle cx="{x}" cy="300" r="4" fill="{accent}"/>'
    if world in (10,13):s+=f'<path d="M0 298q125-25 250 0t250 0 250 0 250 0" fill="none" stroke="{mix(d,.7)}" stroke-width="10" opacity=".3"/>'
    for index,(key,r) in enumerate(STATIONS.items()):
        x,y,w,h=r['x'],r['y'],r['w'],r['h'];rounding=26 if world in (4,8,10,13,14) else 9 if world in (2,7,9,12) else 17
        s+=f'<rect x="{x+3}" y="{y+7}" width="{w}" height="{h}" rx="{rounding}" fill="#071422" opacity=".35"/><rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{rounding}" fill="{mix(a,.16)}" fill-opacity=".4" stroke="{mix(d,.45)}" stroke-width="1.5"/>'
        # Quiet station header plate beneath title
        s+=f'<rect x="{x+1}" y="{y+1}" width="{w-2}" height="32" rx="{rounding-1}" fill="{mix(a,.22)}" opacity=".75"/><rect x="{x+1}" y="{y+18}" width="{w-2}" height="14" fill="{mix(a,.22)}" opacity=".75"/><line x1="{x+12}" y1="{y+32}" x2="{x+w-12}" y2="{y+32}" stroke="{mix(d,.35)}" stroke-width="1"/>'
        s+=f'<path d="M{x+14} {y+h-30}h{w-28}l-8 15H{x+22}z" fill="url(#desk)"/><path d="M{x+22} {y+h-15}v7h{w-44}v-7" fill="{mix(b,.35)}"/>'
        for col in range(3):
            sx=x+w*(col+.5)/3
            s+=f'<ellipse cx="{sx}" cy="{y+110}" rx="30" ry="8" fill="#d9ecdb" opacity=".07"/><ellipse cx="{sx}" cy="{y+195}" rx="30" ry="8" fill="#d9ecdb" opacity=".07"/>'
        # Each room receives a handcrafted environmental vignette at its quiet edge.
        s+=vignette(world,x+w-42,y+22,entry['palette'])
        # Small instrument indicators are decorative; no numbers or fake progress.
        for j in range(3):s+=f'<circle cx="{x+22+j*9}" cy="{y+h-22}" r="2" fill="{d}" opacity=".55"/>'
    if world==12:
        s+=f'<circle cx="500" cy="300" r="25" fill="{dark}" stroke="{c}" stroke-width="2"/>'+star(500,300,15,d)
    return svg(s,1000,600)


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
        thumbnail=svg(inner,800,480,'0 0 1000 600')
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
        pack=dict(schemaVersion=1,id=pid,version='0.1.0',title=entry['title'],description=entry['description'],moodTags=entry['moodTags'],availability='development',tokens=dict(backdrop=mix(palette[0],.18),surface=mix(palette[0],.32),ink='#ffffff',mutedInk='#d4e0eb',accent=palette[2],focus='#ffffff'),assets=dict(scene=ref('scene'),thumbnail=ref('thumbnail'),characters=[ref(f'character-{i}') for i in range(6)],props={f'prop-{i}':ref(f'prop-{i}') for i in range(6)}),stations={key:{**value,'label':entry['stationLabels'][key]} for key,value in STATIONS.items()},motionProfile='shared-v1',signature=entry['signature'],credits=['Original Control-Rod vector artwork · Apache-2.0'])
        (packdir/f'{pid}.ts').write_text('import type { ThemePackV1 } from "../types.js";\nexport default '+json.dumps(pack,indent=2)+' satisfies ThemePackV1;\n')
        entry['thumbnail']=ref('thumbnail')['path']
    catalogpath.write_text('import type { ThemeRegistryEntry } from "./types.js";\nexport const THEME_CATALOG: readonly ThemeRegistryEntry[] = '+json.dumps(entries,indent=2)+';\n')
    print('Built fifteen original draft worlds, ninety characters and ninety props with reproducible sources and SHA-256 manifests.')


if __name__=='__main__': main()
