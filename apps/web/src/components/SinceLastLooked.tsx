import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client.js";
import type { CrEvent } from "../api/types.js";
import { LAST_SEEN_KEY, readNumber, writeNumber } from "../lib/storage.js";

/** Events since this browser last marked them seen. Stored in this browser; works without storage. */
export function SinceLastLooked() {
  const [lastSeen, setLastSeen] = useState<number | undefined>(() => readNumber(LAST_SEEN_KEY));
  const q = useQuery({ queryKey: ["events", "since", lastSeen ?? 0], queryFn: () => api.events(lastSeen ?? 0) });
  const events: CrEvent[] = q.data ?? [];
  const fresh = lastSeen === undefined ? [] : events.filter((e) => e.seq > lastSeen);
  const maxSeq = events.reduce((m, e) => Math.max(m, e.seq), lastSeen ?? 0);

  // First visit on this browser: start counting from now.
  useEffect(() => {
    if (lastSeen === undefined && q.data !== undefined) {
      writeNumber(LAST_SEEN_KEY, maxSeq);
      setLastSeen(maxSeq);
    }
  }, [lastSeen, q.data, maxSeq]);

  function markSeen() {
    writeNumber(LAST_SEEN_KEY, maxSeq);
    setLastSeen(maxSeq);
  }

  return (
    <section className="panel" aria-labelledby="since-title">
      <h2 id="since-title">Since you last looked</h2>
      {lastSeen === undefined ? (
        <p className="muted">First visit on this browser. New activity will collect here.</p>
      ) : fresh.length === 0 ? (
        <p className="muted">Nothing new.</p>
      ) : (
        <ul className="since">
          {fresh.slice(-6).reverse().map((e) => (
            <li key={e.seq}>
              <span className="mono small">{e.type}</span> <span>{e.subject}</span>
            </li>
          ))}
          {fresh.length > 6 && <li className="muted small">and {fresh.length - 6} more in Records</li>}
        </ul>
      )}
      <button type="button" className="btn ghost small" onClick={markSeen}>
        Mark as seen
      </button>
    </section>
  );
}

