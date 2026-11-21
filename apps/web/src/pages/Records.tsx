import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client.js";
import type { PackageProof, RecordsVerification, SealCheck, WindowExport } from "../api/types.js";
import { type Passkeys, browserPasskeys, signAdmin } from "../lib/decide.js";
import { shortDigest, time } from "../lib/format.js";

/**
 * Records (specification 12 and 11.6; plan task 5.3): the event chain, verified; Members' seals over
 * it, each checked again from its stored signature; how much no seal covers yet; sealing the chain as
 * it stands; and a package's inclusion proof. Interim tamper evidence: this is a local chain that
 * nothing outside the database witnesses, and every view here says so.
 */

const NOT_WITNESSED =
  "Local chain, not witnessed. Nothing outside this database vouches for it yet, and a database alone cannot prove that a sealed stretch was not cut short.";

const RESULT_WORDS: Record<SealCheck["result"], string> = {
  valid: "Valid",
  "head-mismatch": "Not valid: the event it names no longer has the digest it sealed",
  "head-missing": "Not valid: the event it names is missing",
  unrecorded: "Not valid: the chain does not record this seal as it stands",
  "key-revoked": "Not valid: made with a passkey already revoked",
  "not-enrolled": "Not valid: the passkey was not enrolled to the signer before the seal",
  "key-changed": "Not valid: the signer's retained key is not the one recorded with the seal",
  "subject-mismatch": "Not valid: what is recorded is not what was signed",
  "key-unknown": "Not valid: the signer's passkey is not known",
  "signature-invalid": "Not valid: the signature does not check",
  "chain-broken-before-head": "Not valid: the chain breaks before the event it seals",
};

