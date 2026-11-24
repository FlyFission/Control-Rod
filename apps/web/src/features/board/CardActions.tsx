import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { api, explain } from "../../api/client.js";
import type { DecisionKind } from "../../api/types.js";
import { needsIndependentCheck } from "../../lib/board.js";
import { DECISION_LABEL, NEEDS_REASON, browserPasskeys, decide, type Passkeys } from "../../lib/decide.js";
import { useActionLock } from "../../lib/scramLock.js";
import { type MenuItem, menuItems, primaryItem } from "./actions.js";
import { MoveMenu } from "./MoveMenu.js";
import type { BoardCard } from "./useBoardData.js";

const REASON_PROMPT: Partial<Record<DecisionKind, string>> = {
  return: "Direction for the next revision",
  reject: "Why reject this work",
  "accept-with-findings": "Why accept with these findings",
};

/**
 * Act from the card (redesign M3): the one primary decision as a button, every other decision and Stop
 * in a Move to menu. Each decision is signed with the person's passkey over the digest the card read;
 * the kernel on the server still decides. A refusal, from the menu or from the server, is shown here
 * in the card's own alert region, and the card stays where it is until the board is read again.
 */
export function CardActions({ card, passkeys = browserPasskeys }: { card: BoardCard; passkeys?: Passkeys }) {
  const qc = useQueryClient();
  const scramLock = useActionLock(card.pkg.project);
  const [pending, setPending] = useState<DecisionKind | null>(null);
  const [reason, setReason] = useState("");
  const [busyWith, setBusyWith] = useState<"sign" | "stop" | "requeue" | null>(null);
  const busy = busyWith !== null;
  // One outstanding operation per card: a ref so a second click in the same tick is refused too.
  const inFlight = useRef(false);
  const [alert, setAlert] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  if (card.offered === undefined || card.digest === undefined) return null;
  const base = menuItems(card.offered, card.activeRunId !== undefined);
  if (base.length === 0 && card.requeueRunId === undefined && card.settleRunId === undefined) return null;
  // Under a SCRAM or drill every decision is held, so each is shown refused with the lock's reason; Stop stays open.
  const items: MenuItem[] = scramLock.locked ? base.map((i) => (i.id === "stop" ? i : { ...i, enabled: false, ...(scramLock.why ? { reason: scramLock.why } : {}) })) : base;
  const primary = primaryItem(base);
  // A decision is signable only while the card's current reads still offer it. A reason form opened
  // before the decision was withdrawn is put away and says why; its text is kept if it opens again.
  const openNow = (id: DecisionKind) => items.some((i) => i.id === id && i.enabled);
  const pendingItem = pending !== null ? items.find((i) => i.id === pending) : undefined;
  const pendingOpen = pending !== null && openNow(pending);
  const pkg = card.pkg;
  const digest = card.digest;

  function refresh() {
    for (const key of ["packages", "office", "inbox"]) void qc.invalidateQueries({ queryKey: [key] });
    void qc.invalidateQueries({ queryKey: ["package", pkg.id] });
    void qc.invalidateQueries({ queryKey: ["actions", pkg.id] });
  }

  async function sign(kind: DecisionKind, why?: string) {
    if (inFlight.current || !openNow(kind)) return;
    inFlight.current = true;
    setBusyWith("sign");
    setAlert(null);
    setDone(null);
    try {
      const { decision } = await decide(
        { packageId: pkg.id, revision: pkg.revision, kind, shownDigest: digest, independentCheck: needsIndependentCheck(pkg), ...(why ? { reason: why } : {}) },
        passkeys,
      );
      setDone(`${DECISION_LABEL[decision.kind]} recorded.`);
      setPending(null);
      setReason("");
      refresh();
    } catch (e) {
      setAlert(explain(e, "The decision was not recorded."));
      void qc.invalidateQueries({ queryKey: ["person-verifications", pkg.id] });
      void qc.invalidateQueries({ queryKey: ["actions", pkg.id] });
    } finally {
      inFlight.current = false;
      setBusyWith(null);
    }
  }

  async function stop() {
    if (card.activeRunId === undefined || inFlight.current) return;
    inFlight.current = true;
    setBusyWith("stop");
    setAlert(null);
    setDone(null);
    try {
      await api.stopRun(pkg.id, card.activeRunId);
      setDone("Stop requested. The card shows the recorded outcome when the run ends.");
      refresh();
    } catch (e) {
      setAlert(explain(e, "The stop request was not recorded."));
    } finally {
      inFlight.current = false;
      setBusyWith(null);
    }
  }

  async function requeue() {
    if (card.requeueRunId === undefined || inFlight.current) return;
    inFlight.current = true;
    setBusyWith("requeue");
    setAlert(null);
    setDone(null);
    try {
      await api.requeueRun(pkg.id, card.requeueRunId);
      setDone("Queued again. The card moves on when an agent picks it up.");
      refresh();
    } catch (e) {
      setAlert(explain(e, "The run was not queued again."));
    } finally {
      inFlight.current = false;
      setBusyWith(null);
    }
  }

  function choose(item: MenuItem) {
    if (inFlight.current) return;
    setDone(null);
    if (!item.enabled) {
      // A refused item sends nothing: it says why, and what would change it.
      setAlert([`${item.label} is not open now`, item.reason, item.change].filter(Boolean).join(". ").replace(/\.\./g, ".") + ".");
      return;
    }
    setAlert(null);
    if (item.id === "stop") {
      void stop();
      return;
    }
    if (NEEDS_REASON.has(item.id)) {
      setPending(item.id);
      return;
    }
    void sign(item.id);
  }

  return (
    <div className="bd-actions">
      <div className="bd-actions-row">
        {card.requeueRunId !== undefined && (
          <button type="button" className="btn small primary" disabled={busy || scramLock.locked} title={scramLock.why} onClick={() => void requeue()}>
            Run again
          </button>
        )}
        {card.settleRunId !== undefined && (
          <Link to="/packages/$id" params={{ id: pkg.id }} hash={`run-${card.settleRunId}`} className="btn small primary">
            Open run log
          </Link>
        )}
        {primary && card.requeueRunId === undefined && card.settleRunId === undefined && (
          <button type="button" className="btn small primary" disabled={busy || scramLock.locked} title={scramLock.why} onClick={() => choose(primary)}>
            {primary.label}
          </button>
        )}
        {items.length > 0 && <MoveMenu items={items} onChoose={choose} cardTitle={pkg.title} disabled={busy} />}
      </div>
      {pending !== null && !pendingOpen && (
        <p role="alert" className="bd-alert small">
          {([`${DECISION_LABEL[pending]} is no longer open`, pendingItem?.reason, pendingItem?.change].filter(Boolean).join(". ") + ".").replace(/\.\./g, ".")}
        </p>
      )}
      {pending !== null && pendingOpen && (
        <div className="bd-reason">
          <label className="field">
            <span>{REASON_PROMPT[pending] ?? "Reason"}</span>
            <textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
          </label>
          <div className="bd-actions-row">
            <button type="button" className="btn small primary" disabled={busy || scramLock.locked || reason.trim().length === 0} title={scramLock.why} onClick={() => void sign(pending, reason.trim())}>
              Sign: {DECISION_LABEL[pending]}
            </button>
            <button type="button" className="btn small ghost" disabled={busy} onClick={() => setPending(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}
      {busyWith === "sign" && <p className="small muted">Waiting for your passkey</p>}
      {busyWith === "stop" && <p className="small muted">Sending the stop request</p>}
      {busyWith === "requeue" && <p className="small muted">Queuing the run again</p>}
      {alert !== null && (
        <p role="alert" className="bd-alert small">
          {alert}
        </p>
      )}
      {done !== null && (
        <p role="status" className="small ok">
          {done}
        </p>
      )}
    </div>
  );
}
