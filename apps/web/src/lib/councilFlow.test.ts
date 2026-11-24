import { describe, expect, it } from "vitest";
import { type AgentRow, agentRows } from "./agents.js";
import { buildCouncilFlow, CHECK_ROUNDS, councilOf, SEND_BACKS } from "./councilFlow.js";
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
    expect(kinds["pick->fallback"]).toBe("fallback");
    // A new round picks its author again (work.ts claims a fresh author run), so the loop goes back to the pick.
    expect(kinds["verdict->pick"]).toBe("send-back");
    expect(f.steps.find((s) => s.id === "pick")?.kind).toBe("decision");
    expect(f.summary).toContain(`at most ${SEND_BACKS} times`);
    expect(f.summary).toContain(`after ${CHECK_ROUNDS} checks that do not pass`);
    expect(f.summary).toContain("inconclusive");
    expect(f.summary).toContain("merging or shipping is a separate step");
    expect(SEND_BACKS).toBe(2);
  });

  it("never sends the stand-in's work to its own vendor or to the author it replaced", () => {
    const f = buildCouncilFlow(rows({ claude: true, codex: true }), "start-and-merge");
    // Codex stands in for Claude, you see the switch (coming), and Codex's work cannot go to Codex. Claude may
    // check it once it is back, as pickChecker judges independence against the runtime that wrote the work.
    expect(f.edges.filter((e) => e.from === "fallback").map((e) => e.to)).toEqual(["see-fallback"]);
    expect(f.steps.find((s) => s.id === "see-fallback")?.stop).toBe("coming");
    expect(f.edges.filter((e) => e.from === "see-fallback").map((e) => e.to)).toEqual(["fallback-check"]);
    const hold = f.steps.find((s) => s.id === "fallback-check")!;
    expect(hold.seat?.id).toBe("claude");
    expect(hold.detail).toMatch(/Once Claude Code is back/);
    // The main check stays with Codex, which is independent of the author, Claude.
    expect(f.steps.find((s) => s.id === "check")?.seat?.id).toBe("codex");
    // No checker step is reached by a fallback edge: checkers never fall over.
    expect(f.edges.some((e) => e.kind === "fallback" && f.steps.find((s) => s.id === e.to)?.role === "checker")).toBe(false);
  });

  it("puts every-step stops on every path: work before any checker, every verdict before what follows", () => {
    for (const r of [{ claude: true, codex: true }, { claude: true, codex: false }]) {
      const f = buildCouncilFlow(rows(r), "every-step");
      const kind = (id: string) => f.steps.find((s) => s.id === id)!;
      // Walk forward from `from` without passing a "you" step; return every step reached.
      const reach = (from: string, stopAt: (id: string) => boolean) => {
        const seen = new Set<string>();
        const go = (id: string) => {
          for (const e of f.edges.filter((x) => x.from === id && x.kind !== "send-back")) {
            if (seen.has(e.to)) continue;
            seen.add(e.to);
            if (!stopAt(e.to)) go(e.to);
          }
        };
        go(from);
        return seen;
      };
      const isYou = (id: string) => kind(id).kind === "you";
      for (const author of ["author", "fallback"].filter((id) => f.steps.some((s) => s.id === id))) {
        const checkers = [...reach(author, isYou)].filter((id) => kind(id).role === "checker");
        expect(checkers, `${author} reaches a checker without a stop`).toEqual([]);
      }
      for (const checker of f.steps.filter((s) => s.role === "checker").map((s) => s.id)) {
        expect([...reach(checker, isYou)], `${checker} reaches the verdict without a stop`).not.toContain("verdict");
      }
    }
  });

  it("marks stops the person chose but that are not built as coming, never as on", () => {
    const every = buildCouncilFlow(rows({ claude: true, codex: true }), "every-step");
    const stop = (id: string) => every.steps.find((s) => s.id === id)?.stop;
    expect(stop("see-work")).toBe("coming");
    expect(stop("see-check")).toBe("coming");
    const start = buildCouncilFlow(rows({ claude: true, codex: true }), "start");
    expect(start.steps.some((s) => s.id === "see-work")).toBe(false);
    // Sign-off stays on in every answer: skipping it needs a signed standing acceptance (ADR 0024 d7).
    for (const answer of ["start", "start-and-merge", "every-step"] as const) {
      const f = buildCouncilFlow(rows({ claude: true, codex: true }), answer);
      expect(f.steps.find((s) => s.id === "merge")?.stop).toBe("on");
      expect(f.matrix.find((r) => r.step === "Accept the work")?.stopsForYou).toBe("on");
    }
  });

  it("says plainly when nobody can work yet", () => {
    const f = buildCouncilFlow(rows({ claude: false, codex: false }), "start-and-merge");
    expect(f.council.author).toBeUndefined();
    expect(f.steps.find((s) => s.id === "author")?.seat).toBeUndefined();
    expect(f.summary).toMatch(/No agent at the table is ready yet/);
    // Nobody to stand in for, so no stand-in branch naming an offline agent.
    expect(f.steps.some((s) => s.id === "fallback")).toBe(false);
  });

  it("shows a seated agent that is not ready as the stand-in, not as the checker, and does not promise it", () => {
    const f = buildCouncilFlow(rows({ claude: true, codex: false }), "start-and-merge");
    expect(f.steps.find((s) => s.id === "fallback")?.seat).toMatchObject({ id: "codex", ready: false });
    expect(f.steps.find((s) => s.id === "fallback")?.detail).toMatch(/until then the card waits/);
    expect(f.steps.find((s) => s.id === "check")?.seat).toBeUndefined();
  });

  it("gives the spend limit its own row, holding new work only", () => {
    const m = buildCouncilFlow(rows({ claude: true, codex: true }), "start-and-merge").matrix;
    expect(m.find((r) => r.step === "Spend limit")).toMatchObject({ who: "control-rod", stopsForYou: "coming" });
    expect(m.find((r) => r.step.startsWith("SCRAM"))?.step).not.toMatch(/spend/i);
  });

  it("keeps the SCRAM, dispute and plan stops in the matrix whatever the answer", () => {
    for (const answer of ["start", "start-and-merge", "every-step"] as const) {
      const m = buildCouncilFlow(rows({ claude: true, codex: true }), answer).matrix;
      expect(m.find((r) => r.step.startsWith("SCRAM"))?.stopsForYou).toBe("always");
      expect(m.find((r) => r.step === "Accept the work")?.stopsForYou).toBe("on");
      expect(m.find((r) => r.step === "Settle a dispute")?.stopsForYou).toBe("always");
      expect(m.find((r) => r.step === "Approve the plan")?.stopsForYou).toBe("on");
    }
  });
});

