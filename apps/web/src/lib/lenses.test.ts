import { describe, expect, it } from "vitest";
import { pkg } from "../test/fixtures.js";
import type { BoardCard } from "../features/board/useBoardData.js";
import type { ColumnId } from "./board.js";
import { kindsOf } from "./kind.js";
import {
  DEFAULT_LENS,
  type Lens,
  applyLens,
  edgeColor,
  isProtected,
  legendEntries,
  lensToQuery,
  parseLens,
  revealHidden,
} from "./lenses.js";

function card(over: Partial<BoardCard> = {}, pkgOver: Parameters<typeof pkg>[0] = {}): BoardCard {
  const p = pkg(pkgOver);
  return {
    pkg: p,
    kinds: kindsOf(p),
    column: "ready",
    next: { tone: "wait", text: "Waiting" },
    runActive: false,
    lastKnown: false,
    nuclear: false,
    ...over,
  };
}

describe("lenses", () => {
  it("round-trips lenses through URL query parameters and omits defaults", () => {
    expect(lensToQuery(DEFAULT_LENS)).toBe("");
    expect(parseLens(new URLSearchParams(""))).toEqual(DEFAULT_LENS);

    const cases: Lens[] = [
      { kind: "code", needs: true, mine: false, colorBy: "state", groupBy: "person", density: "compact" },
      { kind: "doc", needs: false, mine: true, colorBy: "agent", groupBy: "kind", density: "comfortable" },
      { kind: "all", needs: true, mine: true, colorBy: "none", groupBy: "project", density: "compact" },
    ];
    for (const l of cases) {
      expect(parseLens(new URLSearchParams(lensToQuery(l)))).toEqual(l);
    }
  });

  it("falls back to defaults for unknown query values", () => {
    const parsed = parseLens(new URLSearchParams("kind=banana&colorBy=rainbow&groupBy=planet&density=tiny&needs=maybe"));
    expect(parsed).toEqual(DEFAULT_LENS);
  });

  it("identifies protected columns as person-verifies and needs-signature", () => {
    const cols: ColumnId[] = ["ready", "drafting", "agent-check", "person-verifies", "needs-signature", "reached"];
    expect(cols.filter((column) => isProtected(card({ column })))).toEqual(["person-verifies", "needs-signature"]);
  });

  it("counts hidden protected cards when filtering to code with a document waiting on a signature", () => {
    const cards: BoardCard[] = [
      card({ column: "drafting" }, { id: "WP-C", deliverables: [{ id: "D1", type: "patch" }] }),
      card({ column: "needs-signature" }, { id: "WP-D", deliverables: [{ id: "D1", type: "scope of work" }] }),
      card({ column: "person-verifies" }, { id: "WP-P", deliverables: [{ id: "D1", type: "calculation" }] }),
    ];
    const codeOnly = applyLens(cards, { ...DEFAULT_LENS, kind: "code" }, "ben");
    expect(codeOnly.shown.map((c) => c.pkg.id)).toEqual(["WP-C"]);
    expect(codeOnly.hiddenProtected).toBe(2);
  });

  it("keeps needs and block cards only under the Needs you lens", () => {
    const cards: BoardCard[] = [
      card({ next: { tone: "needs", text: "Release" } }, { id: "WP-1" }),
      card({ next: { tone: "block", text: "Needs a second qualified person" } }, { id: "WP-2" }),
      card({ next: { tone: "wait", text: "Agent drafting" } }, { id: "WP-3" }),
      card({ next: { tone: "ok", text: "Accepted" } }, { id: "WP-4" }),
    ];
    const res = applyLens(cards, { ...DEFAULT_LENS, needs: true }, "ben");
    expect(res.shown.map((c) => c.pkg.id)).toEqual(["WP-1", "WP-2"]);
  });

  it("filters Mine by the signed-in user name", () => {
    const cards: BoardCard[] = [
      card({ owner: "ben" }, { id: "WP-1" }),
      card({ owner: "ana" }, { id: "WP-2" }),
      card({}, { id: "WP-3" }),
    ];
    expect(applyLens(cards, { ...DEFAULT_LENS, mine: true }, "ben").shown.map((c) => c.pkg.id)).toEqual(["WP-1"]);
    expect(applyLens(cards, { ...DEFAULT_LENS, mine: true }, "").shown).toEqual([]);
  });

  it("revealHidden clears kind, needs, and mine while preserving presentation fields and showing all protected cards", () => {
    const cards: BoardCard[] = [
      card({ column: "person-verifies", owner: "ana", next: { tone: "wait", text: "Waiting" } }, { id: "WP-1", deliverables: [{ id: "D1", type: "report" }] }),
      card({ column: "needs-signature", owner: "ana", next: { tone: "wait", text: "Waiting" } }, { id: "WP-2", deliverables: [{ id: "D1", type: "report" }] }),
    ];
    const lenses: Lens[] = [
      { ...DEFAULT_LENS, kind: "code", colorBy: "person", groupBy: "kind", density: "compact" },
      { ...DEFAULT_LENS, needs: true, colorBy: "state", groupBy: "person", density: "compact" },
      { ...DEFAULT_LENS, mine: true, colorBy: "agent", groupBy: "project", density: "compact" },
      { kind: "code", needs: true, mine: true, colorBy: "none", groupBy: "person", density: "compact" },
    ];
    for (const l of lenses) {
      const revealed = revealHidden(l);
      expect(revealed).toEqual({
        kind: "all",
        needs: false,
        mine: false,
        colorBy: l.colorBy,
        groupBy: l.groupBy,
        density: l.density,
      });
      expect(applyLens(cards, revealed, "ben").hiddenProtected).toBe(0);
    }
  });

  it("never returns a fixed meaning token from edgeColor for any colorBy mode", () => {
    const forbidden = new Set(["var(--needs)", "var(--check)", "var(--stuck)", "var(--done)"]);
    const sampleCards: BoardCard[] = [
      card({ column: "ready", owner: "ben", kinds: ["code"] }, { id: "WP-1", deliverables: [{ id: "D1", type: "code" }] }),
      card({ column: "drafting", owner: "ana", kinds: ["doc"] }, { id: "WP-2", agent_assignment: [] }),
      card({ column: "agent-check", kinds: ["doc"] }, { id: "WP-3" }),
      card({ column: "person-verifies", owner: "marco", next: { tone: "block", text: "Blocked" } }, { id: "WP-4" }),
      card({ column: "needs-signature", owner: "ben", next: { tone: "needs", text: "Accept" } }, { id: "WP-5" }),
      card({ column: "reached", owner: "dora", next: { tone: "ok", text: "Accepted" } }, { id: "WP-6" }),
    ];
    const colorBys: Lens["colorBy"][] = ["kind", "state", "agent", "person", "none"];
    for (const colorBy of colorBys) {
      const lens: Lens = { ...DEFAULT_LENS, colorBy };
      for (const c of sampleCards) {
        const color = edgeColor(c, lens);
        expect(color.length).toBeGreaterThan(0);
        expect(forbidden.has(color)).toBe(false);
      }
      for (const entry of legendEntries(sampleCards, lens)) {
        expect(forbidden.has(entry.color)).toBe(false);
      }
    }
  });
});
