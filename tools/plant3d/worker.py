"""Procedural radworker v2 (adult proportions): anti-contamination coverall with the hood drawn close round a visible face,
safety glasses, nitrile gloves, shoe covers, a dosimeter on the chest, taped cuffs and a per-agent accent band (material name, parameter).

Scale: 1 layout unit ~ 3.1 cm, a standing worker is 56 units (head incl. hood 8.0 = 1/7.0 of height). A tiny armature in code: each pose is a dict of
joint targets in the worker's local frame (x right, y forward, z up, origin on the floor under the hips); limbs come from two-bone IK,
the torso is stacked bevelled boxes (suit folds come from bevels and small joint bulges). build_worker() emits into a Mesher.
Materials expected in the book: suit, suit_dk, hood, suit_n, suit_n_dk, boot_n, hair, skin, eye, glasses, glove, shoe, tape, badge, accent (or the given accent), lamp.
"""
import math
from mathutils import Matrix, Vector

L_THIGH, L_SHIN, L_UPPER, L_FORE = 13.5, 14.0, 9.2, 8.2
SHO_W, HIP_W, TORSO = 6.7, 2.9, 16.4
ANKLE = 2.4
HEIGHT = 56.4


def ik2(p0, tgt, l1, l2, hint):
    p0, tgt, hint = Vector(p0), Vector(tgt), Vector(hint)
    d = (tgt - p0)
    dist = min(max(d.length, 1e-4), l1 + l2 - 1e-3)
    dirn = d.normalized()
    a = (l1 * l1 - l2 * l2 + dist * dist) / (2 * dist)
    h = math.sqrt(max(l1 * l1 - a * a, 0.0))
    perp = hint - dirn * hint.dot(dirn)
    perp = perp.normalized() if perp.length > 1e-6 else dirn.orthogonal()
    return p0 + dirn * a + perp * h, p0 + dirn * dist


def rot_x(deg):
    return Matrix.Rotation(math.radians(deg), 3, "X")


def rot_z(deg):
    return Matrix.Rotation(math.radians(deg), 3, "Z")


def frame(axis_up, fwd_hint=(0, 1, 0)):
    z = Vector(axis_up).normalized()
    y = Vector(fwd_hint); y = (y - z * y.dot(z)).normalized()
    x = y.cross(z)
    return Matrix(((x.x, y.x, z.x), (x.y, y.y, z.y), (x.z, y.z, z.z)))


# seat height 14.0 (chair seat top); desk top 25.5
POSES = {
    "working":   dict(hip=(0, -0.3, 16.9), torso=11, head=20, turn=22, foot=((-4.0, 12.6, 2.4), (4.0, 12.6, 2.4)),
                      hand=((-4.8, 17.6, 26.2), (4.8, 17.6, 26.2)), seated=True),
    "waiting":   dict(hip=(0, -0.8, 16.9), torso=-11, head=-3, turn=18, foot=((-4.0, 11.5, 2.4), (4.6, 13.6, 2.4)),
                      hand=((-6.5, 6.0, 17.5), (3.4, 6.0, 38.2)), seated=True),      # right hand to the chin
    "stuck":     dict(hip=(0, -0.3, 16.9), torso=46, head=58, turn=14, foot=((-4.0, 12.0, 2.4), (4.0, 12.0, 2.4)),
                      hand=((-5.0, 19.0, 26.2), (3.0, 16.5, 36.4)), seated=True),   # head in the hand, elbow on the desk
    "needs-you": dict(hip=(0, 0, 29.6), torso=0, head=0, turn=0, foot=((-4.6, 0.6, ANKLE), (4.6, -0.6, ANKLE)),
                      hand=((-8.4, 1.2, 20.4), (8.6, 3.0, 66.0)), seated=False, lamp=True),
    "walking":   dict(hip=(0, 0, 29.2), torso=4, head=1, turn=0, foot=((-3.6, 9.6, ANKLE), (3.6, -8.4, 5.0)),
                      hand=((-8.2, -5.0, 24.0), (8.2, 7.4, 25.0)), seated=False),
}


def torus(m, c, axis, ru, rv, r, mat, n=16):
    """Elliptical ring of tube radius r around axis (local), semi-axes ru, rv."""
    fr = frame(axis)
    pts = [c + fr @ Vector((math.cos(2 * math.pi * k / n) * ru, math.sin(2 * math.pi * k / n) * rv, 0)) for k in range(n + 1)]
    m.tube(pts, r, mat, 6, caps=False)