describe("layout", () => {
  const rosters = {
    "both ready": rows({ claude: true, codex: true }),
    "one ready, one offline": rows({ claude: true, codex: false }),
    "one ready, one benched": rows({ claude: true, codex: true }, [{ runtime: "codex", seated: false }]),
    "nobody ready": rows({ claude: false, codex: false }),
  };
  for (const dir of ["LR", "TB"] as const)
    for (const [name, r] of Object.entries(rosters))
      for (const answer of ["start", "start-and-merge", "every-step"] as const)
        it(`keeps the main line straight with no overlaps (${dir}, ${name}, ${answer})`, () => {
          const f = buildCouncilFlow(r, answer);
          const l = layoutFlow(f.steps, f.edges, dir);
          expect(l.spine).toEqual(spineOf(f.steps, f.edges));
          for (const branch of ["fallback", "see-fallback", "fallback-check", "dispute"]) expect(l.spine).not.toContain(branch);
          const centre = (id: string) => {
            const p = l.placed.get(id)!;
            return dir === "LR" ? p.y + p.height / 2 : p.x + p.width / 2;
          };
          expect(new Set(l.spine.map((id) => Math.round(centre(id)))).size).toBe(1);
          const all = [...l.placed.values()];
          for (const a of all)
            for (const b of all)
              if (a !== b) expect(a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height).toBe(false);
          for (const p of all) expect(p.x >= 0 && p.y >= 0 && p.x + p.width <= l.width + 0.5 && p.y + p.height <= l.height + 0.5).toBe(true);
        });
});
