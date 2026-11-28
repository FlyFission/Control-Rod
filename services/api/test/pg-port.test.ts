import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { choosePgPort, derivedPgPort, LEGACY_PG_PORT } from "../src/pg-port.js";

const home = () => mkdtempSync(join(tmpdir(), "cr-pgport-"));
const recorded = (h: string) => readFileSync(join(h, "pg.port"), "utf8").trim();

describe("choosePgPort", () => {
  it("gives a new install the web port plus 10000, so CONTROLROD_PORT=7301 no longer meets the database", () => {
    const h = home();
    expect(choosePgPort({ home: h, webPort: 7300, dataExists: false })).toEqual({ port: 17300 });
    expect(recorded(h)).toBe("17300");
    const other = home();
    expect(choosePgPort({ home: other, webPort: 7301, dataExists: false }).port).toBe(17301);
    expect(derivedPgPort(60000)).toBe(50000);
  });

  it("keeps an older install on 7301, where its database always was, and records it", () => {
    const h = home();
    expect(choosePgPort({ home: h, webPort: 7300, dataExists: true })).toEqual({ port: LEGACY_PG_PORT });
    expect(recorded(h)).toBe("7301");
    expect(choosePgPort({ home: h, webPort: 7300, dataExists: true })).toEqual({ port: 7301 });
  });

  it("keeps the recorded port across restarts and web port changes", () => {
    const h = home();
    writeFileSync(join(h, "pg.port"), "17300\n");
    expect(choosePgPort({ home: h, webPort: 7400, dataExists: true })).toEqual({ port: 17300 });
  });

  it("moves an older install off 7301 only when the web app takes 7301, and says so", () => {
    const h = home();
    const choice = choosePgPort({ home: h, webPort: 7301, dataExists: true });
    expect(choice.port).toBe(17301);
    expect(choice.moved).toContain("from port 7301 to 17301");
    expect(choice.moved).toContain("data is unchanged");
    expect(recorded(h)).toBe("17301");
  });

  it("uses CONTROLROD_PG_PORT as given, and refuses one that is not a port or is the web port", () => {
    const h = home();
    expect(choosePgPort({ home: h, webPort: 7300, env: "5433", dataExists: true })).toEqual({ port: 5433 });
    expect(() => choosePgPort({ home: h, webPort: 7300, env: "abc", dataExists: false })).toThrow(/port number/);
    expect(() => choosePgPort({ home: h, webPort: 7300, env: "7300", dataExists: false })).toThrow(/both 7300/);
  });
});
