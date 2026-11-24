"""Procedural radworker: white anti-contamination coverall, hood with visor, gloves, shoe covers, dosimeter badge, accent band.

A tiny armature in code: each pose is a dict of joint targets in the worker's local frame (x right, y forward, z up, origin on the floor
under the hips); limbs come from two-bone IK, torso and head from pitch angles. build_worker() emits capsules/ellipsoids into a Mesher.
Dimensions are layout units (a standing worker is ~55 units, wall height 80-90, desk 24).
"""
import math
from mathutils import Matrix, Vector

L_THIGH, L_SHIN, L_UPPER, L_FORE = 13.0, 13.0, 9.5, 9.0
SHO_W, HIP_W = 6.6, 3.4


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


def frame_z(axis):
    z = Vector(axis).normalized()
    x = Vector((1, 0, 0)); x = (x - z * x.dot(z)).normalized()
    y = z.cross(x)
    return Matrix(((x.x, y.x, z.x), (x.y, y.y, z.y), (x.z, y.z, z.z)))


# pose = torso pitch (deg, + forward), head pitch, hip height, per-limb targets
POSES = {
    "working":  dict(hip=(0, 0, 16.5), torso=14, head=12, foot=((-4, 14.5, 3.4), (4, 14.5, 3.4)),
                     hand=((-5.5, 19.5, 26.9), (5.5, 19.5, 26.9)), seated=True),
    "waiting":  dict(hip=(0, 0, 16.5), torso=-14, head=-4, foot=((-4, 14.0, 3.4), (4.5, 15.5, 3.4)),
                     hand=((-5.0, 9.0, 19.5), (3.4, 5.0, 38.0)), seated=True),     # right hand to chin
    "stuck":    dict(hip=(0, 0, 16.5), torso=58, head=68, foot=((-4, 14.0, 3.4), (4, 14.0, 3.4)),
                     hand=((-6.0, 20.0, 27.2), (6.0, 20.0, 27.2)), seated=True, head_at=(0, 17.5, 31.5)),
    "needs-you": dict(hip=(0, 0, 27.0), torso=0, head=-4, foot=((-4.5, 1.0, 1.8), (4.5, -1.0, 1.8)),
                     hand=((-8.6, 1.0, 17.0), (8.2, 2.0, 60.5)), seated=False, lamp=True),
    "walking":  dict(hip=(0, 0, 26.4), torso=5, head=2, foot=((-3.8, 9.0, 1.8), (3.8, -8.0, 4.4)),
                     hand=((-8.0, -4.0, 20.0), (8.0, 7.0, 21.5)), seated=False),
}


def build_worker(m, pose, accent="accent", walk_lift=0.0):
    """Emit one worker into Mesher m, current transform = worker placement. Materials expected in the book:
    suit, suit_dk, hood, visor, glove, shoe, badge, accent, lamp."""
    p = POSES[pose]
    H = Vector(p["hip"])
    pitch = rot_x(-p["torso"])               # forward lean rotates +y (forward) down: about local x
    up = pitch @ Vector((0, 0, 1))
    N = H + up * 16.5                         # base of neck
    S = H + up * 14.2                         # shoulder line centre
    side = Vector((1, 0, 0))
    # pelvis and torso
    fr = frame_z(up)
    m.ellipsoid(H + up * 1.2, (5.6, 4.4, 5.2), "suit", fr)
    m.ellipsoid(H + up * 9.0, (6.4, 4.5, 8.4), "suit", fr)
    m.ellipsoid(H + up * 14.0, (7.2, 4.4, 3.6), "suit", fr)                     # shoulders
    # dosimeter badge on the left chest and an accent tab on the right shoulder strap
    fwd = pitch @ Vector((0, 1, 0))
    m.box(H + up * 12.0 + fwd * 4.3 + side * -3.2, (2.8, 0.6, 3.4), {"*": "badge"}, rot=(math.radians(-p["torso"]), 0, 0))
    m.ellipsoid(S + side * 7.0 + Vector((0, 0, 0.8)), (2.9, 2.9, 2.5), "accent")
    # head
    hc = Vector(p.get("head_at", (0, 0, 0))) if "head_at" in p else N + (rot_x(-p["head"]) @ Vector((0, 0.6, 6.4)))
    hf = rot_x(-p["head"])
    m.ellipsoid(hc, (5.4, 5.7, 6.2), "hood", frame_z(hf @ Vector((0, 0, 1))), u=16, v=12)
    m.ellipsoid(hc + hf @ Vector((0, 4.2, 0.4)), (3.7, 2.3, 3.7), "visor", frame_z(hf @ Vector((0, 0, 1))), u=12, v=8)
    m.cone(N + Vector((0, 0.2, -1.0)), N + Vector((0, 0.5, 2.5)), 3.4, 2.8, "hood", 10)
    # legs
    for sgn, foot in ((-1, p["foot"][0]), (1, p["foot"][1])):
        hip = H + Vector((sgn * HIP_W, 0, -0.5))
        knee, ank = ik2(hip, foot, L_THIGH, L_SHIN, (0, 1, 0))
        m.cone(hip, knee, 3.5, 2.9, "suit", 10); m.ellipsoid(knee, (3.0, 3.0, 3.0), "suit")
        m.cone(knee, ank, 2.9, 2.3, "suit", 10)
        m.ellipsoid(ank + Vector((0, 2.4, -1.2)), (2.9, 5.4, 2.4), "shoe")
    # arms
    for sgn, hand in ((-1, p["hand"][0]), (1, p["hand"][1])):
        sh = S + side * (sgn * SHO_W) + Vector((0, 0, -0.4))
        elb, hnd = ik2(sh, hand, L_UPPER, L_FORE, (sgn * 0.6, -0.5, -0.8))
        m.cone(sh, elb, 2.6, 2.1, "suit", 10); m.ellipsoid(elb, (2.2, 2.2, 2.2), "suit")
        m.cone(elb, hnd, 2.1, 1.8, "suit", 10)
        m.ellipsoid(hnd, (2.2, 2.6, 2.0), "glove")
        if sgn == 1 and p.get("lamp"):
            m.cone(hnd + Vector((0, 0, 1.0)), hnd + Vector((0, 0, 3.2)), 1.2, 1.2, "suit_dk", 8)
            m.ellipsoid(hnd + Vector((0, 0, 5.4)), (2.4, 2.4, 2.8), "lamp")
