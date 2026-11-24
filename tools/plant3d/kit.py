"""Mesh and material kit: procedural geometry (bmesh) and flat-tone emission materials. No downloaded assets.

All geometry is built in Blender world space B = (gx, -gy, z). Furniture and workers are authored in a local frame
(x right, y forward, z up) and placed with Mesher.push(matrix). Materials are emission shaders that compute their own
tonal shading from the face normal (flat, deterministic, no lights), optional ambient occlusion, procedural hatch / grid /
panel-seam patterns, and an emissive part that the glow pass renders alone (glowmode = 1 zeroes the shaded part).
"""
import math
import bpy, bmesh
from mathutils import Matrix, Vector, Euler
import common as K

# ---------------------------------------------------------------------------------------------- colour
def srgb(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4))

def mix(a, b, t):
    return tuple(a[i] + (b[i] - a[i]) * t for i in range(3))

def lin(c, k=1.0):
    f = lambda v: ((v + 0.055) / 1.055) ** 2.4 if v > 0.04045 else v / 12.92
    return (f(c[0]) * k, f(c[1]) * k, f(c[2]) * k, 1.0)

P = {k: srgb(v) for k, v in K.PALETTE.items()}
WHITE, PALE = (1, 1, 1), srgb("#bfeaff")

# ---------------------------------------------------------------------------------------------- materials
LIGHT = Vector((0.35, -0.55, 0.76)).normalized()   # fixed key direction in B space: top 1.0, left faces ~0.8, right faces ~0.62


