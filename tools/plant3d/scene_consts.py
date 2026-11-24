"""Constants shared with post3 without importing bpy (mirrors scene.py)."""
import json
from pathlib import Path
LAY = json.loads((Path(__file__).resolve().parents[2] / "design/art/layout.json").read_text())
CORE = LAY["core"]
R, H_WALL, DRUM_R, DRUM_H, WT = CORE["radius"], CORE["wall_height"], CORE["vessel_radius"], CORE["vessel_height"], 14.0
