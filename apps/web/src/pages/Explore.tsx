import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { api } from "../api/client.js";

/**
 * Snapshots (formerly Explore): private-ref checkpoints and a non-destructive Merkle freeze over a
 * worktree, so Compare can line revisions up. Multi-CLI fan-out is not built, so it is not shown.
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
      setStatus(`Checkpoint saved at ${res.ref} (${res.commit_sha.slice(0, 12)})`);
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
        `Frozen: ${res.manifest_digest.slice(0, 16)} (${res.file_count} files, ref ${res.checkpoint_ref})`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Freeze failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="place">
      <header className="place-head">
        <h1>Snapshots</h1>
        <p className="muted">
          Save a private checkpoint of a worktree, or freeze it so its exact files can be compared later. Nothing in the worktree is changed.
        </p>
      </header>

      <section className="panel" style={{ marginBottom: "1rem" }}>
        <div className="row" style={{ gap: "1rem", flexWrap: "wrap", marginBottom: "0.75rem" }}>
          <label>
            Worktree or repository path{" "}
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

        <div className="row" style={{ gap: "0.75rem", flexWrap: "wrap" }}>
          <button type="button" onClick={runCheckpoint} disabled={busy || !repoPath.trim()}>
            Save checkpoint
          </button>
          <button type="button" onClick={runFreeze} disabled={busy || !repoPath.trim()}>
            Freeze
          </button>
          <Link to="/packages" className="button">
            Open Packages
          </Link>
          <Link to="/compare" className="button">
            Compare
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
