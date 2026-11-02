import { Link } from "@tanstack/react-router";

/**
 * Explore (specification 12 and 15). Live exploration runs in its own worktree and is promoted into
 * a package. It needs the run sandbox (plan Phase 6) before it can start, so until then this place
 * says what it will do and where work starts today.
 */
export function Explore() {
  return (
    <div className="place">
      <header className="place-head">
        <h1>Explore</h1>
        <p className="muted">Try an idea with an agent before it becomes a package, then promote what is worth keeping.</p>
      </header>
      <section className="panel empty-state" aria-labelledby="explore-empty">
        <h2 id="explore-empty">Not available yet</h2>
        <p>
          Exploration starts agents that can change files, so it waits for the run sandbox and its attestation. Nothing here starts an agent
          today.
        </p>
        <p className="muted">
          To get work done now, capture it on <Link to="/packages">Packages</Link>: intake answers quick questions and drafts a package for
          anything bigger.
        </p>
      </section>
    </div>
  );
}
