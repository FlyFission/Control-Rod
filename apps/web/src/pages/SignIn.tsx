import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client.js";
import type { Session } from "../api/types.js";
import { browserPasskeys, type Passkeys } from "../lib/decide.js";

/** The invitation an administrator's link carries, in the address's fragment so no server ever logs it. */
function invitationInAddress(): string | undefined {
  const m = /(?:^|[#&])invitation=([A-Za-z0-9_-]+)/.exec(window.location.hash);
  return m?.[1];
}

/**
 * First run registers a passkey for the first person; a person an administrator invited registers
 * theirs from the invitation link; later visits sign in with a passkey.
 */
export function SignIn({ session, passkeys = browserPasskeys }: { session: Session; passkeys?: Passkeys }) {
  const qc = useQueryClient();
  const [invitation] = useState(invitationInAddress);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(fn: () => Promise<Session>) {
    setBusy(true);
    setError(null);
    try {
      const s = await fn();
      // A new session never sees what an earlier person's session loaded.
      qc.clear();
      qc.setQueryData(["session"], s);
    } catch (e) {
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
      // Used once: the invitation leaves the address so it is not kept in history or shared by accident.
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
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
