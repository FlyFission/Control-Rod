// Electron-builder configuration for Control Rod.
// macOS unsigned .dmg is built first; Windows, Linux, signing, notarization, and auto-update
// are structured here as config additions / documented follow-ups (no redesign needed).
// Patterned on anomalyco/opencode (MIT) desktop packaging layout.

/** @type {import("electron-builder").Configuration} */
const config = {
  appId: "com.flyfission.control-rod",
  productName: "Control Rod",
  copyright: "Copyright © FlyFission Consulting Group",
  asar: true,
  directories: {
    output: "release",
    buildResources: "assets",
  },
  files: [
    "dist/**/*",
    "renderer/**/*",
    "assets/icon.png",
    "package.json",
  ],
  // The staged runtime (scripts/cr.mjs, services/api/dist, apps/web/dist, node_modules with
  // @embedded-postgres, and the compiled Go daemon binary) lives outside app.asar so Node and
  // PostgreSQL can execute native binaries directly.
  extraResources: [
    {
      from: "runtime",
      to: "app-runtime",
      filter: ["**/*"],
    },
  ],
  mac: {
    category: "public.app-category.developer-tools",
    icon: "assets/icon.icns",
    target: [
      {
        target: "dmg",
        arch: ["arm64", "x64"],
      },
    ],
    // Unsigned by default for PR builds.
    // Follow-up (code signing): remove `identity: null`, enable `hardenedRuntime: true`,
    // add `entitlements` / `entitlementsInherit` plist files, and set CSC_LINK + CSC_KEY_PASSWORD.
    identity: null,
    // Follow-up (notarization): configure `notarize: true` (or an `afterSign` hook) with
    // APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, and APPLE_TEAM_ID in release CI.
  },
  dmg: {
    title: "Control Rod",
    artifactName: "Control-Rod-${version}-${arch}.dmg",
    contents: [
      { x: 140, y: 180 },
      { x: 410, y: 180, type: "link", path: "/Applications" },
    ],
  },
  // Follow-up (Windows): flip CI target to `--win nsis` and stage the Windows Go daemon +
  // @embedded-postgres/windows-x64 in scripts/build-desktop.mjs.
  win: {
    icon: "assets/icon.ico",
    target: ["nsis"],
    artifactName: "Control-Rod-${version}-${arch}.${ext}",
  },
  // Follow-up (Linux): flip CI target to `--linux AppImage deb` and stage the Linux Go daemon +
  // @embedded-postgres/linux-* in scripts/build-desktop.mjs.
  linux: {
    icon: "assets/icon.png",
    category: "Development",
    target: ["AppImage", "deb"],
    artifactName: "Control-Rod-${version}-${arch}.${ext}",
  },
  // Follow-up (auto-update): enable `publish: [{ provider: "github" }]` and wire
  // `electron-updater` once release signing and notarization are in place.
  publish: null,
};

export default config;
