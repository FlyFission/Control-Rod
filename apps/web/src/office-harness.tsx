import { createRoot } from "react-dom/client";
import { useEffect, useMemo, useState } from "react";
import { STATE_INFO } from "./components/StateMark.js";
import { validateTheme } from "./features/office/contract.js";
import { harnessFigures } from "./features/office/fixtures.js";
import { OfficeStage, type FigureState } from "./features/office/OfficeStage.js";
import { OFFICE_THEMES } from "./features/office/registry.js";
import { type LensId, lensById } from "./features/office/lenses.js";
import "./styles.css";

/**
 * The office theme quality harness page (plan task 4.3). A draft only entry, never in a release
 * build: it draws the office stage with fixture figures under any theme the repository carries, and
 * checks the theme's served files against the contract in the browser. The Playwright harness
 * (e2e/office-harness.spec.ts) measures contrast, occlusion, hit testing, legibility, frame time,
 * reduced motion and state across a theme switch on this page.
 */

const SHIFT: Record<FigureState, FigureState> = { working: "needs", needs: "waiting", waiting: "stuck", stuck: "changed", changed: "working" };

const sha256 = async (bytes: Uint8Array) =>
  [...new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(bytes)))].map((b) => b.toString(16).padStart(2, "0")).join("");
const fetchBytes = async (path: string) => {
  const r = await fetch(path);
  return r.ok ? new Uint8Array(await r.arrayBuffer()) : null;
};

function Harness() {
  const params = new URLSearchParams(location.search);
  const [themeId, setThemeId] = useState(params.get("theme") ?? OFFICE_THEMES[0]!.id);
  const [count, setCount] = useState(Number(params.get("agents") ?? 12));
  // Zoom as a fraction of the layout canvas; the stage refuses to draw below its minimum (0.8).
  const zoom = Number(params.get("zoom") ?? 0);
  // A deliberate delay before a state change commits, so the harness can prove its timer sees it.
  const delay = Number(params.get("delay") ?? 0);
  // A lens to tint the figures with: every colour of its scale in turn, so the harness meets them all.
  const lensId = params.get("lens") as LensId | null;
  const scale = lensId ? lensById(lensId).scale : [];
  const [shifted, setShifted] = useState(0);
  const [selected, setSelected] = useState<string>();
  const [contract, setContract] = useState<{ theme: string; problems: string[] }>();
  const theme = OFFICE_THEMES.find((t) => t.id === themeId) ?? OFFICE_THEMES[0]!;
  const figures = useMemo(
    () =>
      harnessFigures(count).map((f) => {
        let state = f.state;
        for (let i = 0; i < shifted; i++) state = SHIFT[state];
        return { ...f, state, ...(scale.length ? { tint: scale[Number(f.id.slice(1)) % scale.length]!.color } : {}) };
      }),
    [count, shifted, scale],
  );
  const open = figures.find((f) => f.id === selected);

  useEffect(() => {
    let live = true;
    setContract(undefined);
    void validateTheme(theme, fetchBytes, sha256).then((problems) => live && setContract({ theme: theme.id, problems }));
    return () => {
      live = false;
    };
  }, [theme]);

  return (
    <main className="content" style={{ maxWidth: 1560, margin: "0 auto", padding: "24px clamp(16px,3vw,40px)" }}>
      <p style={{ fontSize: 12, letterSpacing: 3, color: "#bed5d4", margin: "0 0 16px" }}>
        CONTROL ROD <span style={{ color: "#a7b6c4", letterSpacing: 1, marginLeft: 16 }}>OFFICE THEME HARNESS / DRAFT</span>
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "center", marginBottom: 16 }}>
        <label>
          Theme{" "}
          <select value={theme.id} onChange={(e) => setThemeId(e.target.value)} data-harness="theme">
            {OFFICE_THEMES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title} ({t.availability})
              </option>
            ))}
          </select>
        </label>
        <label>
          Agents{" "}
          <select value={count} onChange={(e) => setCount(Number(e.target.value))} data-harness="agents">
            {[12, 40].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="btn" onClick={() => (delay ? setTimeout(() => setShifted((n) => n + 1), delay) : setShifted((n) => n + 1))} data-harness="shift">
          Shift every state
        </button>
        <span role="status" data-harness="contract" data-theme={contract?.theme ?? ""} data-problems={contract ? contract.problems.length : ""}>
          {!contract ? "Checking the theme's files against the contract" : contract.problems.length === 0 ? `${theme.title} passes the theme contract` : `${theme.title} fails the theme contract: ${contract.problems.join("; ")}`}
        </span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 260px", gap: 16, alignItems: "start" }}>
        <div className="office-scroll" data-harness="scroll" style={{ overflow: "auto", maxHeight: "80vh" }}>
          <div style={zoom ? { width: Math.round(1200 * zoom) } : undefined}>
            <OfficeStage theme={theme} figures={figures} selected={selected} onSelect={setSelected} />
          </div>
        </div>
        <aside aria-label="Selected figure" data-harness="card" style={{ border: "1px solid var(--line-2)", borderRadius: 12, padding: 14, minHeight: 120 }}>
          {open ? (
            <>
              <h2 style={{ fontSize: 15, margin: "0 0 6px" }}>{open.code}</h2>
              <p style={{ margin: "0 0 4px" }}>{STATE_INFO[open.state].label}</p>
              <p style={{ margin: 0, color: "var(--muted)" }}>{open.cause}</p>
            </>
          ) : (
            <p style={{ margin: 0, color: "var(--muted)" }}>Select a figure to open its card.</p>
          )}
        </aside>
      </div>
    </main>
  );
}

const root = document.getElementById("root");
if (root) createRoot(root).render(<Harness />);
