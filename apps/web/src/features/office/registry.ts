import type { OfficeThemeV1 } from "./contract.js";
import bright from "./themes/harness-bright.js";
import standard from "./themes/standard-office.js";
import { WORLD_THEMES } from "./themes/worlds/index.js";

/**
 * Every office theme the repository carries. Released themes reach ordinary builds; development
 * themes (the structural test theme, and the fifteen worlds as draft art pending human review) reach
 * only draft builds and draft pages such as the quality harness.
 */
export const OFFICE_THEMES: readonly OfficeThemeV1[] = [standard, bright, ...WORLD_THEMES];
export const DEFAULT_OFFICE_THEME = standard;
export const releasedOfficeThemes = () => OFFICE_THEMES.filter((t) => t.availability === "released");

/**
 * The themes a person may choose on the office view: the released themes, and in a draft build the
 * fifteen worlds too (their art ships only in draft builds). The structural test theme is for the
 * harness, never a choice.
 */
export const officeThemeChoices = (drafts: boolean): readonly OfficeThemeV1[] => [...releasedOfficeThemes(), ...(drafts ? WORLD_THEMES : [])];

/** Whether this is a draft build: the dev server, or a build made with drafts on. */
export const draftBuild = (): boolean => import.meta.env.DEV || import.meta.env.VITE_FLOOR_THEME_DRAFTS === "true";