class Book:
    """Material book. tone() builds one material; .m maps name -> material; set_glow(v) flips every shaded part off/on."""
    def __init__(self, prefix=""):
        self.m, self.gm, self.prefix = {}, [], prefix

    def set_glow(self, v):
        for n in self.gm:
            n.outputs[0].default_value = float(v)

    def tone(self, name, base, amb=0.30, ao=0.5, pat=None, pat_col=None, emit=None, emit_k=0.0, emit_pat=None,
             radial=None, alpha=None, voronoi=None):
        mat = bpy.data.materials.new(self.prefix + name)
        mat.use_nodes = True
        nt = mat.node_tree
        for n in list(nt.nodes):
            nt.nodes.remove(n)
        N, L = nt.nodes.new, nt.links.new

        def math_(op, a=None, b=None, c=None, clamp=False):
            n = N("ShaderNodeMath"); n.operation = op; n.use_clamp = clamp
            for i, v in enumerate((a, b, c)):
                if v is None:
                    continue
                if isinstance(v, (int, float)):
                    n.inputs[i].default_value = v
                else:
                    L(v, n.inputs[i])
            return n.outputs[0]

        def vec_(op, a=None, b=None, s=None):
            n = N("ShaderNodeVectorMath"); n.operation = op
            if a is not None:
                if isinstance(a, (tuple, list, Vector)): n.inputs[0].default_value = tuple(a)[:3]
                else: L(a, n.inputs[0])
            if b is not None:
                if isinstance(b, (tuple, list, Vector)): n.inputs[1].default_value = tuple(b)[:3]
                else: L(b, n.inputs[1])
            if s is not None:
                if isinstance(s, (int, float)): n.inputs["Scale"].default_value = s
                else: L(s, n.inputs["Scale"])
            return n

        def mixc(fac, a, b):
            n = N("ShaderNodeMix"); n.data_type = "RGBA"; n.blend_type = "MIX"
            if isinstance(fac, (int, float)): n.inputs[0].default_value = fac
            else: L(fac, n.inputs[0])
            for idx, v in ((6, a), (7, b)):
                if isinstance(v, tuple): n.inputs[idx].default_value = v
                else: L(v, n.inputs[idx])
            return n.outputs[2]

        geo = N("ShaderNodeNewGeometry")
        pos = geo.outputs["Position"]
        sep = N("ShaderNodeSeparateXYZ"); L(pos, sep.inputs[0])
        X, Y, Z = sep.outputs

        def line(coord, sp, w):  # 1 where fract(coord/sp) < w/sp
            return math_("LESS_THAN", math_("FRACT", math_("MULTIPLY", coord, 1.0 / sp)), w / sp)

        # ---- base colour with optional pattern
        col = lin(base)
        mask = None
        if pat:
            kind = pat[0]
            if kind == "hatch":
                _, period, w = pat
                d = vec_("DOT_PRODUCT", pos, (1.0 / period,) * 3)
                mask = math_("LESS_THAN", math_("FRACT", d.outputs["Value"]), w / period)
            elif kind == "grid":
                _, sp, w = pat
                mask = math_("MAXIMUM", line(X, sp, w), line(Y, sp, w))
            elif kind == "seam":      # panel seams on a vertical face: horizontal = x + y, vertical = z
                _, sp1, sp2, w = pat
                h = math_("ADD", X, Y)
                mask = math_("MAXIMUM", line(h, sp1, w), line(Z, sp2, w))
            elif kind == "tick":      # sparse tick crosses at grid nodes
                _, sp, w = pat
                mx, my = math_("MULTIPLY", math_("FRACT", math_("MULTIPLY", X, 1 / sp)), sp), math_("MULTIPLY", math_("FRACT", math_("MULTIPLY", Y, 1 / sp)), sp)
                cx = math_("LESS_THAN", math_("ABSOLUTE", math_("SUBTRACT", mx, w)), w)
                near_x = math_("LESS_THAN", math_("MINIMUM", mx, math_("SUBTRACT", sp, mx)), w * 1.0)
                near_y = math_("LESS_THAN", math_("MINIMUM", my, math_("SUBTRACT", sp, my)), w * 1.0)
                arm = math_("LESS_THAN", math_("MINIMUM", mx, math_("SUBTRACT", sp, mx)), 5.0)
                arm_y = math_("LESS_THAN", math_("MINIMUM", my, math_("SUBTRACT", sp, my)), 5.0)
                mask = math_("MAXIMUM", math_("MULTIPLY", near_x, arm_y), math_("MULTIPLY", near_y, arm))
            colB = lin(pat_col or mix(base, WHITE, 0.4))
            col = mixc(mask, col, colB)

        # ---- shading scalar
        s = None
        if amb is not None:
            d = vec_("DOT_PRODUCT", geo.outputs["Normal"], tuple(LIGHT))
            lam = math_("MAXIMUM", d.outputs["Value"], 0.0)
            shade = math_("MULTIPLY_ADD", lam, 0.70 / LIGHT.z, amb)
            s = shade
        if ao > 0:
            aon = N("ShaderNodeAmbientOcclusion"); aon.samples = 4; aon.inputs["Distance"].default_value = 16.0
            aof = math_("MULTIPLY_ADD", aon.outputs["AO"], ao, 1.0 - ao)
            s = aof if s is None else math_("MULTIPLY", s, aof)
        gmn = N("ShaderNodeValue"); gmn.outputs[0].default_value = 0.0; self.gm.append(gmn)
        inv = math_("SUBTRACT", 1.0, gmn.outputs[0])
        s = inv if s is None else math_("MULTIPLY", s, inv)
        shaded = vec_("SCALE", col, s=s)
        outc = shaded.outputs[0]

        # ---- emissive part
        if emit is not None and emit_k > 0:
            e = lin(emit)
            ecol = N("ShaderNodeRGB"); ecol.outputs[0].default_value = (e[0] * emit_k, e[1] * emit_k, e[2] * emit_k, 1)
            efac = None
            if emit_pat == "bars":
                h = math_("ADD", X, Y)
                comb = N("ShaderNodeCombineXYZ"); L(h, comb.inputs[0]); L(Z, comb.inputs[1])
                br = N("ShaderNodeTexBrick"); L(comb.outputs[0], br.inputs["Vector"])
                br.inputs["Scale"].default_value = 0.11; br.inputs["Mortar Size"].default_value = 0.06
                br.inputs["Brick Width"].default_value = 1.7; br.inputs["Row Height"].default_value = 0.22
                br.inputs["Color1"].default_value = (1, 1, 1, 1); br.inputs["Color2"].default_value = (0.45, 0.45, 0.45, 1)
                br.inputs["Mortar Smooth"].default_value = 0.0
                bw = vec_("DOT_PRODUCT", br.outputs["Color"], (0.3333, 0.3333, 0.3333))
                efac = math_("MULTIPLY_ADD", bw.outputs["Value"], 0.55, 0.45)
            elif emit_pat == "voronoi":
                vn = N("ShaderNodeTexVoronoi"); vn.feature = "DISTANCE_TO_EDGE"
                L(pos, vn.inputs["Vector"]); vn.inputs["Scale"].default_value = 0.06
                efac = math_("SUBTRACT", 1.0, math_("MULTIPLY", math_("MINIMUM", vn.outputs["Distance"], 0.12), 5.0))
                efac = math_("MULTIPLY_ADD", efac, 0.85, 0.35)
            ev = vec_("SCALE", ecol.outputs[0], s=efac if efac is not None else 1.0)
            if radial:   # (cx, cy, falloff): gaussian-ish glow centred on the core, added as emission
                rc, rk, rl = radial
                cmb = N("ShaderNodeCombineXYZ"); L(X, cmb.inputs[0]); L(Y, cmb.inputs[1])
                ln = vec_("LENGTH", cmb.outputs[0])
                g = math_("EXPONENT", math_("MULTIPLY", ln.outputs["Value"], -1.0 / rl))
                ev = vec_("SCALE", ev.outputs[0], s=math_("MULTIPLY", g, rk))
            outc = vec_("ADD", outc, ev.outputs[0]).outputs[0]
        elif radial and emit is not None:
            pass
        em = N("ShaderNodeEmission"); L(outc, em.inputs[0])
        out = N("ShaderNodeOutputMaterial")
        if alpha is not None:
            tr = N("ShaderNodeBsdfTransparent"); mx = N("ShaderNodeMixShader"); mx.inputs[0].default_value = alpha
            L(tr.outputs[0], mx.inputs[1]); L(em.outputs[0], mx.inputs[2]); L(mx.outputs[0], out.inputs[0])
        else:
            L(em.outputs[0], out.inputs[0])
        self.m[name] = mat
        return mat

