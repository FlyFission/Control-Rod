import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  timeout: 60000,
  projects: [
    { name: "chromium", use: { browserName: "chromium" } },
    { name: "firefox", use: { browserName: "firefox" } },
    { name: "webkit", use: { browserName: "webkit" } },
  ],
  use: {
    baseURL: "http://127.0.0.1:4173",
    viewport: { width: 1440, height: 1100 },
    trace: "retain-on-failure",
  },
  webServer: {
    command:
      "pnpm build && pnpm exec vite preview --host 127.0.0.1 --port 4173",
    url: "http://127.0.0.1:4173/themes.html",
    reuseExistingServer: false,
    timeout: 120000,
    env: { VITE_FLOOR_THEMES_ENABLED: process.env.THEME_TEST_LEGACY === "true" ? "false" : "true", VITE_FLOOR_THEME_DRAFTS: "true" },
  },
  reporter: [
    ["list"],
    [
      "json",
      {
        outputFile:
          "../../.nuclear/changes/overlay-themes/evidence/browser-results.json",
      },
    ],
  ],
});
