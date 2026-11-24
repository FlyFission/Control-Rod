import { defineConfig } from "@playwright/test";

/**
 * Live suites: the real control plane, database and daemon (fake runtime), driven in three browsers.
 * See e2e/live/README.md. Run:
 *   pnpm -C apps/web exec playwright test -c playwright.live.config.ts --trace off
 * One browser:       --project=chromium
 * One pass:          --grep @functional | @break | @persona
 * Skip the rebuild:  LIVE_SKIP_BUILD=1
 */
export default defineConfig({
  testDir: "./e2e/live",
  testMatch: "*.spec.ts",
  globalSetup: "./e2e/live/global-setup.ts",
  fullyParallel: false,
  workers: process.env.CI ? 1 : 2,
  timeout: 120000,
  expect: { timeout: 15000 },
  retries: 0,
  projects: [
    {
      name: "chromium",
      use: {
        browserName: "chromium",
        // A machine with a preinstalled Chromium of another version can point at it.
        ...(process.env.LIVE_CHROMIUM_PATH ? { launchOptions: { executablePath: process.env.LIVE_CHROMIUM_PATH } } : {}),
      },
    },
    { name: "firefox", use: { browserName: "firefox" } },
    { name: "webkit", use: { browserName: "webkit" } },
  ],
  use: {
    viewport: { width: 1440, height: 1000 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  reporter: [["list"], ["json", { outputFile: "test-results/live-results.json" }]],
});
