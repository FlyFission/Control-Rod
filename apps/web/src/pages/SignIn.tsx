import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client.js";
import type { Session } from "../api/types.js";
import { browserPasskeys, type Passkeys } from "../lib/decide.js";

/** First run registers a passkey for the one local user; later visits sign in with it. */
export function SignIn({ session, passkeys = browserPasskeys }: { session: Session; passkeys?: Passkeys }) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(fn: () => Promise<Session>) {
    setBusy(true);
    setError(null);
    try {
      const s = await fn();
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
        {session.registered ? (
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
      <rect x="12" y="2" width="4" height="24" rx="2" fill="#5CC8FF" />
      <rect x="4" y="8" width="4" height="12" rx="2" fill="#2B6E99" />
      <rect x="20" y="8" width="4" height="12" rx="2" fill="#2B6E99" />
    </svg>
  );
}
