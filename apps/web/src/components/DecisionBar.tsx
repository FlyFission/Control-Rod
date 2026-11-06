import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { explain } from "../api/client.js";
import type { ActionDescriptor, DecisionKind, PackageView } from "../api/types.js";
import { decisionLabel, NEEDS_REASON, browserPasskeys, decide, type Passkeys } from "../lib/decide.js";
import { shortDigest } from "../lib/format.js";
import { useOfferedActions } from "../lib/offered.js";
import { needsIndependentCheck } from "../lib/board.js";

const KINDS: DecisionKind[] = ["release", "accept", "accept-with-findings", "return", "reject"];
const isKind = (c: string): c is DecisionKind => (KINDS as string[]).includes(c);

/**
 * The decision bar (specification 14 Sign; plan task 3.5). It never disappears. It offers exactly
 * the decisions the server's kernel would allow this person now, each signed with their passkey over
 * the digest shown beside the sentence of what it binds. When nothing is open to them it says why:
 * the floor that blocks it, the authority missing, and the one fact that would change it.
 */
export function DecisionBar({ view, passkeys = browserPasskeys }: { view: PackageView; passkeys?: Passkeys }) {
  const qc = useQueryClient();
  const pkg = view.package;
  // The server's actions with the acceptance rule applied (ruling 16), the same rule the board uses.
  const actions = useOfferedActions(pkg);
  const role = pkg.agent_assignment[0]?.role;
  const label = (k: DecisionKind) => decisionLabel(k, role);
  const [pending, setPending] = useState<DecisionKind | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const decisions = (actions.data ?? []).filter((a) => isKind(a.command));
  const allowed = KINDS.filter((k) => decisions.some((a) => a.command === k && a.allowed));
  const refused = decisions.filter((a) => !a.allowed);
  // Signing is offered only on a current, successful answer: never on a failed refresh.
  const current = actions.isSuccess && !actions.isError;
  const pendingAllowed = pending !== null && current && allowed.includes(pending);
  // A decision started before permission was withdrawn is put away, with the refusal shown below.
  useEffect(() => {
    if (pending !== null && actions.isSuccess && !allowed.includes(pending)) setPending(null);
  }, [pending, actions.isSuccess, allowed]);

  async function sign(kind: DecisionKind) {
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      const { decision } = await decide(
        { packageId: pkg.id, revision: pkg.revision, kind, shownDigest: view.subject_digest, independentCheck: needsIndependentCheck(pkg), ...(reason.trim().length > 0 ? { reason } : {}) },
        passkeys,
      );
      setDone(`${label(decision.kind)} recorded.`);
      setPending(null);
      setReason("");
      for (const key of ["package", "office", "inbox", "packages", "actions"]) void qc.invalidateQueries({ queryKey: key === "package" ? [key, pkg.id] : [key] });
    } catch (e) {
      setError(explain(e, "The decision was not recorded."));
      // A refusal may come from a verification read that no longer matches what the bar offers.
      void qc.invalidateQueries({ queryKey: ["person-verifications", pkg.id] });
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
      {view.binds !== undefined ? (
        <p className="binds small">{view.binds}</p>
      ) : (
        <p className="muted small">
          A decision here signs <span className="mono">{shortDigest(view.subject_digest)}</span>, the digest of this revision, its output and its pre-check.
        </p>
      )}
      <p className="small muted">
        Full digest <span className="mono wrap">{view.subject_digest.algorithm}:{view.subject_digest.value}</span>
      </p>
      {actions.isLoading && <p className="muted small">Checking what you may sign</p>}
      {actions.isError && (
        <div role="alert" className="error">
          <p>{actions.data === undefined ? "What you may sign could not be checked." : "What you may sign could not be refreshed; the buttons may be out of date."}</p>
          <button type="button" className="btn small" onClick={actions.refetch}>
            Try again
          </button>
        </div>
      )}
      {actions.verificationsFailed && (
        <div role="alert" className="error">
          <p>The person verifications could not be read, so Accept is not offered.</p>
          <button type="button" className="btn small" onClick={actions.refetchVerifications}>
            Try again
          </button>
        </div>
      )}
      {allowed.length > 0 && (
        <div className="decide-buttons">
          {allowed.map((k) => (
            <button
              key={k}
              type="button"
              className={k === "accept" || k === "release" ? "btn primary" : k === "reject" ? "btn danger" : "btn ghost"}
              onClick={() => choose(k)}
              disabled={busy || !current}
            >
              {label(k)}
            </button>
          ))}
        </div>
      )}
      {actions.isSuccess && allowed.length === 0 && <Blocked refused={refused} label={label} />}
      {allowed.length > 0 && refused.length > 0 && (
        <details className="refused-decisions">
          <summary className="small muted">Why the other decisions are not open to you</summary>
          <Blocked refused={refused} label={label} />
        </details>
      )}
      {pending !== null && pendingAllowed && (
        <div className="reason">
          <label className="field">
            <span>{pending === "return" ? "Direction for the next revision" : pending === "reject" ? "Why reject this package" : "Why accept with these findings"}</span>
            <textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
          </label>
          <div className="decide-buttons">
            <button type="button" className="btn primary" onClick={() => void sign(pending)} disabled={busy || !pendingAllowed || reason.trim().length === 0}>
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

/** Refused decisions grouped by reason: what blocks them, what is missing, and what would change it. */
function Blocked({ refused, label }: { refused: ActionDescriptor[]; label: (k: DecisionKind) => string }) {
  if (refused.length === 0) return <p className="muted small">No decision is open on this revision.</p>;
  const groups = new Map<string, ActionDescriptor[]>();
  for (const a of refused) {
    const key = `${a.reason ?? ""}|${a.change ?? ""}`;
    groups.set(key, [...(groups.get(key) ?? []), a]);
  }
  return (
    <ul className="blocked">
      {[...groups.values()].map((group) => {
        const a = group[0]!;
        return (
          <li key={group.map((g) => g.command).join(",")}>
            <p>
              <strong>{group.map((g) => (isKind(g.command) ? label(g.command) : g.label)).join(", ")}</strong>
              {a.floor && <span className="tag small-tag">floor</span>}: {a.reason ?? "Not open to you now."}
            </p>
            {a.missing !== undefined && a.missing.length > 0 && <p className="muted small">Missing: {a.missing.join(", ")}.</p>}
            {a.change !== undefined && <p className="muted small">{a.floor ? "Why nothing changes this: " : "What would change it: "}{a.change}</p>}
          </li>
        );
      })}
    </ul>
  );
}
