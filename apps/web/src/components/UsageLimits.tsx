import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client.js";
import type { UsageLimitsView, UsageProvider, UsageWindow } from "../api/types.js";
import {
  ago,
  lowestReserve,
  orderProviders,
  providerName,
  windowLabel,
  readWindow,
  runsOutBefore,
  shortDuration,
  sourceWords,
  spokenDuration,
  type Reading,
} from "../lib/usage-limits.js";
import { VendorBadge } from "./VendorBadge.js";

/** A clock that ticks every `ms` while the tab is visible, and catches up when it becomes visible again. */
function useNow(ms: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const tick = () => {
      if (!document.hidden) setNow(Date.now());
    };
    const id = window.setInterval(tick, ms);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [ms]);
  return now;
}

const lowerFirst = (s: string) => (/^\d/.test(s) ? s : s.charAt(0).toLowerCase() + s.slice(1));
const TICKS = Array.from({ length: 11 }, (_, i) => i);

function readoutWords(r: Reading): string {
  if (r.state === "stale") return `was ${r.left}% left`;
  return r.state === "rejected" ? "limit reached" : `${r.left}% left`;
}

function stateWord(r: Reading): string | null {
  return r.state === "rejected" ? "Limit reached" : r.state === "critical" ? "Almost out" : r.state === "low" ? "Running low" : null;
}

function resetText(r: Reading): string {
  if (r.state === "stale") return "window has reset since this reading";
  return r.resetsInMs === null ? "reset time not reported" : `resets in ${shortDuration(r.resetsInMs)}`;
}

function Meter({ provider, w, now }: { provider: UsageProvider; w: UsageWindow; now: number }) {
  const r = readWindow(w, now);
  const label = windowLabel(w);
  const early = runsOutBefore(w, r);
  const paceAhead = early !== null;
  const word = stateWord(r);
  const spoken =
    r.state === "stale"
      ? "reading is out of date, the window has reset since it was recorded"
      : `${r.state === "rejected" ? "limit reached" : `${r.left} percent left`}${r.resetsInMs === null ? "" : `, resets in ${spokenDuration(r.resetsInMs)}`}`;
  return (
    <div className={`cr-row tone-${r.tone}${r.stale ? " is-stale" : ""}`}>
      <div className="cr-row-label">
        <span>{label}</span>
        {word && <span className="cr-state">{word}</span>}
      </div>
      <div className="cr-gauge">
        <div
          className="cr-track"
          role="meter"
          aria-label={`${providerName(provider.id)} ${label}`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={r.left}
          aria-valuetext={spoken}
        >
          <div className="cr-fill" style={{ width: `${r.left}%` }} />
          {r.timeLeft !== null && !r.stale && (
            <div className="cr-pace" style={{ left: `${(r.timeLeft * 100).toFixed(2)}%` }} title="Time left in this window" />
          )}
        </div>
        <div className="cr-scale" aria-hidden="true">
          {TICKS.map((i) => (
            <span key={i} className={i % 5 === 0 ? "major" : undefined} style={{ left: `${i * 10}%` }} />
          ))}
        </div>
      </div>
      <div className="cr-readout">
        <span className="cr-big mono">{readoutWords(r)}</span>
        <span className="cr-reset mono">{resetText(r)}</span>
      </div>
      {paceAhead && r.tone !== "stuck" && (
        <p className="cr-pace-note">ahead of pace: runs out about {shortDuration(early)} before reset</p>
      )}
    </div>
  );
}

function ProviderGroup({ p, now }: { p: UsageProvider; now: number }) {
  const name = providerName(p.id);
  const when = p.observed_at ? ago(p.observed_at, now) : null;
  const fresh = p.source === "codexbar" && !when ? "from CodexBar" : `${when ? `as of ${when}, ` : ""}from ${sourceWords(p)}`;
  return (
    <section className="cr-provider" aria-label={`${name} limits`}>
      <header className="cr-provider-head">
        <h3>{name}</h3>
        <VendorBadge provider={p.id} />
        {p.plan && <span className="mono cr-plan">{p.plan}</span>}
        <span className="muted small cr-fresh">{fresh}</span>
      </header>
      {p.windows.length === 0 ? (
        <p className="muted small">No windows reported.</p>
      ) : (
        p.windows.map((w, i) => <Meter key={`${w.id}-${i}`} provider={p} w={w} now={now} />)
      )}
    </section>
  );
}

const CODEXBAR_URL = "https://github.com/steipete/CodexBar";

/** What the engine adds, and which harnesses still report nothing. */
function EngineLine({ engine, silent }: { engine: UsageLimitsView["engine"]; silent: UsageProvider[] }) {
  return (
    <div className="cr-engine muted small">
      {engine?.found ? (
        <p>Using CodexBar{engine.version ? ` ${engine.version}` : ""} for the other tools.</p>
      ) : (
        <p>
          Limits for Cursor, Copilot, Gemini, Grok and 12 more come from{" "}
          <a href={CODEXBAR_URL} target="_blank" rel="noreferrer">
            CodexBar
          </a>
          , a free open-source usage tracker (MIT). Install it and Control Rod reads its numbers; CodexBar signs in to each tool itself, Control Rod never sees a token.
        </p>
      )}
      {silent.length > 0 && <p>Not reported: {silent.map((p) => providerName(p.id)).join(", ")}.</p>}
    </div>
  );
}

/** The usage-limits module: each agent subscription's windows as reserve gauges, with a pace marker. */
export function UsageLimits() {
  const q = useQuery({ queryKey: ["usage-limits"], queryFn: api.usageLimits, refetchInterval: 60_000, refetchIntervalInBackground: false });
  const now = useNow(30_000);
  if (q.isError) {
    return (
      <p className="error" role="alert">
        Usage limits could not be loaded.
      </p>
    );
  }
  if (q.data === undefined) return <p className="muted">Loading</p>;
  const reporting = orderProviders(q.data.providers.filter((p) => p.source !== "none"), now);
  const silent = q.data.providers.filter((p) => p.source === "none");
  const hasReadings = q.data.reported && reporting.some((p) => p.windows.length > 0);
  const lowest = hasReadings ? lowestReserve(reporting, now) : null;
  const warm = lowest !== null && lowest.reading.tone !== "ok";
  return (
    <div className="cr-usage">
      {hasReadings ? (
        <>
          <p className={`cr-summary${warm ? " warm" : ""}`}>
            {lowest && warm
              ? `Lowest reserve: ${providerName(lowest.provider.id)} ${(lowest.window.label?.trim() ? lowest.window.label.trim() : lowerFirst(windowLabel(lowest.window)))}, ${readoutWords(lowest.reading)}${
                  lowest.reading.resetsInMs === null ? "" : `, resets in ${shortDuration(lowest.reading.resetsInMs)}`
                }`
              : "All reserves above 20%"}
          </p>
          <div className="cr-providers">
            {reporting.map((p) => (
              <ProviderGroup key={p.id} p={p} now={now} />
            ))}
          </div>
          <p className="muted small cr-key">Bar: reserve left. Line: share of the window still to come.</p>
        </>
      ) : (
        <div className="cr-empty">
          <p className="cr-summary">No readings yet.</p>
          <p className="muted">Limits appear after Codex or Claude Code has run once on this machine.</p>
        </div>
      )}
      <EngineLine engine={q.data.engine} silent={silent} />
    </div>
  );
}
