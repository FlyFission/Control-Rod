import type { Configuration } from "electron-builder";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

const testDir = dirname(fileURLToPath(import.meta.url));
const desktopDir = resolve(testDir, "..");

describe("desktop packaging config", () => {
  it("configures Control Rod macOS unsigned dmg with future Windows/Linux/update stubs", async () => {
    const mod = (await import(pathToFileURL(join(desktopDir, "electron-builder.config.mjs")).href)) as {
      default: Configuration;
    };
    const config = mod.default;
    expect(config.productName).toBe("Control Rod");
    expect(config.appId).toBe("com.flyfission.control-rod");
    expect(config.mac?.identity).toBeNull();
    expect(config.publish).toBeNull();
    expect(config.win?.target).toEqual(["nsis"]);
    expect(config.linux?.target).toEqual(["AppImage", "deb"]);
  });

  it("includes required dock icon assets and the calm loading screen", () => {
    for (const rel of ["assets/icon.png", "assets/icon.icns", "assets/icon.ico", "assets/icon.svg", "renderer/loading.html"]) {
      expect(existsSync(join(desktopDir, rel)), `missing ${rel}`).toBe(true);
    }
    const html = readFileSync(join(desktopDir, "renderer", "loading.html"), "utf8");
    expect(html).toContain("<title>Control Rod</title>");
    expect(html).toContain("Try again");
    expect(html).toContain("Technical details");
  });
});
