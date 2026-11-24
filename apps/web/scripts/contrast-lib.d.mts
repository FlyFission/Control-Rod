export const LOOKS: readonly string[];
export const SURFACE_TOKENS: readonly string[];
export const TEXT_TOKENS: readonly string[];
export const FILL_PAIRS: readonly (readonly [string, string])[];
export const MIN_RATIO: number;
export function parseLooks(css: string): Record<string, Record<string, string>>;
export function luminance(hex: string): number;
export function contrastRatio(a: string, b: string): number;
export interface ContrastRow {
  look: string;
  text: string;
  fg: string;
  surface: string;
  bg: string;
  ratio: number;
  pass: boolean;
}
export function contrastTable(looks: Record<string, Record<string, string>>): ContrastRow[];
