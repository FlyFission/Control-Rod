import { LegacyFloor } from "../features/floor/LegacyFloor.js";
import { ThemedFloor } from "../features/floor/ThemedFloor.js";
import { isThemeFeatureEnabled } from "../features/floor/themes/registry.js";
export function Floor(){return isThemeFeatureEnabled(import.meta.env.VITE_FLOOR_THEMES_ENABLED)?<ThemedFloor/>:<LegacyFloor/>;}
