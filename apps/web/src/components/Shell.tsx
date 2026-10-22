import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client.js";
import type { Session } from "../api/types.js";
import { BrandMark } from "../pages/SignIn.js";

const NAV: { to: string; label: string }[] = [
  { to: "/", label: "Home" },
  { to: "/office", label: "Your office" },
  { to: "/board", label: "Board" },
  { to: "/floor", label: "Floor" },
  { to: "/records", label: "Records" },
];

export function Shell({ session, children }: { session: Session; children: ReactNode }) {
  const qc = useQueryClient();
  const office = useQuery({ queryKey: ["office"], queryFn: api.office });
  const needs = office.data?.length ?? 0;

  async function logout() {
    try {
      const s = await api.logout();
      qc.setQueryData(["session"], s);
    } catch {
      void qc.invalidateQueries({ queryKey: ["session"] });
    }
  }

  return (
    <div className="shell">
      <a className="skip" href="#main">
        Skip to content
      </a>
      <header className="topbar">
        <Link to="/" className="brand">
          <BrandMark />
          <span>Control Rod</span>
        </Link>
        <nav aria-label="Main">
          {NAV.map((n) => (
            <Link key={n.to} to={n.to} className="nav-link" activeProps={{ className: "nav-link active" }} activeOptions={{ exact: n.to === "/" }}>
              {n.label}
              {n.to === "/office" && needs > 0 && (
                <span className="badge" aria-label={`${needs} need you`}>
                  {needs}
                </span>
              )}
            </Link>
          ))}
        </nav>
        <div className="who">
          <span className="muted">{session.user ?? "Signed in"}</span>
          <button type="button" className="btn ghost small" onClick={() => void logout()}>
            Sign out
          </button>
        </div>
      </header>
      <main id="main" className="content" tabIndex={-1}>
        {children}
      </main>
    </div>
  );
}
