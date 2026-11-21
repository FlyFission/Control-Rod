import type { OfficeThemeV1 } from "./contract.js";
import bright from "./themes/harness-bright.js";
import standard from "./themes/standard-office.js";
import { WORLD_THEMES } from "./themes/worlds/index.js";

/**
 * Every office theme the repository carries. Released themes (the standard office and the fifteen
 * worlds, approved by the project owner on 2026-11-18) reach ordinary builds; the development theme
 * (the structural test theme) reaches only draft builds and draft pages such as the quality harness.
 */
export const OFFICE_THEMES: readonly OfficeThemeV1[] = [standard, bright, ...WORLD_THEMES];
export const DEFAULT_OFFICE_THEME = standard;
export const releasedOfficeThemes = () => OFFICE_THEMES.filter((t) => t.availability === "released");

/**
 * The themes a person may choose on the office view: the released themes, and in a draft build any
 * world not yet released. The structural test theme is for the harness, never a choice.
 */
export const officeThemeChoices = (drafts: boolean): readonly OfficeThemeV1[] => [
  ...releasedOfficeThemes(),
  ...(drafts ? WORLD_THEMES.filter((t) => t.availability !== "released") : []),
];

/** Whether this is a draft build: the dev server, or a build made with drafts on. */
export const draftBuild = (): boolean => import.meta.env.DEV || import.meta.env.VITE_FLOOR_THEME_DRAFTS === "true";
