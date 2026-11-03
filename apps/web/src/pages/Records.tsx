import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client.js";
import { shortDigest, time } from "../lib/format.js";

export function Records() {
  const q = useQuery({ queryKey: ["events", "all"], queryFn: () => api.allEvents() });
  const [verify, setVerify] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const events = [...(q.data ?? [])].sort((a, b) => b.seq - a.seq);

  async function check() {
    setBusy(true);
    try {
      const r = await api.verifyEvents();
      setVerify(
        r.ok
          ? `Chain intact: ${r.count} entries recomputed.`
          : `Chain broken at entry ${r.broken_at ?? "unknown"} of ${r.count}.`,
      );
    } catch (e) {
      setVerify(e instanceof Error ? e.message : "Could not verify.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel" aria-labelledby="rec-title">
      <div className="panel-head">
        <h1 id="rec-title">Records</h1>
        <button type="button" className="btn ghost small" onClick={() => void check()} disabled={busy}>
          {busy ? "Verifying" : "Verify chain"}
        </button>
      </div>
      {verify !== null && (
        <p role="status" className={verify.startsWith("Chain intact") ? "ok" : "error"}>
          {verify}
        </p>
      )}
      <p className="muted small">Append-only. Each entry carries the digest of the one before it.</p>
      {q.isLoading && <p className="muted">Loading</p>}
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
  );
}
