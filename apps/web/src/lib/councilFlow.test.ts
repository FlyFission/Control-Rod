import { describe, expect, it } from "vitest";
import { type AgentRow, agentRows } from "./agents.js";
import { buildCouncilFlow, councilOf, SEND_BACK_ROUNDS } from "./councilFlow.js";
import { layoutFlow, spineOf } from "./councilLayout.js";

const AT = "2026-11-24T17:00:00Z";
const rt = (runtime: string, ready: boolean) => ({ runtime, ready, version: "1.0.0", login_checked: true });
function rows(ready: Record<string, boolean>, seats: { runtime: string; seated: boolean }[] = []): AgentRow[] {
  return agentRows(
    Object.entries(ready).map(([id, ok]) => rt(id, ok)) as never,
    { reported: true, reported_at: AT, platform: "darwin", probes: [], checkers: [], tiers: [], local_rule: "", pins: [] } as never,
    { confirmed: true, seats, check_in: "start-and-merge" } as never,
  );
}

describe("council", () => {
  it("seats the first ready agent as author and the next ready one from another vendor as blind checker", () => {
    const c = councilOf(rows({ claude: true, codex: true }));
    expect(c.author?.id).toBe("claude");
    expect(c.checker?.id).toBe("codex");
    expect(c.fallbacks.map((s) => s.id)).toEqual(["codex"]);
    expect(c.later.map((s) => s.id)).toEqual(["agy", "grok", "opencode", "ollama"]);
  });

  it("never seats the author's own vendor as checker", () => {
    const c = councilOf(rows({ claude: true, codex: false }));
    expect(c.author?.id).toBe("claude");
    expect(c.checker).toBeUndefined();
    expect(c.waiting.map((s) => s.id)).toEqual(["codex"]);
  });

  it("leaves a benched agent out of every seat", () => {
    const c = councilOf(rows({ claude: true, codex: true }, [{ runtime: "claude", seated: false }]));
    expect(c.author?.id).toBe("codex");
    expect(c.checker).toBeUndefined();
    expect(c.benched.map((s) => s.id)).toEqual(["claude"]);
    expect(c.fallbacks).toEqual([]);
  });
});

describe("flow", () => {
  it("draws the baton pass, the author-only stand-in and the send-back loop", () => {
    const f = buildCouncilFlow(rows({ claude: true, codex: true }), "start-and-merge");
    const kinds = Object.fromEntries(f.edges.map((e) => [e.id, e.kind]));
    expect(kinds["author->check"]).toBe("baton");
    expect(kinds["approve->fallback"]).toBe("fallback");
    expect(kinds["verdict->author"]).toBe("send-back");
    // The checker never falls back: no edge leaves the stand-in for any seat but the check.
    expect(f.edges.filter((e) => e.from === "fallback").map((e) => e.to)).toEqual(["check"]);
    expect(f.edges.some((e) => e.to === "check" && e.kind === "fallback")).toBe(false);
    expect(f.summary).toContain(`up to ${SEND_BACK_ROUNDS} times`);
  });

  it("marks stops the person chose but that are not built as coming, never as on", () => {
    const every = buildCouncilFlow(rows({ claude: true, codex: true }), "every-step");
    const stop = (id: string) => every.steps.find((s) => s.id === id)?.stop;
    expect(stop("see-work")).toBe("coming");
    expect(stop("see-check")).toBe("coming");
    expect(stop("merge")).toBe("on");
    const start = buildCouncilFlow(rows({ claude: true, codex: true }), "start");
    expect(start.steps.find((s) => s.id === "merge")?.stop).toBe("skipped");
    expect(start.steps.some((s) => s.id === "see-work")).toBe(false);
  });

  it("says plainly when nobody can work yet", () => {
    const f = buildCouncilFlow(rows({ claude: false, codex: false }), "start-and-merge");
    expect(f.council.author).toBeUndefined();
    expect(f.steps.find((s) => s.id === "author")?.seat).toBeUndefined();
    expect(f.summary).toMatch(/No agent at the table is ready yet/);
  });

  it("keeps the SCRAM, dispute and plan stops in the matrix whatever the answer", () => {
    for (const answer of ["start", "start-and-merge", "every-step"] as const) {
      const m = buildCouncilFlow(rows({ claude: true, codex: true }), answer).matrix;
      expect(m.find((r) => r.step.startsWith("SCRAM"))?.stopsForYou).toBe("always");
      expect(m.find((r) => r.step === "Settle a dispute")?.stopsForYou).toBe("always");
      expect(m.find((r) => r.step === "Approve the plan")?.stopsForYou).toBe("on");
    }
  });
});

describe("layout", () => {
  for (const dir of ["LR", "TB"] as const) {
    it(`keeps the main line straight and branches off it (${dir})`, () => {
      const f = buildCouncilFlow(rows({ claude: true, codex: true }), "every-step");
      const l = layoutFlow(f.steps, f.edges, dir);
      expect(l.spine).toEqual(spineOf(f.steps, f.edges));
      expect(l.spine).not.toContain("fallback");
      expect(l.spine).not.toContain("dispute");
      const centre = (id: string) => {
        const p = l.placed.get(id)!;
        return dir === "LR" ? p.y + p.height / 2 : p.x + p.width / 2;
      };
      const line = new Set(l.spine.map((id) => Math.round(centre(id))));
      expect(line.size).toBe(1);
      // No two blocks overlap.
      const all = [...l.placed.values()];
      for (const a of all)
        for (const b of all)
          if (a !== b) expect(a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height).toBe(false);
    });
  }
});
