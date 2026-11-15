import { Link } from "@tanstack/react-router";
import { useState } from "react";

/**
 * Explore (Wave 3): Uncounted batch exploration & multi-CLI fan-out over hardened
 * worktrees before non-destructive Merkle Freeze into Case Mode.
 */
export function Explore() {
  const [mode, setMode] = useState<"software" | "capital-projects">("software");
  const [prompt, setPrompt] = useState("");
  const [selectedRuntimes, setSelectedRuntimes] = useState<string[]>(["claude", "codex"]);

  const toggleRuntime = (rt: string) => {
    setSelectedRuntimes((prev) =>
      prev.includes(rt) ? prev.filter((item) => item !== rt) : [...prev, rt],
    );
  };

  return (
    <div className="place">
      <header className="place-head">
        <h1>Explore</h1>
        <p className="muted">
          Uncounted batch turns and multi-CLI fan-out over hardened worktrees. Freeze a clean Merkle tree when ready for Case Mode.
        </p>
      </header>

      <section className="panel" style={{ marginBottom: "1rem" }}>
        <div className="row" style={{ gap: "1rem", flexWrap: "wrap", marginBottom: "0.75rem" }}>
          <label>
            Delivery Mode{" "}
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value as "software" | "capital-projects")}
            >
              <option value="software">Software (GitHub PR outfall)</option>
              <option value="capital-projects">Capital Projects (Transmittal Dossier)</option>
            </select>
          </label>
          <div>
            <span className="muted" style={{ marginRight: "0.5rem" }}>Fan-out Runtimes:</span>
            {["claude", "codex", "grok", "opencode", "agy", "ollama"].map((rt) => (
              <label key={rt} style={{ marginRight: "0.65rem" }}>
                <input
                  type="checkbox"
                  checked={selectedRuntimes.includes(rt)}
                  onChange={() => toggleRuntime(rt)}
                />{" "}
                {rt}
              </label>
            ))}
          </div>
        </div>

        <textarea
          rows={3}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder={
            mode === "software"
              ? "Describe the exploration task for your hardened worktree..."
              : "Describe the calculation, drawing, or specification dossier task..."
          }
          style={{ width: "100%", marginBottom: "0.75rem" }}
        />

        <div className="row" style={{ gap: "0.75rem" }}>
          <Link to="/packages" className="button">
            Open Packages &amp; Freeze
          </Link>
          <Link to="/compare" className="button">
            Compare Candidates
          </Link>
        </div>
      </section>
    </div>
  );
}
