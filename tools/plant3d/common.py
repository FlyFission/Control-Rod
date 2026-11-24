"""Shared constants for the Blender plant spike: layout loading, the exact blockout projection, camera rig, colour helpers.

Blender world space is B = (gx, -gy, z). The y flip keeps Blender right-handed while reproducing the blockout's screen
mapping sx = ox + (gx - gy) cos30, sy = oy + (gx + gy) sin30 - gz (a true isometric: all three axes foreshorten equally).
"""
import json, math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
ART = ROOT / "design" / "art"
LAYOUT = json.loads((ART / "layout.json").read_text())
PALETTE = json.loads((ART / "palette.json").read_text())["roles"]
CANVAS = (2400, 1500)
ORIGIN = tuple(LAYOUT["projection"]["origin_screen"])
ANGLE = LAYOUT["projection"]["angle_deg"]
C, S = math.cos(math.radians(ANGLE)), math.sin(math.radians(ANGLE))
PX_PER_UNIT = 1.0                      # one layout unit = one screen px along an iso axis
ORTHO_SCALE_FULL = CANVAS[0] / (PX_PER_UNIT * math.sqrt(3.0 / 2.0))  # true-iso axis length is sqrt(2/3) of the camera scale
CAM_ROT = (math.radians(54.735610317), 0.0, math.radians(45.0))
HALF_PX = 0.0  # sub-pixel registration offset applied to the camera (see manifest)


def proj(gx, gy, gz=0.0):
    return (ORIGIN[0] + (gx - gy) * C, ORIGIN[1] + (gx + gy) * S - gz)


def hex_lin(h, k=1.0):
    h = h.lstrip("#")
    c = [int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4)]
    lin = [((v + 0.055) / 1.055) ** 2.4 if v > 0.04045 else v / 12.92 for v in c]
    return (lin[0] * k, lin[1] * k, lin[2] * k, 1.0)


def rooms():
    return {r["id"]: r for r in LAYOUT["rooms"]}


def make_camera(bpy, scale=1.0, centre_px=None, res=None, name="Cam"):
    """Orthographic camera. scale = render px per layout unit relative to the 2400x1500 canvas (1 = canvas). centre_px: the
    canvas pixel (sx, sy) that lands in the middle of the output image (default: canvas centre). Returns the camera object."""
    res = res or (round(CANVAS[0] * scale), round(CANVAS[1] * scale))
    cam_d = bpy.data.cameras.new(name)
    cam_d.type = "ORTHO"
    cam_d.clip_start, cam_d.clip_end = 10.0, 20000.0
    ob = bpy.data.objects.new(name, cam_d)
    bpy.context.scene.collection.objects.link(ob)
    ob.rotation_euler = CAM_ROT
    cx, cy = centre_px or (CANVAS[0] / 2, CANVAS[1] / 2)
    # ground point whose projection is (cx, cy): solve for gx, gy at z=0
    a, b = (cx - ORIGIN[0]) / C, (cy - ORIGIN[1]) / S
    gx, gy = (a + b) / 2, (b - a) / 2
    tgt = (gx, -gy, 0.0)
    d = (1.0, -1.0, 1.0)
    n = math.sqrt(3.0)
    ob.location = tuple(tgt[i] + d[i] / n * 6000.0 for i in range(3))
    # res[0] px span ortho_scale layout units / scale ... width in canvas px = res[0] / scale
    cam_d.ortho_scale = (res[0] / scale) / (PX_PER_UNIT * math.sqrt(1.5))
    bpy.context.scene.camera = ob
    bpy.context.scene.render.resolution_x, bpy.context.scene.render.resolution_y = res
    bpy.context.scene.render.resolution_percentage = 100
    return ob
