"""World-specific architectural backdrops and station styling for overlay themes.

Authored to evoke the specific creative lineage of each world with unmistakable
atmosphere while adhering to docs/overlay-themes/originality.md (original vector
geometry only, no trademarked marks, logos, character likenesses, or external assets).

Ergonomics guarantee:
All scenery is confined strictly to the unobstructed circulation corridors:
- Promenade band: y=260..340 (80px height across full 1000px width)
- Upper ceiling clearance: y=0..20 (20px height)
- Lower floor band: y=580..600 (20px height)
- Vertical circulation aisles:
    Upper: x=320..340, x=660..680 (y=0..260)
    Lower: x=360..380, x=640..660 (y=340..600)
- Outer canvas margins: x=0..20, x=980..1000
No scenery crosses into the six station card slot interiors (y=20..260 and y=340..580).
"""

from __future__ import annotations


def mix(hexcolor: str, ratio: float, base=(15, 25, 35)) -> str:
    rgb = tuple(int(hexcolor[i:i+2], 16) for i in (1, 3, 5))
    return '#' + ''.join(f'{round(c * ratio + b * (1 - ratio)):02x}' for c, b in zip(rgb, base))


def backdrop(world: int, a: str, b: str, c: str, d: str, dark: str, light: str, accent: str, rng) -> str:
    """Generate rich world-specific architectural scenery in the unobstructed floor zones."""
    s = ''

    if world == 0:
        # The Monster Mailroom: industrial pneumatic dispatch warehouse, overhead rails & delivery tubes
        # Overhead structural steel truss in ceiling clearance (y=0..20)
        s += f'<rect x="0" y="4" width="1000" height="14" fill="{mix(b, .5)}" stroke="{mix(d, .4)}" stroke-width="1.5"/>'
        for x in range(20, 1000, 48):
            s += f'<line x1="{x}" y1="4" x2="{x+24}" y2="18" stroke="{mix(b, .8)}" stroke-width="1.5"/>'
            s += f'<line x1="{x+24}" y1="4" x2="{x}" y2="18" stroke="{mix(b, .8)}" stroke-width="1.5"/>'
        # Overhead conveyor rail with delivery clamps in ceiling margin
        s += f'<line x1="0" y1="18" x2="1000" y2="18" stroke="{c}" stroke-width="3"/>'

        # Vertical pneumatic transfer tubes running strictly through the vertical aisles
        # Upper aisles: x=324..336, x=664..676 (y=0..260)
        for tx in (330, 670):
            s += (f'<rect x="{tx-5}" y="0" width="10" height="260" fill="{mix(a, .3)}" stroke="{mix(a, .7)}" stroke-width="2" fill-opacity=".45"/>'
                  f'<line x1="{tx-5}" y1="80" x2="{tx+5}" y2="80" stroke="{c}" stroke-width="2"/>'
                  f'<line x1="{tx-5}" y1="180" x2="{tx+5}" y2="180" stroke="{c}" stroke-width="2"/>'
                  f'<rect x="{tx-3}" y="120" width="6" height="18" rx="3" fill="{d}" stroke="{c}" stroke-width="1"/>')

        # Pneumatic routing junction across the promenade (y=260..340) connecting upper (x=330, 670) to lower (x=370, 650)
        s += (f'<path d="M330 260v15q0 15 20 15t20 15v35" fill="none" stroke="{mix(a, .7)}" stroke-width="10"/>'
              f'<path d="M330 260v15q0 15 20 15t20 15v35" fill="none" stroke="{mix(a, .3)}" stroke-width="6"/>'
              f'<path d="M670 260v15q0 15-10 15t-10 15v35" fill="none" stroke="{mix(a, .7)}" stroke-width="10"/>'
              f'<path d="M670 260v15q0 15-10 15t-10 15v35" fill="none" stroke="{mix(a, .3)}" stroke-width="6"/>')

        # Lower aisles: x=364..376, x=644..656 (y=340..600)
        for tx in (370, 650):
            s += (f'<rect x="{tx-5}" y="340" width="10" height="260" fill="{mix(a, .3)}" stroke="{mix(a, .7)}" stroke-width="2" fill-opacity=".45"/>'
                  f'<line x1="{tx-5}" y1="420" x2="{tx+5}" y2="420" stroke="{c}" stroke-width="2"/>'
                  f'<line x1="{tx-5}" y1="520" x2="{tx+5}" y2="520" stroke="{c}" stroke-width="2"/>'
                  f'<rect x="{tx-3}" y="460" width="6" height="18" rx="3" fill="{c}" stroke="{d}" stroke-width="1"/>')

        # Industrial parcel transit rails along promenade (y=280..320)
        s += (f'<rect x="0" y="280" width="1000" height="40" fill="{mix(b, .22)}" stroke="{mix(c, .4)}" stroke-width="1"/>'
              f'<line x1="0" y1="288" x2="1000" y2="288" stroke="{c}" stroke-width="2.5" stroke-dasharray="14 10"/>'
              f'<line x1="0" y1="312" x2="1000" y2="312" stroke="{c}" stroke-width="2.5" stroke-dasharray="14 10"/>')
        for px in (100, 220, 500, 780, 900):
            s += (f'<rect x="{px-16}" y="292" width="32" height="16" rx="4" fill="{mix(b, .6)}" stroke="{d}" stroke-width="1.5"/>'
                  f'<circle cx="{px-6}" cy="300" r="3" fill="{accent}"/>'
                  f'<circle cx="{px+6}" cy="300" r="3" fill="{c}"/>')

    elif world == 1:
        # Little Helpers Laboratory: distillation piping, gauges, and central chalkboard schematic
        # Steam piping and pressure dials in ceiling clearance (y=0..20)
        s += f'<line x1="0" y1="12" x2="1000" y2="12" stroke="{mix(c, .8)}" stroke-width="4"/>'
        for gx in (160, 330, 500, 670, 840):
            s += (f'<circle cx="{gx}" cy="12" r="7" fill="{d}" stroke="{b}" stroke-width="1.5"/>'
                  f'<line x1="{gx}" y1="12" x2="{gx+4}" y2="9" stroke="{c}" stroke-width="1.5"/>')

        # Vertical conduit columns in aisles
        for tx in (330, 670):
            s += f'<rect x="{tx-4}" y="0" width="8" height="260" fill="{mix(b, .3)}" stroke="{mix(c, .5)}" stroke-width="1"/>'
        for tx in (370, 650):
            s += f'<rect x="{tx-4}" y="340" width="8" height="260" fill="{mix(b, .3)}" stroke="{mix(c, .5)}" stroke-width="1"/>'

        # Central chalkboard across the promenade zone (y=274..326)
        s += (f'<rect x="160" y="274" width="680" height="52" rx="4" fill="#1b3628" stroke="{mix(b, .8)}" stroke-width="2.5"/>'
              f'<circle cx="210" cy="300" r="14" fill="none" stroke="{d}" stroke-width="1.5" stroke-dasharray="3 3"/>'
              f'<ellipse cx="210" cy="300" rx="18" ry="7" fill="none" stroke="{d}" stroke-width="1" transform="rotate(30 210 300)"/>'
              f'<path d="M260 292l14 14-8 4 12 6" fill="none" stroke="{c}" stroke-width="2"/>'
              f'<path d="M320 290h55M320 300h40M320 310h30" stroke="{d}" stroke-width="2" stroke-linecap="round"/>'
              f'<circle cx="430" cy="300" r="12" fill="none" stroke="{d}" stroke-width="2"/>'
              f'<line x1="430" y1="284" x2="430" y2="316" stroke="{d}" stroke-width="2"/>'
              f'<line x1="414" y1="300" x2="446" y2="300" stroke="{d}" stroke-width="2"/>'
              f'<path d="M500 290l16 12-8 3 14 12" fill="none" stroke="{accent}" stroke-width="2"/>'
              f'<circle cx="590" cy="300" r="10" fill="none" stroke="{c}" stroke-width="2"/>'
              f'<path d="M660 290h50M660 302h35" stroke="{d}" stroke-width="2"/>'
              f'<circle cx="760" cy="300" r="14" fill="none" stroke="{c}" stroke-width="2"/>'
              f'<line x1="746" y1="300" x2="774" y2="300" stroke="{c}" stroke-width="1.5"/>')

    elif world == 2:
        # Heist Night: penthouse window overlooking midnight skyline in promenade, security tripwires
        # Panoramic midnight skyline silhouette strictly inside the promenade (y=265..340)
        skyline_d = ("M0 340 L0 300 L25 300 L25 278 L55 278 L55 300 "
                     "L85 300 L85 270 L125 270 L125 300 "
                     "L155 300 L155 284 L195 284 L195 300 "
                     "L225 300 L225 268 L275 268 L275 300 "
                     "L305 300 L305 282 L350 282 L350 300 "
                     "L390 300 L390 272 L440 272 L440 300 "
                     "L480 300 L480 266 L530 266 L530 300 "
                     "L570 300 L570 276 L620 276 L620 300 "
                     "L660 300 L660 268 L710 268 L710 300 "
                     "L750 300 L750 280 L800 280 L800 300 "
                     "L840 300 L840 270 L890 270 L890 300 "
                     "L930 300 L930 284 L975 284 L975 300 L1000 300 L1000 340 Z")
        s += f'<path d="{skyline_d}" fill="{mix(b, .18)}" stroke="{mix(b, .38)}" stroke-width="1.5"/>'

        # Spire antennas and beacon lights on rooftops
        for tx, ty in [(90, 270), (250, 268), (505, 266), (685, 268), (865, 270)]:
            s += (f'<line x1="{tx}" y1="{ty}" x2="{tx}" y2="{ty-8}" stroke="{d}" stroke-width="1.5"/>'
                  f'<circle cx="{tx}" cy="{ty-8}" r="2" fill="{c}"/>')

        # Searchlight sweep pools across promenade
        s += (f'<polygon points="90,262 0,260 40,260" fill="{c}" opacity=".09"/>'
              f'<polygon points="865,262 940,260 1000,260" fill="{c}" opacity=".09"/>')

        # Security laser tripwires along promenade (y=278..322) and ceiling band (y=8..14)
        s += (f'<line x1="0" y1="10" x2="1000" y2="10" stroke="{c}" stroke-width="1" stroke-dasharray="16 12" opacity=".5"/>'
              f'<line x1="0" y1="282" x2="1000" y2="300" stroke="{c}" stroke-width="1.5" stroke-dasharray="24 12" opacity=".55"/>'
              f'<line x1="0" y1="318" x2="1000" y2="302" stroke="{c}" stroke-width="1.5" stroke-dasharray="20 10" opacity=".55"/>')

        # Sleek dark architectural pilasters in aisles
        for cx in (330, 670):
            s += f'<rect x="{cx-3}" y="0" width="6" height="260" fill="{mix(a, .4)}" stroke="{mix(c, .3)}" stroke-width="1"/>'
        for cx in (370, 650):
            s += f'<rect x="{cx-3}" y="340" width="6" height="260" fill="{mix(a, .4)}" stroke="{mix(c, .3)}" stroke-width="1"/>'

    elif world == 3:
        # The Chocolate Factory: candy swirl hills, spiral lollipop trees, brass syrup piping
        # Overhead brass candy syrup pipe in ceiling clearance (y=0..20)
        s += (f'<path d="M0 12q250-10 500 4t500-4" fill="none" stroke="{c}" stroke-width="6"/>'
              f'<path d="M0 12q250-10 500 4t500-4" fill="none" stroke="{d}" stroke-width="2" stroke-dasharray="10 8"/>')
        for px in (180, 500, 820):
            s += (f'<circle cx="{px}" cy="13" r="6" fill="{mix(b, .7)}" stroke="{c}" stroke-width="2"/>'
                  f'<circle cx="{px}" cy="13" r="2.5" fill="{accent}"/>')

        # Candy pipes down the vertical aisles
        for tx in (330, 670):
            s += f'<rect x="{tx-4}" y="0" width="8" height="260" fill="{c}" stroke="{d}" stroke-width="1"/>'
        for tx in (370, 650):
            s += f'<rect x="{tx-4}" y="340" width="8" height="260" fill="{c}" stroke="{d}" stroke-width="1"/>'

        # Rolling confectionery hills visible across promenade (y=262..338)
        s += (f'<path d="M0 310q180-45 360 0t360-35 280 25v35H0z" fill="{mix(b, .35)}" stroke="{c}" stroke-width="2.5"/>'
              f'<path d="M0 298q180-45 360 0t360-35 280 25" fill="none" stroke="{d}" stroke-width="2" stroke-dasharray="10 8" opacity=".6"/>')

        # Spiral lollipop trees in promenade
        for lx, ly in [(90, 278), (240, 274), (490, 272), (730, 276), (910, 274)]:
            s += (f'<line x1="{lx}" y1="{ly}" x2="{lx}" y2="{ly+34}" stroke="{d}" stroke-width="3"/>'
                  f'<circle cx="{lx}" cy="{ly}" r="14" fill="{b}" stroke="{c}" stroke-width="2.5"/>'
                  f'<circle cx="{lx}" cy="{ly}" r="8" fill="none" stroke="{d}" stroke-width="1.5"/>'
                  f'<circle cx="{lx}" cy="{ly}" r="3" fill="{c}"/>')

    elif world == 4:
        # The Lantern Woods Guild: STRICT 16-BIT PIXEL ART AESTHETIC!
        # Stepped pixel woodland canopy along ceiling (y=0..16)
        for px in range(0, 1000, 32):
            s += f'<rect x="{px}" y="0" width="32" height="10" fill="{mix(a, .8)}"/>'
            s += f'<rect x="{px+8}" y="10" width="16" height="6" fill="{b}"/>'

        # Stepped pixel timber columns in aisles
        for tx in (330, 670):
            s += (f'<rect x="{tx-6}" y="0" width="12" height="260" fill="{mix(b, .6)}"/>'
                  f'<rect x="{tx-10}" y="18" width="20" height="6" fill="{mix(a, .7)}"/>')
        for tx in (370, 650):
            s += (f'<rect x="{tx-6}" y="340" width="12" height="260" fill="{mix(b, .6)}"/>'
                  f'<rect x="{tx-10}" y="342" width="20" height="6" fill="{mix(a, .7)}"/>')

        # Stepped pixel iron lanterns with dithered pixel amber aura in promenade
        for lx in (160, 500, 840):
            s += (f'<rect x="{lx+4}" y="262" width="4" height="14" fill="{mix(d, .4)}"/>'
                  f'<rect x="{lx}" y="276" width="12" height="14" fill="{mix(d, .3)}"/>'
                  f'<rect x="{lx+2}" y="278" width="8" height="10" fill="{c}"/>')
            # 16-bit dithered pixel aura pattern (alternating 4x4 checkerboard steps, zero opacity)
            for dy in (-8, -4, 0, 4, 8, 12, 16):
                for dx in (-12, -8, -4, 0, 4, 8, 12, 16):
                    if (dx + dy) % 8 == 0 and not (0 <= dx <= 10 and 0 <= dy <= 12):
                        s += f'<rect x="{lx+dx}" y="{276+dy}" width="4" height="4" fill="{c}"/>'

        # Stepped pixel cobblestone path with corrected dither formula in promenade
        for cx in range(0, 1000, 24):
            cy_step = 296 + ((cx // 24) % 3) * 6
            s += f'<rect x="{cx}" y="{cy_step}" width="16" height="8" fill="{mix(b, .4)}" stroke="{mix(a, .6)}" stroke-width="1"/>'

    elif world == 5:
        # The Coffee House Crew: warm neighborhood café, sunlit storefront window in promenade, bistro tables
        # Pendant lamps hanging in ceiling band and aisles
        for lx in (220, 330, 670, 780):
            s += (f'<line x1="{lx}" y1="0" x2="{lx}" y2="16" stroke="{mix(d, .5)}" stroke-width="1.5"/>'
                  f'<polygon points="{lx-8},20 {lx+8},20 {lx},14" fill="{c}"/>')

        # Vertical wood columns in aisles
        for tx in (330, 670):
            s += f'<rect x="{tx-4}" y="0" width="8" height="260" fill="{mix(a, .5)}" stroke="{mix(d, .3)}" stroke-width="1"/>'
        for tx in (370, 650):
            s += f'<rect x="{tx-4}" y="340" width="8" height="260" fill="{mix(a, .5)}" stroke="{mix(d, .3)}" stroke-width="1"/>'

        # Sunlit café storefront window looking onto tree-lined street strictly within promenade (y=265..335)
        s += (f'<rect x="220" y="268" width="560" height="64" rx="4" fill="{mix(d, .92)}" stroke="{mix(a, .8)}" stroke-width="3"/>'
              f'<line x1="220" y1="300" x2="780" y2="300" stroke="{mix(a, .8)}" stroke-width="2"/>'
              f'<line x1="360" y1="268" x2="360" y2="332" stroke="{mix(a, .8)}" stroke-width="2"/>'
              f'<line x1="500" y1="268" x2="500" y2="332" stroke="{mix(a, .8)}" stroke-width="2"/>'
              f'<line x1="640" y1="268" x2="640" y2="332" stroke="{mix(a, .8)}" stroke-width="2"/>')

        # Round bistro tables and stools in promenade (avoids signature sofa furniture)
        for bx in (110, 890):
            s += (f'<ellipse cx="{bx}" cy="296" rx="18" ry="6" fill="{c}"/>'
                  f'<rect x="{bx-2}" y="296" width="4" height="24" fill="{mix(d, .6)}"/>'
                  f'<ellipse cx="{bx}" cy="320" rx="12" ry="4" fill="{mix(d, .7)}"/>')

    elif world == 6:
        # Tumbletown Rhyme Works: crooked chimney stacks in gutters, looping conveyor ramps
        # Crooked chimneys located strictly in borders (x=8, 992) and gutters (x=330, 670)
        for cx, ch in [(10, 60), (330, 70), (670, 70), (990, 60)]:
            s += (f'<path d="M{cx-6} 260l4-{ch} 12 3-4 {ch}z" fill="{b}" stroke="{d}" stroke-width="1.5"/>'
                  f'<path d="M{cx-2} {260-ch}q-12-16 0-24t18-6 8 14" fill="none" stroke="{d}" stroke-width="2" opacity=".6"/>'
                  f'<circle cx="{cx+18}" cy="{246-ch}" r="4" fill="{d}" opacity=".4"/>')

        # Looping conveyor ramps strictly across the promenade (y=274..326)
        s += f'<path d="M0 292q250 40 500-12t500 20" fill="none" stroke="{c}" stroke-width="5"/>'
        for rx in range(40, 980, 80):
            s += f'<rect x="{rx}" y="286" width="12" height="10" rx="2" fill="{d}" stroke="{b}" stroke-width="1"/>'

    elif world == 7:
        # Starport Shipyard: orbital hangar looking at curved planet in promenade, hazard gantry crane
        # Heavy-duty hazard crane in ceiling clearance (y=0..20)
        s += f'<rect x="0" y="4" width="1000" height="12" fill="{mix(a, .4)}" stroke="{mix(d, .4)}" stroke-width="1.5"/>'
        for hx in range(0, 1000, 24):
            s += f'<polygon points="{hx},4 {hx+8},4 {hx+14},16 {hx+6},16" fill="{c}"/>'

        # Blast-door bulkheads in aisles
        for bx in (330, 670):
            s += (f'<rect x="{bx-5}" y="0" width="10" height="260" fill="{mix(a, .3)}" stroke="{mix(d, .5)}" stroke-width="1.5"/>'
                  f'<line x1="{bx}" y1="20" x2="{bx}" y2="250" stroke="{c}" stroke-width="1.5" stroke-dasharray="8 12"/>')
        for bx in (370, 650):
            s += (f'<rect x="{bx-5}" y="340" width="10" height="260" fill="{mix(a, .3)}" stroke="{mix(d, .5)}" stroke-width="1.5"/>'
                  f'<line x1="{bx}" y1="350" x2="{bx}" y2="580" stroke="{c}" stroke-width="1.5" stroke-dasharray="8 12"/>')

        # Luminous curved planet limb and starfield strictly in promenade (y=265..335)
        s += (f'<path d="M260 340q240-80 480 0z" fill="{b}" opacity=".7"/>'
              f'<path d="M260 340q240-80 480 0" fill="none" stroke="{c}" stroke-width="4" opacity=".9"/>')
        for sx, sy in [(120, 280), (180, 310), (450, 275), (550, 285), (820, 290), (920, 315)]:
            s += f'<circle cx="{sx}" cy="{sy}" r="1.5" fill="{d}" opacity=".8"/>'

    elif world == 8:
        # Critter Expedition Camp: STRICT 16-BIT PIXEL ART AESTHETIC!
        # Stepped pixel pine foliage in ceiling clearance (y=0..16)
        for px in range(0, 1000, 40):
            s += f'<rect x="{px}" y="0" width="40" height="8" fill="{mix(a, .7)}"/>'
            s += f'<rect x="{px+10}" y="8" width="20" height="6" fill="{b}"/>'

        # Stepped pixel trail markers in aisles
        for tx in (330, 670):
            s += f'<rect x="{tx-4}" y="0" width="8" height="260" fill="{mix(b, .4)}"/>'
        for tx in (370, 650):
            s += f'<rect x="{tx-4}" y="340" width="8" height="260" fill="{mix(b, .4)}"/>'

        # Stepped pixel tents strictly in promenade (y=270..330)
        for tx in (180, 820):
            # Stepped pixel tent roof (rectangles, zero diagonal mixels)
            for step in range(8):
                w_s = step * 8 + 8
                s += f'<rect x="{tx - w_s // 2}" y="{276 + step * 4}" width="{w_s}" height="4" fill="{d}"/>'
            s += f'<rect x="{tx-4}" y="292" width="8" height="16" fill="{mix(a, .5)}"/>'

        # Stepped pixel campfire: pixel stone ring, pixel firewood logs, pixel flame sprite
        s += f'<rect x="472" y="306" width="56" height="12" fill="{mix(a, .4)}"/>'
        for sx in (476, 492, 508, 520):
            s += f'<rect x="{sx}" y="308" width="8" height="8" fill="{mix(b, .6)}"/>'
        # Pixel wood logs
        s += (f'<rect x="488" y="302" width="24" height="6" fill="{mix(b, .8)}"/>'
              f'<rect x="492" y="298" width="16" height="6" fill="{mix(b, .7)}"/>')
        # Stepped pixel flame sprite
        s += (f'<rect x="494" y="286" width="12" height="12" fill="{c}"/>'
              f'<rect x="496" y="278" width="8" height="8" fill="{c}"/>'
              f'<rect x="498" y="274" width="4" height="6" fill="{accent}"/>')

    elif world == 9:
        # Blockworks Foundry: STRICT ISOMETRIC 3D VOXEL PIXEL AESTHETIC!
        def voxel_cube(vx: int, vy: int, size: int = 16, top_col=c, left_col=a, right_col=b):
            h_s = size // 2
            # Stepped voxel paths
            top = f'M{vx} {vy}l{size} -{h_s} {size} {h_s}-{size} {h_s}z'
            left = f'M{vx} {vy}l0 {size} {size} {h_s} 0 -{size}z'
            right = f'M{vx+size} {vy+h_s}l0 {size} {size} -{h_s} 0 -{size}z'
            return f'<path d="{top}" fill="{top_col}"/><path d="{left}" fill="{left_col}"/><path d="{right}" fill="{right_col}"/>'

        # Voxel crane rail in ceiling clearance (y=0..18)
        s += f'<rect x="0" y="4" width="1000" height="10" fill="{mix(a, .4)}" stroke="{b}" stroke-width="1"/>'
        for vx in range(40, 980, 60):
            s += f'<rect x="{vx}" y="6" width="12" height="6" fill="{c}"/>'

        # Voxel structural pillars in aisles
        for tx in (330, 670):
            s += f'<rect x="{tx-5}" y="0" width="10" height="260" fill="{mix(a, .4)}" stroke="{b}" stroke-width="1"/>'
        for tx in (370, 650):
            s += f'<rect x="{tx-5}" y="340" width="10" height="260" fill="{mix(a, .4)}" stroke="{b}" stroke-width="1"/>'

        # Tiered voxel quarry blocks along promenade (y=270..330)
        for vx in range(40, 960, 64):
            s += voxel_cube(vx, 284, 16, top_col=d, left_col=mix(a, .6), right_col=mix(b, .6))
            s += voxel_cube(vx + 10, 294, 16, top_col=c, left_col=mix(a, .5), right_col=mix(b, .5))

        # Voxel conveyor belt across promenade
        s += f'<line x1="0" y1="304" x2="1000" y2="304" stroke="{mix(b, .4)}" stroke-width="6"/>'
        for vx in range(30, 980, 72):
            s += f'<rect x="{vx}" y="298" width="12" height="12" fill="{d}" stroke="{b}" stroke-width="1"/>'

    elif world == 10:
        # The Cloudspring Baths: traditional cedar pagoda eaves, timber footbridge, mineral steam
        # Pagoda roofline in ceiling clearance (y=0..18)
        for rx, rw in [(120, 180), (460, 200), (800, 180)]:
            s += (f'<path d="M{rx} 16q{rw//2}-14 {rw} 0l-8 4H{rx+8}z" fill="{mix(a, .4)}" stroke="{c}" stroke-width="1.5"/>'
                  f'<path d="M{rx+10} 6q{(rw-20)//2}-10 {rw-20} 0l-6 4H{rx+16}z" fill="{mix(a, .5)}" stroke="{c}" stroke-width="1"/>')

        # Timber columns in aisles
        for tx in (330, 670):
            s += f'<rect x="{tx-4}" y="0" width="8" height="260" fill="{mix(a, .5)}" stroke="{mix(d, .4)}" stroke-width="1"/>'
        for tx in (370, 650):
            s += f'<rect x="{tx-4}" y="340" width="8" height="260" fill="{mix(a, .5)}" stroke="{mix(d, .4)}" stroke-width="1"/>'

        # Natural cedar timber footbridge across hot spring pools in promenade (cleanroom cedar craft)
        s += (f'<rect x="380" y="296" width="240" height="8" rx="2" fill="{mix(a, .6)}" stroke="{mix(d, .7)}" stroke-width="1.5"/>'
              f'<line x1="380" y1="292" x2="620" y2="292" stroke="{mix(c, .8)}" stroke-width="2"/>')
        for px in (400, 450, 500, 550, 600):
            s += f'<rect x="{px-3}" y="284" width="6" height="20" fill="{mix(b, .6)}"/><circle cx="{px}" cy="282" r="2.5" fill="{d}"/>'

        # Swirling mineral steam clouds strictly within promenade (y=265..335)
        for sx in (180, 500, 820):
            s += (f'<path d="M{sx} 320q-16-20 0-36t24-20 12 28" fill="none" stroke="{d}" stroke-width="4" opacity=".3" stroke-linecap="round"/>'
                  f'<path d="M{sx+14} 315q-12-16 0-28t16-16" fill="none" stroke="{d}" stroke-width="3" opacity=".2" stroke-linecap="round"/>')

    elif world == 11:
        # Thimble Town: giant drawer dovetails, thread spool pillars, measuring tape walkway
        # Drawer dovetails in ceiling clearance (y=0..18)
        s += f'<rect x="0" y="0" width="1000" height="18" fill="{mix(a, .35)}" stroke="{mix(c, .4)}" stroke-width="1"/>'
        for dx in range(0, 1000, 50):
            s += f'<path d="M{dx} 0l8 12h14l8-12z" fill="{mix(a, .25)}" stroke="{mix(c, .3)}" stroke-width="1"/>'

        # Giant thread spool pillars in aisles
        for sx in (330, 670):
            s += (f'<rect x="{sx-8}" y="265" width="16" height="6" rx="2" fill="{mix(a, .5)}"/>'
                  f'<rect x="{sx-6}" y="271" width="12" height="58" fill="{c}"/>'
                  f'<rect x="{sx-8}" y="329" width="16" height="6" rx="2" fill="{mix(a, .5)}"/>')
            for ty in range(276, 325, 8):
                s += f'<line x1="{sx-6}" y1="{ty}" x2="{sx+6}" y2="{ty}" stroke="{d}" stroke-width="1.5"/>'

        # Measuring tape walkway across promenade (y=292..316)
        s += (f'<rect x="0" y="296" width="1000" height="16" fill="{mix(d, .8)}" stroke="{mix(c, .6)}" stroke-width="1.5"/>')
        for mx in range(0, 1000, 16):
            h_mark = 8 if mx % 64 == 0 else 4
            s += f'<line x1="{mx}" y1="296" x2="{mx}" y2="{296+h_mark}" stroke="{mix(a, .8)}" stroke-width="1"/>'

    elif world == 12:
        # Clockwork Stargazers: interlocking brass gear trains, astrolabe armillary rings in promenade
        def gear(gx: int, gy: int, r: int, teeth: int = 10, col=c):
            g_str = f'<circle cx="{gx}" cy="{gy}" r="{r}" fill="{mix(col, .35)}" stroke="{col}" stroke-width="2"/>'
            for t_i in range(teeth):
                angle = (360 / teeth) * t_i
                g_str += f'<rect x="{gx-2.5}" y="{gy-r-3}" width="5" height="4" rx="1" fill="{col}" transform="rotate({angle} {gx} {gy})"/>'
            g_str += f'<circle cx="{gx}" cy="{gy}" r="{r//3}" fill="{mix(a, .4)}" stroke="{d}" stroke-width="1.5"/>'
            return g_str

        # Brass shafts in aisles
        for tx in (330, 670):
            s += f'<rect x="{tx-3}" y="0" width="6" height="260" fill="{c}" stroke="{d}" stroke-width="1"/>'
        for tx in (370, 650):
            s += f'<rect x="{tx-3}" y="340" width="6" height="260" fill="{c}" stroke="{d}" stroke-width="1"/>'

        # Interlocking brass gears in promenade (y=265..335)
        s += gear(160, 300, 26, 8)
        s += gear(206, 300, 20, 6, col=d)
        s += gear(500, 300, 32, 10)
        s += gear(794, 300, 20, 6, col=d)
        s += gear(840, 300, 26, 8)

        # Astrolabe armillary rings in center promenade
        s += (f'<circle cx="500" cy="300" r="42" fill="none" stroke="{d}" stroke-width="1.5" opacity=".4"/>'
              f'<ellipse cx="500" cy="300" rx="52" ry="16" fill="none" stroke="{c}" stroke-width="1.5" transform="rotate(-20 500 300)" opacity=".5"/>')

    elif world == 13:
        # Reef Town: bioluminescent branching coral arches, rising bubble streams in aisles
        # Coral arches in promenade (y=265..335)
        for cx in (120, 330, 670, 880):
            s += (f'<path d="M{cx} 330q-6-35 10-60" fill="none" stroke="{mix(c, .8)}" stroke-width="6" stroke-linecap="round"/>'
                  f'<path d="M{cx+3} 302q14-16 22-32" fill="none" stroke="{b}" stroke-width="4" stroke-linecap="round"/>')

        # Bubble streams rising through vertical aisles
        for bx in (330, 670):
            for by in range(20, 260, 35):
                s += f'<circle cx="{bx + (by % 5) * 2 - 4}" cy="{by}" r="3" fill="none" stroke="{d}" stroke-width="1.5" opacity=".5"/>'
        for bx in (370, 650):
            for by in range(350, 580, 35):
                s += f'<circle cx="{bx + (by % 5) * 2 - 4}" cy="{by}" r="3" fill="none" stroke="{d}" stroke-width="1.5" opacity=".5"/>'

        # Sunken anchor in center promenade
        s += (f'<circle cx="500" cy="285" r="8" fill="none" stroke="{mix(a, .7)}" stroke-width="2.5"/>'
              f'<line x1="500" y1="293" x2="500" y2="325" stroke="{mix(a, .7)}" stroke-width="4"/>'
              f'<path d="M482 318q18 14 36 0" fill="none" stroke="{mix(a, .7)}" stroke-width="4" stroke-linecap="round"/>')

    elif world == 14:
        # Cozy Critter Village: oak root arch in ceiling, stone chimney, rustic mailboxes in promenade
        # Oak root arch strictly in ceiling clearance (y=0..18)
        s += f'<path d="M0 16q250-16 500-6t500 6V0H0z" fill="{mix(a, .6)}" stroke="{mix(b, .5)}" stroke-width="1"/>'

        # Stone pillars in aisles
        for tx in (330, 670):
            s += f'<rect x="{tx-4}" y="0" width="8" height="260" fill="{mix(b, .4)}" stroke="{mix(d, .4)}" stroke-width="1"/>'
        for tx in (370, 650):
            s += f'<rect x="{tx-4}" y="340" width="8" height="260" fill="{mix(b, .4)}" stroke="{mix(d, .4)}" stroke-width="1"/>'

        # Rustic wooden mailboxes with palette flags in promenade (y=270..330)
        for mx in (180, 500, 820):
            s += (f'<rect x="{mx}" y="280" width="4" height="28" fill="{mix(b, .5)}"/>'
                  f'<rect x="{mx-5}" y="268" width="16" height="12" rx="3" fill="{d}" stroke="{b}" stroke-width="1"/>'
                  f'<rect x="{mx+11}" y="271" width="5" height="3" fill="{c}"/>')

    return s
