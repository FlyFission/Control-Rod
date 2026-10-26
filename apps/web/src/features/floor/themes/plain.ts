import type { ThemePackV1 } from "./types.js";
export const STATIONS: ThemePackV1["stations"] = {
  general: { label: "General desk", x: 20, y: 20, w: 300, h: 240 },
  site: { label: "Site and civil", x: 340, y: 20, w: 320, h: 240 },
  archive: { label: "Archive", x: 680, y: 20, w: 300, h: 240 },
  verify: { label: "Verification", x: 20, y: 340, w: 340, h: 240 },
  office: { label: "Your office", x: 380, y: 340, w: 260, h: 240 },
  bench: { label: "Bench", x: 660, y: 340, w: 320, h: 240 },
};
export const PLAIN_THEME: ThemePackV1 = {
  schemaVersion: 1,
  id: "plain",
  version: "1.0.0",
  title: "Plain Floor",
  description: "A clear view of the work.",
  moodTags: [],
  availability: "released",
  tokens: {
    backdrop: "#101b29",
    surface: "#17283a",
    ink: "#ffffff",
    mutedInk: "#c3d2df",
    accent: "#91d8cb",
    focus: "#ffffff",
  },
  assets: { scene: null, thumbnail: null, characters: [], props: {} },
  stations: STATIONS,
  motionProfile: "shared-v1",
  signature: "none",
  credits: [],
};
