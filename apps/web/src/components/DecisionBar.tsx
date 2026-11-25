import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { noteSigned, passkeyHint, signedToday } from "../lib/signing.js";
import { explain } from "../api/client.js";
import type { ActionDescriptor, DecisionKind, PackageView } from "../api/types.js";
import { decisionLabel, NEEDS_REASON, browserPasskeys, decide, type Passkeys } from "../lib/decide.js";
import { shortDigest } from "../lib/format.js";
import { useOfferedActions } from "../lib/offered.js";
import { needsIndependentCheck } from "../lib/board.js";
import { useActionLock } from "../lib/scramLock.js";
import { InstrumentFrame } from "../design/instruments/InstrumentFrame.js";
import "../pages/screens.css";

const KINDS: DecisionKind[] = ["release", "accept", "accept-with-findings", "return", "reject"];
const isKind = (c: string): c is DecisionKind => (KINDS as string[]).includes(c);

export type DecisionSigner = ReturnType<typeof useDecisionSigner>;

/**
 * The state behind signing a decision on one package, shared by the decision bar on the case page
 * and the board drawer: what is open to this person now, the reason a decision needs, and the
 * passkey ceremony. The kernel on the server still decides.
 */
export function useDecisionSigner(view: PackageView, passkeys: Passkeys = browserPasskeys) {
  const qc = useQueryClient();
  const pkg = view.package;
  // The server's actions with the acceptance rule applied (ruling 16), the same rule the board uses.
  const actions = useOfferedActions(pkg);
  const scramLock = useActionLock(pkg.project);
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
  const allowedKey = allowed.join(",");
  // "Accept recorded." is a confirmation, not a status: it fades once read.
  useEffect(() => {
    if (done === null) return;
    const t = setTimeout(() => setDone(null), 6000);
    return () => clearTimeout(t);
  }, [done]);
  useEffect(() => {
    if (pending !== null && actions.isSuccess && !allowedKey.split(",").includes(pending)) setPending(null);
  }, [pending, actions.isSuccess, allowedKey]);

  async function sign(kind: DecisionKind) {
    if (scramLock.locked || busy) return;
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      const { decision } = await decide(
        {
          packageId: pkg.id, revision: pkg.revision, kind, shownDigest: view.subject_digest, independentCheck: needsIndependentCheck(pkg), ...(reason.trim().length > 0 ? { reason } : {}),
          // The signing settings let this step go with a press: no passkey, still bound to what was shown.
          noPasskey: decisions.find((a) => a.command === kind)?.signature === "none",
        },
        passkeys,
      );
      if (decisions.find((a) => a.command === kind)?.signature === "direct") noteSigned(kind);
      setDone(`${decisionLabel(decision.kind)} recorded.`);
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
    setDone(null);
    if (NEEDS_REASON.has(kind)) {
      setPending(kind);
      return;
    }
    void sign(kind);
  }

  const signsWithPasskey = allowed.some((k) => decisions.find((a) => a.command === k)?.signature === "direct");
  return { actions, decisions, scramLock, allowed, refused, current, pending, pendingAllowed, setPending, reason, setReason, busy, error, done, sign, choose, signsWithPasskey };
}

/**
 * One quiet line under the buttons when one of them will ask for a passkey: why, and where to
 * change it. After a few signed steps of one kind in a day it offers to let them go.
 */
export function PasskeyHint({ d }: { d: DecisionSigner }) {
  const signedKind = d.allowed.find((k) => d.decisions.find((a) => a.command === k)?.signature === "direct");
  if (!signedKind) return null;
  const descriptor = d.decisions.find((a) => a.command === signedKind);
  if (descriptor?.signing_preset === undefined && descriptor?.step_mode === undefined) return null;
  return (
    <p className="small muted passkey-hint">
      {passkeyHint(signedKind, decisionLabel(signedKind), descriptor.signing_preset, signedToday(signedKind))} <a href="/setup#signing">Change</a>
    </p>
  );
}

