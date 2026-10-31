# Hardware-backed authenticators for high-consequence signing

Approved by the owner on 2026-10-30 (workbench plan task 0.10; specification section 11.1, G-5). The Platform Plan floor: "High-consequence decisions need a credentialed person signing with a hardware-backed key."

## Eligible

A passkey counts as hardware backed only when its registration carried an attestation statement that identifies one of these authenticator classes, recorded on the Member's AuthenticatorCredential:

| Class | Examples | Evidence at registration |
|---|---|---|
| Roaming FIDO2 security key | YubiKey 5 series, other FIDO2 certified keys | `packed` or `fido-u2f` attestation chaining to the vendor's root; AAGUID recorded |
| Platform authenticator bound to a TPM | Windows Hello on a device with a TPM 2.0 | `tpm` attestation; AAGUID recorded |

## Not eligible

- Synced passkeys (for example iCloud Keychain or Google Password Manager). They are designed to move between devices, and their platforms typically return no attestation.
- Any credential registered with `attestation: "none"`. That includes every passkey registered before this policy, because `services/api/src/auth.ts` currently requests no attestation.
- Credentials whose attestation cannot be verified against a retained trust anchor.

Ineligible credentials still sign everything else; only decisions whose floor requires a hardware-backed key refuse them, and the refusal names the missing evidence.

## What the owner does

Re-enroll one security key or Windows Hello credential with attestation once Phase 1 task 1.12 lands, before signing any high-consequence decision.

## How Control Rod enforces it (task 1.12)

- Every registration asks the authenticator for attestation (`attestation: "direct"`). The format and AAGUID are recorded on the AuthenticatorCredential whatever the answer.
- A credential is eligible only when its statement is `packed`, `tpm` or `fido-u2f`, it is not synced (backup eligible), the format is listed in the current policy set, and its certificate chain verifies against a trust anchor in `~/.controlrod/trust-anchors/` (PEM files; `CONTROLROD_HOME` moves it). Control Rod ships no anchors: the owner adds the vendor roots for the keys they use, for example Yubico's attestation root from Yubico's PKI page. With no anchors, no credential is eligible, and the refusal says so.
- Safety and Material grade decisions (release, verdicts and the independence override) must be signed with an eligible credential; anything else is refused with `hardware-key-required`, naming the evidence the passkey lacks. Every other decision accepts any registered passkey.
- To re-enroll, a signed-in Member adds a passkey from the account page by signing with one they already hold; the new credential is evaluated as above. Passkeys recorded before this change carry format `none` and stay ineligible.

## Change control

Adding or removing an authenticator class is a policy change: a ChangeRequest signed by a Member with policy authority.

## Exit criteria

Phase 1 task 1.12 enforces this list, and its tests refuse every class marked not eligible.

## Source-lineage note

Written for Control Rod from the Platform Plan's Security and compliance floor and the W3C WebAuthn attestation formats.
