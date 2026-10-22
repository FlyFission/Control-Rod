import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueries, useQuery } from "@tanstack/react-query";
import { api } from "../api/client.js";
import type { PackageView } from "../api/types.js";
import { StateMark, STATE_INFO, type StateKind } from "../components/StateMark.js";
import { ROOMS, layoutFloor, type RoomId } from "../lib/floor.js";

const ACTIVE = new Set(["draft", "released", "in-work", "in-verification"]);
const LEGEND: StateKind[] = ["working", "needs", "waiting", "stuck", "changed", "idle"];

export function Floor() {
  const navigate = useNavigate();
  const packages = useQuery({ queryKey: ["packages"], queryFn: api.packages });
  const office = useQuery({ queryKey: ["office"], queryFn: api.office });
  const active = (packages.data ?? []).filter((p) => ACTIVE.has(p.status)).slice(0, 30);
  const views = useQueries({
    queries: active.map((p) => ({ queryKey: ["views", p.id], queryFn: () => api.packageView(p.id) })),
  });
  const loaded = views.map((v) => v.data).filter((v): v is PackageView => v !== undefined);
  const figures = layoutFloor(loaded, office.data ?? []);
  const accepted = (packages.data ?? []).filter((p) => p.status === "accepted").length;
  const [selected, setSelected] = useState<string | null>(null);

  // Rest the pulse animation while the tab is hidden.
  useEffect(() => {
    const onVis = () => document.body.classList.toggle("tab-hidden", document.visibilityState === "hidden");
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  return (
    <section aria-labelledby="floor-title">
      <div className="panel-head">
        <h1 id="floor-title">Floor</h1>
        <span className="muted small">One figure per active agent. Anyone waiting on you stands in your office.</span>
      </div>
      <div className="floor-wrap panel">
        <div className="floor" role="group" aria-label="Office floor">
          <svg viewBox="0 0 1000 600" className="floor-plan" aria-hidden="true">
            <rect x="0" y="0" width="1000" height="600" fill="#0B1016" />
            <rect x="10" y="270" width="980" height="60" fill="#0E141B" />
            {(Object.keys(ROOMS) as RoomId[]).map((id) => {
              const r = ROOMS[id];
              const isOffice = id === "office";
              const isVerify = id === "verify";
              return (
                <g key={id}>
                  <rect
                    x={r.x}
                    y={r.y}
                    width={r.w}
                    height={r.h}
                    rx="8"
                    fill={isOffice ? "#141109" : isVerify ? "#0F1220" : "#101720"}
                    stroke={isOffice ? "#8A6D25" : isVerify ? "#5D6AA8" : "#2A3646"}
                    strokeWidth={isOffice ? 2 : 1.5}
                    strokeDasharray={isVerify ? "6 5" : undefined}
                  />
                  <text x={r.x + 14} y={r.y + 24} className="room-label" fill={isOffice ? "#E2C26E" : "#8B98A8"}>
                    {r.label.toUpperCase()}
                  </text>
                </g>
              );
            })}
            <text x={694} y={70} className="room-note" fill="#5F6C7C">
              {accepted} accepted and filed
            </text>
            <text x={34} y={380} className="room-note" fill="#6E78AD">
              agents pre-check, people verify
            </text>
          </svg>
          {figures.map((f) => (
            <button
              key={f.id}
              type="button"
              className={selected === f.id ? "figure selected" : "figure"}
              style={{ left: `${(f.x / 1000) * 100}%`, top: `${(f.y / 600) * 100}%` }}
              aria-label={`${f.code}: ${STATE_INFO[f.state].label}. ${f.bubble}`}
              onFocus={() => setSelected(f.id)}
              onMouseEnter={() => setSelected(f.id)}
              onMouseLeave={() => setSelected(null)}
              onClick={() => void navigate({ to: "/packages/$id", params: { id: f.packageId } })}
            >
              {(selected === f.id || f.state !== "working") && <span className="bubble">{f.bubble}</span>}
              <span className={f.state === "working" ? "mark pulse" : "mark"}>
                <StateMark kind={f.state} size={9} />
              </span>
              <svg className="person" width="24" height="26" viewBox="0 0 26 28" aria-hidden="true">
                <circle cx="13" cy="7.5" r="5.8" fill="#7FB8D9" />
                <path d="M2.5 27c1.5-7.5 5.5-10.5 10.5-10.5s9 3 10.5 10.5z" fill="#7FB8D9" />
              </svg>
              <span className="code mono">{f.code}</span>
            </button>
          ))}
        </div>
        <div className="legend">
          {LEGEND.map((k) => (
            <span key={k}>
              <StateMark kind={k} /> {STATE_INFO[k].label}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
