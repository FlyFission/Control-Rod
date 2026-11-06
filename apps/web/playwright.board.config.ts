import { defineConfig } from "@playwright/test";
import base from "./playwright.config.js";

/**
 * The board specs run on their own: same server and browsers as the default config, but the JSON
 * reporter is not used, so a run never rewrites the overlay-themes evidence file.
 * Run: pnpm -C apps/web exec playwright test -c playwright.board.config.ts
 */
export default defineConfig({
  ...base,
  testMatch: "board-*.spec.ts",
  reporter: [["list"]],
});
