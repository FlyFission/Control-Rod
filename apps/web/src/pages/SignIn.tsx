import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../api/client.js";
import { adoptSession } from "../lib/session.js";
import type { Session } from "../api/types.js";
import { browserPasskeys, type Passkeys } from "../lib/decide.js";
import { captureInvitation, forgetInvitation, heldInvitation } from "../lib/invitation.js";

/**
 * First run registers a passkey for the first person; a person an administrator invited registers
 * theirs from the invitation link; later visits sign in with a passkey.
 */
/**
 * Refusals that mean this page was drawn from an out-of-date session (a second tab, or a page the
 * browser restored with Back): the machine is already set up, or this browser is already signed in.
 * The page reloads the session and redraws itself instead of showing a refusal meant for other cases.
 */
const STALE_SESSION = new Set(["own-account-only", "forbidden", "step-up-required", "not-registered"]);

export function SignIn({ session, passkeys = browserPasskeys }: { session: Session; passkeys?: Passkeys }) {
  const qc = useQueryClient();
  // Normally taken at startup (capture-invitation.ts); taking it again here is harmless.
  const [invitation] = useState(() => (captureInvitation(), heldInvitation()));
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const adopt = (s: Session) => adoptSession(qc, s);

  async function run(fn: () => Promise<Session>) {
    setBusy(true);
    setError(null);
    try {
      await adopt(await fn());
    } catch (e) {
      if (e instanceof ApiError && STALE_SESSION.has(e.code)) {
        const fresh = await api.session().catch(() => null);
        if (fresh !== null) {
          await adopt(fresh);
          if (!fresh.signed_in)
            setError(fresh.registered ? "This machine is already set up. Sign in with your passkey." : "Set up this machine to continue.");
          return;
        }
      }
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  const register = () =>
    run(async () => {
      const { options } = await api.registerOptions(name.trim());
      const credential = await passkeys.create(options);
      return api.registerVerify(credential);
    });

  const acceptInvitation = () =>
    run(async () => {
      const { options } = await api.registerInvitedOptions(invitation!);
      const credential = await passkeys.create(options);
      const s = await api.registerVerify(credential);
      // Used once: kept in memory only for a retry until now.
      forgetInvitation();
      return s;
    });

  const signIn = () =>
    run(async () => {
      const { options } = await api.loginOptions();
      const assertion = await passkeys.get(options);
      return api.loginVerify(assertion);
    });

  return (
    <main className="signin">
      <div className="signin-card">
        <div className="brand">
          <BrandMark />
          <span>Control Rod</span>
        </div>
        {invitation !== undefined ? (
          <>
            <h1>Accept your invitation</h1>
            <p className="muted">An administrator invited you. Register a passkey on this device; it signs every decision you make.</p>
            <button type="button" className="btn primary" onClick={acceptInvitation} disabled={busy}>
              {busy ? "Waiting for your passkey" : "Register my passkey"}
            </button>
          </>
        ) : session.registered ? (
          <>
            <h1>Sign in</h1>
            <p className="muted">Use the passkey on this machine. Touch ID works.</p>
            <button type="button" className="btn primary" onClick={signIn} disabled={busy}>
              {busy ? "Waiting for your passkey" : "Sign in with passkey"}
            </button>
          </>
        ) : (
          <>
            <h1>Set up this machine</h1>
            <p className="muted">
              Control Rod runs here for one person. Register a passkey; it signs every decision you make.
            </p>
            <label className="field">
              <span>Your name</span>
              <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
            </label>
            <button
              type="button"
              className="btn primary"
              onClick={register}
              disabled={busy || name.trim().length === 0}
            >
              {busy ? "Waiting for your passkey" : "Register passkey"}
            </button>
          </>
        )}
        {error !== null && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
      </div>
    </main>
  );
}

export function BrandMark() {
  return (
    <svg width="24" height="24" viewBox="0 0 28 28" aria-hidden="true">
      <rect x="12" y="2" width="4" height="24" rx="2" style={{ fill: "var(--accent)" }} />
      <rect x="4" y="8" width="4" height="12" rx="2" style={{ fill: "var(--accent-dim)" }} />
      <rect x="20" y="8" width="4" height="12" rx="2" style={{ fill: "var(--accent-dim)" }} />
    </svg>
  );
}