# ---------------------------------------------------------------------------------------------- meshing
KEYS = {"+gx": "right", "-gx": "left", "+gy": "back", "-gy": "front"}


def _key(c):
    ax = max(range(3), key=lambda i: abs(c[i]))
    return [("right", "left"), ("front", "back"), ("top", "bottom")][ax][0 if c[ax] > 0 else 1]


def _pick_old(mats, k):
    if isinstance(mats, str):
        return mats
    return mats.get(k) or mats.get("side") if k in ("right", "left", "front", "back") and "side" in mats and k not in mats else (mats.get(k) or mats.get("*"))


class Mesher:
    def __init__(self, name, book):
        self.name, self.book, self.bm = name, book, bmesh.new()
        self.slots, self.idx, self.xf, self.st = [], {}, Matrix.Identity(4), []

    def slot(self, mn):
        if mn not in self.idx:
            self.idx[mn] = len(self.slots); self.slots.append(self.book.m[mn])
        return self.idx[mn]

    def push(self, M):
        self.st.append(self.xf); self.xf = self.xf @ M

    def pop(self):
        self.xf = self.st.pop()

    def _set(self, faces, fn):
        for f in faces:
            f.material_index = self.slot(fn(f))

    # ---- primitives (local frame)
    def box(self, c, size, mats, bevel=0.0, rot=(0, 0, 0)):
        bm, n0 = self.bm, len(self.bm.faces)
        r = bmesh.ops.create_cube(bm, size=1.0)
        faces = bm.faces[n0:]
        self._set(faces, lambda f: _pick(mats, _key(f.calc_center_median())))
        R = Euler(rot, "XYZ").to_matrix().to_4x4()
        M = self.xf @ Matrix.Translation(c) @ R @ Matrix.Diagonal(Vector((size[0], size[1], size[2], 1.0)))
        bmesh.ops.transform(bm, matrix=M, verts=r["verts"])
        if bevel and bevel < min(size) / 2.4:
            bmesh.ops.bevel(bm, geom=list({e for f in faces if f.is_valid for e in f.edges}), offset=bevel, segments=1, affect="EDGES")

    def lbox(self, x0, y0, x1, y1, z0, z1, mats, bevel=0.0):
        if isinstance(mats, dict):
            mats = {KEYS.get(k, k): v for k, v in mats.items()}
        self.box(((x0 + x1) / 2, -(y0 + y1) / 2, (z0 + z1) / 2), (x1 - x0, y1 - y0, z1 - z0), mats, bevel)

    def cone(self, p0, p1, r0, r1, mats, seg=12, caps=True, smooth=True):
        bm, n0 = self.bm, len(self.bm.faces)
        a, b = Vector(p0), Vector(p1)
        d = b - a
        if d.length < 1e-6:
            return
        r = bmesh.ops.create_cone(bm, cap_ends=caps, cap_tris=False, segments=seg, radius1=r0, radius2=r1, depth=d.length)
        faces = bm.faces[n0:]
        for f in faces:
            cap = abs(f.normal.z) > 0.99 and len(f.verts) == seg
            f.material_index = self.slot(mats if isinstance(mats, str) else (mats["cap"] if cap and "cap" in mats else mats["side"]))
            f.smooth = smooth and not cap
        M = self.xf @ Matrix.Translation((a + b) / 2) @ Vector((0, 0, 1)).rotation_difference(d.normalized()).to_matrix().to_4x4()
        bmesh.ops.transform(bm, matrix=M, verts=r["verts"])

    def cyl(self, c, r, h, mats, seg=16, z0=None, smooth=True):
        z = c[2] if z0 is None else z0
        self.cone((c[0], c[1], z), (c[0], c[1], z + h), r, r, mats, seg, True, smooth)

    def ellipsoid(self, c, radii, mat, frame=None, u=14, v=10):
        bm, n0 = self.bm, len(self.bm.faces)
        r = bmesh.ops.create_uvsphere(bm, u_segments=u, v_segments=v, radius=1.0)
        F = (frame or Matrix.Identity(3)).to_4x4()
        M = self.xf @ Matrix.Translation(c) @ F @ Matrix.Diagonal(Vector((radii[0], radii[1], radii[2], 1.0)))
        bmesh.ops.transform(bm, matrix=M, verts=r["verts"])
        for f in bm.faces[n0:]:
            f.material_index = self.slot(mat); f.smooth = True

    def prism(self, prof, x0, x1, mats):
        """Extrude a closed profile of (y, z) points along local x from x0 to x1 (convex profiles only)."""
        bm = self.bm
        a = [bm.verts.new(self.xf @ Vector((x0, y, z))) for y, z in prof]
        b = [bm.verts.new(self.xf @ Vector((x1, y, z))) for y, z in prof]
        faces = [bm.faces.new(a), bm.faces.new(b)] + [bm.faces.new((a[i], a[(i + 1) % len(a)], b[(i + 1) % len(a)], b[i])) for i in range(len(a))]
        bmesh.ops.recalc_face_normals(bm, faces=faces)
        for f in faces:
            n = (self.xf.to_3x3().inverted() @ f.normal)
            k = "top" if n.z > 0.3 else _key(n)
            f.material_index = self.slot(_pick(mats, k))

    def sector(self, r0, r1, a0, a1, z0, z1, n, mats, closed=False, smooth=True):
        """Annular sector in layout angles (gx = r cos a, gy = r sin a), a closed solid. mats: outer, inner, top, bottom, end."""
        bm = self.bm
        ang = [a0 + (a1 - a0) * k / n for k in range(n + (0 if closed else 1))]
        def pt(r, a, z): return self.xf @ Vector((r * math.cos(math.radians(a)), -r * math.sin(math.radians(a)), z))
        OT = [bm.verts.new(pt(r1, a, z1)) for a in ang]; OB = [bm.verts.new(pt(r1, a, z0)) for a in ang]
        IT = [bm.verts.new(pt(r0, a, z1)) for a in ang]; IB = [bm.verts.new(pt(r0, a, z0)) for a in ang]
        m = len(ang); rng = range(m if closed else m - 1)
        groups = {"outer": [], "inner": [], "top": [], "bottom": [], "end": []}
        for i in rng:
            j = (i + 1) % m
            groups["outer"].append(bm.faces.new((OB[i], OB[j], OT[j], OT[i])))
            groups["top"].append(bm.faces.new((OT[i], OT[j], IT[j], IT[i])))
            groups["bottom"].append(bm.faces.new((IB[i], IB[j], OB[j], OB[i])))
            if r0 > 0.01:
                groups["inner"].append(bm.faces.new((IB[i], IT[i], IT[j], IB[j])))
        if not closed:
            groups["end"].append(bm.faces.new((OB[0], OT[0], IT[0], IB[0])))
            groups["end"].append(bm.faces.new((OB[-1], IB[-1], IT[-1], OT[-1])))
        allf = [f for g in groups.values() for f in g]
        bmesh.ops.recalc_face_normals(bm, faces=allf)
        for g, fl in groups.items():
            for f in fl:
                f.material_index = self.slot(mats.get(g) or mats["*"]); f.smooth = smooth and g in ("outer", "inner")

    def tube(self, pts, r, mat, seg=8, caps=True):
        """Round tube along a polyline of local points, parallel-transport frames."""
        bm, P_ = self.bm, [Vector(p) for p in pts]
        if len(P_) < 2:
            return
        tans = []
        for i, p in enumerate(P_):
            t = (P_[min(i + 1, len(P_) - 1)] - P_[max(i - 1, 0)])
            tans.append(t.normalized() if t.length > 1e-9 else Vector((1, 0, 0)))
        up = Vector((0, 0, 1)) if abs(tans[0].z) < 0.9 else Vector((1, 0, 0))
        rings, nrm = [], up
        for p, t in zip(P_, tans):
            nrm = (nrm - t * nrm.dot(t)); nrm = nrm.normalized() if nrm.length > 1e-6 else t.orthogonal()
            bn = t.cross(nrm)
            rings.append([bm.verts.new(self.xf @ (p + (nrm * math.cos(2 * math.pi * k / seg) + bn * math.sin(2 * math.pi * k / seg)) * r)) for k in range(seg)])
        faces = []
        for a, b in zip(rings[:-1], rings[1:]):
            for k in range(seg):
                faces.append(bm.faces.new((a[k], a[(k + 1) % seg], b[(k + 1) % seg], b[k])))
        if caps:
            faces.append(bm.faces.new(rings[0][::-1])); faces.append(bm.faces.new(rings[-1]))
        bmesh.ops.recalc_face_normals(bm, faces=faces)
        for f in faces:
            f.material_index = self.slot(mat); f.smooth = len(f.verts) == 4

    def finish(self, name, collections):
        me = bpy.data.meshes.new(name)
        self.bm.to_mesh(me); self.bm.free()
        for m in self.slots:
            me.materials.append(m)
        ob = bpy.data.objects.new(name, me)
        for c in collections:
            c.objects.link(ob)
        return ob


def _pick(mats, k):
    if isinstance(mats, str):
        return mats
    return mats.get(k) or mats.get("*") or mats.get("side") or next(iter(mats.values()))
