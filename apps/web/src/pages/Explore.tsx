import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { api } from "../api/client.js";

/**
 * Explore (Wave 4): Private-ref Checkpoints and non-destructive Merkle Freeze over
 * hardened worktrees. Multi-CLI fan-out controls are previewed and disabled until Cycle 2.
 */
export function Explore() {
  const [repoPath, setRepoPath] = useState("");
  const [label, setLabel] = useState("explore");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const runCheckpoint = async () => {
    if (!repoPath.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api.checkpointRepo({
        repo_path: repoPath.trim(),
        ...(label.trim() ? { label: label.trim() } : {}),
      });
      setStatus(`Checkpoint captured at ${res.ref} (${res.commit_sha.slice(0, 12)})`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Checkpoint failed");
    } finally {
      setBusy(false);
    }
  };

  const runFreeze = async () => {
    if (!repoPath.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api.freezeRepo({
        repo_path: repoPath.trim(),
        ...(label.trim() ? { label: label.trim() } : {}),
      });
      setStatus(
        `Merkle Freeze ready: ${res.manifest_digest.slice(0, 16)} (${res.file_count} files, ref ${res.checkpoint_ref})`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Merkle Freeze failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="place">
      <header className="place-head">
        <h1>Explore</h1>
        <p className="muted">
          Capture private checkpoints or freeze a Merkle tree over a hardened worktree. Multi-CLI fan-out is coming in Cycle 2.
        </p>
      </header>

      <section className="panel" style={{ marginBottom: "1rem" }}>
        <div className="row" style={{ gap: "1rem", flexWrap: "wrap", marginBottom: "0.75rem" }}>
          <label>
            Worktree / Repo Path{" "}
            <input
              type="text"
              value={repoPath}
              onChange={(e) => setRepoPath(e.target.value)}
              placeholder="~/projects/Control-Rod"
            />
          </label>
          <label>
            Label{" "}
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="explore"
            />
          </label>
        </div>

        <fieldset disabled style={{ border: "1px solid var(--line-2)", borderRadius: "8px", padding: "0.75rem", marginBottom: "0.75rem" }}>
          <legend className="muted small">Multi-CLI fan-out coming in Cycle 2 (not sent with Checkpoint or Freeze)</legend>
          <div className="row" style={{ gap: "1rem", flexWrap: "wrap", marginBottom: "0.75rem" }}>
            <label>
              Delivery Mode{" "}
              <select value="software" disabled>
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
                    checked={rt === "claude" || rt === "codex"}
                    disabled
                  />{" "}
                  {rt}
                </label>
              ))}
            </div>
          </div>

          <textarea
            rows={3}
            value=""
            disabled
            placeholder="Multi-CLI fan-out coming in Cycle 2: exploration prompt dispatch is disabled in this release."
            style={{ width: "100%" }}
          />
        </fieldset>

        <div className="row" style={{ gap: "0.75rem", flexWrap: "wrap" }}>
          <button type="button" onClick={runCheckpoint} disabled={busy || !repoPath.trim()}>
            Capture Checkpoint
          </button>
          <button type="button" onClick={runFreeze} disabled={busy || !repoPath.trim()}>
            Merkle Freeze
          </button>
          <Link to="/packages" className="button">
            Open Packages
          </Link>
          <Link to="/compare" className="button">
            Compare Candidates
          </Link>
        </div>

        {status && (
          <p className="mono" role="status" style={{ marginTop: "0.75rem" }}>
            {status}
          </p>
        )}
        {error && (
          <p className="error" role="alert" style={{ marginTop: "0.75rem" }}>
            {error}
          </p>
        )}
      </section>
    </div>
  );
}
