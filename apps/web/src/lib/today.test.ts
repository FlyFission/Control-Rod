import { describe, expect, it } from "vitest";
import type { AgentFigure, AttentionItem, OfficeFloor } from "../api/types.js";
import { brief, riskBand } from "./today.js";

const fig = (state: AgentFigure["state"]) => ({ id: state + Math.random(), state }) as unknown as AgentFigure;
const floor = (...states: AgentFigure["state"][]) => ({ figures: states.map(fig), needs_me: 0, inbox_items: 0, hidden: 0, generated_at: "" }) as OfficeFloor;
const items = (n: number) => ({ items: Array.from({ length: n }, () => ({}) as AttentionItem) });

describe("the shift brief", () => {
  it("says decisions, agents and stuck work in one sentence", () => {
    const b = brief(floor("working", "working", "working", "working", "working", "working", "stuck", "needs"), items(2));
    expect(b).toMatchObject({ needs: 2, working: 6, stuck: 1, calm: false });
    expect(b.headline).toBe("2 decisions waiting, 6 agents working, 1 stuck");
  });

  it("uses the singular and drops what is zero", () => {
    expect(brief(floor("working"), items(1)).headline).toBe("1 decision waiting, 1 agent working");
  });

  it("is calm only when nothing waits and nothing is stuck", () => {
    expect(brief(floor("working", "working"), items(0))).toMatchObject({ calm: true, headline: "Nothing needs you. 2 agents are working." });
    expect(brief(floor(), items(0))).toMatchObject({ calm: true, headline: "Nothing needs you." });
    expect(brief(floor("stuck"), items(0))).toMatchObject({ calm: false, headline: "1 stuck" });
  });

  it("never turns a read that failed into zero", () => {
    const b = brief(undefined, items(3));
    expect(b.working).toBeUndefined();
    expect(b.stuck).toBeUndefined();
    expect(b.headline).toBe("3 decisions waiting");
    const none = brief(undefined, undefined);
    expect(none).toMatchObject({ needs: undefined, calm: false });
    // The plant is known and the Inbox is not: nothing is claimed about what needs the person.
    expect(brief(floor("working"), undefined).calm).toBe(false);
  });
});

describe("the risk band", () => {
  const band = (kind: AttentionItem["kind"], rank: number) => riskBand({ kind, risk: { rank, label: "x" } });
  it("steps its height with the rank, riskiest tallest", () => {
    expect([band("scram", 0), band("lost", 20), band("accept", 40), band("accept", 41)].map((b) => b.level)).toEqual([4, 3, 2, 1]);
  });
  it("names the kind by glyph and tone, so colour is never the only signal", () => {
    expect(band("scram", 0)).toMatchObject({ glyph: "cross", tone: "trip" });
    expect(band("lost", 21)).toMatchObject({ glyph: "cross", tone: "trip" });
    expect(band("permission", 10)).toMatchObject({ glyph: "diamond", tone: "needs-you" });
    expect(band("release", 41)).toMatchObject({ glyph: "bang", tone: "needs-you" });
  });
});
