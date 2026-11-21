import { describe, expect, it } from "vitest";
import { daemonPresence, SILENT_AFTER_MS } from "./daemon.js";
import { daemonNoticeText } from "../components/DaemonNotice.js";

const now = Date.parse("2026-11-21T12:00:00Z");
const at = (ms: number) => new Date(now - ms).toISOString();
const ready = [{ runtime: "claude", ready: true, login_checked: true }];

describe("daemonPresence", () => {
  it("is unknown until /runtimes is read", () => expect(daemonPresence(undefined, 0, now).state).toBe("unknown"));
  it("says no daemon has ever connected", () => {
    const p = daemonPresence({ runtimes: [] }, 0, now);
    expect(p.state).toBe("never");
    expect(daemonNoticeText(p)?.title).toMatch(/No run daemon has connected/);
  });
  it("is fine while the daemon reports", () => expect(daemonPresence({ reported_at: at(2000), runtimes: ready }, 1, now).state).toBe("ok"));
  it("says the daemon went silent when it stops reporting with a free slot", () => {
    expect(daemonPresence({ reported_at: at(SILENT_AFTER_MS + 1000), runtimes: ready }, 1, now).state).toBe("silent");
  });
  it("does not cry wolf while every slot is busy", () => {
    expect(daemonPresence({ reported_at: at(SILENT_AFTER_MS + 1000), runtimes: ready }, 3, now).state).toBe("ok");
  });
  it("says when no agent is ready, with the daemon's reasons", () => {
    const p = daemonPresence({ reported_at: at(1000), runtimes: [{ runtime: "claude", ready: false, reason: "not signed in", login_checked: true }] }, 0, now);
    expect(p).toEqual({ state: "no-agent", reasons: ["claude: not signed in"] });
    expect(daemonNoticeText(p)?.detail).toMatch(/Claude Code or Codex/);
  });
});