/** Where a decision's reason is typed: shown in view and focused the moment it opens. */
export function ReasonBox({ d, compact = false }: { d: DecisionSigner; compact?: boolean }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const pending = d.pending;
  useEffect(() => {
    if (pending === null) return;
    const el = ref.current;
    if (!el) return;
    el.focus({ preventScroll: true });
    el.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
  }, [pending]);
  if (pending === null || !d.pendingAllowed) return null;
  return (
    <div className="reason">
      <label className="field">
        <span>{REASON_PROMPT[pending]}</span>
        <textarea ref={ref} rows={compact ? 2 : 3} value={d.reason} onChange={(e) => d.setReason(e.target.value)} />
      </label>
      <div className="decide-buttons">
        <button type="button" className={pending === "reject" ? "btn danger" : "btn primary"} onClick={() => void d.sign(pending)} disabled={d.busy || !d.pendingAllowed || d.scramLock.locked || d.reason.trim().length === 0} title={d.scramLock.why}>
          {d.decisions.find((a) => a.command === pending)?.signature === "none" ? decisionLabel(pending) : `Sign: ${decisionLabel(pending)}`}
        </button>
        <button type="button" className="btn ghost" onClick={() => d.setPending(null)} disabled={d.busy}>
          Cancel
        </button>
      </div>
    </div>
  );
}

const REASON_PROMPT: Record<DecisionKind, string> = {
  release: "Reason",
  accept: "Reason",
  return: "What should change in the next revision?",
  reject: "Why reject this work?",
  "accept-with-findings": "Why accept with these findings?",
};

/**
 * The decision bar (specification 14 Sign; plan task 3.5). It never disappears. It offers exactly
 * the decisions the server's kernel would allow this person now, each signed with their passkey over
 * the digest shown beside the sentence of what it binds. When nothing is open to them it says why:
 * the floor that blocks it, the authority missing, and the one fact that would change it.
 */
export function DecisionBar({ view, passkeys = browserPasskeys }: { view: PackageView; passkeys?: Passkeys }) {
  const pkg = view.package;
  const d = useDecisionSigner(view, passkeys);
  const { actions, scramLock, allowed, refused, current, busy, error, done, choose } = d;
  const label = (k: DecisionKind) => decisionLabel(k);

  return (
    <section id="decide" className="panel decide" aria-labelledby="decide-title">
      <h2 id="decide-title">Your decision</h2>
      <InstrumentFrame label="Signing readout">
        <dl className="sign-readout">
          <div className="sign-readout-cell">
            <dt>Package</dt>
            <dd className="mono">{pkg.id}</dd>
          </div>
          <div className="sign-readout-cell">
            <dt>Bound revision</dt>
            <dd className="mono">rev {pkg.revision}</dd>
          </div>
          <div className="sign-readout-cell sign-readout-digest">
            <dt>Digest</dt>
            <dd className="mono">{shortDigest(view.subject_digest)}</dd>
          </div>
        </dl>
        <p className="small muted sign-readout-full">
          Full digest <span className="mono wrap">{view.subject_digest.algorithm}:{view.subject_digest.value}</span>
        </p>
      </InstrumentFrame>
      {view.binds !== undefined ? (
        <p className="binds small">{view.binds}</p>
      ) : (
        <p className="muted small">
          A decision here signs revision {pkg.revision}, its output and its pre-check, bound by the digest above.
        </p>
      )}
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
      {allowed.length > 0 && scramLock.locked && scramLock.why && (
        <p className="lock-note" role="status">
          {scramLock.why}
        </p>
      )}
      {allowed.length > 0 && (
        <div className="decide-buttons">
          {allowed.map((k) => (
            <button
              key={k}
              type="button"
              className={k === "accept" || k === "release" ? "btn primary" : k === "reject" ? "btn danger" : "btn ghost"}
              onClick={() => choose(k)}
              disabled={busy || !current || scramLock.locked}
              title={scramLock.why}
            >
              {label(k)}
            </button>
          ))}
        </div>
      )}
      <PasskeyHint d={d} />
      {actions.isSuccess && allowed.length === 0 && <Blocked refused={refused} label={label} />}
      {allowed.length > 0 && refused.length > 0 && (
        <details className="refused-decisions">
          <summary className="small muted">Why the other decisions are not open to you</summary>
          <Blocked refused={refused} label={label} />
        </details>
      )}
      <ReasonBox d={d} />
      {busy && <p className="muted small">{d.signsWithPasskey ? "Waiting for your passkey" : "Recording"}</p>}
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
export function Blocked({ refused, label }: { refused: ActionDescriptor[]; label: (k: DecisionKind) => string }) {
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
