import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client.js";
import type { PackageProof, RecordsVerification, SealCheck } from "../api/types.js";
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
    mutationFn: () => signAdmin("chain.seal", { head_seq: h!.head_seq, head_digest: h!.head_digest.value, purpose: purpose.trim(), sealed_at: new Date().toISOString() }, passkeys),
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
      {seal.isSuccess && (
        <p className="ok" role="status">
          Sealed through entry {h?.head_seq ?? ""}.
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
          setAsked(id.trim());
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
          <p className={p.check.ok ? "ok" : "error"}>
            {p.check.ok
              ? `${p.bundle.events.length} ${p.bundle.events.length === 1 ? "entry" : "entries"} of ${p.bundle.package_id} recompute and link through the chain.`
              : `The proof does not hold: ${p.check.problem ?? "unknown problem"}.`}
          </p>
          <p>
            {p.bundle.seal
              ? `Covered by seal ${p.bundle.seal.id} through entry ${p.bundle.seal.payload.head_seq} (${p.bundle.seal.payload.purpose}).`
              : "No seal covers these entries yet: the proof runs to the chain's current head, unsealed."}
          </p>
          <p className="muted small">{NOT_WITNESSED}</p>
          {href && (
            <a className="btn small" href={href} download={`${p.bundle.package_id}-inclusion-proof.json`}>
              Download the proof bundle
            </a>
          )}
        </div>
      )}
    </section>
  );
}
