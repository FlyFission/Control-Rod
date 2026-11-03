import type { OfficeThemeV1 } from "./contract.js";
import bright from "./themes/harness-bright.js";
import standard from "./themes/standard-office.js";

/**
 * Every office theme the repository carries. Released themes reach ordinary builds; development
 * themes (the structural test theme) appear only on draft pages such as the quality harness.
 */
export const OFFICE_THEMES: readonly OfficeThemeV1[] = [standard, bright];
export const DEFAULT_OFFICE_THEME = standard;
export const releasedOfficeThemes = () => OFFICE_THEMES.filter((t) => t.availability === "released");