export function Records({ passkeys = browserPasskeys }: { passkeys?: Passkeys } = {}) {
  const q = useQuery({ queryKey: ["events", "all"], queryFn: () => api.allEvents() });
  const events = [...(q.data ?? [])].sort((a, b) => b.seq - a.seq);
  return (
    <div className="place">
      <header className="place-head">
        <h1>Records</h1>
        <p className="muted">The event chain: every controlled change, each entry carrying the digest of the one before it, sealed by Members with their passkeys.</p>
        <p className="small" role="note">
          {NOT_WITNESSED}
        </p>
      </header>
      <Verification />
      <Seal passkeys={passkeys} />
      <Proof />
      <Export />
      <section className="panel" aria-labelledby="rec-title">
        <h2 id="rec-title">The chain</h2>
        {q.isLoading && <p className="muted">Loading</p>}
        {q.isError && (
          <p className="error" role="alert">
            The chain could not be loaded.
          </p>
        )}
        <div className="table-wrap">
          <table className="records">
            <thead>
              <tr>
                <th scope="col">Seq</th>
                <th scope="col">Time</th>
                <th scope="col">Type</th>
                <th scope="col">Subject</th>
                <th scope="col">Actor</th>
                <th scope="col">Digest</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.seq}>
                  <td className="mono">{e.seq}</td>
                  <td className="small">{time(e.at)}</td>
                  <td className="mono small">{e.type}</td>
                  <td className="small">{e.subject}</td>
                  <td className="small">
                    {e.actor.kind}: {e.actor.id}
                  </td>
                  <td className="mono small muted">{shortDigest(e.digest)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

/** The chain and every seal, checked on request. */
function Verification() {
  const [run, setRun] = useState(false);
  const q = useQuery({ queryKey: ["records-verify"], queryFn: api.verifyRecords, enabled: run });
  const v: RecordsVerification | undefined = q.data;
  return (
    <section className="panel" aria-labelledby="verify-title">
      <div className="panel-head">
        <h2 id="verify-title">Verification</h2>
        <button
          type="button"
          className="btn small"
          disabled={q.isFetching}
          onClick={() => (run ? void q.refetch() : setRun(true))}
        >
          {q.isFetching ? "Verifying" : "Verify the record"}
        </button>
      </div>
      {q.isError && (
        <p className="error" role="alert">
          The record could not be verified just now.
        </p>
      )}
      {v && (
        <div role="status">
          <p className={v.chain.ok ? "ok" : "error"}>
            {v.chain.ok
              ? `Chain intact: all ${v.chain.count} entries recomputed and linked.`
              : `Chain broken at entry ${v.chain.broken_at ?? "unknown"} of ${v.chain.count}: from there on, nothing can be relied on.`}
          </p>
          <p>
            {v.last_sealed_seq === 0
              ? `No valid seal covers any entry yet: all ${v.unsealed} are unsealed.`
              : `Sealed through entry ${v.last_sealed_seq}. ${v.unsealed} ${v.unsealed === 1 ? "entry after it is" : "entries after it are"} not sealed yet.`}
          </p>
          <p className="muted small">{NOT_WITNESSED}</p>
          {v.seals.length > 0 && (
            <div className="table-wrap">
              <table className="records">
                <thead>
                  <tr>
                    <th scope="col">Seal</th>
                    <th scope="col">Through entry</th>
                    <th scope="col">Purpose</th>
                    <th scope="col">Signed</th>
                    <th scope="col">Result</th>
                  </tr>
                </thead>
                <tbody>
                  {v.seals.map((s) => (
                    <tr key={s.id}>
                      <td className="mono small">{s.id}</td>
                      <td className="small">
                        <span className="mono">{s.head_seq}</span> <span className="mono muted">{shortDigest(s.head_digest)}</span>
                      </td>
                      <td className="small">{s.purpose}</td>
                      <td className="small">
                        <span className="mono">{s.signer_id}</span>
                        <p className="muted">{time(s.sealed_at)}</p>
                      </td>
                      <td className={s.result === "valid" ? "small ok" : "small error"}>{RESULT_WORDS[s.result]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

/** Seals the chain through the head shown, with a purpose and the person's passkey. */
function Seal({ passkeys }: { passkeys: Passkeys }) {
  const qc = useQueryClient();
  const head = useQuery({ queryKey: ["records-head"], queryFn: api.recordsHead });
  const [purpose, setPurpose] = useState("");
  const h = head.data?.head;
  const seal = useMutation({
    // What the screen shows is what is signed: this head, this purpose, this moment.
    mutationFn: () => signAdmin<{ payload: { head_seq: number } }>("chain.seal", { head_seq: h!.head_seq, head_digest: h!.head_digest.value, purpose: purpose.trim(), sealed_at: new Date().toISOString() }, passkeys),
    onSuccess: () => {
      setPurpose("");
      void qc.invalidateQueries({ queryKey: ["records-verify"] });
      void qc.invalidateQueries({ queryKey: ["records-head"] });
      void qc.invalidateQueries({ queryKey: ["events"] });
    },
  });
  return (
    <section className="panel" aria-labelledby="seal-title">
      <h2 id="seal-title">Seal the record</h2>
      <p className="muted small">
        A seal is your passkey signature over the chain as it stands: the last entry and its digest, the time and your purpose. Its own entry comes after, and the
        next seal covers it.
      </p>
      {head.isError && (
        <p className="error" role="alert">
          The chain head could not be loaded.
        </p>
      )}
      {head.isSuccess && !h && <p className="muted">The chain is empty; there is nothing to seal.</p>}
      {h && (
        <fieldset className="office-scram-form" disabled={seal.isPending}>
          <p role="status">
            This seals the chain through entry <span className="mono">{h.head_seq}</span>, digest <span className="mono">{h.head_digest.value}</span>.
          </p>
          <label className="field">
            <span>Purpose (required)</span>
            <input value={purpose} maxLength={200} onChange={(e) => setPurpose(e.target.value)} />
          </label>
          <button type="button" className="btn small" disabled={!purpose.trim()} onClick={() => seal.mutate()}>
            Sign with your passkey and seal
          </button>
        </fieldset>
      )}
      {/* The seal's own head, never the head the page shows now: sealing itself adds entries after it. */}
      {seal.data && (
        <p className="ok" role="status">
          Sealed through entry {seal.data.payload.head_seq}.
        </p>
      )}
      {seal.error && (
        <p className="error" role="alert">
          {seal.error.message}
        </p>
      )}
    </section>
  );
}

/** A package's inclusion proof: whether its entries are in the chain under a seal, with the bundle to keep. */
function Proof() {
  const [id, setId] = useState("");
  const [asked, setAsked] = useState("");
  const q = useQuery({ queryKey: ["package-proof", asked], queryFn: () => api.packageProof(asked), enabled: asked !== "" });
  const p: PackageProof | undefined = q.data;
  // A data address: nothing to release later, and the bundle stays exactly what the control plane sent.
  const href = p ? `data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify(p.bundle, null, 2))}` : undefined;
  return (
    <section className="panel" aria-labelledby="proof-title">
      <h2 id="proof-title">Prove a package is in the record</h2>
      <form
        className="office-scram-form"
        onSubmit={(e) => {
          e.preventDefault();
          // The same package asked again is proven again: a seal made since may now cover it.
          if (id.trim() === asked) void q.refetch();
          else setAsked(id.trim());
        }}
      >
        <label className="field">
          <span>Package</span>
          <input value={id} onChange={(e) => setId(e.target.value)} placeholder="WP-0001" />
        </label>
        <button type="submit" className="btn small" disabled={!id.trim() || q.isFetching}>
          Prove it
        </button>
      </form>
      {q.isError && (
        <p className="error" role="alert">
          {q.error.message}
        </p>
      )}
      {p && (
        <div role="status">
          <p className={p.ok ? "ok" : "error"}>
            {!p.check.ok
              ? `The proof does not hold: ${p.check.problem ?? "unknown problem"}.`
              : !p.chain.ok
                ? `The chain is broken at entry ${p.chain.broken_at ?? "unknown"}, so this proof cannot be relied on, though ${p.bundle.package_id}'s own stretch checks.`
                : `${p.check.events.length} ${p.check.events.length === 1 ? "entry" : "entries"} of ${p.bundle.package_id} recompute and link through the chain from its first entry.`}
          </p>
          <p>
            {p.bundle.seal
              ? p.check.authenticated
                ? `Covered by seal ${p.bundle.seal.id} through entry ${p.bundle.seal.payload.head_seq} (${p.bundle.seal.payload.purpose}), and its passkey signature checks against the key in the bundle. Whether that key is the signer's must be confirmed from outside the bundle.`
                : `Seal ${p.bundle.seal.id} does not authenticate these entries.`
              : "No seal covers these entries yet: the proof runs to the chain's current head, unsealed."}
          </p>
          <p className="muted small">{NOT_WITNESSED}</p>
          {href && (
            <a className="btn small" href={href} download={`${p.bundle.package_id}-inclusion-proof.json`}>
              Download the proof bundle
            </a>
          )}
          {href && (
            <p className="muted small">
              Anyone holding the file can check it without this app: <code>pnpm cr verify {p.bundle.package_id}-inclusion-proof.json</code>
            </p>
          )}
        </div>
      )}
    </section>
  );
}

/**
 * Saves JSON through an object URL, released once the download starts. An export carries the chain from
 * its first entry and grows with it, past what a data address holds.
 */
function saveJson(value: unknown, file: string) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = file;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** A date-time-local value read as the viewer's local time, sent with its zone. */
const asInstant = (local: string) => (local ? new Date(local).toISOString() : "");

/** An audit export: everything the chain recorded in a time window, under the seal that covers it, to keep and check offline. */
function Export() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [asked, setAsked] = useState<{ from: string; to: string } | null>(null);
  const q = useQuery({ queryKey: ["records-export", asked], queryFn: () => api.recordsExport(asked!.from, asked!.to), enabled: asked !== null });
  const p: WindowExport | undefined = q.data;
  const file = p ? `audit-export-${p.bundle.window.from.slice(0, 10)}-to-${p.bundle.window.to.slice(0, 10)}.json` : "";
  return (
    <section className="panel" aria-labelledby="export-title">
      <h2 id="export-title">Export a time window for audit</h2>
      <form
        className="office-scram-form"
        onSubmit={(e) => {
          e.preventDefault();
          const next = { from: asInstant(from), to: asInstant(to) };
          if (asked && next.from === asked.from && next.to === asked.to) void q.refetch();
          else setAsked(next);
        }}
      >
        <label className="field">
          <span>From</span>
          <input type="datetime-local" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="field">
          <span>To</span>
          <input type="datetime-local" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
        <button type="submit" className="btn small" disabled={!from || !to || q.isFetching}>
          Export
        </button>
      </form>
      {q.isError && (
        <p className="error" role="alert">
          {q.error.message}
        </p>
      )}
      {p && (
        <div role="status">
          <p className={p.ok ? "ok" : "error"}>
            {!p.check.ok
              ? `The export does not hold: ${p.check.problem ?? "unknown problem"}.`
              : !p.chain.ok
                ? `The chain is broken at entry ${p.chain.broken_at ?? "unknown"}, so this export cannot be relied on.`
                : `${p.check.events.length} ${p.check.events.length === 1 ? "entry" : "entries"} recorded in the window recompute and link through the chain from its first entry.`}
          </p>
          <p>
            {p.bundle.seal
              ? p.check.authenticated
                ? `Covered by seal ${p.bundle.seal.id} through entry ${p.bundle.seal.payload.head_seq} (${p.bundle.seal.payload.purpose}).`
                : `Seal ${p.bundle.seal.id} does not authenticate these entries.`
              : "No seal covers the end of this window yet: seal the chain first if the export is for an audit."}
          </p>
          <p className="muted small">{NOT_WITNESSED}</p>
          <button type="button" className="btn small" onClick={() => saveJson(p.bundle, file)}>
            Download the export
          </button>
          <p className="muted small">
            Check it without this app: <code>pnpm cr verify {file}</code>
          </p>
        </div>
      )}
    </section>
  );
}