def _build_worker(m, pose, accent="accent", walk_lift=0.0, turn_deg=None, garb="antic"):
    """Emit one worker into Mesher m, current transform = worker placement (anchor: the floor point under the hips).
    garb: "antic" = white anti-contamination coverall, hood up, shoe covers, nitrile gloves, taped cuffs (RCA rooms and containment);
          "station" = navy station coverall, no hood (short cool-dark hair), dark work boots, bare hands, collar; both carry a dosimeter badge."""
    p = POSES[pose]
    A = garb == "antic"
    SUIT, SUIT_DK, SHOE, GLOVE, TAPE = ("suit", "suit_dk", "shoe", "glove", "tape") if A else ("suit_n", "suit_n_dk", "boot_n", "skin", "suit_n_dk")
    H = Vector(p["hip"])
    pitch = rot_x(-p["torso"])               # a forward lean rotates +y (forward) downwards about local x
    up = pitch @ Vector((0, 0, 1))
    fwd = pitch @ Vector((0, 1, 0))
    side = Vector((1, 0, 0))
    fr = frame(up, fwd)
    S = H + up * (TORSO - 1.8)               # shoulder line centre
    N = H + up * TORSO                       # neck base
    # --- torso: pelvis, abdomen, chest (bevelled boxes, tapered), shoulder caps, collar
    def tbox(c, size, mat, bev=0.9):
        m.push(Matrix.Translation(c) @ fr.to_4x4()); m.box((0, 0, 0), size, mat, bevel=bev); m.pop()
    tbox(H + up * 0.4, (11.2, 6.6, 5.6), SUIT, 1.2)
    tbox(H + up * 5.8, (10.6, 6.3, 6.4), SUIT, 1.2)
    tbox(H + up * 11.4, (12.6, 6.9, 7.2), SUIT, 1.4)
    for sgn in (-1, 1):                      # shoulder caps
        m.ellipsoid(S + side * (sgn * (SHO_W - 0.2)) + Vector((0, 0, 0.2)), (3.1, 3.1, 3.0), SUIT)
    if A:
        m.ellipsoid(N - up * 0.8, (6.2, 3.9, 1.9), "hood", fr, u=14, v=8)           # hood cowl over the shoulders
    else:
        m.ellipsoid(N - up * 0.4, (4.6, 3.3, 1.3), "suit_n_dk", fr, u=12, v=6)      # open collar
    # zip line, pocket, elastic waist cinch, folds
    tbox(H + up * 7.2 + fwd * 3.2, (0.5, 0.5, 14.0), SUIT_DK, 0.0)
    tbox(H + up * 12.4 + fwd * 3.55 + side * 3.7, (3.4, 0.5, 3.2), SUIT_DK, 0.2)
    tbox(H + up * 2.7 + fwd * 3.2, (10.4, 0.5, 0.9), SUIT_DK, 0.0)
    tbox(H + up * 8.4 - side * 0.0 + fwd * 0.0, (10.9, 6.9, 0.9), SUIT_DK, 0.3)     # waist seam ring
    if not A:
        tbox(H + up * 4.4 + fwd * 3.25, (10.8, 0.5, 0.9), "badge", 0.0)                # reflective belt stripe
    # dosimeter on the left chest, with clip and indicator dot; accent band on the right upper arm
    tbox(H + up * 12.6 + fwd * 3.8 - side * 3.9, (2.8, 0.8, 3.4), "badge", 0.3)
    tbox(H + up * 14.4 + fwd * 3.6 - side * 3.9, (1.0, 0.7, 1.2), "metal" if False else SUIT_DK, 0.0)
    # --- head: skin face inside a close hood with a drawn opening
    hturn = p.get("turn", 0) if turn_deg is None else turn_deg
    hf = rot_x(-p["head"]) @ rot_z(-hturn) if False else (rot_z(-hturn) @ rot_x(-p["head"]))
    hup = hf @ Vector((0, 0, 1)); hfw = hf @ Vector((0, 1, 0)); hrt = hf @ Vector((1, 0, 0))
    hc = N + up * 1.2 + hup * 3.3
    hfr = frame(hup, hfw)
    m.cone(N - up * 0.8, hc - hup * 2.0, 2.6, 2.4, "skin", 8)                                    # neck
    m.ellipsoid(hc + hfw * 0.1, (3.05, 3.5, 4.0), "skin", hfr, u=18, v=12)                    # head
    if A:
        m.ellipsoid(hc - hfw * 0.9 + hup * 0.6, (3.8, 4.0, 4.5), "hood", hfr, u=18, v=12)     # hood shell, set back so the face shows
    else:
        m.ellipsoid(hc - hfw * 0.7 + hup * 1.2, (3.25, 3.45, 3.3), "hair", hfr, u=16, v=10)    # short hair, no hood
    m.ellipsoid(hc + hfw * 3.4 - hup * 0.2, (0.8, 0.9, 1.0), "skin", hfr, u=8, v=6)           # nose
    torus(m, hc + hfw * 2.55 + hup * 0.2, hfw, 2.95, 3.55, 0.55, TAPE, 18) if False else None
    ring_c = hc + hfw * 1.7 + hup * 0.1
    fr_ring = frame(hfw, hup)
    pts = [ring_c + fr_ring @ Vector((math.cos(2 * math.pi * k / 20) * 3.2, math.sin(2 * math.pi * k / 20) * 3.9, 0)) for k in range(21)]
    if A:
        m.tube(pts, 0.55, "hood", 6, caps=False)                                              # drawn hood edge round the face
    for sgn in (-1, 1):
        m.ellipsoid(hc + hfw * 2.95 + hrt * (sgn * 1.15) + hup * 0.7, (0.42, 0.3, 0.42), "eye", hfr, u=6, v=4)
    m.box(hc + hfw * 3.0 + hup * 0.7, (3.4, 0.5, 1.2), "glasses", bevel=0.2) if False else None
    gl_fr = hfr.to_4x4()
    m.push(Matrix.Translation(hc + hfw * 2.9 + hup * 0.75) @ gl_fr); m.box((0, 0, 0), (6.0, 0.7, 1.3), "glasses", bevel=0.25); m.pop()   # safety glasses
    # --- legs
    for sgn, foot in ((-1, p["foot"][0]), (1, p["foot"][1])):
        hip = H + Vector((sgn * HIP_W, 0, -1.0))
        knee, ank = ik2(hip, foot, L_THIGH, L_SHIN, (sgn * 0.12, 1.0, 0))
        m.cone(hip, knee, 3.5, 2.8, SUIT, 10); m.ellipsoid(knee + Vector((0, 0.9, 0)), (3.0, 2.6, 3.0), SUIT)
        m.cone(knee, ank, 2.8, 2.2, SUIT, 10)
        m.cone(ank - (ank - knee).normalized() * 1.6, ank, 2.25, 2.3, TAPE, 8, True, False)
        m.ellipsoid(ank + Vector((0, 2.6, -0.4)), (2.9, 5.7, 2.5), SHOE, None, 12, 8)           # shoe cover
        m.ellipsoid(ank + Vector((0, 5.2, -0.9)), (2.4, 2.2, 1.8), SHOE, None, 10, 6)
    # --- arms
    for sgn, hand in ((-1, p["hand"][0]), (1, p["hand"][1])):
        sh = S + side * (sgn * SHO_W) + Vector((0, 0, -0.6))
        elb, hnd = ik2(sh, hand, L_UPPER, L_FORE, (sgn * 0.7, -0.6, -0.7))
        m.cone(sh, elb, 2.7, 2.2, SUIT, 10); m.ellipsoid(elb, (2.2, 2.2, 2.2), SUIT)
        m.cone(elb, hnd, 2.2, 1.75, SUIT, 10)
        wd = (hnd - elb).normalized()
        m.cone(hnd - wd * 1.5, hnd - wd * 0.2, 1.9, 1.9, TAPE, 8, True, False)
        m.ellipsoid(hnd + wd * 1.4, (1.7, 1.9, 2.3), GLOVE, frame(wd), 10, 8)
        m.ellipsoid(hnd + wd * 0.8 + Vector((sgn * 1.2, 0.8, 0)), (0.8, 1.1, 1.0), GLOVE)
        if sgn == 1:                                                  # accent band on the right upper arm (per-agent colour)
            mid = sh + (elb - sh) * 0.42
            m.cone(mid - (elb - sh).normalized() * 1.2, mid + (elb - sh).normalized() * 1.2, 2.95, 2.9, accent, 12, True, False)
        if sgn == 1 and p.get("lamp"):
            m.cone(hnd + Vector((0, 0, 1.0)), hnd + Vector((0, 0, 3.2)), 1.2, 1.2, SUIT_DK, 8)
            m.ellipsoid(hnd + Vector((0, 0, 5.4)), (2.4, 2.4, 2.8), "lamp")


from scene_consts import WORKER_SCALE   # v4 carried the scale in the model (1.5); v5 sets it in scene_consts (1.25)


def build_worker(m, pose, accent="accent", walk_lift=0.0, turn_deg=None, garb="antic"):
    """Worker at WORKER_SCALE about the floor point under the hips (the seat anchor does not move)."""
    m.push(Matrix.Scale(WORKER_SCALE, 4))
    _build_worker(m, pose, accent, walk_lift, turn_deg, garb)
    m.pop()
