// Plain sentences for what a browser's passkey window can fail with. The browser and the
// @simplewebauthn/browser library name failures with codes such as NotAllowedError or
// ERROR_INVALID_RP_ID, which mean nothing to a person signing in.

const SENTENCES = {
  cancelled: "The passkey request was cancelled. Nothing was recorded. Try again when you are ready.",
  closed:
    "The passkey window closed or timed out before a passkey was used. Nothing was recorded. Try again, and finish the steps in the passkey window.",
  address:
    "This browser will not use a passkey at this address. Open Control Rod at the address it printed when it started, then try again.",
  registered: "This device already holds a passkey for Control Rod. Sign in with it instead.",
  verification:
    "This passkey device cannot confirm it is you with a PIN, fingerprint or face. Use one that can, such as this computer's own passkey or a phone.",
  keyType: "This passkey device does not support the kind of key Control Rod asks for. Try this computer's own passkey or a phone.",
  device: "The passkey device reported a problem. Try again, or use another passkey device.",
  browser: "This browser cannot use passkeys. Open Control Rod in a current version of Chrome, Edge, Firefox or Safari.",
  unfinished: "The passkey did not finish. Nothing was recorded. Try again.",
} as const;

const BY_CODE: Readonly<Record<string, keyof typeof SENTENCES>> = {
  ERROR_CEREMONY_ABORTED: "cancelled",
  ERROR_INVALID_DOMAIN: "address",
  ERROR_INVALID_RP_ID: "address",
  ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED: "registered",
  ERROR_AUTHENTICATOR_MISSING_USER_VERIFICATION_SUPPORT: "verification",
  ERROR_AUTHENTICATOR_MISSING_DISCOVERABLE_CREDENTIAL_SUPPORT: "verification",
  ERROR_AUTO_REGISTER_USER_VERIFICATION_FAILURE: "verification",
  ERROR_AUTHENTICATOR_NO_SUPPORTED_PUBKEYCREDPARAMS_ALG: "keyType",
  ERROR_MALFORMED_PUBKEYCREDPARAMS: "keyType",
  ERROR_AUTHENTICATOR_GENERAL_ERROR: "device",
  ERROR_INVALID_USER_ID_LENGTH: "device",
};

const BY_NAME: Readonly<Record<string, keyof typeof SENTENCES>> = {
  AbortError: "cancelled",
  NotAllowedError: "closed",
  SecurityError: "address",
  InvalidStateError: "registered",
  NotSupportedError: "keyType",
  ConstraintError: "verification",
  UnknownError: "device",
};

/**
 * A plain sentence for an error the passkey window raised, or null for one it has no sentence for.
 * Only errors from the passkey calls come here (browserPasskeys in decide.ts), so a browser error
 * name such as AbortError is known to be about the passkey. Control Rod's own PasskeyStuckError
 * already says what happened, so it is left alone.
 */
/** An Error, or a DOMException (which is not an Error in every runtime). */
function isError(e: unknown): e is Error {
  return e instanceof Error || (typeof DOMException !== "undefined" && e instanceof DOMException);
}

export function passkeyProblem(e: unknown): string | null {
  if (!isError(e) || e.name === "PasskeyStuckError") return null;
  const code = (e as { code?: unknown }).code;
  if (typeof code === "string" && code in BY_CODE) return SENTENCES[BY_CODE[code]!];
  // The library passes the browser's own error through as `cause` when it has no better code.
  const cause = (e as { cause?: unknown }).cause;
  const named = code === "ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY" && isError(cause) ? cause.name : e.name;
  if (named in BY_NAME) return SENTENCES[BY_NAME[named]!];
  if (code === "ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY") return SENTENCES.device;
  if (e.message === "WebAuthn is not supported in this browser") return SENTENCES.browser;
  if (e.message === "Authentication was not completed" || e.message === "Registration was not completed") return SENTENCES.unfinished;
  return null;
}

type PlatformNavigator = { userAgent?: string; platform?: string; userAgentData?: { platform?: string } };

/** What to use to sign in on this kind of device. Touch ID is named only where there is one. */
export function passkeyHint(nav: PlatformNavigator | undefined = typeof navigator === "undefined" ? undefined : navigator): string {
  const ua = nav?.userAgent ?? "";
  const platform = nav?.userAgentData?.platform || nav?.platform || "";
  if (/iPhone|iPad|iPod/.test(ua) || (/Mac/.test(platform) && /Mobile/.test(ua))) {
    return "Use the passkey on this device. Face ID or Touch ID works.";
  }
  if (/Mac/i.test(platform) || /Macintosh/.test(ua)) return "Use the passkey on this Mac. Touch ID works.";
  if (/Win/i.test(platform) || /Windows/.test(ua)) return "Use the passkey on this computer. Windows Hello works.";
  if (/Android/i.test(platform) || /Android/.test(ua)) return "Use the passkey on this phone. Your fingerprint or screen lock works.";
  return "Use the passkey on this computer, a security key, or your phone.";
}

/** A passkey failure, said plainly. `cause` keeps the browser's own error for debugging. */
export class PasskeyError extends Error {
  constructor(message: string, cause: unknown) {
    super(message, { cause });
    this.name = "PasskeyError";
  }
}

/** The error to show for a failed passkey call: a PasskeyError when there is a sentence for it. */
export function asPasskeyError(e: unknown): unknown {
  const sentence = passkeyProblem(e);
  return sentence === null ? e : new PasskeyError(sentence, e);
}
