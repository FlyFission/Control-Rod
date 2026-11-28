import { describe, expect, it } from "vitest";
import { PasskeyError, asPasskeyError, passkeyHint, passkeyProblem } from "./passkeyErrors.js";
import { PasskeyStuckError } from "./decide.js";

/** The shape @simplewebauthn/browser throws: a code, and the browser's own error as the cause. */
function webAuthnError(code: string, cause: Error): Error {
  const e = new Error(cause.message, { cause }) as Error & { code: string };
  e.name = cause.name;
  e.code = code;
  return e;
}

const dom = (name: string, message = "raw browser text") => new DOMException(message, name);

describe("passkey failures in plain words (WEB-10)", () => {
  it("says a closed or timed-out window plainly, never as NotAllowedError", () => {
    const said = passkeyProblem(webAuthnError("ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY", dom("NotAllowedError", "The operation either timed out or was not allowed.")));
    expect(said).toMatch(/closed or timed out/);
    expect(said).not.toMatch(/NotAllowed|operation/);
  });

  it("names each library code in words", () => {
    expect(passkeyProblem(webAuthnError("ERROR_CEREMONY_ABORTED", dom("AbortError")))).toMatch(/cancelled/);
    expect(passkeyProblem(webAuthnError("ERROR_INVALID_RP_ID", dom("SecurityError")))).toMatch(/at this address/);
    expect(passkeyProblem(webAuthnError("ERROR_INVALID_DOMAIN", dom("SecurityError")))).toMatch(/at this address/);
    expect(passkeyProblem(webAuthnError("ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED", dom("InvalidStateError")))).toMatch(/already holds a passkey/);
    expect(passkeyProblem(webAuthnError("ERROR_AUTHENTICATOR_MISSING_USER_VERIFICATION_SUPPORT", dom("ConstraintError")))).toMatch(/PIN, fingerprint or face/);
    expect(passkeyProblem(webAuthnError("ERROR_AUTHENTICATOR_GENERAL_ERROR", dom("UnknownError")))).toMatch(/reported a problem/);
  });

  it("covers raw browser errors the library passes on unchanged, and a browser without passkeys", () => {
    expect(passkeyProblem(dom("NotSupportedError"))).toMatch(/kind of key/);
    expect(passkeyProblem(dom("SecurityError"))).toMatch(/at this address/);
    expect(passkeyProblem(new Error("WebAuthn is not supported in this browser"))).toMatch(/cannot use passkeys/);
    expect(passkeyProblem(new Error("Authentication was not completed"))).toMatch(/did not finish/);
  });

  it("leaves Control Rod's own stuck-window message and unrelated errors alone", () => {
    expect(passkeyProblem(new PasskeyStuckError())).toBeNull();
    expect(passkeyProblem(new Error("something else"))).toBeNull();
    expect(passkeyProblem("not an error")).toBeNull();
    const stuck = new PasskeyStuckError();
    expect(asPasskeyError(stuck)).toBe(stuck);
  });

  it("wraps a mapped failure and keeps the browser's error as its cause", () => {
    const raw = dom("NotSupportedError");
    const wrapped = asPasskeyError(raw);
    expect(wrapped).toBeInstanceOf(PasskeyError);
    expect((wrapped as Error).cause).toBe(raw);
  });

  it("names Touch ID only on Apple devices", () => {
    expect(passkeyHint({ platform: "MacIntel", userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5)" })).toBe("Use the passkey on this Mac. Touch ID works.");
    expect(passkeyHint({ userAgentData: { platform: "macOS" } })).toMatch(/Touch ID/);
    expect(passkeyHint({ platform: "Win32", userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" })).toBe("Use the passkey on this computer. Windows Hello works.");
    expect(passkeyHint({ platform: "Linux x86_64", userAgent: "Mozilla/5.0 (X11; Linux x86_64)" })).toBe("Use the passkey on this computer, a security key, or your phone.");
    expect(passkeyHint({ platform: "Linux armv8l", userAgent: "Mozilla/5.0 (Linux; Android 15)" })).toMatch(/this phone/);
    expect(passkeyHint({ platform: "iPhone", userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)" })).toMatch(/Face ID or Touch ID/);
    for (const nav of [{ platform: "Win32" }, { platform: "Linux x86_64" }, undefined]) expect(passkeyHint(nav)).not.toMatch(/Touch ID/);
  });
});
