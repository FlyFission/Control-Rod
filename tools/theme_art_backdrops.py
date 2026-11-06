"""World-specific architectural backdrops and station styling for overlay themes.

Authored to evoke the specific creative lineage of each world with unmistakable
atmosphere while adhering to docs/overlay-themes/originality.md (original vector
geometry only, no trademarked marks, logos, character likenesses, or external assets).
"""

from __future__ import annotations


def mix(hexcolor: str, ratio: float, base=(15, 25, 35)) -> str:
    rgb = tuple(int(hexcolor[i:i+2], 16) for i in (1, 3, 5))
    return '#' + ''.join(f'{round(c * ratio + b * (1 - ratio)):02x}' for c, b in zip(rgb, base))


def backdrop(world: int, a: str, b: str, c: str, d: str, dark: str, light: str, accent: str, rng) -> str:
    """Generate the rich world-specific architectural scenery behind the floor stations."""
    s = ''

    if world == 0:
        # The Monster Mailroom: industrial pneumatic dispatch warehouse, overhead door tracks & delivery tubes
        # Overhead structural steel I-beam truss spanning the open top margin
        s += f'<rect x="0" y="8" width="1000" height="12" fill="{mix(b, .5)}" stroke="{mix(d, .4)}" stroke-width="1.5"/>'
        for x in range(20, 1000, 50):
            s += f'<line x1="{x}" y1="8" x2="{x+25}" y2="20" stroke="{mix(b, .8)}" stroke-width="2"/>'
            s += f'<line x1="{x+25}" y1="8" x2="{x}" y2="20" stroke="{mix(b, .8)}" stroke-width="2"/>'
        # Overhead suspended conveyor rail with door clamps across the ceiling
        s += f'<line x1="0" y1="28" x2="1000" y2="28" stroke="{c}" stroke-width="4"/>'
        for x in (60, 220, 330, 490, 670, 810, 950):
            s += (f'<rect x="{x}" y="28" width="8" height="12" fill="{mix(d, .6)}"/>'
                  f'<rect x="{x-10}" y="40" width="28" height="36" rx="3" fill="{mix(b, .4)}" stroke="{c}" stroke-width="1.5"/>'
                  f'<circle cx="{x+4}" cy="58" r="2.5" fill="{accent}"/>')
        # Three vertical pneumatic glass transfer tubes in the vertical circulation aisles (x=330, x=670) and margins
        for tx in (330, 670):
            s += (f'<rect x="{tx-5}" y="0" width="20" height="600" fill="{mix(a, .3)}" stroke="{mix(a, .7)}" stroke-width="2" fill-opacity=".4"/>'
                  f'<line x1="{tx-5}" y1="140" x2="{tx+15}" y2="140" stroke="{c}" stroke-width="3"/>'
                  f'<line x1="{tx-5}" y1="270" x2="{tx+15}" y2="270" stroke="{c}" stroke-width="3"/>'
                  f'<line x1="{tx-5}" y1="420" x2="{tx+15}" y2="420" stroke="{c}" stroke-width="3"/>'
                  f'<rect x="{tx-2}" y="200" width="14" height="28" rx="6" fill="{d}" stroke="{c}" stroke-width="1.5"/>'
                  f'<rect x="{tx-2}" y="360" width="14" height="28" rx="6" fill="{c}" stroke="{d}" stroke-width="1.5"/>')
        # Heavy-duty industrial floor transit tracks along the central promenade
        s += (f'<rect x="0" y="278" width="1000" height="44" fill="{mix(b, .2)}" stroke="{mix(c, .4)}" stroke-width="1"/>'
              f'<line x1="0" y1="288" x2="1000" y2="288" stroke="{c}" stroke-width="3" stroke-dasharray="14 10"/>'
              f'<line x1="0" y1="312" x2="1000" y2="312" stroke="{c}" stroke-width="3" stroke-dasharray="14 10"/>')
        for px in range(40, 1000, 120):
            s += f'<circle cx="{px}" cy="300" r="8" fill="{mix(a, .5)}" stroke="{d}" stroke-width="2"/>'

    elif world == 1:
        # Little Helpers Laboratory: massive distillation coils, chalkboard schematics, pressure pipes
        # Overhead copper steam piping with round analog pressure gauges in top margin
        s += (f'<line x1="0" y1="14" x2="1000" y2="14" stroke="{mix(c, .8)}" stroke-width="5"/>'
              f'<line x1="0" y1="22" x2="1000" y2="22" stroke="{mix(b, .6)}" stroke-width="3"/>')
        for gx in (160, 330, 500, 670, 840):
            s += (f'<circle cx="{gx}" cy="18" r="11" fill="{d}" stroke="{b}" stroke-width="2"/>'
                  f'<line x1="{gx}" y1="18" x2="{gx+5}" y2="13" stroke="{c}" stroke-width="2"/>'
                  f'<circle cx="{gx}" cy="18" r="2" fill="{a}"/>')
        # Central chalkboard across the promenade zone (y=274..326)
        s += (f'<rect x="180" y="274" width="640" height="52" rx="4" fill="#1b3628" stroke="{mix(b, .8)}" stroke-width="3"/>'
              f'<circle cx="230" cy="300" r="14" fill="none" stroke="{d}" stroke-width="1.5" stroke-dasharray="3 3"/>'
              f'<ellipse cx="230" cy="300" rx="18" ry="7" fill="none" stroke="{d}" stroke-width="1" transform="rotate(30 230 300)"/>'
              f'<path d="M280 292l14 14-8 4 12 6" fill="none" stroke="{c}" stroke-width="2"/>'
              f'<path d="M340 290h55M340 300h40M340 310h30" stroke="{d}" stroke-width="2" stroke-linecap="round"/>'
              f'<circle cx="450" cy="300" r="12" fill="none" stroke="{d}" stroke-width="2"/>'
              f'<line x1="450" y1="284" x2="450" y2="316" stroke="{d}" stroke-width="2"/>'
              f'<line x1="434" y1="300" x2="466" y2="300" stroke="{d}" stroke-width="2"/>'
              f'<path d="M520 290l16 12-8 3 14 12" fill="none" stroke="{accent}" stroke-width="2"/>'
              f'<circle cx="610" cy="300" r="10" fill="none" stroke="{c}" stroke-width="2"/>'
              f'<path d="M680 290h50M680 302h35" stroke="{d}" stroke-width="2"/>')

    elif world == 2:
        # Heist Night: penthouse glass window overlooking midnight skyline, laser beams, marble floor
        # Compact skyline paths (lightweight, under 15KB)
        sky_path = ("M0 270"
                    "L20 270 20 120 70 120 70 270 "
                    "L90 270 90 90 150 90 150 270 "
                    "L180 270 180 140 240 140 240 270 "
                    "L260 270 260 70 320 70 320 270 "
                    "L350 270 350 110 420 110 420 270 "
                    "L440 270 440 50 510 50 510 270 "
                    "L530 270 530 100 600 100 600 270 "
                    "L620 270 620 60 690 60 690 270 "
                    "L710 270 710 130 780 130 780 270 "
                    "L800 270 800 80 870 80 870 270 "
                    "L890 270 890 120 960 120 960 270 "
                    "L1000 270 1000 600 0 600 Z")
        s += f'<path d="{sky_path}" fill="{mix(b, .18)}" stroke="{mix(b, .35)}" stroke-width="1.5"/>'
        # Spire antennas with beacon lights in upper margin
        for tx in (120, 290, 475, 655, 835):
            s += (f'<line x1="{tx}" y1="20" x2="{tx}" y2="70" stroke="{mix(d, .7)}" stroke-width="2"/>'
                  f'<circle cx="{tx}" cy="20" r="3" fill="#ff4444"/>')
        # Searchlight sweeps in open sky
        s += (f'<polygon points="120,20 0,0 80,0" fill="{c}" opacity=".07"/>'
              f'<polygon points="835,20 920,0 1000,0" fill="{c}" opacity=".07"/>')
        # Angled cyan security laser tripwires across upper clearance and promenade
        s += (f'<line x1="0" y1="25" x2="1000" y2="45" stroke="{c}" stroke-width="1.5" stroke-dasharray="16 8" opacity=".6"/>'
              f'<line x1="0" y1="275" x2="1000" y2="305" stroke="{c}" stroke-width="1.5" stroke-dasharray="20 10" opacity=".6"/>'
              f'<line x1="0" y1="325" x2="1000" y2="295" stroke="{c}" stroke-width="1.5" stroke-dasharray="24 8" opacity=".5"/>')
        # Sleek dark architectural columns along bay dividers
        for cx in (330, 670):
            s += f'<rect x="{cx-4}" y="0" width="8" height="600" fill="{mix(a, .5)}" stroke="{mix(c, .4)}" stroke-width="1"/>'

    elif world == 3:
        # The Chocolate Factory: whimsical candy hills, giant lollipop trees, looping brass syrup pipes
        # Rolling candy-swirl hills visible across the central promenade (y=260..340)
        s += (f'<path d="M0 310q180-60 360 0t360-50 280 40v30H0z" fill="{mix(b, .35)}" stroke="{c}" stroke-width="3"/>'
              f'<path d="M0 295q180-60 360 0t360-50 280 40" fill="none" stroke="{d}" stroke-width="2" stroke-dasharray="10 8" opacity=".6"/>')
        # Giant spiral lollipop tree silhouettes in promenade and margins
        for lx, ly in [(80, 270), (330, 280), (670, 275), (920, 265)]:
            s += (f'<line x1="{lx}" y1="{ly}" x2="{lx}" y2="{ly+45}" stroke="{d}" stroke-width="4"/>'
                  f'<circle cx="{lx}" cy="{ly}" r="18" fill="{b}" stroke="{c}" stroke-width="3"/>'
                  f'<circle cx="{lx}" cy="{ly}" r="10" fill="none" stroke="{d}" stroke-width="2"/>'
                  f'<circle cx="{lx}" cy="{ly}" r="4" fill="{c}"/>')
        # Looping overhead brass/copper candy syrup pipe with glass globes along upper margin
        s += (f'<path d="M0 22q250-18 500 10t500-10" fill="none" stroke="{c}" stroke-width="8"/>'
              f'<path d="M0 22q250-18 500 10t500-10" fill="none" stroke="{d}" stroke-width="3" stroke-dasharray="12 8"/>')
        for px in (180, 500, 820):
            s += (f'<circle cx="{px}" cy="24" r="10" fill="{mix(b, .7)}" stroke="{c}" stroke-width="2.5"/>'
                  f'<circle cx="{px}" cy="24" r="5" fill="{accent}"/>')

    elif world == 4:
        # The Lantern Woods Guild: STRICT 16-BIT PIXEL ART AESTHETIC!
        # Stepped-pixel woodland canopy along the top (uniform 16px pixel blocks)
        for px in range(0, 1000, 32):
            s += f'<rect x="{px}" y="0" width="32" height="16" fill="{mix(a, .8)}"/>'
            s += f'<rect x="{px+8}" y="16" width="16" height="12" fill="{b}"/>'
        # Stepped pixel timber columns at bay seams
        for tx in (330, 670):
            s += f'<rect x="{tx-6}" y="0" width="12" height="600" fill="{mix(b, .6)}"/>'
            s += f'<rect x="{tx-12}" y="28" width="24" height="8" fill="{mix(a, .7)}"/>'
            s += f'<rect x="{tx-12}" y="272" width="24" height="8" fill="{mix(a, .7)}"/>'
        # Stepped pixel iron lanterns with dithered warm amber light halos in promenade
        for lx in (170, 500, 830):
            s += (f'<rect x="{lx+4}" y="260" width="4" height="16" fill="{mix(d, .4)}"/>'
                  f'<rect x="{lx}" y="276" width="12" height="16" fill="{mix(d, .3)}"/>'
                  f'<rect x="{lx+2}" y="278" width="8" height="12" fill="{c}"/>'
                  f'<rect x="{lx-6}" y="272" width="24" height="24" fill="{c}" fill-opacity=".15"/>'
                  f'<rect x="{lx-12}" y="266" width="36" height="36" fill="{c}" fill-opacity=".08"/>')
        # Stepped pixel cobblestone path along promenade (y=292..316)
        for cx in range(0, 1000, 24):
            cy_step = 296 + (cx % 3) * 6
            s += f'<rect x="{cx}" y="{cy_step}" width="16" height="8" fill="{mix(b, .4)}" stroke="{mix(a, .6)}" stroke-width="1"/>'

    elif world == 5:
        # The Coffee House Crew: warm exposed brick masonry, arched sunlit window, sofa lounge
        # Brick masonry lines across background (compact line paths, under 15KB)
        brick_lines = ""
        for by in range(6, 260, 16):
            brick_lines += f"M0 {by}H1000 "
        for by in range(340, 590, 16):
            brick_lines += f"M0 {by}H1000 "
        s += f'<path d="{brick_lines}" stroke="{mix(d, .2)}" stroke-width="1.5"/>'
        # Center arched window in the central circulation hub
        s += (f'<path d="M430 268V140q70-55 140 0v128z" fill="{mix(d, .9)}" stroke="{mix(a, .8)}" stroke-width="5"/>'
              f'<line x1="430" y1="190" x2="570" y2="190" stroke="{mix(a, .8)}" stroke-width="3"/>'
              f'<line x1="500" y1="100" x2="500" y2="268" stroke="{mix(a, .8)}" stroke-width="3"/>')
        # Hanging warm amber pendant lamps in open upper margin
        for lx in (220, 780):
            s += (f'<line x1="{lx}" y1="0" x2="{lx}" y2="35" stroke="{mix(d, .5)}" stroke-width="2"/>'
                  f'<polygon points="{lx-14},45 {lx+14},45 {lx},35" fill="{c}"/>')
        # Elegant round cafe bistro tables in center promenade (avoids signature sofa furniture)
        s += (f'<ellipse cx="460" cy="296" rx="22" ry="7" fill="{c}"/>'
              f'<rect x="458" y="296" width="4" height="24" fill="{mix(d, .6)}"/>'
              f'<ellipse cx="460" cy="320" rx="14" ry="4" fill="{mix(d, .7)}"/>'
              f'<ellipse cx="540" cy="296" rx="22" ry="7" fill="{c}"/>'
              f'<rect x="538" y="296" width="4" height="24" fill="{mix(d, .6)}"/>'
              f'<ellipse cx="540" cy="320" rx="14" ry="4" fill="{mix(d, .7)}"/>')

    elif world == 6:
        # Tumbletown Rhyme Works: crooked spiral chimney stacks, looping roller conveyor ramps, whimsical physics
        # Crooked spiraling chimney stacks visible along the bay dividers and promenade
        for cx, ch in [(160, 90), (500, 110), (840, 95)]:
            s += (f'<path d="M{cx} 270l10-{ch} 20 5-6 {ch}z" fill="{b}" stroke="{d}" stroke-width="2"/>'
                  f'<path d="M{cx+8} {270-ch}q-18-24 0-36t26-8 12 20" fill="none" stroke="{d}" stroke-width="2.5" opacity=".6"/>'
                  f'<circle cx="{cx+36}" cy="{250-ch}" r="6" fill="{d}" opacity=".4"/>')
        # Looping spiraling roller conveyor ramps through the promenade (y=275..325)
        s += f'<path d="M0 290q250 50 500-15t500 25" fill="none" stroke="{c}" stroke-width="6"/>'
        for rx in range(50, 980, 90):
            s += f'<rect x="{rx}" y="282" width="14" height="12" rx="2" fill="{d}" stroke="{b}" stroke-width="1.5"/>'

    elif world == 7:
        # Starport Shipyard: vast orbital hangar bay looking out at curved planet & starfield, gantry cranes
        # Starfield in open upper clearance
        for _ in range(45):
            sx, sy = rng.randrange(1000), rng.randrange(50)
            s += f'<circle cx="{sx}" cy="{sy}" r="{rng.choice([1, 1, 2])}" fill="{d}" opacity="{rng.uniform(.4, .9)}"/>'
        # Radiant curved planet limb in upper space
        s += (f'<path d="M720 0q140 60 280 160V0z" fill="{b}" opacity=".6"/>'
              f'<path d="M720 0q140 60 280 160" fill="none" stroke="{c}" stroke-width="6" opacity=".85"/>')
        # Heavy-duty yellow gantry crane with hazard chevrons across upper margin
        s += f'<rect x="0" y="16" width="1000" height="14" fill="{mix(a, .4)}" stroke="{mix(d, .4)}" stroke-width="1.5"/>'
        for hx in range(0, 1000, 28):
            s += f'<polygon points="{hx},16 {hx+10},16 {hx+16},30 {hx+6},30" fill="{c}"/>'
        # Vertical structural blast-door bay bulkheads at seams
        for bx in (330, 670):
            s += (f'<rect x="{bx-6}" y="0" width="12" height="600" fill="{mix(a, .3)}" stroke="{mix(d, .5)}" stroke-width="1.5"/>'
                  f'<line x1="{bx}" y1="30" x2="{bx}" y2="570" stroke="{c}" stroke-width="2" stroke-dasharray="10 16"/>')

    elif world == 8:
        # Critter Expedition Camp: STRICT 16-BIT PIXEL ART AESTHETIC!
        # Stepped pixel canvas field tents in central promenade
        for tx in (220, 780):
            s += (f'<polygon points="{tx},272 {tx-36},314 {tx+36},314" fill="{d}"/>'
                  f'<polygon points="{tx},272 {tx-8},314 {tx+8},314" fill="{mix(a, .5)}"/>'
                  f'<line x1="{tx}" y1="272" x2="{tx}" y2="260" stroke="{mix(b, .5)}" stroke-width="2"/>')
        # Central stone-ringed pixel campfire with stepped pixel ember glow (strict 16-bit grid)
        s += f'<rect x="472" y="292" width="56" height="18" fill="{mix(a, .4)}"/>'
        for sx in (474, 490, 506, 520):
            s += f'<rect x="{sx}" y="294" width="8" height="8" fill="{mix(b, .6)}"/>'
        s += (f'<rect x="494" y="280" width="12" height="14" fill="{c}"/>'
              f'<rect x="498" y="274" width="6" height="8" fill="{accent}"/>'
              f'<rect x="490" y="272" width="20" height="20" fill="{accent}" fill-opacity=".15"/>')

    elif world == 9:
        # Blockworks Foundry: STRICT ISOMETRIC 3D VOXEL PIXEL AESTHETIC!
        def voxel_cube(vx: int, vy: int, size: int = 18, top_col=c, left_col=a, right_col=b):
            h_s = size // 2
            top = f'M{vx} {vy}l{size} -{h_s} {size} {h_s}-{size} {h_s}z'
            left = f'M{vx} {vy}l0 {size} {size} {h_s} 0 -{size}z'
            right = f'M{vx+size} {vy+h_s}l0 {size} {size} -{h_s} 0 -{size}z'
            return f'<path d="{top}" fill="{top_col}"/><path d="{left}" fill="{left_col}"/><path d="{right}" fill="{right_col}"/>'

        # Tiered voxel quarry blocks along the promenade (y=265..335)
        for vx in range(30, 970, 64):
            s += voxel_cube(vx, 280, 18, top_col=d, left_col=mix(a, .6), right_col=mix(b, .6))
            s += voxel_cube(vx + 12, 290, 18, top_col=c, left_col=mix(a, .5), right_col=mix(b, .5))
        # Voxel conveyor belt across the promenade
        s += f'<line x1="0" y1="300" x2="1000" y2="300" stroke="{mix(b, .4)}" stroke-width="8"/>'
        for vx in range(40, 980, 80):
            s += f'<rect x="{vx}" y="295" width="12" height="12" fill="{d}" stroke="{b}" stroke-width="1.5"/>'

    elif world == 10:
        # The Cloudspring Baths: traditional multi-tiered cedar pagoda roofs, arched vermilion bridge, rising steam
        # Multi-tiered cedar pagoda roofline in open upper margin
        for rx, rw in [(120, 180), (460, 200), (800, 180)]:
            s += (f'<path d="M{rx} 20q{rw//2}-18 {rw} 0l-10 10H{rx+10}z" fill="{mix(a, .4)}" stroke="{c}" stroke-width="2"/>'
                  f'<path d="M{rx+12} 8q{(rw-24)//2}-14 {rw-24} 0l-8 8H{rx+20}z" fill="{mix(a, .5)}" stroke="{c}" stroke-width="1.5"/>')
        # Billowing, swirling clouds of warm white mineral steam in promenade
        for sx in (180, 500, 820):
            s += (f'<path d="M{sx} 320q-20-25 0-45t30-25 15 35" fill="none" stroke="{d}" stroke-width="5" opacity=".35" stroke-linecap="round"/>'
                  f'<path d="M{sx+18} 315q-15-20 0-35t20-20" fill="none" stroke="{d}" stroke-width="3.5" opacity=".25" stroke-linecap="round"/>')
        # Natural cedar timber footbridge across hot spring pools (cleanroom cedar craft)
        s += (f'<rect x="420" y="296" width="160" height="10" rx="2" fill="{mix(a, .6)}" stroke="{mix(d, .7)}" stroke-width="1.5"/>'
              f'<line x1="420" y1="292" x2="580" y2="292" stroke="{mix(c, .8)}" stroke-width="2"/>')
        for px in (450, 490, 530, 570):
            s += f'<rect x="{px-3}" y="282" width="6" height="24" fill="{mix(b, .6)}"/><circle cx="{px}" cy="280" r="3" fill="{d}"/>'

    elif world == 11:
        # Thimble Town: giant wooden desk drawer with dovetails, giant thread spools as pillars, steel needle ladder
        # Drawer dovetail corners and drop-pulls along top margin
        s += f'<rect x="0" y="0" width="1000" height="24" fill="{mix(a, .35)}" stroke="{mix(c, .4)}" stroke-width="1.5"/>'
        for dx in range(0, 1000, 60):
            s += f'<path d="M{dx} 0l10 16h16l10-16z" fill="{mix(a, .25)}" stroke="{mix(c, .3)}" stroke-width="1"/>'
        # Brass drawer drop-pull in center upper margin
        s += (f'<circle cx="500" cy="12" r="8" fill="{mix(c, .6)}" stroke="{d}" stroke-width="2"/>'
              f'<path d="M488 12q12 16 24 0" fill="none" stroke="{d}" stroke-width="2.5"/>')
        # Giant thread spools as pillars along bay seams
        for sx in (330, 670):
            s += (f'<rect x="{sx-10}" y="265" width="20" height="8" rx="2" fill="{mix(a, .5)}"/>'
                  f'<rect x="{sx-7}" y="273" width="14" height="54" fill="{c}"/>'
                  f'<rect x="{sx-10}" y="327" width="20" height="8" rx="2" fill="{mix(a, .5)}"/>')
            for ty in range(278, 325, 8):
                s += f'<line x1="{sx-7}" y1="{ty}" x2="{sx+7}" y2="{ty}" stroke="{d}" stroke-width="2"/>'

    elif world == 12:
        # Clockwork Stargazers: giant interlocking brass gear trains, astrolabe armillary rings, pendulum
        def gear(gx: int, gy: int, r: int, teeth: int = 10, col=c):
            g_str = f'<circle cx="{gx}" cy="{gy}" r="{r}" fill="{mix(col, .35)}" stroke="{col}" stroke-width="2"/>'
            for t_i in range(teeth):
                angle = (360 / teeth) * t_i
                g_str += f'<rect x="{gx-3}" y="{gy-r-4}" width="6" height="5" rx="1" fill="{col}" transform="rotate({angle} {gx} {gy})"/>'
            g_str += f'<circle cx="{gx}" cy="{gy}" r="{r//3}" fill="{mix(a, .4)}" stroke="{d}" stroke-width="1.5"/>'
            return g_str

        # Interlocking brass gears in promenade and open margins
        s += gear(170, 300, 32, 10)
        s += gear(226, 300, 24, 8, col=d)
        s += gear(500, 300, 36, 12)
        s += gear(774, 300, 24, 8, col=d)
        s += gear(830, 300, 32, 10)
        # Astrolabe armillary rings in center promenade
        s += (f'<circle cx="500" cy="300" r="50" fill="none" stroke="{d}" stroke-width="1.5" opacity=".4"/>'
              f'<ellipse cx="500" cy="300" rx="60" ry="20" fill="none" stroke="{c}" stroke-width="1.5" transform="rotate(-20 500 300)" opacity=".5"/>')

    elif world == 13:
        # Reef Town: bioluminescent branching staghorn coral arches, sea anemone crowns, bubble streams
        # Coral arches in promenade and bay seams
        for cx in (100, 330, 670, 900):
            s += (f'<path d="M{cx} 330q-8-45 12-75" fill="none" stroke="{mix(c, .8)}" stroke-width="8" stroke-linecap="round"/>'
                  f'<path d="M{cx+4} 295q18-20 28-40" fill="none" stroke="{b}" stroke-width="5" stroke-linecap="round"/>')
        # Rising translucent bubble streams in vertical aisles
        for bx in (330, 670):
            for by in range(20, 580, 40):
                s += f'<circle cx="{bx + (by % 7) * 3 - 9}" cy="{by}" r="{rng.randrange(3, 7)}" fill="none" stroke="{d}" stroke-width="1.5" opacity=".5"/>'
        # Sunken ship anchor half-buried in promenade
        s += (f'<circle cx="500" cy="285" r="10" fill="none" stroke="{mix(a, .7)}" stroke-width="3"/>'
              f'<line x1="500" y1="295" x2="500" y2="330" stroke="{mix(a, .7)}" stroke-width="5"/>'
              f'<path d="M478 322q22 18 44 0" fill="none" stroke="{mix(a, .7)}" stroke-width="5" stroke-linecap="round"/>')

    elif world == 14:
        # Cozy Critter Village: ancient oak tree root burrow arch, stone chimney with smoke, postboxes
        # Massive oak root arch framing the ceiling
        s += f'<path d="M0 35q250-35 500-15t500 15v18q-250-15-500-15t-500 35z" fill="{mix(a, .6)}"/>'
        # Stone chimney with woodsmoke puffs in center upper margin
        s += (f'<rect x="480" y="24" width="28" height="36" fill="{mix(b, .4)}" stroke="{mix(d, .5)}" stroke-width="1.5"/>'
              f'<path d="M494 24q-10-16 0-28t18-6" fill="none" stroke="{d}" stroke-width="2.5" opacity=".6"/>'
              f'<circle cx="508" cy="14" r="4.5" fill="{d}" opacity=".4"/>')
        # Rustic wooden mailboxes with red flags in promenade
        for mx in (180, 820):
            s += (f'<rect x="{mx}" y="280" width="5" height="30" fill="{mix(b, .5)}"/>'
                  f'<rect x="{mx-6}" y="266" width="18" height="14" rx="4" fill="{d}" stroke="{b}" stroke-width="1.5"/>'
                  f'<rect x="{mx+12}" y="270" width="6" height="3" fill="#ff4444"/>')

    return s
