import type { OfficeThemeV1 } from "./contract.js";
import type { RegionId } from "./layout.js";
import bright from "./themes/harness-bright.js";
import standard from "./themes/standard-office.js";
import { WORLD_THEMES } from "./themes/worlds/index.js";

/**
 * What each room of the Plant is called on the site plan. The Plant is first-party art (plant-scene),
 * not an office theme (docs/superpowers/specs/2026-11-24-control-room-redesign.md, section 5), so its
 * room names live here and not in a theme file.
 */
export const PLANT_LABELS: Readonly<Record<RegionId, { label: string }>> = {
  process: { label: "Work bay" },
  mechanical: { label: "Work bay" },
  electrical: { label: "Work bay" },
  civil: { label: "Work bay" },
  assurance: { label: "Work bay" },
  "project-controls": { label: "Work bay" },
  review: { label: "Review board" },
  interface: { label: "Work control" },
  verification: { label: "Independent verification" },
  "your-office": { label: "Main control room" },
  "document-control": { label: "Records vault" },
  bench: { label: "Staging yard" },
  quarantine: { label: "Hold yard" },
};

/**
 * Every office theme the repository carries: the archived office, the structural test theme and the
 * fifteen worlds, approved by the project owner on 2026-11-18. They are released, shipped and offered
 * only under Advanced. The development theme (the structural test theme) reaches only draft builds
 * and draft pages such as the quality harness.
 */
export const OFFICE_THEMES: readonly OfficeThemeV1[] = [standard, bright, ...WORLD_THEMES];
export const releasedOfficeThemes = () => OFFICE_THEMES.filter((t) => t.availability === "released");

/** The archived office themes a person may still choose under Advanced; in a draft build also any world not yet released. */
export const archivedThemeChoices = (drafts: boolean): readonly OfficeThemeV1[] => [
  ...releasedOfficeThemes(),
  ...(drafts ? WORLD_THEMES.filter((t) => t.availability !== "released") : []),
];

/** Whether this is a draft build: the dev server, or a build made with drafts on. */
export const draftBuild = (): boolean => import.meta.env.DEV || import.meta.env.VITE_FLOOR_THEME_DRAFTS === "true";
