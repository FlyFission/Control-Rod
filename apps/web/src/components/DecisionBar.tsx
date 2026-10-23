import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { DecisionKind, PackageView } from "../api/types.js";
import {
  decisionLabel,
  NEEDS_REASON,
  availableDecisions,
  browserPasskeys,
  decide,
  type Passkeys,
} from "../lib/decide.js";
import { shortDigest } from "../lib/format.js";

/**
 * The person's decisions on this revision. Each one is signed with the passkey over the digest
 * shown beside it; the kernel on the server decides whether it is allowed.
 */
export function DecisionBar({ view, passkeys = browserPasskeys }: { view: PackageView; passkeys?: Passkeys }) {
  const qc = useQueryClient();
  const pkg = view.package;
  const kinds = availableDecisions(pkg.status, view.pre_check !== undefined, view.pre_check?.outcome).filter(k => !view.preparation_enrolled ||
    (k === "release" ? Boolean(view.preparation_release_ready) :
     k === "accept" ? Boolean(view.preparation_verification_complete && view.preparation_results_pass) :
     k === "accept-with-findings" ? Boolean(view.preparation_verification_complete) : true));
  const role = pkg.agent_assignment[0]?.role;
  const label = (k: DecisionKind) => decisionLabel(k, role);
  const [pending, setPending] = useState<DecisionKind | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  if (kinds.length === 0) return null;

  async function sign(kind: DecisionKind) {
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      const { decision } = await decide(
        { packageId: pkg.id, revision: pkg.revision, kind, shownDigest: view.subject_digest, ...(reason.trim().length > 0 ? { reason } : {}) },
        passkeys,
      );
      setDone(`${label(decision.kind)} recorded.`);
      setPending(null);
      setReason("");
      void qc.invalidateQueries({ queryKey: ["package", pkg.id] });
      void qc.invalidateQueries({ queryKey: ["office"] });
      void qc.invalidateQueries({ queryKey: ["packages"] });
    } catch (e) {
      setError(e instanceof Error ? e.message : "The decision was not recorded.");
    } finally {
      setBusy(false);
    }
  }

  function choose(kind: DecisionKind) {
    setError(null);
    if (NEEDS_REASON.has(kind)) {
      setPending(kind);
      return;
    }
    void sign(kind);
  }

  return (
    <section id="decide" className="panel decide" aria-labelledby="decide-title">
      <h2 id="decide-title">Your decision</h2>
      <p className="muted small">
        Signs <span className="mono">{shortDigest(view.subject_digest)}</span>, the digest of this revision, its output and its
        pre-check. Your passkey binds the decision to exactly that.
      </p>
      <div className="decide-buttons">
        {kinds.map((k) => (
          <button
            key={k}
            type="button"
            className={k === "accept" || k === "release" ? "btn primary" : k === "reject" ? "btn danger" : "btn ghost"}
            onClick={() => choose(k)}
            disabled={busy}
          >
            {label(k)}
          </button>
        ))}
      </div>
      {pending !== null && (
        <div className="reason">
          <label className="field">
            <span>{pending === "return" ? "Direction for the next revision" : pending === "reject" ? "Why reject this package" : "Why accept with these findings"}</span>
            <textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
          </label>
          <div className="decide-buttons">
            <button
              type="button"
              className="btn primary"
              onClick={() => void sign(pending)}
              disabled={busy || reason.trim().length === 0}
            >
              Sign: {label(pending)}
            </button>
            <button type="button" className="btn ghost" onClick={() => setPending(null)} disabled={busy}>
              Cancel
            </button>
          </div>
        </div>
      )}
      {busy && <p className="muted small">Waiting for your passkey</p>}
      {error !== null && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {done !== null && (
        <p role="status" className="ok">
          {done}
        </p>
      )}
    </section>
  );
}
