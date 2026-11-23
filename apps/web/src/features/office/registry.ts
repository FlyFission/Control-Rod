import type { OfficeThemeV1 } from "./contract.js";
import bright from "./themes/harness-bright.js";
import plant from "./themes/plant.js";
import standard from "./themes/standard-office.js";
import { WORLD_THEMES } from "./themes/worlds/index.js";

/**
 * Every office theme the repository carries. The Plant is the view's one theme and its default
 * (docs/superpowers/specs/2026-11-23-plant-view-design.md). The standard office and the fifteen worlds,
 * approved by the project owner on 2026-11-18, are archived: still released, still shipped, offered
 * only under Advanced. The development theme (the structural test theme) reaches only draft builds
 * and draft pages such as the quality harness.
 */
export const PLANT_THEME = plant;
export const OFFICE_THEMES: readonly OfficeThemeV1[] = [plant, standard, bright, ...WORLD_THEMES];
export const DEFAULT_OFFICE_THEME = plant;
export const releasedOfficeThemes = () => OFFICE_THEMES.filter((t) => t.availability === "released");

/**
 * The archived office themes a person may still choose under Advanced: the released ones other than
 * the Plant, and in a draft build any world not yet released. The structural test theme is for the
 * harness, never a choice.
 */
export const archivedThemeChoices = (drafts: boolean): readonly OfficeThemeV1[] => [
  ...releasedOfficeThemes().filter((t) => t.id !== plant.id),
  ...(drafts ? WORLD_THEMES.filter((t) => t.availability !== "released") : []),
];

/** Whether this is a draft build: the dev server, or a build made with drafts on. */
export const draftBuild = (): boolean => import.meta.env.DEV || import.meta.env.VITE_FLOOR_THEME_DRAFTS === "true";
