"""Constants shared with post3 without importing bpy (mirrors scene.py)."""
import json
from pathlib import Path
LAY = json.loads((Path(__file__).resolve().parents[2] / "design/art/layout.json").read_text())
CORE = LAY["core"]
R, H_WALL, DRUM_R, DRUM_H, WT = CORE["radius"], CORE["wall_height"], CORE["vessel_radius"], CORE["vessel_height"], 14.0
# Worker scale (worker.py, rooms.py chairs) and the sprite render scale that keeps the v3 sprite pixel size (6 px per plate px at
# scale 1): figures render WORKER_SCALE x larger on the plate, sprites at SPRITE_PX_PER_PLATE_PX = 6 / WORKER_SCALE.
WORKER_SCALE = 1.25     # v5: 1.5 made seated workers swamp their desks (hands above desktops); 1.25 per the owner's review
SPRITE_PX_PER_PLATE_PX = 6.0 / WORKER_SCALE
